import { lireCsv, normaliserEntete } from '../lib/csv.js';
import { normaliser } from '../identification/normalisation.js';

// Colonnes reconnues (en-têtes normalisés) → champ.
const ALIAS = {
  article: 'article',
  designation: 'article',
  reference: 'article',
  taille: 'taille',
  numero_serie: 'numero_serie',
  n_serie: 'numero_serie',
  n_de_serie: 'numero_serie',
  serie: 'numero_serie',
  nominatif: 'nominatif',
  site: 'site',
  poste: 'site',
  mis_en_service: 'mis_en_service_le',
  mise_en_service: 'mis_en_service_le',
  date_mise_en_service: 'mis_en_service_le',
  code_barres: 'code_barres',
  code_barre: 'code_barres',
  qr: 'qr',
  qr_code: 'qr',
  datamatrix: 'datamatrix',
  data_matrix: 'datamatrix',
  nfc: 'nfc',
  uid_nfc: 'nfc',
};
const TECHNOLOGIES_COLONNES = ['code_barres', 'qr', 'datamatrix', 'nfc'];
const OUI = ['oui', 'o', 'yes', 'y', '1', 'vrai', 'x'];
const NON = ['non', 'n', 'no', '0', 'faux', ''];

function lireDate(texte) {
  const t = texte.trim();
  if (!t) return { valeur: null };
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const [a, mo, j] = m ? [m[3], m[2], m[1]] : (t.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? []).slice(1);
  if (!a) return { erreur: `Date non reconnue : « ${t} » (attendu JJ/MM/AAAA)` };
  const d = new Date(Date.UTC(+a, +mo - 1, +j));
  if (d.getUTCFullYear() !== +a || d.getUTCMonth() !== +mo - 1 || d.getUTCDate() !== +j) {
    return { erreur: `Date impossible : « ${t} »` };
  }
  return { valeur: `${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}` };
}

// Analyse un CSV de vêtements existants sans rien écrire.
//   articles : [{ id, designation, reference, actif }] ; sites : [{ id, nom }]
//   identifiantsExistants : Set de « technologie|valeur » déjà actifs en base
// Rapport : aCreer (lignes prêtes), doublons, formats (non reconnus), invalides.
export function analyserImportVetements(texte, { articles, sites, identifiantsExistants, urlPublique }) {
  const lignes = lireCsv(texte);
  const rapport = { aCreer: [], doublons: [], formats: [], invalides: [], colonnesIgnorees: [] };
  if (lignes.length === 0) {
    rapport.invalides.push({ ligne: 1, motif: 'Fichier vide' });
    return rapport;
  }

  const colonnes = lignes[0].map((e) => ALIAS[normaliserEntete(e)] ?? null);
  rapport.colonnesIgnorees = lignes[0].filter((_, i) => !colonnes[i]);
  if (!colonnes.includes('article')) {
    rapport.invalides.push({ ligne: 1, motif: 'Colonne « article » absente de l’en-tête' });
    return rapport;
  }

  const minuscule = (s) => (s ?? '').trim().toLowerCase();
  const articlesParCle = new Map();
  for (const a of articles) {
    articlesParCle.set(minuscule(a.designation), a);
    if (a.reference) articlesParCle.set(minuscule(a.reference), a);
  }
  const sitesParNom = new Map(sites.map((s) => [minuscule(s.nom), s.id]));
  const vusDansFichier = new Map(); // « technologie|valeur » → numéro de ligne

  lignes.slice(1).forEach((valeurs, index) => {
    const ligne = index + 2;
    const brut = {};
    colonnes.forEach((col, i) => {
      if (col) brut[col] = (valeurs[i] ?? '').trim();
    });

    const article = articlesParCle.get(minuscule(brut.article));
    if (!brut.article) return rapport.invalides.push({ ligne, motif: 'Article vide' });
    if (!article) return rapport.invalides.push({ ligne, motif: `Article inconnu : « ${brut.article} »` });
    if (!article.actif) return rapport.invalides.push({ ligne, motif: `Article inactif : « ${article.designation} » (activez-le d’abord)` });

    let siteId = null;
    if (brut.site) {
      siteId = sitesParNom.get(minuscule(brut.site)) ?? null;
      if (!siteId) return rapport.invalides.push({ ligne, motif: `Site inconnu : « ${brut.site} »` });
    }

    const nominatif = minuscule(brut.nominatif);
    if (!OUI.includes(nominatif) && !NON.includes(nominatif)) {
      return rapport.formats.push({ ligne, motif: `Nominatif non reconnu : « ${brut.nominatif} » (oui / non)` });
    }
    const date = lireDate(brut.mis_en_service_le ?? '');
    if (date.erreur) return rapport.formats.push({ ligne, motif: date.erreur });

    const identifiants = [];
    for (const technologie of TECHNOLOGIES_COLONNES) {
      if (!brut[technologie]) continue;
      const n = normaliser({ technologie, valeur_brute: brut[technologie] }, { urlPublique });
      if (!n) {
        return rapport.formats.push({ ligne, motif: `Code ${technologie} non reconnu : « ${brut[technologie]} »` });
      }
      identifiants.push(n);
    }

    for (const { technologie, valeur } of identifiants) {
      const cle = `${technologie}|${valeur}`;
      if (identifiantsExistants.has(cle)) {
        return rapport.doublons.push({ ligne, valeur, motif: 'déjà porté par un vêtement en base' });
      }
      if (vusDansFichier.has(cle)) {
        return rapport.doublons.push({ ligne, valeur, motif: `déjà présent ligne ${vusDansFichier.get(cle)}` });
      }
    }
    for (const { technologie, valeur } of identifiants) vusDansFichier.set(`${technologie}|${valeur}`, ligne);

    rapport.aCreer.push({
      ligne,
      article_id: article.id,
      taille: brut.taille || null,
      numero_serie: brut.numero_serie || null,
      nominatif: OUI.includes(nominatif),
      site_id: siteId,
      mis_en_service_le: date.valeur,
      identifiants,
    });
  });

  return rapport;
}
