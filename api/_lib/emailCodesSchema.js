import { ensureSchemaReady } from './schemaReady.js';

// email_codes tablosu — şema bootstrap SQL'de de var; burada yalnızca ensure önbelleği
export async function ensureEmailCodesTable(sql) {
  await ensureSchemaReady(sql);
}
