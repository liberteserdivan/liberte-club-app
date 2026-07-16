// Oturum nesli — login/logout geçişlerinde artar; uçuştaki API yanıtları geçersiz kılınır.
// apiClient ile session arasında döngüsel import olmaması için ayrı modül.
let authEpoch = 0;

export function getAuthEpoch() {
  return authEpoch;
}

export function bumpAuthEpoch() {
  authEpoch += 1;
  return authEpoch;
}