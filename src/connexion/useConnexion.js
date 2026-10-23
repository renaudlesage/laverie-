import { useEffect, useState } from 'react';

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

// Nombre d'événements en attente de synchronisation.
// La file locale (Dexie) arrive au jalon M7 ; d'ici là elle est toujours vide.
export function useFileAttente() {
  return 0;
}
