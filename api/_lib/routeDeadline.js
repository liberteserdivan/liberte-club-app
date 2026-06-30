// Rota suresi ust siniri — ic DB helper takilsa bile kontrollu JSON doner

export function isRouteDeadlineError(error) {
  return error?.code === 'ROUTE_DEADLINE';
}

export async function withRouteDeadline(task, deadlineMs, label = 'route') {
  if (!deadlineMs || deadlineMs <= 0) return task();

  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error(`${label} deadline`), { code: 'ROUTE_DEADLINE' }));
        }, deadlineMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
