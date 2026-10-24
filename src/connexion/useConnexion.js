import { useEffect, useState, useSyncExternalStore } from 'react';
import { abonnerFile, nombreEnAttente } from '../journal/journal.js';

export function useEnLigne() {
  const [enLigne, setEnLigne] = useState(() => navigator.onLine);
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener('online', maj);
    window.addEventListener('offline', maj);
    return () => {
      window.removeEventListener('online', maj);
      window.removeEventListener('offline', maj);
    };
  }, []);
  return enLigne;
}

// Nombre d'événements en cours d'envoi (file persistée hors ligne au jalon M7).
export function useFileAttente() {
  return useSyncExternalStore(abonnerFile, nombreEnAttente);
}
