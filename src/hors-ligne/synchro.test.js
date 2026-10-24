import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Base distante simulée : tables lues par le tirage, RPC d'écriture programmables.
const serveur = { tables: {}, appels: [], repondre: null, panne: false };

function requete(table) {
  let lignes = [...(serveur.tables[table] ?? [])];
  const q = {
    select: () => q,
    eq: (c, v) => ((lignes = lignes.filter((l) => l[c] === v)), q),
    in: (c, vs) => ((lignes = lignes.filter((l) => vs.includes(l[c]))), q),
    gte: () => q,
    order: () => q,
    or: () => q,
    range: () => q,
    upsert: (rows) => {
      serveur.appels.push({ rpc: 'lectures', charges: rows });
      return Promise.resolve(serveur.panne ? { error: { message: 'Failed to fetch' }, status: 0 } : { error: null, status: 201 });
    },
    then: (ok, ko) => Promise.resolve({ data: lignes, error: null }).then(ok, ko),
  };
  return q;
}

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: (table) => requete(table),
    rpc: async (nom, args) => {
      if (serveur.panne) return { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
      const charges = args.evenements ?? args.operations;
      serveur.appels.push({ rpc: nom, charges, org: args.org });
      return { data: charges.map((c) => serveur.repondre?.(c) ?? { id: c.id, statut: 'accepte' }), error: null };
    },
  },
}));

const { base, toutEffacer } = await import('./base.js');
const synchro = await import('./synchro.js');
const { emettre, evenement, operation, operer } = await import('../journal/journal.js');
const { purgerHorsPerimetre } = await import('./tirage.js');

const ORG = 'org';
const ctx = { utilisateurId: 'u1', organisationId: ORG, index: false };
const vetement = {
  id: 'v1', organisation_id: ORG, article_id: 'a1', statut: 'en_laverie', contamine: false, site_id: 'lav',
  porteur_id: null, lot_id: null, controle_renforce: false, nominatif: false, derniere_lecture_le: null,
};

beforeEach(async () => {
  await toutEffacer();
  synchro._reinitialiser();
  synchro._definirContexte(ctx);
  Object.assign(serveur, { tables: { vetements: [vetement], identifiants: [], compteurs: [], lots: [] }, appels: [], repondre: null, panne: false });
  await base.vetements.put(vetement);
  await base.sites.put({ id: 'lav', organisation_id: ORG, nom: 'Laverie', type: 'laverie_interne', actif: true });
  await base.traitements.put({ id: 't1', organisation_id: ORG, libelle: 'Lavage', circuit: 'les_deux', actif: true });
});

afterEach(() => synchro._reinitialiser());

async function constituerEtCloturer() {
  const [o] = await operer(ORG, [operation('ouvrir_lot', 'L1', { circuit: 'standard', traitement_id: 't1', site_id: 'lav' })]);
  const [a] = await emettre(ORG, [evenement('ajout_lot', 'v1', { lotId: 'L1' })]);
  const [c] = await operer(ORG, [operation('cloturer_lot', 'L1')]);
  return [o, a, c];
}

describe('hors ligne : file locale et projection', () => {
  it('enregistre sur l’appareil, compte localement, puis envoie dans l’ordre au retour du réseau', async () => {
    synchro._definirEnLigne(false);
    const reponses = await constituerEtCloturer();
    expect(reponses.map((r) => r.statut)).toEqual(['en_attente', 'en_attente', 'en_attente']);
    expect(await base.vetements.get('v1')).toMatchObject({ statut: 'traite', lot_id: null });
    expect((await base.compteurs.get(['v1', 't1'])).passages).toBe(1);
    expect(await base.file.count()).toBe(3);
    expect(serveur.appels).toEqual([]);

    synchro._definirEnLigne(true);
    await synchro.synchroniser();
    expect(serveur.appels.map((a) => [a.rpc, a.charges.map((c) => c.type)])).toEqual([
      ['operer_lots', ['ouvrir_lot']],
      ['ingerer_evenements', ['ajout_lot']],
      ['operer_lots', ['cloturer_lot']],
    ]);
    expect(await base.file.count()).toBe(0);
    expect(synchro.lireEtat().enAttente).toBe(0);
  });

  it('refuse sur l’appareil le mélange de circuits, sans rien mettre en file', async () => {
    synchro._definirEnLigne(false);
    await base.vetements.update('v1', { contamine: true });
    await operer(ORG, [operation('ouvrir_lot', 'L1', { circuit: 'standard', traitement_id: 't1', site_id: 'lav' })]);
    const [r] = await emettre(ORG, [evenement('ajout_lot', 'v1', { lotId: 'L1' })]);
    expect(r).toMatchObject({ statut: 'rejete', code: 'LC001' });
    expect((await base.vetements.get('v1')).statut).toBe('en_laverie');
    // En file : l'ouverture du lot et le signalement (l'alerte sera créée à l'envoi), pas l'ajout.
    expect((await base.file.orderBy('seq').toArray()).map((i) => i.genre)).toEqual(['operation', 'signalement']);
    expect(synchro.lireEtat().enAttente).toBe(1);
  });

  it('garde la file intacte si l’envoi échoue, et reprend sans doublon', async () => {
    synchro._definirEnLigne(false);
    await constituerEtCloturer();
    synchro._definirEnLigne(true);
    serveur.panne = true;
    await synchro.synchroniser();
    expect(await base.file.count()).toBe(3);
    expect(synchro.lireEtat().erreur).toMatch(/Failed to fetch/);

    serveur.panne = false;
    const deja = new Set();
    serveur.repondre = (c) => (deja.has(c.id) ? { id: c.id, statut: 'doublon' } : (deja.add(c.id), null));
    await synchro.synchroniser();
    expect(await base.file.count()).toBe(0);
    expect(await base.conflits.count()).toBe(0);
  });

  it('un refus de la base après coup devient un conflit, et la projection locale est relue', async () => {
    synchro._definirEnLigne(false);
    await constituerEtCloturer();
    // Sur le serveur, l'autre appareil a déjà traité ce vêtement dans son propre lot.
    serveur.tables.vetements = [{ ...vetement, statut: 'traite' }];
    serveur.tables.compteurs = [{ organisation_id: ORG, vetement_id: 'v1', traitement_id: 't1', passages: 1 }];
    serveur.tables.lots = [{ id: 'L1', organisation_id: ORG, type: 'traitement', statut: 'cloture', site_id: 'lav', traitement_id: 't1' }];
    serveur.repondre = (c) =>
      c.type === 'ajout_lot' ? { id: c.id, statut: 'rejete', motif: 'Transition impossible : « ajout_lot » depuis le statut « traite »' } : null;

    synchro._definirEnLigne(true);
    await synchro.synchroniser();
    const conflits = await base.conflits.toArray();
    expect(conflits).toHaveLength(1);
    expect(conflits[0]).toMatchObject({ genre: 'evenement', charge: { type: 'ajout_lot', vetement_id: 'v1' } });
    expect(synchro.lireEtat().conflits).toBe(1);
    // Un seul passage : celui de la base, pas un second compté sur l'appareil.
    expect((await base.compteurs.get(['v1', 't1'])).passages).toBe(1);
  });

  it('en ligne, l’écran reçoit directement le refus de la base (pas de conflit)', async () => {
    serveur.repondre = (c) => ({ id: c.id, statut: 'rejete', motif: 'Refusé par la base' });
    serveur.tables.lots = [];
    const [r] = await operer(ORG, [operation('ouvrir_lot', 'L1', { circuit: 'standard', traitement_id: 't1', site_id: 'lav' })]);
    expect(r).toMatchObject({ statut: 'rejete', motif: 'Refusé par la base' });
    const conflitsAvant = await base.conflits.count();
    expect(conflitsAvant).toBe(0);
    expect(await base.lots.get('L1')).toBeUndefined(); // relu à la base : le lot n'existe pas
  });
});

describe('laverie externe et prestataire multi-zones', () => {
  it('un vêtement qui n’est plus confié sort de l’index local, avec ses tags et ses compteurs', async () => {
    await base.vetements.put({ ...vetement, id: 'v2' });
    await base.identifiants.put({ id: 'i2', organisation_id: ORG, vetement_id: 'v2', technologie: 'qr', valeur: 'X2', actif: true });
    await base.compteurs.put({ organisation_id: ORG, vetement_id: 'v2', traitement_id: 't1', passages: 3 });
    await base.porteurs.put({ id: 'p-ancien', organisation_id: ORG, matricule: 'P9' });
    serveur.tables.porteurs_anonymises = [{ id: 'p1', organisation_id: ORG, matricule: 'P1' }];
    // La base ne renvoie plus que v1 (v2 a été livré au poste).
    await purgerHorsPerimetre(ORG, { vetements: new Set(), lots: new Set() });
    expect(await base.vetements.toCollection().primaryKeys()).toEqual(['v1']);
    expect(await base.identifiants.count()).toBe(0);
    expect(await base.compteurs.count()).toBe(0);
    expect((await base.porteurs.toArray()).map((p) => p.matricule)).toEqual(['P1']);
  });

  it('garde un vêtement modifié sur l’appareil et pas encore envoyé', async () => {
    await base.vetements.put({ ...vetement, id: 'v2' });
    await purgerHorsPerimetre(ORG, { vetements: new Set(['v2']), lots: new Set() });
    expect((await base.vetements.toCollection().primaryKeys()).sort()).toEqual(['v1', 'v2']);
  });

  it('la file part pour chaque zone, dans l’ordre, même si une autre zone est affichée', async () => {
    synchro._definirEnLigne(false);
    await emettre(ORG, [evenement('contamination', 'v1')]);
    await base.file.add({
      utilisateur_id: 'u1', organisation_id: 'org-b', genre: 'evenement', vetements: [], lots: [],
      charge: { id: 'e-b', type: 'perte', vetement_id: 'vb', donnees: {} },
    });
    synchro._definirEnLigne(true);
    await synchro.synchroniser();
    expect(serveur.appels.map((a) => [a.org, a.charges[0].type])).toEqual([
      [ORG, 'contamination'],
      ['org-b', 'perte'],
    ]);
    expect(await base.file.count()).toBe(0);
  });
});
