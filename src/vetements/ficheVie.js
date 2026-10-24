// Export CSV de la fiche de vie d'un vêtement (preuve de conformité, CONCEPT §10).
// Séparateur « ; » et BOM UTF-8 : s'ouvre directement dans Excel en français.

function cellule(valeur) {
  const texte = valeur == null ? '' : String(valeur);
  return /[";\r\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
}

function ligne(valeurs) {
  return valeurs.map(cellule).join(';');
}

// fiche : [[libellé, valeur], …] ; evenements : [{ date, evenement, detail, site, source, annule }]
export function ficheVieCsv({ fiche, compteurs, identifiants, evenements }) {
  const lignes = ['Fiche de vie', ...fiche.map(([l, v]) => ligne([l, v])), ''];
  lignes.push('Passages', ligne(['Traitement', 'Passages', 'Limite']), ...compteurs.map((c) => ligne([c.traitement, c.passages, c.limite])), '');
  lignes.push(
    'Identifiants',
    ligne(['Technologie', 'Valeur', 'Posé le', 'Retiré le', 'Motif du retrait']),
    ...identifiants.map((i) => ligne([i.technologie, i.valeur, i.pose_le, i.retire_le, i.motif])),
    '',
  );
  lignes.push(
    'Historique',
    ligne(['Date', 'Événement', 'Détail', 'Site', 'Source', 'Annulé']),
    ...evenements.map((e) => ligne([e.date, e.evenement, e.detail, e.site, e.source, e.annule ? 'oui' : ''])),
  );
  return '﻿' + lignes.join('\r\n') + '\r\n';
}

export function telecharger(nom, contenu) {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
