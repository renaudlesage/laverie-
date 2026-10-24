import { supabase } from '../lib/supabase.js';
import { base, lireMeta, viderIndex, ecrireMeta } from './base.js';
import { protegesLocaux, rafraichir, tirerChangements, tirerReferentiels, tirerTout } from './tirage.js';

// Synchronisation : la file est poussée dans l'ordre (événements, opérations sur les lots,
// lectures brutes), puis l'index local est mis à jour depuis la base. Une écriture refusée
// par la base devient un conflit, sauf si l'écran qui l'a émise attend encore sa réponse.

const INTERVALLE_MS = 30_000;
const REFERENTIELS_MS = 5 * 60_000;
const COMPLET_MS = 24 * 3600_000;
const LOT_ENVOI = { evenement: 100, operation: 100, lecture: 500, signalement: 100 };
// Traces envoyées sans action de l'utilisateur à suivre : lectures brutes, alertes de circuits.
const TRACES = ['lecture', 'signalement'];

let contexte = null; // { utilisateurId, organisationId, index }
let etat = {
  enLigne: typeof navigator === 'undefined' ? true : navigator.onLine,
  enAttente: 0, // événements et opérations sur les lots
  tracesEnAttente: 0, // lectures brutes et signalements
  conflits: 0,
  enCours: false,
  pret: false,
  derniereSynchro: null,
  erreur: null,
};
const abonnes = new Set();
const changements = new Set(); // rappels (table) sur modification diffusée en direct
const attentes = new Map(); // id de l'écriture → résoudre(réponse | null)
let enVol = null;
let encore = false;
let dernierReferentiel = 0;

function publier(changement) {
  etat = { ...etat, ...changement };
  for (const f of abonnes) f();
}

export function abonner(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

export const lireEtat = () => etat;

export function contexteCourant() {
  return contexte && { ...contexte, enLigne: () => etat.enLigne };
}

const cleContexte = () => [contexte.utilisateurId, contexte.organisationId];

export async function compter() {
  if (!contexte) return;
  const [traces, tout, conflits] = await Promise.all([
    base.file.where('[utilisateur_id+organisation_id]').equals(cleContexte()).filter((i) => TRACES.includes(i.genre)).count(),
    base.file.where('[utilisateur_id+organisation_id]').equals(cleContexte()).count(),
    base.conflits.where('[utilisateur_id+organisation_id]').equals(cleContexte()).count(),
  ]);
  publier({ enAttente: tout - traces, tracesEnAttente: traces, conflits });
}

// Une erreur sans réponse exploitable de la base (réseau, session expirée, serveur) : on réessaiera.
class Interruption extends Error {}

async function envoyer(genre, organisationId, charges) {
  if (genre === 'lecture') {
    const { error, status } = await supabase
      .from('lectures_brutes')
      .upsert(charges, { onConflict: 'id', ignoreDuplicates: true });
    if (!error) return charges.map((c) => ({ id: c.id, statut: 'accepte' }));
    if (!status || status >= 500 || status === 401) throw new Interruption(error.message);
    // Une lecture invalide (lecteur supprimé…) ne bloque pas les autres : envoi une à une.
    const reponses = [];
    for (const c of charges) {
      const r = await supabase.from('lectures_brutes').upsert([c], { onConflict: 'id', ignoreDuplicates: true });
      if (r.error && (!r.status || r.status >= 500 || r.status === 401)) throw new Interruption(r.error.message);
      reponses.push({ id: c.id, statut: r.error ? 'abandon' : 'accepte', motif: r.error?.message });
    }
    return reponses;
  }
  const [rpc, parametre] = {
    evenement: ['ingerer_evenements', 'evenements'],
    operation: ['operer_lots', 'operations'],
    signalement: ['signaler_melanges', 'signalements'],
  }[genre];
  const { data, error } = await supabase.rpc(rpc, { org: organisationId, [parametre]: charges });
  if (error) throw new Interruption(error.message);
  return data;
}

async function pousser() {
  for (;;) {
    const items = await base.file.where('[utilisateur_id+organisation_id]').equals(cleContexte()).sortBy('seq');
    if (!items.length) return;
    const genre = items[0].genre;
    const paquet = [];
    for (const item of items) {
      if (item.genre !== genre || paquet.length >= LOT_ENVOI[genre]) break;
      paquet.push(item);
    }
    let reponses;
    try {
      reponses = await envoyer(genre, contexte.organisationId, paquet.map((i) => i.charge));
    } catch (e) {
      if (!(e instanceof Interruption) && !(e instanceof TypeError)) throw e;
      for (const i of paquet) attentes.get(i.charge.id)?.(null);
      throw new Interruption(e.message);
    }
    const parId = new Map(reponses.map((r) => [r.id, r]));
    const aRelire = { vetements: [], lots: [] };
    await base.transaction('rw', base.file, base.conflits, async () => {
      for (const item of paquet) {
        const r = parId.get(item.charge.id) ?? { statut: 'rejete', motif: 'Sans réponse de la base' };
        await base.file.delete(item.seq);
        if (r.statut !== 'rejete' || TRACES.includes(item.genre)) continue;
        aRelire.vetements.push(...item.vetements);
        aRelire.lots.push(...item.lots);
        if (!attentes.has(item.charge.id)) {
          await base.conflits.add({
            utilisateur_id: item.utilisateur_id,
            organisation_id: item.organisation_id,
            genre: item.genre,
            charge: item.charge,
            motif: r.motif,
            code: r.code ?? null,
            refuse_le: new Date().toISOString(),
          });
        }
      }
    });
    // La projection locale avait anticipé l'écriture refusée : on la relit à la base.
    if (aRelire.vetements.length || aRelire.lots.length) await rafraichir(contexte.organisationId, aRelire);
    for (const item of paquet) attentes.get(item.charge.id)?.(parId.get(item.charge.id) ?? null);
    await compter();
  }
}

async function tirer() {
  const { organisationId, utilisateurId } = contexte;
  const reste = await base.file.where('[utilisateur_id+organisation_id]').equals(cleContexte()).count();
  const proteges = await protegesLocaux(utilisateurId, organisationId);
  const complet = await lireMeta(`complet:${organisationId}`);
  if (!complet || (Date.now() - new Date(complet).getTime() > COMPLET_MS && reste === 0)) {
    await tirerTout(organisationId, proteges);
    dernierReferentiel = Date.now();
  } else {
    if (Date.now() - dernierReferentiel > REFERENTIELS_MS) {
      await tirerReferentiels(organisationId);
      dernierReferentiel = Date.now();
    }
    await tirerChangements(organisationId, proteges);
  }
}

async function cycle() {
  if (!contexte || !etat.enLigne) return;
  const ctx = contexte;
  publier({ enCours: true });
  try {
    await pousser();
    if (ctx !== contexte) return;
    if (ctx.index) await tirer();
    const maintenant = new Date().toISOString();
    await ecrireMeta(`synchro:${ctx.organisationId}`, maintenant);
    publier({ derniereSynchro: maintenant, erreur: null, pret: true });
  } catch (e) {
    publier({ erreur: e.message || String(e) });
  } finally {
    publier({ enCours: false });
  }
}

async function boucle() {
  while (encore) {
    encore = false;
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request('suivi-linge-synchro', cycle);
    } else {
      await cycle();
    }
  }
}

export function synchroniser() {
  encore = true;
  if (!enVol) enVol = boucle().finally(() => (enVol = null));
  return enVol;
}

// Attend la réponse de la base pour ces écritures (au plus `delai` ms) ; null si pas de réponse.
export function attendre(ids, delai = 6000) {
  const promesses = ids.map(
    (id) =>
      new Promise((resoudre) => {
        attentes.set(id, (r) => {
          attentes.delete(id);
          resoudre(r);
        });
      }),
  );
  const minuterie = new Promise((resoudre) => setTimeout(resoudre, delai));
  return {
    resultat: Promise.race([Promise.all(promesses), minuterie.then(() => null)]).then((r) => {
      for (const id of ids) attentes.delete(id);
      return r ?? ids.map(() => null);
    }),
    abandonner: (id) => attentes.get(id)?.(null),
  };
}

// Modifications faites ailleurs (autre appareil, tâche horaire), diffusées par Supabase Realtime.
export function abonnerChangements(rappel) {
  changements.add(rappel);
  return () => changements.delete(rappel);
}

function ecouter(organisationId, index) {
  let minuterie = null;
  const recevoir = (table) => {
    for (const f of changements) f(table);
    if (!index || table === 'alertes') return;
    // Index local : une seule synchronisation pour une rafale de modifications.
    clearTimeout(minuterie);
    minuterie = setTimeout(() => synchroniser(), 1500);
  };
  let canal = supabase.channel(`organisation-${organisationId}`);
  for (const table of ['vetements', 'lots', 'alertes']) {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table, filter: `organisation_id=eq.${organisationId}` }, () =>
      recevoir(table),
    );
  }
  canal.subscribe();
  return () => {
    clearTimeout(minuterie);
    supabase.removeChannel(canal);
  };
}

// Démarre la synchronisation pour un utilisateur et une organisation. Renvoie l'arrêt.
//   index : tenir l'index local (rôles de laverie) ; sinon seule la file est poussée.
export async function demarrer({ utilisateurId, organisationId, index }) {
  const precedent = await lireMeta('utilisateur');
  if (precedent !== utilisateurId) await viderIndex(); // appareil partagé : jamais l'index d'un autre
  await ecrireMeta('utilisateur', utilisateurId);
  const moi = { utilisateurId, organisationId, index };
  contexte = moi;
  dernierReferentiel = 0;
  publier({
    pret: !index || !!(await lireMeta(`complet:${organisationId}`)),
    derniereSynchro: await lireMeta(`synchro:${organisationId}`),
    erreur: null,
  });
  await compter();

  const enLigne = () => {
    publier({ enLigne: true });
    synchroniser();
  };
  const horsLigne = () => publier({ enLigne: false });
  const visible = () => document.visibilityState === 'visible' && synchroniser();
  window.addEventListener('online', enLigne);
  window.addEventListener('offline', horsLigne);
  document.addEventListener('visibilitychange', visible);
  const minuterie = setInterval(() => document.visibilityState !== 'hidden' && synchroniser(), INTERVALLE_MS);
  const arreterEcoute = supabase.channel ? ecouter(organisationId, index) : () => {};
  synchroniser();

  return () => {
    window.removeEventListener('online', enLigne);
    window.removeEventListener('offline', horsLigne);
    document.removeEventListener('visibilitychange', visible);
    clearInterval(minuterie);
    arreterEcoute();
    if (contexte === moi) contexte = null;
  };
}

// Écritures faites directement en ligne (enrôlement, tags, import) : l'index local est relu
// tout de suite pour ces vêtements, sans attendre le prochain tirage.
export async function apresEcritureDirecte(organisationId, vetementIds) {
  if (!contexte?.index || contexte.organisationId !== organisationId || !etat.enLigne) return;
  try {
    await rafraichir(organisationId, { vetements: vetementIds });
  } catch {
    // Le prochain tirage s'en chargera.
  }
}

// Conflits : remettre dans la file (même identifiant, la base retranche) ou classer.
export async function reessayer(conflit) {
  await base.transaction('rw', base.file, base.conflits, async () => {
    await base.conflits.delete(conflit.n);
    await base.file.add({
      utilisateur_id: conflit.utilisateur_id,
      organisation_id: conflit.organisation_id,
      genre: conflit.genre,
      charge: conflit.charge,
      vetements: [conflit.charge.vetement_id].filter(Boolean),
      lots: [conflit.charge.lot_id].filter(Boolean),
      depose_le: new Date().toISOString(),
    });
  });
  await compter();
  return synchroniser();
}

export async function classer(conflit) {
  await base.conflits.delete(conflit.n);
  await compter();
}

// Pour les tests.
export function _reinitialiser() {
  contexte = null;
  attentes.clear();
  encore = false;
  etat = { ...etat, enAttente: 0, conflits: 0, enCours: false, pret: false, erreur: null, enLigne: true };
}

export function _definirContexte(c) {
  contexte = c;
}

export function _definirEnLigne(enLigne) {
  publier({ enLigne });
}
