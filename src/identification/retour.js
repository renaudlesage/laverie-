// Retour sonore et vibration à chaque lecture (usage avec des gants, en milieu bruyant).

let contexte = null;

function bip(frequence, debut, duree) {
  try {
    contexte ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = contexte.createOscillator();
    const gain = contexte.createGain();
    osc.type = 'square';
    osc.frequency.value = frequence;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(contexte.destination);
    const t = contexte.currentTime + debut;
    osc.start(t);
    osc.stop(t + duree);
  } catch {
    // Pas d'audio disponible : la vibration et l'affichage suffisent.
  }
}

function vibrer(motif) {
  try {
    navigator.vibrate?.(motif);
  } catch {
    // Vibration non prise en charge.
  }
}

// trouve : un bip aigu ; inconnu : deux bips graves ; erreur ou doublon : un bip très grave.
export function signaler(type) {
  if (type === 'trouve') {
    bip(1760, 0, 0.08);
    vibrer(60);
  } else if (type === 'inconnu' || type === 'ambigu') {
    bip(660, 0, 0.1);
    bip(660, 0.16, 0.1);
    vibrer([80, 60, 80]);
  } else {
    bip(220, 0, 0.25);
    vibrer(250);
  }
}
