import { createClient } from '@supabase/supabase-js';
import { apiFetch } from './apiClient.js';
import { isNativeApp } from './platform.js';
import { bootstrapSession, getRealtimeToken, patchMemorySession } from './session.js';

let cachedConfig = null;
let cachedClient = null;
let lastRealtimeToken = null;

// Supabase public config — build-time veya runtime API
async function resolveSupabaseConfig() {
  if (cachedConfig?.enabled) return cachedConfig;

  const fromBuild = {
    url: String(import.meta.env.VITE_SUPABASE_URL || '').trim(),
    anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
  };

  if (fromBuild.url && fromBuild.anonKey) {
    cachedConfig = { ...fromBuild, enabled: true };
    return cachedConfig;
  }

  try {
    const response = await apiFetch('/api/config?resource=supabase');
    if (response.ok) {
      const data = await response.json();
      if (data?.url && data?.anonKey) {
        cachedConfig = {
          url: String(data.url).trim(),
          anonKey: String(data.anonKey).trim(),
          enabled: true
        };
        return cachedConfig;
      }
    }
  } catch {
    // Realtime opsiyonel — sessizce devre dışı
  }

  cachedConfig = { url: '', anonKey: '', enabled: false };
  return cachedConfig;
}

// RLS sonrası Realtime JWT — oturum tokenı değişince yenile
export async function refreshRealtimeAuth() {
  const supabase = cachedClient;
  if (!supabase) return;

  const token = getRealtimeToken();
  if (!token || token === lastRealtimeToken) return;

  await supabase.realtime.setAuth(token);
  lastRealtimeToken = token;
}

// Supabase istemcisi — yalnızca anon key + backend mint JWT
export async function getSupabaseClient() {
  const config = await resolveSupabaseConfig();
  if (!config.enabled) return null;

  if (!cachedClient) {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          // Native WebView'da kasa LP güncellemeleri daha sık gelebilsin
          eventsPerSecond: isNativeApp() ? 10 : 4
        }
      }
    });
  }

  await refreshRealtimeAuth();
  return cachedClient;
}

// Realtime JWT süresi dolduğunda oturumdan yeni token al
export async function refreshRealtimeSessionFromServer() {
  const result = await bootstrapSession();
  if (!result?.session) return false;

  patchMemorySession({
    realtimeToken: result.session.realtimeToken || null,
    adminVerified: Boolean(result.session.adminVerified),
    isAdmin: Boolean(result.session.isAdmin),
    role: result.session.role || 'user'
  });
  await refreshRealtimeAuth();
  return Boolean(result.session.realtimeToken);
}

// Logout sonrası önbelleği temizle
export function resetSupabaseClient() {
  cachedClient = null;
  cachedConfig = null;
  lastRealtimeToken = null;
}

// Realtime kullanılabilir mi?
export async function isSupabaseRealtimeEnabled() {
  const config = await resolveSupabaseConfig();
  return Boolean(config.enabled);
}
