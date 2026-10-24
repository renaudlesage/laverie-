import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { base, toutEffacer } from './base.js';
import { contexteCourant, lireEtat, synchroniser } from './synchro.js';

// Déconnexion : ce qui peut partir part, puis l'index et la file de l'appareil sont effacés
// (appareil partagé). S'il reste des écritures non envoyées, on demande confirmation.
export function useSortie() {
  const { deconnexion, utilisateur } = useAuth();
  const [enCours, setEnCours] = useState(false);

  async function sortir() {
    setEnCours(true);
    const { enLigne } = lireEtat();
    if (enLigne && contexteCourant()) await synchroniser();
    // Toutes zones confondues, synchronisation démarrée ou non (écran de choix de la zone).
    const nonEnvoyes = utilisateur ? await base.file.filter((i) => i.utilisateur_id === utilisateur.id).count() : 0;
    if (
      nonEnvoyes > 0 &&
      !window.confirm(
        `${nonEnvoyes} écriture(s) ne sont pas encore envoyées${enLigne ? '' : ' (hors ligne)'} et seront perdues. Se déconnecter quand même ?`,
      )
    ) {
      setEnCours(false);
      return;
    }
    await toutEffacer();
    await deconnexion();
  }

  return { sortir, enCours };
}
