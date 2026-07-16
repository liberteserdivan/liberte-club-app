// Cihaz kimliği — oturum yenileme için (oturum token'ı değil)

const DEVICE_KEY = 'liberteDeviceId';

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Kalıcı cihaz kimliği
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}
