import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRouter);

const webDist = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(webDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) res.status(404).send('Web arayüzü henüz derlenmedi. npm run dev:web ile geliştirin.');
  });
});

app.listen(cfg.port, () => {
  console.log(`Milkan panel API: http://localhost:${cfg.port}`);
  console.log(`Mod: ${cfg.mock ? 'MOCK (demo veri)' : `SQL ${cfg.sql.server}/${cfg.sql.database}`}`);
});
