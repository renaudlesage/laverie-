// Adaptateur Web NFC : Chrome Android uniquement, en HTTPS. Lit l'UID (serialNumber) du tag.

export const nfcDisponible = typeof window !== 'undefined' && 'NDEFReader' in window;

// À appeler depuis un geste de l'utilisateur. Renvoie une fonction d'arrêt.
export async function demarrerNfc(onLecture, onErreur) {
  const lecteur = new window.NDEFReader();
  const arret = new AbortController();
  lecteur.addEventListener('reading', (e) => {
    if (e.serialNumber) onLecture({ technologie: 'nfc', valeur_brute: e.serialNumber, source: 'nfc' });
  }, { signal: arret.signal });
  lecteur.addEventListener('readingerror', () => onErreur?.('Tag NFC illisible : réessayez en le tenant immobile.'), {
    signal: arret.signal,
  });
  await lecteur.scan({ signal: arret.signal });
  return () => arret.abort();
}
