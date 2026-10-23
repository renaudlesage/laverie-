import { lireCsv, normaliserEntete } from '../lib/csv.js';

const ALIAS = {
  matricule: 'matricule',
  nom: 'nom',
  prenom: 'prenom',
  casier: 'casier',
  n_casier: 'casier',
  site: 'site',
  poste: 'site',
};

// Analyse un CSV de porteurs sans rien écrire.
// sites : [{ id, nom }] ; matriculesExistants : Set des matricules déjà en base.
export function analyserImportPorteurs(texte, sites, matriculesExistants) {
  const lignes = lireCsv(texte);
  const rapport = { aCreer: [], aMettreAJour: [], doublons: [], invalides: [], colonnesIgnorees: [] };
  if (lignes.length === 0) {
    rapport.invalides.push({ ligne: 1, motif: 'Fichier vide' });
    return rapport;
  }

  const entetes = lignes[0].map(normaliserEntete);
  const colonnes = entetes.map((e) => ALIAS[e] ?? null);
  rapport.colonnesIgnorees = lignes[0].filter((_, i) => !colonnes[i]);
  if (!colonnes.includes('matricule')) {
    rapport.invalides.push({ ligne: 1, motif: 'Colonne « matricule » absente de l’en-tête' });
    return rapport;
  }

  const sitesParNom = new Map(sites.map((s) => [s.nom.trim().toLowerCase(), s.id]));
  const vus = new Map();

  lignes.slice(1).forEach((valeurs, index) => {
    const numero = index + 2; // numéro de ligne dans le fichier, en-tête compris
    const brut = {};
    colonnes.forEach((col, i) => {
      if (col) brut[col] = (valeurs[i] ?? '').trim();
    });

    if (!brut.matricule) {
      rapport.invalides.push({ ligne: numero, motif: 'Matricule vide' });
      return;
    }
    let siteId = null;
    if (brut.site) {
      siteId = sitesParNom.get(brut.site.toLowerCase()) ?? null;
      if (!siteId) {
        rapport.invalides.push({ ligne: numero, motif: `Site inconnu : « ${brut.site} »` });
        return;
      }
    }
    if (vus.has(brut.matricule)) {
      rapport.doublons.push({ ligne: numero, matricule: brut.matricule, premiere: vus.get(brut.matricule) });
      return;
    }
    vus.set(brut.matricule, numero);

    const porteur = {
      matricule: brut.matricule,
      nom: brut.nom || null,
      prenom: brut.prenom || null,
      casier: brut.casier || null,
      site_id: siteId,
    };
    // Une colonne absente du fichier ne doit pas effacer la valeur en base.
    for (const champ of ['nom', 'prenom', 'casier']) {
      if (!colonnes.includes(champ)) delete porteur[champ];
    }
    if (!colonnes.includes('site')) delete porteur.site_id;

    (matriculesExistants.has(brut.matricule) ? rapport.aMettreAJour : rapport.aCreer).push(porteur);
  });

  return rapport;
}
