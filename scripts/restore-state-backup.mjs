#!/usr/bin/env node
/**
 * app_state yedeğini listele veya geri yükle — admin yanlışlıkla silindiyse.
 * Kullanım:
 *   DATABASE_URL=... node scripts/restore-state-backup.mjs --list
 *   DATABASE_URL=... node scripts/restore-state-backup.mjs --latest-pre-delete
 *   DATABASE_URL=... node scripts/restore-state-backup.mjs --id 42
 */
import { getSql } from './_lib/getSql.mjs';

const STATE_ID = 'liberte';

function parseArgs(argv) {
  const args = { list: false, latestPreDelete: false, id: null };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--list') args.list = true;
    if (token === '--latest-pre-delete') args.latestPreDelete = true;
    if (token === '--id') args.id = Number(argv[i + 1]);
  }
  return args;
}

// Yedek listesini yazdır
async function listBackups(sql) {
  const rows = await sql`
    SELECT id, reason, customer_count, created_at
    FROM app_state_backups
    ORDER BY created_at DESC
    LIMIT 20
  `;

  if (!rows.length) {
    console.log('Yedek bulunamadı.');
    return;
  }

  console.log('Son yedekler:');
  for (const row of rows) {
    console.log(
      `- id=${row.id} reason=${row.reason} customers=${row.customer_count} at=${row.created_at}`
    );
  }
}

// Seçili yedeği app_state'e geri yükle
async function restoreBackup(sql, backupId) {
  const rows = await sql`
    SELECT data, reason, customer_count, created_at
    FROM app_state_backups
    WHERE id = ${backupId}
    LIMIT 1
  `;

  const backup = rows[0];
  if (!backup?.data) {
    console.error(`Yedek bulunamadı: id=${backupId}`);
    process.exit(1);
  }

  const customers = Array.isArray(backup.data.customers) ? backup.data.customers : [];
  const adminCount = customers.filter((row) => row.isAdmin).length;

  await sql`
    INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${JSON.stringify(backup.data)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;

  console.log(`Geri yüklendi: backup id=${backupId} (${backup.reason}, ${backup.customer_count} üye, ${adminCount} admin)`);
  console.log('Sonraki adım: uygulamada PIN unuttum ile yeni PIN belirle veya eski PIN ile dene.');
}

// En son silme öncesi yedeği bul
async function findLatestPreDeleteBackup(sql) {
  const rows = await sql`
    SELECT id
    FROM app_state_backups
    WHERE reason = 'pre-delete'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function main() {
  const args = parseArgs(process.argv);
  const sql = getSql();

  if (args.list || (!args.latestPreDelete && !args.id)) {
    await listBackups(sql);
    if (!args.list && !args.latestPreDelete && !args.id) {
      console.log('\nGeri yüklemek için:');
      console.log('  node scripts/restore-state-backup.mjs --latest-pre-delete');
      console.log('  node scripts/restore-state-backup.mjs --id <numara>');
    }
    return;
  }

  let backupId = args.id;
  if (args.latestPreDelete) {
    backupId = await findLatestPreDeleteBackup(sql);
    if (!backupId) {
      console.error('pre-delete yedeği bulunamadı. --list ile id seçin.');
      process.exit(1);
    }
    console.log(`En son pre-delete yedek: id=${backupId}`);
  }

  if (!backupId || Number.isNaN(backupId)) {
    console.error('Geçerli --id gerekli.');
    process.exit(1);
  }

  await restoreBackup(sql, backupId);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
