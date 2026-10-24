import Dexie from 'dexie';

// Base locale de l'appareil (IndexedDB) :
//   - index du périmètre visible de l'utilisateur : vêtements, identifiants, compteurs, lots,
//     référentiels utiles à la laverie (porteurs : matricule et casier seulement) ;
//   - file des écritures à envoyer, dans l'ordre (événements, opérations sur les lots, lectures) ;
//   - conflits : écritures refusées par la base après coup, à examiner.
export const base = new Dexie('suivi-linge');

base.version(1).stores({
  vetements: 'id, organisation_id, [organisation_id+statut], lot_id',
  identifiants: 'id, organisation_id, vetement_id, valeur',
  compteurs: '[vetement_id+traitement_id], organisation_id, vetement_id',
  lots: 'id, organisation_id, [organisation_id+type], sac_id',
  sites: 'id, organisation_id',
  traitements: 'id, organisation_id',
  sacs: 'id, organisation_id',
  articles: 'id, organisation_id',
  articles_limites: 'id, organisation_id, article_id',
  vetements_limites: 'id, organisation_id, vetement_id',
  porteurs: 'id, organisation_id',
  // genre : evenement | operation | lecture ; charge : ce qui part vers la base.
  file: '++seq, [utilisateur_id+organisation_id], charge.id',
  conflits: '++n, [utilisateur_id+organisation_id]',
  meta: 'cle',
});

export const TABLES_INDEX = [
  'vetements', 'identifiants', 'compteurs', 'lots', 'sites', 'traitements', 'sacs',
  'articles', 'articles_limites', 'vetements_limites', 'porteurs',
];

export async function lireMeta(cle, defaut = null) {
  return (await base.meta.get(cle))?.valeur ?? defaut;
}

export function ecrireMeta(cle, valeur) {
  return base.meta.put({ cle, valeur });
}

// Efface l'index (changement d'utilisateur, déconnexion). La file et les conflits ne sont
// effacés que sur demande explicite : ils portent des écritures non encore envoyées.
export async function viderIndex() {
  await base.transaction('rw', [...TABLES_INDEX.map((t) => base.table(t)), base.meta], async () => {
    for (const t of TABLES_INDEX) await base.table(t).clear();
    await base.meta.clear();
  });
}

export async function toutEffacer() {
  await viderIndex();
  await base.file.clear();
  await base.conflits.clear();
}
