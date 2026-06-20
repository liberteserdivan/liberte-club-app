import { getSupabaseClient, resetSupabaseClient, refreshRealtimeAuth } from './supabaseClient.js';

const channelRegistry = new Map();
let messageCount = 0;
let reconnectCount = 0;

// Realtime metrikleri — debug için
export function getRealtimeMetrics() {
  return {
    activeChannels: channelRegistry.size,
    messageCount,
    reconnectCount
  };
}

// Debounce yardımcısı
export function createDebouncedTask(delayMs = 450) {
  let timer = null;
  return (fn) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delayMs);
  };
}

// Postgres değişikliği dinle — payload UI'ya uygulanmaz, yalnızca tetikleyici
function attachPostgresListener(channel, { schema = 'public', table, filter, event = '*', onChange }) {
  const config = { event, schema, table };
  if (filter) config.filter = filter;

  channel.on('postgres_changes', config, (payload) => {
    messageCount += 1;
    onChange?.(payload);
  });
}

// Kanal oluştur veya mevcut olanı döndür
export async function openRealtimeChannel(key, builder) {
  if (channelRegistry.has(key)) {
    return channelRegistry.get(key);
  }

  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  await refreshRealtimeAuth();

  const channel = supabase.channel(key);
  builder(channel, attachPostgresListener);

  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      reconnectCount += 1;
      console.warn('[realtime.channel]', key, status, err?.message || '');
    }
    if (status === 'SUBSCRIBED') {
      console.info('[realtime.channel]', key, 'subscribed');
    }
  });

  channelRegistry.set(key, channel);
  return channel;
}

// Tek kanalı kapat
export async function closeRealtimeChannel(key) {
  const channel = channelRegistry.get(key);
  if (!channel) return;

  const supabase = await getSupabaseClient();
  channelRegistry.delete(key);
  if (supabase) {
    await supabase.removeChannel(channel);
  }
}

// Tüm kanalları kapat — logout
export async function closeAllRealtimeChannels() {
  const keys = [...channelRegistry.keys()];
  await Promise.all(keys.map((key) => closeRealtimeChannel(key)));
  resetSupabaseClient();
}
