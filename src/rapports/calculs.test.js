import { describe, expect, it } from 'vitest';
import { regrouperFinDeVie, totauxParTraitement } from './calculs.js';

describe('rapports', () => {
  it('regroupe les vêtements à renouveler par article et taille', () => {
    const r = regrouperFinDeVie([
      { article: 'Veste', taille: 'L' },
      { article: 'Veste', taille: 'L' },
      { article: 'Cagoule', taille: null },
      { article: 'Veste', taille: 'M' },
    ]);
    expect(r).toEqual([
      { article: 'Cagoule', taille: '—', nombre: 1 },
      { article: 'Veste', taille: 'L', nombre: 2 },
      { article: 'Veste', taille: 'M', nombre: 1 },
    ]);
  });

  it('totalise l’activité d’une laverie par traitement', () => {
    expect(
      totauxParTraitement([
        { traitement: 'Lavage', passages: 12 },
        { traitement: 'Séchage', passages: 3 },
        { traitement: 'Lavage', passages: 8 },
      ]),
    ).toEqual([
      { traitement: 'Lavage', lots: 2, passages: 20 },
      { traitement: 'Séchage', lots: 1, passages: 3 },
    ]);
  });
});
