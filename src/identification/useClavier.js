import { useEffect, useRef } from 'react';
import { creerDetecteurClavier } from './detecteurClavier.js';

function estChampSaisie(cible) {
  return cible instanceof HTMLElement && (cible.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName));
}

// Écoute globale des douchettes en émulation clavier, hors champs de saisie
// (dans un champ, la douchette tape dans le champ et Entrée valide le formulaire).
export function useClavier(onLecture, actif = true) {
  const rappel = useRef(onLecture);
  rappel.current = onLecture;

  useEffect(() => {
    if (!actif) return undefined;
    const detecteur = creerDetecteurClavier();
    const ecouter = (e) => {
      if (estChampSaisie(e.target)) return;
      const valeur = detecteur.touche(e.key, e.timeStamp);
      if (valeur) {
        e.preventDefault(); // Entrée de fin de lecture : ne pas activer le bouton qui a le focus
        rappel.current({ technologie: null, valeur_brute: valeur, source: 'clavier' });
      }
    };
    window.addEventListener('keydown', ecouter, true);
    return () => window.removeEventListener('keydown', ecouter, true);
  }, [actif]);
}
