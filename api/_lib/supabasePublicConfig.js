// Supabase Realtime — yalnızca public URL + anon key (service role asla frontend'e gitmez)

// DATABASE_URL içinden proje ref çıkar — pooler URI'den REST/Realtime host türet
export function deriveSupabaseProjectRef(connectionString = '') {
  const url = String(connectionString || '');
  const userMatch = url.match(/\/\/([^:@/]+)/);
  const user = userMatch?.[1] || '';
  const refMatch = user.match(/^postgres\.([a-z0-9]+)$/i);
  return refMatch?.[1] || '';
}

// Public Supabase yapılandırması — secret sızdırmaz
export function readSupabasePublicConfig() {
  const explicitUrl = String(
    process.env.SUPABASE_URL
    || process.env.VITE_SUPABASE_URL
    || ''
  ).trim();

  const anonKey = String(
    process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || ''
  ).trim();

  const projectRef = deriveSupabaseProjectRef(process.env.DATABASE_URL);
  const derivedUrl = projectRef ? `https://${projectRef}.supabase.co` : '';
  const url = explicitUrl || derivedUrl;

  return {
    url,
    anonKey,
    projectRef: projectRef || null,
    enabled: Boolean(url && anonKey),
    realtimeReady: Boolean(url && anonKey)
  };
}
