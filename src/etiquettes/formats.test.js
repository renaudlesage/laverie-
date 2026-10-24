import { describe, expect, it } from 'vitest';
import { FORMATS, paginer, parPage } from './formats.js';

describe('planches d’étiquettes', () => {
  it('chaque format A4 tient dans la page', () => {
    for (const f of Object.values(FORMATS)) {
      const largeur = f.marges.gauche + f.colonnes * f.etiquette.largeur + (f.colonnes - 1) * f.ecart.colonnes;
      const hauteur = f.marges.haut + f.lignes * f.etiquette.hauteur + (f.lignes - 1) * f.ecart.lignes;
      expect(largeur).toBeLessThanOrEqual(f.page.largeur + 0.01);
      expect(hauteur).toBeLessThanOrEqual(f.page.hauteur + 0.01);
    }
  });

  it('pagine avec décalage sur une planche entamée', () => {
    const codes = Array.from({ length: 25 }, (_, i) => `C${i}`);
    const pages = paginer(codes, FORMATS.a4_21, 4);
    expect(pages.length).toBe(2);
    expect(pages[0].slice(0, 5)).toEqual([null, null, null, null, 'C0']);
    expect(pages[1].length).toBe(29 - parPage(FORMATS.a4_21));
  });
});
