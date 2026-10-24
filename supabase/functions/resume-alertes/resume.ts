// Contenu du résumé quotidien des alertes (texte et HTML), sans dépendance : testé par Vitest.

export const TYPES_ALERTE: Record<string, string> = {
  seuil_preventif: 'Fin de vie proche',
  seuil_atteint: 'Limite de passages atteinte',
  age_maximal: 'Âge maximal dépassé',
  usure_tag: 'Tag à remplacer',
  non_revenu: 'Non revenu',
  ecart_reception: 'Écart de réception',
  melange_circuits: 'Mélange de circuits',
};

export type NouvelleAlerte = {
  type: string;
  niveau: string;
  message: string;
  ouverte_le: string;
  code?: string | null;
  article?: string | null;
};

const echapper = (texte: string) =>
  texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const heure = (iso: string) =>
  new Date(iso).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Brussels' });

export function construireResume({
  zone,
  ouvertes,
  nouvelles,
  totalNouvelles,
  lien,
}: {
  zone: string;
  ouvertes: Record<string, number>;
  nouvelles: NouvelleAlerte[];
  totalNouvelles: number;
  lien: string;
}) {
  const critiques = nouvelles.filter((a) => a.niveau === 'critique').length;
  const sujet = `${zone} — ${totalNouvelles} nouvelle(s) alerte(s)${critiques ? `, dont ${critiques} critique(s)` : ''}`;
  const totalOuvertes = Object.values(ouvertes).reduce((a, b) => a + b, 0);
  const lignesOuvertes = Object.entries(ouvertes)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => [TYPES_ALERTE[t] ?? t, n] as const);
  const decrire = (a: NouvelleAlerte) =>
    [a.article, a.code].filter(Boolean).join(' ') + (a.article || a.code ? ' : ' : '') + a.message;

  const texte = [
    `Suivi du linge — ${zone}`,
    '',
    `Nouvelles alertes (24 h) : ${totalNouvelles}`,
    ...nouvelles.map((a) => `- [${TYPES_ALERTE[a.type] ?? a.type}] ${decrire(a)} (${heure(a.ouverte_le)})`),
    ...(totalNouvelles > nouvelles.length ? [`… et ${totalNouvelles - nouvelles.length} autre(s).`] : []),
    '',
    `Alertes ouvertes : ${totalOuvertes}`,
    ...lignesOuvertes.map(([l, n]) => `- ${l} : ${n}`),
    '',
    `Toutes les alertes : ${lien}/alertes`,
  ].join('\n');

  const couleur = (niveau: string) => (niveau === 'critique' ? '#b42318' : niveau === 'attention' ? '#a15c07' : '#1f4f82');
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#10151b;max-width:640px">
<h2 style="margin:0 0 4px">Suivi du linge — ${echapper(zone)}</h2>
<p style="margin:0 0 16px;color:#555">Résumé quotidien des alertes</p>
<h3>Nouvelles alertes (24 h) : ${totalNouvelles}</h3>
<ul style="padding-left:18px">${nouvelles
    .map(
      (a) =>
        `<li style="margin-bottom:6px"><strong style="color:${couleur(a.niveau)}">${echapper(TYPES_ALERTE[a.type] ?? a.type)}</strong> — ${echapper(decrire(a))} <span style="color:#777">(${heure(a.ouverte_le)})</span></li>`,
    )
    .join('')}${totalNouvelles > nouvelles.length ? `<li>… et ${totalNouvelles - nouvelles.length} autre(s).</li>` : ''}</ul>
<h3>Alertes ouvertes : ${totalOuvertes}</h3>
<table style="border-collapse:collapse">${lignesOuvertes
    .map(([l, n]) => `<tr><td style="padding:2px 12px 2px 0">${echapper(l)}</td><td style="text-align:right"><strong>${n}</strong></td></tr>`)
    .join('')}</table>
<p style="margin-top:20px"><a href="${echapper(lien)}/alertes" style="background:#10151b;color:#fff;padding:10px 16px;text-decoration:none;display:inline-block">Voir les alertes</a></p>
<p style="color:#777;font-size:12px">Envoyé par Suivi du linge. Réglages : Paramètres → Organisation.</p>
</body></html>`;
  return { sujet, texte, html };
}
