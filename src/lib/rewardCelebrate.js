const CONFETTI_COLORS = ['#d8c29d', '#fff4d4', '#9fdcc7', '#ffffff', '#f2dfad'];
const SESSION_KEY = 'liberteReadyCelebrate';

// Hazır ikram kutlaması — oturumda bir kez
export function shouldCelebrateReadyRewards() {
  if (typeof sessionStorage === 'undefined') return true;
  return !sessionStorage.getItem(SESSION_KEY);
}

export function markReadyRewardsCelebrated() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Sessizce geç
  }
}

// Hafif titreşim — destekleyen cihazlarda
export function triggerRewardHaptic() {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;

  try {
    navigator.vibrate([10, 32, 10]);
  } catch {
    // Sessizce geç
  }
}

// Konfeti parçacığı oluştur
function createConfettiPiece(layer, originX, originY, index) {
  const piece = document.createElement('span');
  piece.className = 'rewardConfettiPiece';

  const angle = (Math.random() - 0.5) * 2.4;
  const distance = 36 + Math.random() * 64;
  const dx = Math.sin(angle) * distance;
  const dy = -Math.abs(Math.cos(angle) * distance) - Math.random() * 28;
  const rot = Math.floor(Math.random() * 360);
  const size = 4 + Math.random() * 5;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const delay = Math.random() * 90;

  piece.style.left = `${originX}px`;
  piece.style.top = `${originY}px`;
  piece.style.width = `${size}px`;
  piece.style.height = `${Math.max(3, size * 0.55)}px`;
  piece.style.background = color;
  piece.style.setProperty('--cf-dx', `${dx}px`);
  piece.style.setProperty('--cf-dy', `${dy}px`);
  piece.style.setProperty('--cf-rot', `${rot}deg`);
  piece.style.animationDelay = `${delay}ms`;

  layer.appendChild(piece);
}

// Hafif konfeti patlaması — kart merkezinden
export function burstConfetti(anchor, { count = 18, duration = 1200 } = {}) {
  if (typeof document === 'undefined' || !anchor?.getBoundingClientRect) return;

  const rect = anchor.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const layer = document.createElement('div');

  layer.className = 'rewardConfettiLayer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  for (let i = 0; i < count; i += 1) {
    createConfettiPiece(layer, originX, originY, i);
  }

  window.setTimeout(() => layer.remove(), duration);
}
