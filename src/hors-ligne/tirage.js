import { supabase } from '../lib/supabase.js';
import { base, ecrireMeta, lireMeta } from './base.js';

// Tirage de l'index local depuis la base, par l'API ordinaire : la RLS borne ce que
// l'appareil reçoit au périmètre de l'utilisateur (laverie externe : vêtements confiés,
// porteurs par matricule ou casier seulement).

const COLONNES = {
  vetements:
    'id, organisation_id, article_id, taille, numero_serie, mis_en_service_le, nominatif, statut, contamine, site_id, porteur_id, lot_id, derniere_lecture_le, controle_renforce, cree_le, modifie_le',
  identifiants: 'id, organisation_id, vetement_id, technologie, valeur, actif, modifie_le',
  compteurs: 'organisation_id, vetement_id, traitement_id, passages, modifie_le',
  lots: 'id, organisation_id, type, circuit, site_id, site_destination_id, traitement_id, programme, machine, statut, ouvert_le, cloture_le, quantite_attendue, sac_id, modifie_le',
};

const REFERENTIELS = {
  sites: ['sites', 'id, organisation_id, nom, type, actif'],
  traitements: ['traitements', 'id, organisation_id, code, libelle, circuit, actif, cree_le'],
  sacs: ['sacs', 'id, organisation_id, nom, circuit, technologie, code, site_id, actif'],
  articles: ['articles', 'id, organisation_id, designation, reference, duree_vie_mois, actif'],
  articles_limites: ['articles_limites', 'id, organisation_id, article_id, traitement_id, limite'],
  vetements_limites: ['vetements_limites', 'id, organisation_id, vetement_id, traitement_id, limite'],
  porteurs: ['porteurs_anonymises', 'id, organisation_id, matricule, casier, site_id, actif'],
};

const TAILLE_PAGE = 1000;
const RECOUVREMENT_MS = 5 * 60 * 1000; // transactions longues : on relit les 5 dernières minutes
const LOTS_RECENTS_JOURS = 7;
const ORIGINE = '1970-01-01T00:00:00Z';

async function toutLire(construire) {
  const lignes = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await construire().range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw error;
    lignes.push(...data);
    if (data.length < TAILLE_PAGE) return lignes;
  }
}

const ordonner = (table, requete) =>
  table === 'compteurs' ? requete.order('vetement_id').order('traitement_id') : requete.order('id');

const cleCompteur = (c) => [c.vetement_id, c.traitement_id];

// Vêtements et lots modifiés sur l'appareil et pas encore envoyés : le tirage ne les écrase pas.
export async function protegesLocaux(utilisateurId, organisationId) {
  const vetements = new Set();
  const lots = new Set();
  await base.file.where('[utilisateur_id+organisation_id]').equals([utilisateurId, organisationId]).each((item) => {
    for (const id of item.vetements ?? []) vetements.add(id);
    for (const id of item.lots ?? []) lots.add(id);
  });
  return { vetements, lots };
}

export async function tirerReferentiels(organisationId) {
  const resultats = {};
  for (const [table, [source, colonnes]] of Object.entries(REFERENTIELS)) {
    resultats[table] = await toutLire(() =>
      supabase.from(source).select(colonnes).eq('organisation_id', organisationId).order('id'),
    );
  }
  await base.transaction('rw', Object.keys(REFERENTIELS).map((t) => base.table(t)), async () => {
    for (const [table, lignes] of Object.entries(resultats)) {
      await base.table(table).where('organisation_id').equals(organisationId).delete();
      await base.table(table).bulkPut(lignes);
    }
  });
}

function filtrerProteges(table, lignes, proteges) {
  if (table === 'lots') return lignes.filter((l) => !proteges.lots.has(l.id));
  const cle = table === 'vetements' ? 'id' : 'vetement_id';
  return lignes.filter((l) => !proteges.vetements.has(l[cle]));
}

function plusRecent(lignes, actuel) {
  return lignes.reduce((m, l) => (l.modifie_le > m ? l.modifie_le : m), actuel ?? '');
}

// Tirage complet : remplace l'index de l'organisation (vêtements sortis du périmètre compris).
export async function tirerTout(organisationId, proteges) {
  const depuisLots = new Date(Date.now() - LOTS_RECENTS_JOURS * 86400000).toISOString();
  const resultats = {};
  for (const table of Object.keys(COLONNES)) {
    resultats[table] = await toutLire(() => {
      let q = supabase.from(table).select(COLONNES[table]).eq('organisation_id', organisationId);
      if (table === 'lots') q = q.or(`statut.in.(ouvert,ferme,expedie),modifie_le.gte.${depuisLots}`);
      if (table === 'identifiants') q = q.eq('actif', true);
      return ordonner(table, q);
    });
  }
  await tirerReferentiels(organisationId);
  await base.transaction('rw', Object.keys(COLONNES).map((t) => base.table(t)), async () => {
    for (const [table, lignes] of Object.entries(resultats)) {
      const t = base.table(table);
      const anciennes = await t.where('organisation_id').equals(organisationId).toArray();
      const cle = table === 'lots' ? 'id' : table === 'vetements' ? 'id' : 'vetement_id';
      const garder = (l) => (table === 'lots' ? proteges.lots.has(l.id) : proteges.vetements.has(l[cle]));
      const aSupprimer = anciennes.filter((l) => !garder(l));
      await t.bulkDelete(aSupprimer.map((l) => (table === 'compteurs' ? cleCompteur(l) : l.id)));
      await t.bulkPut(filtrerProteges(table, lignes, proteges));
    }
  });
  for (const [table, lignes] of Object.entries(resultats)) {
    // Table vide : le prochain tirage incrémental reprend depuis l'origine.
    await ecrireMeta(`curseur:${organisationId}:${table}`, plusRecent(lignes, null) || ORIGINE);
  }
  await ecrireMeta(`complet:${organisationId}`, new Date().toISOString());
}

// Tirage incrémental : lignes modifiées depuis le dernier tirage (avec recouvrement).
export async function tirerChangements(organisationId, proteges) {
  for (const table of Object.keys(COLONNES)) {
    const cleMeta = `curseur:${organisationId}:${table}`;
    const curseur = await lireMeta(cleMeta);
    if (!curseur) continue;
    const depuis = new Date(new Date(curseur).getTime() - RECOUVREMENT_MS).toISOString();
    const lignes = await toutLire(() =>
      ordonner(table, supabase.from(table).select(COLONNES[table]).eq('organisation_id', organisationId).gte('modifie_le', depuis)),
    );
    if (!lignes.length) continue;
    const t = base.table(table);
    await base.transaction('rw', t, async () => {
      const utiles = filtrerProteges(table, lignes, proteges);
      if (table === 'identifiants') {
        await t.bulkDelete(utiles.filter((i) => !i.actif).map((i) => i.id));
        await t.bulkPut(utiles.filter((i) => i.actif));
      } else {
        await t.bulkPut(utiles);
      }
    });
    await ecrireMeta(cleMeta, plusRecent(lignes, curseur));
  }
}

const tranches = (liste, n = 100) => Array.from({ length: Math.ceil(liste.length / n) }, (_, i) => liste.slice(i * n, i * n + n));

// Relit des vêtements et des lots précis (après un refus de la base, ou à la demande).
// Ce que la base ne renvoie plus (inexistant ou hors périmètre) disparaît de l'index.
export async function rafraichir(organisationId, { vetements = [], lots = [] }) {
  for (const ids of tranches([...new Set(lots)])) {
    const { data, error } = await supabase.from('lots').select(COLONNES.lots).in('id', ids);
    if (error) throw error;
    await base.transaction('rw', base.lots, async () => {
      await base.lots.bulkDelete(ids.filter((id) => !data.some((l) => l.id === id)));
      await base.lots.bulkPut(data);
    });
  }
  for (const ids of tranches([...new Set(vetements)])) {
    const [v, i, c] = await Promise.all([
      supabase.from('vetements').select(COLONNES.vetements).in('id', ids),
      supabase.from('identifiants').select(COLONNES.identifiants).in('vetement_id', ids).eq('actif', true),
      supabase.from('compteurs').select(COLONNES.compteurs).in('vetement_id', ids),
    ]);
    const erreur = v.error ?? i.error ?? c.error;
    if (erreur) throw erreur;
    const lotsManquants = v.data.map((x) => x.lot_id).filter(Boolean);
    await base.transaction('rw', base.vetements, base.identifiants, base.compteurs, async () => {
      await base.vetements.bulkDelete(ids.filter((id) => !v.data.some((x) => x.id === id)));
      await base.identifiants.where('vetement_id').anyOf(ids).delete();
      await base.compteurs.where('vetement_id').anyOf(ids).delete();
      await base.vetements.bulkPut(v.data);
      await base.identifiants.bulkPut(i.data);
      await base.compteurs.bulkPut(c.data);
    });
    const absents = [];
    for (const id of lotsManquants) if (!(await base.lots.get(id))) absents.push(id);
    if (absents.length) await rafraichir(organisationId, { lots: absents });
  }
}

// Périmètre restreint (laverie externe) : un vêtement qui n'est plus confié (livré, reparti)
// disparaît de l'index à chaque synchronisation, avec ses tags, compteurs, lots et porteurs.
export async function purgerHorsPerimetre(organisationId, proteges) {
  const [vetements, lots] = await Promise.all([
    toutLire(() => supabase.from('vetements').select('id').eq('organisation_id', organisationId).order('id')),
    toutLire(() => supabase.from('lots').select('id').eq('organisation_id', organisationId).order('id')),
  ]);
  const visibles = new Set(vetements.map((v) => v.id));
  const lotsVisibles = new Set(lots.map((l) => l.id));
  const porteurs = await toutLire(() =>
    supabase.from('porteurs_anonymises').select(REFERENTIELS.porteurs[1]).eq('organisation_id', organisationId).order('id'),
  );
  await base.transaction('rw', base.vetements, base.identifiants, base.compteurs, base.vetements_limites, base.lots, base.porteurs, async () => {
    const locaux = await base.vetements.where('organisation_id').equals(organisationId).primaryKeys();
    const sortis = locaux.filter((id) => !visibles.has(id) && !proteges.vetements.has(id));
    if (sortis.length) {
      await base.vetements.bulkDelete(sortis);
      await base.identifiants.where('vetement_id').anyOf(sortis).delete();
      await base.compteurs.where('vetement_id').anyOf(sortis).delete();
      await base.vetements_limites.where('vetement_id').anyOf(sortis).delete();
    }
    const lotsLocaux = await base.lots.where('organisation_id').equals(organisationId).primaryKeys();
    await base.lots.bulkDelete(lotsLocaux.filter((id) => !lotsVisibles.has(id) && !proteges.lots.has(id)));
    await base.porteurs.where('organisation_id').equals(organisationId).delete();
    await base.porteurs.bulkPut(porteurs);
  });
}
