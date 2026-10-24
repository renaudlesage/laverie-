// Synthèse « à renouveler » : nombre de vêtements par article et par taille (pour les commandes).
export function regrouperFinDeVie(lignes) {
  const groupes = new Map();
  for (const l of lignes) {
    const cle = `${l.article}\u0000${l.taille ?? ''}`;
    const g = groupes.get(cle) ?? { article: l.article, taille: l.taille || '—', nombre: 0 };
    g.nombre += 1;
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) => a.article.localeCompare(b.article, 'fr') || String(a.taille).localeCompare(String(b.taille), 'fr', { numeric: true }));
}

// Activité d'une laverie : lots clôturés et vêtements traités, par traitement.
export function totauxParTraitement(lots) {
  const totaux = new Map();
  for (const l of lots) {
    const t = totaux.get(l.traitement) ?? { traitement: l.traitement, lots: 0, passages: 0 };
    t.lots += 1;
    t.passages += l.passages;
    totaux.set(l.traitement, t);
  }
  return [...totaux.values()].sort((a, b) => b.passages - a.passages);
}
