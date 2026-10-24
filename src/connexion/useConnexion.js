import { useSyncExternalStore } from 'react';
import { abonner, lireEtat } from '../hors-ligne/synchro.js';

// État de la synchronisation : { enLigne, enAttente, conflits, enCours, pret, derniereSynchro, erreur }.
export function useSynchro() {
  return useSyncExternalStore(abonner, lireEtat);
}

export function useEnLigne() {
  return useSynchro().enLigne;
}

// Écritures de la file locale pas encore acceptées par la base.
export function useFileAttente() {
  return useSynchro().enAttente;
}
