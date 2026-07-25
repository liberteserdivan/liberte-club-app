// Production API gecikme ölçümü — soğuk/sıcak başlangıç farkını görmek için
const base = process.argv[2] || 'https://app.libertegastrocafe.com';
const paths = ['/api/auth/session', '/api/realtime?resource=promos'];

for (const path of paths) {
  const url = base + path;
  console.log('--- ' + url);
  for (let i = 1; i <= 4; i += 1) {
    const t = Date.now();
    try {
      const r = await fetch(url, { method: 'GET' });
      const txt = await r.text();
      console.log('#' + i + ' status=' + r.status + ' ms=' + (Date.now() - t) + ' len=' + txt.length);
    } catch (e) {
      console.log('#' + i + ' ERR ms=' + (Date.now() - t) + ' ' + e.message);
    }
  }
}
