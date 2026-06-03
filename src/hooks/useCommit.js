import { useEffect, useState } from 'react';
import { loadRemote, save, saveRemote } from '../lib/db.js';

// Veritabani state'ini yerel ve bulut ile senkron tutar
export function useCommit(initial) {
  const [db, setDb] = useState(initial);
  const [mode, setMode] = useState('local');

  useEffect(() => {
    loadRemote().then((r) => {
      if (r) {
        setDb(r);
        save(r);
        setMode('cloud');
      }
    });
  }, []);

  const commit = (n) => {
    setDb(n);
    save(n);
    saveRemote(n);
    setMode('cloud');
  };

  return [db, commit, mode];
}
