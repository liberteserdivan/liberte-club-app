import { loadSafeModeConfigFromDb, loadOpenIncidentsFromDb } from './guardianStore.js';
import { mergeSafeModeFromDb } from './guardianSafeMode.js';
import { mergeIncidentsFromDb } from './guardianIncidents.js';
import { ROUTE_TIMING } from '../routeTiming.js';
import { withRouteDeadline } from '../routeDeadline.js';

const HYDRATE_INTERVAL_MS = 15_000;
let lastHydrateAt = 0;
let hydrateInFlight = null;

// Guardian DB senkronu — musteri cekirdegini bloklamamak icin ust sinir
async function runBoundedHydrate() {
  return withRouteDeadline(async () => {
    const [safeConfig, openIncidents] = await Promise.all([
      loadSafeModeConfigFromDb(),
      loadOpenIncidentsFromDb(50)
    ]);
    if (safeConfig) mergeSafeModeFromDb(safeConfig);
    if (openIncidents.length > 0) mergeIncidentsFromDb(openIncidents);
  }, ROUTE_TIMING.GUARDIAN_HYDRATE_MS, 'guardian-hydrate');
}

export async function hydrateGuardianState(force = false) {
  const now = Date.now();
  if (!force && lastHydrateAt > 0 && now - lastHydrateAt < HYDRATE_INTERVAL_MS) return;
  if (hydrateInFlight) return hydrateInFlight;

  hydrateInFlight = (async () => {
    try {
      await runBoundedHydrate();
    } catch {
      // Bellek modu
    } finally {
      lastHydrateAt = Date.now();
      hydrateInFlight = null;
    }
  })();

  return hydrateInFlight;
}

export function resetGuardianHydrate() {
  lastHydrateAt = 0;
  hydrateInFlight = null;
}
