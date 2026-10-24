import { describe, expect, it } from 'vitest';
import { copier, disposition, ecrireValeur, FORMATS, paginer, parPage, QR_CONSEILLE_MM, verifierFormat } from './formats.js';

describe('modèles d’étiquettes', () => {
  it('chaque modèle tient dans sa page et donne un QR lisible', () => {
    for (const [cle, f] of Object.entries(FORMATS)) {
      const { erreurs } = verifierFormat(f);
      expect(erreurs, cle).toEqual([]);
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

describe('disposition du contenu', () => {
  it('étiquette allongée : QR à côté du code', () => {
    const d = disposition({ largeur: 63.5, hauteur: 38.1 });
    expect(d.sens).toBe('cote');
    expect(d.qr).toBeGreaterThan(30);
    expect(d.police).toBeGreaterThanOrEqual(1.6);
  });

  it('étiquette carrée : code sous le QR', () => {
    const d = disposition({ largeur: 25, hauteur: 25 });
    expect(d.sens).toBe('dessous');
    expect(d.qr).toBeGreaterThanOrEqual(QR_CONSEILLE_MM);
  });

  it('étiquette minuscule : QR seul', () => {
    expect(disposition({ largeur: 12, hauteur: 12 }).sens).toBe('seul');
  });

  it('sans code en clair : QR maximal', () => {
    const d = disposition({ largeur: 40, hauteur: 20 }, { afficherCode: false });
    expect(d.sens).toBe('seul');
    expect(d.qr).toBeCloseTo(20 - 2 * d.marge);
  });
});

describe('format personnalisé', () => {
  it('signale une grille qui déborde de la page', () => {
    const f = ecrireValeur(copier(FORMATS.a4_21), ['colonnes'], 4);
    expect(verifierFormat(f).erreurs[0]).toMatch(/de large/);
  });

  it('refuse un QR trop petit et avertit d’un QR fragile', () => {
    const minuscule = ecrireValeur(ecrireValeur(copier(FORMATS.rouleau_40x20), ['etiquette', 'hauteur'], 7), ['page', 'hauteur'], 7);
    expect(verifierFormat(minuscule).erreurs.some((e) => e.includes('trop petit'))).toBe(true);
    const petit = ecrireValeur(ecrireValeur(copier(FORMATS.rouleau_40x20), ['etiquette', 'hauteur'], 12), ['page', 'hauteur'], 12);
    expect(verifierFormat(petit).avertissements.some((e) => e.includes('fragile'))).toBe(true);
  });

  it('refuse une valeur hors bornes ou non entière', () => {
    expect(verifierFormat(ecrireValeur(copier(FORMATS.a4_21), ['colonnes'], 2.5)).erreurs[0]).toMatch(/entier/);
    expect(verifierFormat(ecrireValeur(copier(FORMATS.a4_21), ['etiquette', 'largeur'], Number.NaN)).erreurs.length).toBe(1);
  });
});
