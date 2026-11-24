import type { SupabaseClient } from '@supabase/supabase-js';
import { blobToDataUrl } from '@/services/imageService.web';
import { CloudSchemaOutdatedError, type RemoteStore, type Row } from '@/sync/types';

/**
 * Web version of supabaseRemoteStore.ts. Row sync is identical; only images
 * differ: on the web a card image is a data URL in the row, so uploads send
 * its bytes and downloads come back as a data URL.
 */
const BUCKET = 'cards';

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error.code ?? '') ||
    /could not find the .* (table|column)|does not exist/i.test(error.message ?? '')
  );
}

export function supabaseRemoteStore(sb: SupabaseClient, userId: string): RemoteStore {
  return {
    async pull(table, cursor, limit) {
      // Explicitly MY rows only — company admins can also READ members' shared contacts.
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
        const blob = await (await fetch(localUri)).blob();
        const { error } = await sb.storage.from(BUCKET).upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
        return !error;
      } catch {
        return false;
      }
    },

    async removeImage(storagePath) {
      const { error } = await sb.storage.from(BUCKET).remove([storagePath]);
      return !error;
    },

    async downloadImage(storagePath) {
      try {
        const { data, error } = await sb.storage.from(BUCKET).download(storagePath);
        if (error || !data) return null;
        return await blobToDataUrl(data);
      } catch {
        return null;
      }
    },
  };
}
