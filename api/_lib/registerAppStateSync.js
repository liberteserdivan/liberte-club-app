// Kayıt sonrası legacy app_state senkronu — best-effort, kayıt yanıtını bloklamaz
export function queueRegisterAppStateSync(payload, requestId = '') {
  void syncRegisterAppState(payload, requestId).catch((error) => {
    console.warn('[register.app_state_sync]', requestId, error?.message || error);
  });
}

async function syncRegisterAppState(payload, requestId) {
  const { loadAppState, saveAppState } = await import('./appState.js');
  const remote = await loadAppState({ skipPersist: true, skipCache: true });
  const state = remote.data || { customers: [], loyalty: {}, history: [] };
  const customers = Array.isArray(state.customers) ? [...state.customers] : [];
  const index = customers.findIndex((c) => Number(c.id) === Number(payload.customer.id));

  if (index >= 0) {
    customers[index] = { ...customers[index], ...payload.customer };
  } else {
    customers.push(payload.customer);
  }

  state.customers = customers;
  state.loyalty = { ...(state.loyalty || {}), [payload.customer.id]: payload.loyalty };
  if (payload.historyEntry) {
    state.history = [payload.historyEntry, ...(state.history || [])];
  }

  await saveAppState(state, { skipBackup: true });
}
