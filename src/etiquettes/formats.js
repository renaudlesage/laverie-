// Formats d'impression des étiquettes QR (dimensions en mm).
// Les planches A4 suivent les références courantes ; « rouleau » imprime une étiquette par page.
export const FORMATS = {
  a4_21: {
    libelle: 'A4 — 21 étiquettes 63,5 × 38,1 mm (type L7160)',
    page: { largeur: 210, hauteur: 297 },
    colonnes: 3,
    lignes: 7,
    etiquette: { largeur: 63.5, hauteur: 38.1 },
    marges: { haut: 15.15, gauche: 7.2 },
    ecart: { colonnes: 2.5, lignes: 0 },
  },
  a4_24: {
    libelle: 'A4 — 24 étiquettes 70 × 37 mm',
    page: { largeur: 210, hauteur: 297 },
    colonnes: 3,
    lignes: 8,
    etiquette: { largeur: 70, hauteur: 37 },
    marges: { haut: 0.5, gauche: 0 },
    ecart: { colonnes: 0, lignes: 0 },
  },
  rouleau_50x30: {
    libelle: 'Rouleau — 50 × 30 mm, une étiquette par page',
    page: { largeur: 50, hauteur: 30 },
    colonnes: 1,
    lignes: 1,
    etiquette: { largeur: 50, hauteur: 30 },
    marges: { haut: 0, gauche: 0 },
    ecart: { colonnes: 0, lignes: 0 },
  },
};

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
