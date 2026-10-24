// Douchettes et lecteurs USB en émulation clavier : une rafale de caractères tapés à moins
// de 50 ms d'intervalle, terminée par Entrée ou Tab, vaut une lecture. Une frappe humaine,
// plus lente, ne déclenche rien.

export const INTERVALLE_MAX_MS = 50;
export const LONGUEUR_MIN = 3;

export function creerDetecteurClavier({ intervalleMax = INTERVALLE_MAX_MS, longueurMin = LONGUEUR_MIN } = {}) {
  let tampon = '';
  let dernier = null;

  return {
    // touche : KeyboardEvent.key ; instant : horodatage en ms. Renvoie la valeur lue ou null.
    touche(touche, instant) {
      const rapide = dernier !== null && instant - dernier < intervalleMax;
      dernier = instant;

      if (touche === 'Enter' || touche === 'Tab') {
        const valeur = rapide && tampon.length >= longueurMin ? tampon : null;
        tampon = '';
        return valeur;
      }
      if (touche.length !== 1) return null; // Shift, Alt… : sans effet sur le tampon
      tampon = rapide ? tampon + touche : touche;
      return null;
    },
    // Vrai si une rafale est en cours : sert à bloquer la frappe dans un champ.
    enRafale(instant) {
      return tampon.length >= 2 && dernier !== null && instant - dernier < intervalleMax;
    },
    reinitialiser() {
      tampon = '';
      dernier = null;
    },
  };
}
