import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/** Ortam değişkenlerini okur ve panel yapılandırmasını döner */
export function loadConfig() {
  const mock = String(process.env.SMARTPOS_MOCK || '').toLowerCase() === 'true';
  return {
    port: Number(process.env.MILKAN_PANEL_PORT || 3920),
    panelPin: String(process.env.MILKAN_PANEL_PIN || '5454').trim(),
    mock,
    depoId: Number(process.env.SMARTPOS_DEPO_ID || 1),
    sql: {
      server: process.env.SMARTPOS_SQL_SERVER || '192.168.1.120',
      database: process.env.SMARTPOS_SQL_DATABASE || 'SMARTPOSV47',
      user: process.env.SMARTPOS_SQL_USER || 'sa',
      password: process.env.SMARTPOS_SQL_PASSWORD || '',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      }
    }
  };
}
