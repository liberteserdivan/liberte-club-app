import { loadSafeModeConfigFromDb, loadOpenIncidentsFromDb } from './guardianStore.js';
import { mergeSafeModeFromDb } from './guardianSafeMode.js';
import { mergeIncidentsFromDb } from './guardianIncidents.js';

const HYDRATE_INTERVAL_MS = 15_000;
let lastHydrateAt = 0;
let hydrateInFlight = null;

export async function hydrateGuardianState(force = false) {
  const now = Date.now();
  if (!force && lastHydrateAt > 0 && now - lastHydrateAt < HYDRATE_INTERVAL_MS) return;
  if (hydrateInFlight) return hydrateInFlight;
  hydrateInFlight = (async () => {
    try {
      const [safeConfig, openIncidents] = await Promise.all([
        loadSafeModeConfigFromDb(), loadOpenIncidentsFromDb(50)
      ]);
      if (safeConfig) mergeSafeModeFromDb(safeConfig);
      if (openIncidents.length > 0) mergeIncidentsFromDb(openIncidents);
    } catch { /* bellek modu */ } finally {
      lastHydrateAt = Date.now();
      hydrateInFlight = null;
    }
  })();
  return hydrateInFlight;
}

export function resetGuardianHydrate() { lastHydrateAt = 0; hydrateInFlight = null; }