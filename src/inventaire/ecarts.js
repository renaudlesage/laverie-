// Écarts d'un inventaire : présents attendus, trouvés en plus (venus d'ailleurs, perdus retrouvés), manquants.
export function ecartsInventaire(attendus, lus) {
  const idsAttendus = new Set(attendus.map((v) => v.id));
  const idsLus = new Set(lus.map((l) => l.vetementId));
  return {
    presents: attendus.filter((v) => idsLus.has(v.id)),
    enPlus: lus.filter((l) => !idsAttendus.has(l.vetementId)),
    manquants: attendus.filter((v) => !idsLus.has(v.id)),
  };
}
