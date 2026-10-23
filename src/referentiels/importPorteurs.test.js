import { describe, expect, it } from 'vitest';
import { analyserImportPorteurs } from './importPorteurs.js';
import { lireCsv, normaliserEntete } from '../lib/csv.js';

const sites = [
  { id: 's1', nom: 'Poste Centre' },
  { id: 's2', nom: 'Poste Nord' },
];

describe('lireCsv', () => {
  it('détecte le point-virgule, retire le BOM et gère les guillemets', () => {
    const lignes = lireCsv('﻿a;b;c\r\n1;"deux; et ""trois""";4\r\n\r\n');
    expect(lignes).toEqual([
      ['a', 'b', 'c'],
      ['1', 'deux; et "trois"', '4'],
    ]);
  });

  it('accepte la virgule et une dernière ligne sans retour', () => {
    expect(lireCsv('x,y\n1,2')).toEqual([
      ['x', 'y'],
      ['1', '2'],
    ]);
  });

  it('garde les retours à la ligne entre guillemets', () => {
    expect(lireCsv('a;b\n"l1\nl2";z')).toEqual([
      ['a', 'b'],
      ['l1\nl2', 'z'],
    ]);
  });
});

describe('normaliserEntete', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normaliserEntete(' Prénom ')).toBe('prenom');
    expect(normaliserEntete('N° casier')).toBe('n_casier');
  });
});

describe('analyserImportPorteurs', () => {
  it('classe créations, mises à jour, doublons et lignes invalides', () => {
    const csv = [
      'Matricule;Nom;Prénom;Casier;Site;Remarque',
      'P001;Dupont;Jean;12;poste centre;x',
      'P002;Martin;Claire;;;',
      'P001;Dupont;Jean;12;Poste Centre;',
      ';Sans;Matricule;;;',
      'P003;Leroy;Paul;;Poste Sud;',
      'P004;Peeters;Anne;7;Poste Nord;',
    ].join('\n');
    const r = analyserImportPorteurs(csv, sites, new Set(['P004']));

    expect(r.aCreer).toEqual([
      { matricule: 'P001', nom: 'Dupont', prenom: 'Jean', casier: '12', site_id: 's1' },
      { matricule: 'P002', nom: 'Martin', prenom: 'Claire', casier: null, site_id: null },
    ]);
    expect(r.aMettreAJour).toEqual([
      { matricule: 'P004', nom: 'Peeters', prenom: 'Anne', casier: '7', site_id: 's2' },
    ]);
    expect(r.doublons).toEqual([{ ligne: 4, matricule: 'P001', premiere: 2 }]);
    expect(r.invalides).toEqual([
      { ligne: 5, motif: 'Matricule vide' },
      { ligne: 6, motif: 'Site inconnu : « Poste Sud »' },
    ]);
    expect(r.colonnesIgnorees).toEqual(['Remarque']);
  });

  it('refuse un fichier sans colonne matricule', () => {
    const r = analyserImportPorteurs('nom;prenom\nDupont;Jean', sites, new Set());
    expect(r.invalides[0].motif).toMatch(/matricule/);
    expect(r.aCreer).toEqual([]);
  });

  it("n'efface pas les colonnes absentes du fichier", () => {
    const r = analyserImportPorteurs('matricule;casier\nP9;3', sites, new Set(['P9']));
    expect(r.aMettreAJour).toEqual([{ matricule: 'P9', casier: '3' }]);
  });
});
