/** BUG-026 — demo/seed scriptleri production'da varsayilan olarak durur */
export function assertDemoSeedAllowed(scriptName = 'seed') {
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!isProd) return;
  if (process.env.ALLOW_PROD_DEMO_SEED === '1') {
    console.warn(JSON.stringify({ ok: true, warn: 'ALLOW_PROD_DEMO_SEED', script: scriptName }));
    return;
  }
  console.error(JSON.stringify({
    ok: false,
    error: 'PROD_DEMO_SEED_BLOCKED',
    script: scriptName,
    hint: 'Set ALLOW_PROD_DEMO_SEED=1 only for intentional non-destructive demos'
  }));
  process.exit(2);
}