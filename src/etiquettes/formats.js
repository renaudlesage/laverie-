// Formats d'impression des étiquettes QR (dimensions en mm).
// Modèles courants, plus un format personnalisé saisi dans l'app et retenu sur l'appareil.

function planche(libelle, colonnes, lignes, largeur, hauteur, haut, gauche, ecartColonnes = 0, ecartLignes = 0) {
  return {
    libelle,
    page: { largeur: 210, hauteur: 297 },
    colonnes,
    lignes,
    etiquette: { largeur, hauteur },
    marges: { haut, gauche },
    ecart: { colonnes: ecartColonnes, lignes: ecartLignes },
  };
}

// Rouleau : une étiquette par page, la page a la taille de l'étiquette.
function rouleau(largeur, hauteur, precision = '') {
  return {
    libelle: `Rouleau — ${String(largeur).replace('.', ',')} × ${String(hauteur).replace('.', ',')} mm${precision}`,
    page: { largeur, hauteur },
    colonnes: 1,
    lignes: 1,
    etiquette: { largeur, hauteur },
    marges: { haut: 0, gauche: 0 },
    ecart: { colonnes: 0, lignes: 0 },
  };
}

export const FORMATS = {
  a4_14: planche('A4 — 14 étiquettes 99,1 × 38,1 mm (type L7163)', 2, 7, 99.1, 38.1, 15.15, 4.65, 2.5),
  a4_21: planche('A4 — 21 étiquettes 63,5 × 38,1 mm (type L7160)', 3, 7, 63.5, 38.1, 15.15, 7.2, 2.5),
  a4_24: planche('A4 — 24 étiquettes 70 × 37 mm', 3, 8, 70, 37, 0.5, 0),
  a4_40: planche('A4 — 40 étiquettes 48,5 × 25,4 mm', 4, 10, 48.5, 25.4, 21.5, 8),
  a4_65: planche('A4 — 65 étiquettes 38,1 × 21,2 mm (type L7651)', 5, 13, 38.1, 21.2, 10.7, 4.65, 2.5),
  rouleau_25x25: rouleau(25, 25, ' (carré)'),
  rouleau_40x20: rouleau(40, 20),
  rouleau_50x30: rouleau(50, 30),
  rouleau_57x32: rouleau(57, 32),
  rouleau_62x29: rouleau(62, 29, ' (type Brother DK-11209)'),
  rouleau_100x50: rouleau(100, 50),
};

export const CLE_PERSONNALISE = 'personnalise';

// Champs du format personnalisé, dans l'ordre du formulaire.
export const CHAMPS_PERSONNALISE = [
  { chemin: ['page', 'largeur'], libelle: 'Largeur de la page', min: 5, max: 600 },
  { chemin: ['page', 'hauteur'], libelle: 'Hauteur de la page', min: 5, max: 900 },
  { chemin: ['colonnes'], libelle: 'Colonnes', min: 1, max: 20, entier: true },
  { chemin: ['lignes'], libelle: 'Lignes', min: 1, max: 40, entier: true },
  { chemin: ['etiquette', 'largeur'], libelle: 'Largeur d’une étiquette', min: 5, max: 600 },
  { chemin: ['etiquette', 'hauteur'], libelle: 'Hauteur d’une étiquette', min: 5, max: 900 },
  { chemin: ['marges', 'haut'], libelle: 'Marge du haut', min: 0, max: 200 },
  { chemin: ['marges', 'gauche'], libelle: 'Marge de gauche', min: 0, max: 200 },
  { chemin: ['ecart', 'colonnes'], libelle: 'Écart entre colonnes', min: 0, max: 100 },
  { chemin: ['ecart', 'lignes'], libelle: 'Écart entre lignes', min: 0, max: 100 },
];

export function copier(format) {
  return JSON.parse(JSON.stringify({ ...format, libelle: 'Format personnalisé' }));
}

export function lireValeur(format, chemin) {
  return chemin.reduce((o, c) => o?.[c], format);
}

export function ecrireValeur(format, chemin, valeur) {
  const copie = JSON.parse(JSON.stringify(format));
  let o = copie;
  for (const c of chemin.slice(0, -1)) o = o[c];
  o[chemin.at(-1)] = valeur;
  return copie;
}

export function parPage(format) {
  return format.colonnes * format.lignes;
}

// Découpe la liste de codes en pages ; « decalage » saute des emplacements déjà utilisés
// sur une planche entamée.
export function paginer(codes, format, decalage = 0) {
  const cases = [...Array(decalage).fill(null), ...codes];
  const pages = [];
  for (let i = 0; i < cases.length; i += parPage(format)) pages.push(cases.slice(i, i + parPage(format)));
  return pages;
}

// Côté minimal conseillé du QR : en dessous, la lecture devient incertaine (usure, appareil photo).
export const QR_CONSEILLE_MM = 12;
export const QR_MINIMUM_MM = 8;
// « XXXX XXXX XX » : 12 caractères mono, environ 0,62 em chacun.
const LARGEUR_CODE_EM = 12 * 0.62;

// Disposition du contenu d'une étiquette : QR à côté du code si l'étiquette est allongée,
// au-dessus sinon ; le code en clair est réduit, puis masqué s'il ne tient plus.
export function disposition({ largeur, hauteur }, { afficherCode = true } = {}) {
  const marge = Math.min(2, Math.max(0.8, Math.min(largeur, hauteur) * 0.06));
  const l = largeur - 2 * marge;
  const h = hauteur - 2 * marge;
  if (!afficherCode) return { sens: 'seul', marge, qr: Math.min(l, h), police: 0 };

  // À côté : le QR prend la hauteur, le code le reste de la largeur.
  const qrCote = Math.min(h, l * 0.62);
  const policeCote = Math.min(4, h / 3, (l - qrCote - marge) / LARGEUR_CODE_EM);
  // Dessous : le code prend une ligne sous le QR.
  const policeDessous = Math.min(4, l / LARGEUR_CODE_EM);
  const qrDessous = Math.min(l, h - policeDessous * 1.3 - marge * 0.5);

  const cote = { sens: 'cote', marge, qr: qrCote, police: policeCote };
  const dessous = { sens: 'dessous', marge, qr: qrDessous, police: policeDessous };
  const lisible = (d) => d.police >= 1.6;
  // On garde la disposition qui donne le plus grand QR avec un code lisible.
  const candidates = [cote, dessous].filter(lisible).sort((a, b) => b.qr - a.qr);
  return candidates[0] ?? { sens: 'seul', marge, qr: Math.min(l, h), police: 0 };
}

const mm = (v) => v.toFixed(1).replace('.', ',');

// Contrôles d'un format : erreurs (impression impossible) et avertissements.
export function verifierFormat(format, options = {}) {
  const erreurs = [];
  const avertissements = [];
  for (const c of CHAMPS_PERSONNALISE) {
    const v = lireValeur(format, c.chemin);
    if (!Number.isFinite(v) || v < c.min || v > c.max || (c.entier && !Number.isInteger(v))) {
      erreurs.push(`${c.libelle} : valeur attendue entre ${c.min} et ${c.max}${c.entier ? ' (nombre entier)' : ' mm'}.`);
    }
  }
  if (erreurs.length) return { erreurs, avertissements };

  const largeur = format.marges.gauche + format.colonnes * format.etiquette.largeur + (format.colonnes - 1) * format.ecart.colonnes;
  const hauteur = format.marges.haut + format.lignes * format.etiquette.hauteur + (format.lignes - 1) * format.ecart.lignes;
  if (largeur > format.page.largeur + 0.05) erreurs.push(`La grille fait ${mm(largeur)} mm de large pour une page de ${format.page.largeur} mm.`);
  if (hauteur > format.page.hauteur + 0.05) erreurs.push(`La grille fait ${mm(hauteur)} mm de haut pour une page de ${format.page.hauteur} mm.`);

  const d = disposition(format.etiquette, options);
  if (d.qr < QR_MINIMUM_MM) {
    erreurs.push(`QR de ${mm(d.qr)} mm : trop petit pour être lu. Agrandissez l’étiquette.`);
  } else if (d.qr < QR_CONSEILLE_MM) {
    avertissements.push(`QR de ${mm(d.qr)} mm : lecture possible mais fragile (${QR_CONSEILLE_MM} mm conseillés).`);
  }
  if (options.afficherCode !== false && d.sens === 'seul') {
    avertissements.push('Étiquette trop petite pour le code en clair : seul le QR sera imprimé.');
  }
  return { erreurs, avertissements };
}
