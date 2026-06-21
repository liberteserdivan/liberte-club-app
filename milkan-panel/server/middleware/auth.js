import crypto from 'crypto';
import { loadConfig } from '../config.js';

const sessions = new Map();
const SESSION_MS = 12 * 60 * 60 * 1000;

/** Oturum token üretir */
export function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}

/** PIN doğrular */
export function verifyPin(pin) {
  const cfg = loadConfig();
  return String(pin).trim() === cfg.panelPin;
}

/** İstekte oturum kontrolü yapar */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Oturum gerekli' });
  }
  const exp = sessions.get(token);
  if (Date.now() > exp) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Oturum süresi doldu' });
  }
  sessions.set(token, Date.now() + SESSION_MS);
  next();
}

/** Header veya body'den token okur */
function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers['x-panel-token'] || '';
}

/** Oturumu sonlandırır */
export function revokeSession(token) {
  sessions.delete(token);
}
