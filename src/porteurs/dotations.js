// Historique de dotation : chaque attribution, jusqu'à l'événement qui l'a close (restitution,
// réforme, perte ou attribution à quelqu'un d'autre).
export function dotations(attributions, suivants) {
  return attributions.map((a) => {
    const fin = suivants
      .filter((e) => e.vetement_id === a.vetement_id && e.numero > a.numero)
      .sort((x, y) => x.numero - y.numero)[0];
    return { ...a, fin };
  });
}
