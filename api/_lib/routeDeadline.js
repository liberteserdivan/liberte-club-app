import { forceResetSqlClient } from './sql.js';

export function isRouteDeadlineError(error) {
  return error?.code === 'ROUTE_DEADLINE';
}

// Kaynakları serbest bırak — varsayılan: SQL force reset (max:1 slot koruması)
async function releaseOnDeadline(label, onDeadline) {
  if (typeof onDeadline === 'function') {
    await onDeadline();
    return;
  }
  await forceResetSqlClient(`route_deadline:${label}`);
}

// task + hard deadline. Deadline aşılırsa SQL bağlantısı serbest bırakılır
// (Promise.race tek başına alt sorguyu iptal etmez → pool bloke kalırdı).
export async function withRouteDeadline(task, deadlineMs, label = 'route', { getPhase, onDeadline } = {}) {
  if (!deadlineMs || deadlineMs <= 0) return task();

  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const phase = typeof getPhase === 'function' ? getPhase() : 'route_deadline';
          const err = Object.assign(new Error(`${label} deadline`), {
            code: 'ROUTE_DEADLINE',
            phase: phase || 'route_deadline'
          });
          // Önce slot'u bırak, sonra 503 yoluna düş — retry taze bağlantı alsın
          Promise.resolve()
            .then(() => releaseOnDeadline(label, onDeadline))
            .catch(() => {})
            .finally(() => reject(err));
        }, deadlineMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
