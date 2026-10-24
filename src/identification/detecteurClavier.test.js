import { describe, expect, it } from 'vitest';
import { creerDetecteurClavier } from './detecteurClavier.js';

function taper(detecteur, texte, { debut = 0, pas = 10, fin = 'Enter' } = {}) {
  let t = debut;
  let resultat = null;
  for (const c of texte) {
    detecteur.touche(c, t);
    t += pas;
  }
  resultat = detecteur.touche(fin, t);
  return { resultat, t };
}

describe('détecteur de rafale clavier', () => {
  it('une rafale rapide terminée par Entrée donne une lecture', () => {
    const d = creerDetecteurClavier();
    expect(taper(d, 'ABC12345').resultat).toBe('ABC12345');
  });

  it('accepte Tab comme fin de lecture', () => {
    const d = creerDetecteurClavier();
    expect(taper(d, '04A23B1C', { fin: 'Tab' }).resultat).toBe('04A23B1C');
  });

  it('une frappe humaine (> 50 ms) ne déclenche rien', () => {
    const d = creerDetecteurClavier();
    expect(taper(d, 'ABC12345', { pas: 120 }).resultat).toBeNull();
  });

  it('ignore une rafale trop courte', () => {
    const d = creerDetecteurClavier();
    expect(taper(d, 'AB').resultat).toBeNull();
  });

  it('une pause repart de zéro : seule la fin rapide compte', () => {
    const d = creerDetecteurClavier();
    d.touche('x', 0);
    d.touche('y', 500);
    expect(taper(d, 'Z9876', { debut: 1000 }).resultat).toBe('Z9876');
  });

  it('les touches de modification ne coupent pas la rafale', () => {
    const d = creerDetecteurClavier();
    d.touche('a', 0);
    d.touche('Shift', 5);
    d.touche('B', 10);
    d.touche('c', 20);
    expect(d.touche('Enter', 30)).toBe('aBc');
  });

  it('deux lectures successives sont indépendantes', () => {
    const d = creerDetecteurClavier();
    const premiere = taper(d, 'AAA111');
    expect(premiere.resultat).toBe('AAA111');
    expect(taper(d, 'BBB222', { debut: premiere.t + 300 }).resultat).toBe('BBB222');
  });
});
