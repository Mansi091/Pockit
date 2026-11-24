import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, requireSupabase } from '@/lib/supabase';
import { closeUserDatabase, deleteUserDatabase, openUserDatabase } from '@/database/db';
import { deleteAllUserImages } from '@/services/imageService';
import { initSync, resetSyncStatus } from '@/services/syncService';
import { cancelAllFollowUpNotifications } from '@/services/notificationService';
import { normaliseName } from '@/auth/userName';
import { emitContactsChanged } from '@/services/dataEvents';
import { getGoogleIdToken, googleSignOut } from '@/auth/googleAuth';

/**
 * Authentication state for the whole app.
 *
 * Flow: Supabase restores the saved session from SecureStore on launch →
 * if a user is signed in we open THEIR SQLite database → `ready` becomes true
 * and the router shows the app; otherwise it shows the sign-in screens.
 *
 * Email confirmation and password reset use 6-digit codes the user types in
 * (Supabase email templates must include {{ .Token }} — see docs/SETUP.md).
 */
interface AuthContextValue {
  session: Session | null;
  /** Session restored AND the user's database is open (or no user). */
  ready: boolean;
  /** True after a recovery code was verified, until a new password is set. */
  mustSetPassword: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string): Promise<{ needsVerification: boolean }>;
  /** Sets the account holder's name (shown in greetings, the sidebar and to their company). */
  updateName(fullName: string): Promise<void>;
  verifySignUpCode(email: string, code: string): Promise<void>;
  resendSignUpCode(email: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** Passwordless sign-in: emails a one-time code to an EXISTING account. */
  sendLoginCode(email: string): Promise<void>;
  verifyLoginCode(email: string, code: string): Promise<void>;
  verifyRecoveryCode(email: string, code: string): Promise<void>;
  setNewPassword(password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Converts Supabase errors into messages a user can act on. */
function friendly(error: { message: string; code?: string } | null | undefined): Error {
  const msg = error?.message ?? 'Something went wrong.';
  if (/invalid login credentials/i.test(msg)) return new Error('Incorrect email or password.');
  if (/email not confirmed/i.test(msg)) return new Error('Please verify your email first.');
  if (/user already registered/i.test(msg)) return new Error('An account with this email already exists. Sign in instead.');
  if (/token has expired|otp.*(expired|invalid)|invalid.*otp/i.test(msg)) return new Error('That code is invalid or has expired. Request a new one.');
  if (/rate limit|too many/i.test(msg)) return new Error('Too many attempts. Please wait a minute and try again.');
  if (/network|fetch/i.test(msg)) return new Error('No internet connection. Check your network and try again.');
  return new Error(msg);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mustSetPassword, setMustSetPassword] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // 1. Restore + subscribe to session changes
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
      if (!data.session && mounted) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true);
      if (!s) setReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2. Open/close the per-user database whenever the signed-in user changes
  const userId = session?.user.id ?? null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (userId && userId !== openedFor) {
        setReady(false);
        await openUserDatabase(userId);
        await initSync();
        if (cancelled) return;
        setOpenedFor(userId);
        emitContactsChanged();
        setReady(true);
      } else if (!userId && openedFor) {
        await cancelAllFollowUpNotifications(); // the next person on this phone mustn't get these
        await closeUserDatabase();
        resetSyncStatus();
        setOpenedFor(null);
        setReady(true);
      }
    })().catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, [userId, openedFor]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendly(error);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await requireSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: normaliseName(fullName) } },
    });
    if (error) throw friendly(error);
    // With "Confirm email" enabled (recommended) there is no session until the code is verified.
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error('An account with this email already exists. Sign in instead.');
    }
    return { needsVerification: !data.session };
  }, []);

  const updateName = useCallback(async (fullName: string) => {
    const { error } = await requireSupabase().auth.updateUser({ data: { full_name: normaliseName(fullName) } });
    if (error) throw friendly(error);
    // The session refreshes itself (USER_UPDATED), so every screen shows the new name.
  }, []);

  const verifySignUpCode = useCallback(async (email: string, code: string) => {
    const { error } = await requireSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) throw friendly(error);
  }, []);

  const resendSignUpCode = useCallback(async (email: string) => {
    const { error } = await requireSupabase().auth.resend({ type: 'signup', email: email.trim() });
    if (error) throw friendly(error);
  }, []);

  const sendLoginCode = useCallback(async (email: string) => {
    // shouldCreateUser: false → only registered emails get a code (no surprise sign-ups).
    const { error } = await requireSupabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    if (error) {
      if (/signups? not allowed|user not found/i.test(error.message)) {
        throw new Error('No Pockit account uses this email. Create an account first.');
      }
      throw friendly(error);
    }
  }, []);

  const verifyLoginCode = useCallback(async (email: string, code: string) => {
    const { error } = await requireSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) throw friendly(error);
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim());
    if (error) throw friendly(error);
  }, []);

  const verifyRecoveryCode = useCallback(async (email: string, code: string) => {
    // Set the flag first so the router keeps the user on the new-password screen.
    setMustSetPassword(true);
    const { error } = await requireSupabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (error) {
      setMustSetPassword(false);
      throw friendly(error);
    }
  }, []);

  const setNewPassword = useCallback(async (password: string) => {
    const { error } = await requireSupabase().auth.updateUser({ password });
    if (error) throw friendly(error);
    setMustSetPassword(false);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const token = await getGoogleIdToken();
    const { error } = await requireSupabase().auth.signInWithIdToken({ provider: 'google', token });
    if (error) throw friendly(error);
  }, []);

  const signOut = useCallback(async () => {
    setMustSetPassword(false);
    await googleSignOut();
    // scope 'local' signs out this device only and works offline.
    const { error } = await requireSupabase().auth.signOut({ scope: 'local' });
    if (error) throw friendly(error);
  }, []);

  const deleteAccount = useCallback(async () => {
    const sb = requireSupabase();
    const uid = session?.user.id;
    if (!uid) throw new Error('Not signed in.');

    // 1. Delete cloud card images (Storage API; RLS only allows own folder).
    for (;;) {
      const { data, error } = await sb.storage.from('cards').list(uid, { limit: 100 });
      if (error) throw friendly(error);
      if (!data?.length) break;
      const { error: rmError } = await sb.storage.from('cards').remove(data.map((f) => `${uid}/${f.name}`));
      if (rmError) throw friendly(rmError);
      if (data.length < 100) break;
    }
    // 2. Delete cloud rows + the auth user (SQL function, see supabase/migrations).
    const { error } = await sb.rpc('delete_my_account');
    if (error) throw friendly(error);

    // 3. Wipe everything on this device.
    await deleteUserDatabase(uid);
    deleteAllUserImages(uid);
    await googleSignOut();
    await sb.auth.signOut({ scope: 'local' });
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready: ready && (!session || openedFor === session.user.id),
      mustSetPassword,
      signIn,
      signUp,
      updateName,
      verifySignUpCode,
      resendSignUpCode,
      sendPasswordReset,
      sendLoginCode,
      verifyLoginCode,
      verifyRecoveryCode,
      setNewPassword,
      signInWithGoogle,
      signOut,
      deleteAccount,
    }),
    [session, ready, openedFor, mustSetPassword, signIn, signUp, updateName, verifySignUpCode, resendSignUpCode,
      sendPasswordReset, sendLoginCode, verifyLoginCode, verifyRecoveryCode, setNewPassword, signInWithGoogle, signOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
