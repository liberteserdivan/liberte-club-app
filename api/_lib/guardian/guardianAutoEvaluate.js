import { evaluateAndIntervene } from './guardianRules.js';

const EVAL_DEBOUNCE_MS = 30_000;
let lastEvalAt = 0;
let evalTimer = null;
let evalInFlight = false;

export function scheduleGuardianEvaluation() {
  const now = Date.now();
  const elapsed = now - lastEvalAt;
  if (evalTimer) return;
  const delay = elapsed >= EVAL_DEBOUNCE_MS ? 50 : (EVAL_DEBOUNCE_MS - elapsed);
  evalTimer = setTimeout(() => { evalTimer = null; void runGuardianEvaluation(); }, delay);
}

async function runGuardianEvaluation() {
  if (evalInFlight) return;
  evalInFlight = true;
  lastEvalAt = Date.now();
  try { await evaluateAndIntervene(); } catch { /* yoksay */ } finally { evalInFlight = false; }
}

export function resetGuardianAutoEvaluate() {
  if (evalTimer) clearTimeout(evalTimer);
  evalTimer = null;
  lastEvalAt = 0;
  evalInFlight = false;
}