// Liberte Guardian — Approval Autopilot aksiyon kayıt defteri (allowlist)
// Tek sorumluluk: botun yapabileceği aksiyonları ve risk politikasını TANIMLAMAK.
// Yan etki yok; gerçek çalıştırma guardianActionExecutor.js'te yapılır.
//
// Risk seviyeleri (bölüm 2):
//   0 → otomatik uygulanabilir (zararsız gözlem/rapor)
//   1 → onaysız güvenli geçici müdahale (TTL'li, geri alınabilir)
//   2 → admin + PIN onayı gerektirir (davranış değişir, veri bozulmaz)
//   3 → asla otomatik uygulanmaz; yalnızca rapor/öneri üretilir

// İzin verilen aksiyonlar (allowlist). Burada olmayan hiçbir aksiyon çalışmaz.
export const GUARDIAN_ALLOWED_ACTIONS = Object.freeze({
  // Level 0 — otomatik, zararsız
  create_incident: { riskLevel: 0, requiresApproval: false, executable: true },
  send_admin_alert: { riskLevel: 0, requiresApproval: false, executable: true },
  generate_incident_report: { riskLevel: 0, requiresApproval: false, executable: true },

  // Level 1 — onaysız güvenli geçici müdahale (TTL zorunlu, geri alınabilir)
  reduce_polling: { riskLevel: 1, requiresApproval: false, executable: true, ttlRequired: true },
  degrade_realtime: { riskLevel: 1, requiresApproval: false, executable: true, ttlRequired: true },

  // Level 2 — admin + PIN onayı gerektirir
  propose_safe_mode: { riskLevel: 2, requiresApproval: true, executable: false },
  enable_safe_mode: { riskLevel: 2, requiresApproval: true, executable: true, ttlRequired: true },
  disable_safe_mode: { riskLevel: 2, requiresApproval: true, executable: true },
  show_maintenance_message: { riskLevel: 2, requiresApproval: true, executable: true, ttlRequired: true },

  // Level 3 — yalnızca öneri/rapor; teknik olarak çalıştırılamaz
  generate_cursor_fix_prompt: { riskLevel: 3, requiresApproval: false, executable: false }
});

// Kesinlikle yasaklı aksiyonlar (bölüm 5). Bot bunları asla uygulamaz.
export const GUARDIAN_BLOCKED_ACTIONS = Object.freeze([
  'run_migration',
  'deploy_production',
  'delete_customer',
  'modify_loyalty_balance',
  'change_admin_role',
  'change_env_secret',
  'change_database_config',
  'change_supabase_config',
  'change_vercel_config',
  'change_firebase_config'
]);

// Aksiyon yasaklı mı? (blocklist en yüksek önceliklidir)
export function isBlockedAction(action) {
  return GUARDIAN_BLOCKED_ACTIONS.includes(String(action || '').trim());
}

// Aksiyon allowlist'te mi?
export function isAllowedAction(action) {
  return Object.prototype.hasOwnProperty.call(GUARDIAN_ALLOWED_ACTIONS, String(action || '').trim());
}

// Aksiyon politikasını döndür (yoksa null)
export function getActionPolicy(action) {
  const key = String(action || '').trim();
  if (isBlockedAction(key)) return null;
  return GUARDIAN_ALLOWED_ACTIONS[key] || null;
}

// Bir aksiyonun otomatik (onaysız) uygulanabilir olup olmadığını döndür.
// Yalnızca allowlist'te + onay gerektirmeyen + çalıştırılabilir aksiyonlar.
export function isAutoExecutable(action) {
  const policy = getActionPolicy(action);
  return Boolean(policy && policy.executable && !policy.requiresApproval);
}

// Risk seviyesini döndür (bilinmiyorsa en yüksek riski varsay = 3)
export function riskLevelOf(action) {
  const policy = getActionPolicy(action);
  return policy ? policy.riskLevel : 3;
}
