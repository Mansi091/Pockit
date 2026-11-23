import { File } from 'expo-file-system';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cardImageFile } from '@/services/imageService';
import { CloudSchemaOutdatedError, type RemoteStore, type Row } from '@/sync/types';

const BUCKET = 'cards';

/** PostgREST / Postgres codes meaning "the cloud schema is older than the app" (missing table or column). */
function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error.code ?? '') ||
    /could not find the .* (table|column)|does not exist/i.test(error.message ?? '')
  );
}

export function supabaseRemoteStore(sb: SupabaseClient, userId: string): RemoteStore {
  return {
    async pull(table, cursor, limit) {
      // Explicitly MY rows only. Since 0005, company admins can also READ members'
      // shared contacts — those must never be pulled into the admin's own address book.
      const { data, error } = await sb
        .from(table)
        .select('*')
        .eq('user_id', userId)
        .gt('server_updated_at', cursor)
        .order('server_updated_at', { ascending: true })
        .limit(limit);
      if (error) {
        if (isMissingTable(error)) throw new CloudSchemaOutdatedError(table);
        throw new Error(`Download of ${table} failed: ${error.message}`);
      }
      return (data ?? []) as (Row & { server_updated_at: string })[];
    },

    async upsert(table, rows) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'id' });
      if (error) {
        if (isMissingTable(error)) throw new CloudSchemaOutdatedError(table);
        throw new Error(`Upload of ${table} failed: ${error.message}`);
      }
    },

    async uploadImage(storagePath, localUri) {
      try {
        const bytes = await new File(localUri).bytes();
        const { error } = await sb.storage.from(BUCKET).upload(storagePath, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
        return !error;
      } catch {
        return false;
      }
    },

    async removeImage(storagePath) {
      const { error } = await sb.storage.from(BUCKET).remove([storagePath]);
      return !error;
    },

    async downloadImage(storagePath, rowId, suffix) {
      try {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, 120);
        if (error || !data?.signedUrl) return null;
        const dest = cardImageFile(userId, `${rowId}${suffix}`);
        if (dest.exists) dest.delete();
        return (await File.downloadFileAsync(data.signedUrl, dest)).uri;
      } catch {
        return null;
      }
    },
  };
}
