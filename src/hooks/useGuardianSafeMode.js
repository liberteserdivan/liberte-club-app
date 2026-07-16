import { useEffect, useState } from 'react';
import { getSafeModeState, subscribeSafeMode } from '../lib/safeMode.js';

// Liberte Guardian — istemci Safe Mode durumu hook'u
// Tek sorumluluk: safeMode.js bellek durumunu React'e bağlamak.
// Durum, API yanıtlarındaki x-safe-mode header'ı ile otomatik güncellenir;
// bu hook ekstra ağ isteği yapmaz (pasif dinleyici).

export default function useGuardianSafeMode() {
  const [state, setState] = useState(getSafeModeState);

  useEffect(() => {
    setState(getSafeModeState());
    return subscribeSafeMode(setState);
  }, []);

  return state;
}
