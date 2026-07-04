export function isRouteDeadlineError(error) {
  return error?.code === 'ROUTE_DEADLINE';
}

export async function withRouteDeadline(task, deadlineMs, label = 'route', { getPhase } = {}) {
  if (!deadlineMs || deadlineMs <= 0) return task();

  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const phase = typeof getPhase === 'function' ? getPhase() : 'route_deadline';
          reject(Object.assign(new Error(`${label} deadline`), {
            code: 'ROUTE_DEADLINE',
            phase: phase || 'route_deadline'
          }));
        }, deadlineMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
