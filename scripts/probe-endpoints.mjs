// Production uç noktası sağlık probu — kimlik gerektirmeyen yanıtlar ölçülür
const base = process.argv[2] || 'https://app.liberte.cafe';

const checks = [
  { name: 'health', method: 'GET', path: '/api/health' },
  { name: 'session(GET)', method: 'GET', path: '/api/auth/session' },
  { name: 'login(POST bos)', method: 'POST', path: '/api/auth/login', body: {} },
  { name: 'realtime(GET)', method: 'GET', path: '/api/realtime?resource=promos' },
  { name: 'qr-generate(POST bos)', method: 'POST', path: '/api/qr/generate', body: {} },
  { name: 'push-send(POST yetkisiz)', method: 'POST', path: '/api/push/send', body: { title: 't', body: 'b', audience: 'all' } },
  { name: 'config-firebase', method: 'GET', path: '/api/config?resource=firebase' },
  { name: 'config-supabase', method: 'GET', path: '/api/config?resource=supabase' }
];

for (const c of checks) {
  const t = Date.now();
  try {
    const opt = { method: c.method, headers: { 'Content-Type': 'application/json' } };
    if (c.body) opt.body = JSON.stringify(c.body);
    const r = await fetch(base + c.path, opt);
    const txt = await r.text();
    let short = txt.slice(0, 120).replace(/\s+/g, ' ');
    console.log(`${c.name.padEnd(26)} ${r.status}  ${Date.now() - t}ms  ${short}`);
  } catch (e) {
    console.log(`${c.name.padEnd(26)} ERR ${Date.now() - t}ms ${e.message}`);
  }
}
