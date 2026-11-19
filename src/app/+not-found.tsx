import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Fallback for any address the router can't show — e.g. the development build
 * opening `pockit:///` while signed out (Home is hidden behind the auth guard),
 * or a stale link from a notification. Instead of an "Unmatched Route" page,
 * send the user to the right starting screen for their auth state.
 */
export default function NotFound() {
  const { session, mustSetPassword } = useAuth();
  if (!session) return <Redirect href="/sign-in" />;
  if (mustSetPassword) return <Redirect href="/new-password" />;
  return <Redirect href="/" />;
}
