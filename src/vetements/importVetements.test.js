import { describe, expect, it } from 'vitest';
import { analyserImportVetements } from './importVetements.js';

const contexte = {
  articles: [
    { id: 'a-veste', designation: 'Veste d’intervention', reference: 'VI-200', actif: true },
    { id: 'a-pantalon', designation: 'Pantalon', reference: null, actif: true },
    { id: 'a-vieux', designation: 'Ancien modèle', reference: null, actif: false },
  ],
  sites: [{ id: 's-centre', nom: 'Poste Centre' }],
  identifiantsExistants: new Set(['code_barres|EXIST01', 'nfc|04AABB']),
  urlPublique: 'https://laverie.exemple.be',
};

describe('analyserImportVetements', () => {
  it('lit une ligne complète et normalise les codes', () => {
    const csv = 'Article;Taille;N° de série;Nominatif;Site;Mise en service;Code barres;QR;NFC\n' +
      'vi-200;L;SN1;oui;poste centre;03/02/2024;CB 001;https://laverie.exemple.be/v/7k3m9p2qxr;04:a2:3b';
    const r = analyserImportVetements(csv, contexte);
    expect(r.aCreer).toEqual([
      {
        ligne: 2,
        article_id: 'a-veste',
        taille: 'L',
        numero_serie: 'SN1',
        nominatif: true,
        site_id: 's-centre',
        mis_en_service_le: '2024-02-03',
        identifiants: [
          { technologie: 'code_barres', valeur: 'CB001' },
          { technologie: 'qr', valeur: '7K3M9P2QXR' },
          { technologie: 'nfc', valeur: '04A23B' },
        ],
      },
    ]);
  });

  it('classe chaque problème dans la bonne catégorie', () => {
    const csv = [
      'article;code_barres;nfc;nominatif;mis_en_service;site',
      'Pantalon;OK1;;;;', // 2 : créé
      'Pantalon;EXIST01;;;;', // 3 : doublon base
      'Pantalon;OK1;;;;', // 4 : doublon fichier
      'Pantalon;;XYZ;;;', // 5 : format NFC
      'Pantalon;;;peut-être;;', // 6 : format nominatif
      'Pantalon;;;;31/02/2024;', // 7 : date impossible
      'Inconnu;;;;;', // 8 : article inconnu
      'Ancien modèle;;;;;', // 9 : article inactif
      'Pantalon;;;;;Poste Nord', // 10 : site inconnu
      ';;;;;', // ligne vide : ignorée
      'Pantalon;;;non;;', // 11 : créé sans code
    ].join('\n');
    const r = analyserImportVetements(csv, contexte);
    expect(r.aCreer.map((l) => l.ligne)).toEqual([2, 11]);
    expect(r.doublons).toEqual([
      { ligne: 3, valeur: 'EXIST01', motif: 'déjà porté par un vêtement en base' },
      { ligne: 4, valeur: 'OK1', motif: 'déjà présent ligne 2' },
    ]);
    expect(r.formats.map((l) => l.ligne)).toEqual([5, 6, 7]);
    expect(r.invalides.map((l) => l.ligne)).toEqual([8, 9, 10]);
  });

  it('refuse un fichier sans colonne article', () => {
    expect(analyserImportVetements('taille;qr\nL;X', contexte).invalides[0].motif).toMatch(/article/);
  });

  it('500 lignes : rapport exact', () => {
    const lignes = ['article;taille;code_barres;nfc'];
    const attendu = { aCreer: 0, doublons: 0, formats: 0, invalides: 0 };
    for (let i = 1; i <= 500; i++) {
      if (i % 50 === 0) {
        lignes.push(`Pantalon;M;CB${String(i - 1).padStart(4, '0')};`); // répète le code de la ligne précédente
        attendu.doublons++;
      } else if (i % 37 === 0) {
        lignes.push('Pantalon;M;;PAS-HEX');
        attendu.formats++;
      } else if (i % 41 === 0) {
        lignes.push('Article fantôme;M;;');
        attendu.invalides++;
      } else if (i === 7) {
        lignes.push('Pantalon;M;EXIST01;');
        attendu.doublons++;
      } else {
        lignes.push(`Pantalon;M;CB${String(i).padStart(4, '0')};`);
        attendu.aCreer++;
      }
    }
    const r = analyserImportVetements(lignes.join('\r\n'), contexte);
    expect({
      aCreer: r.aCreer.length,
      doublons: r.doublons.length,
      formats: r.formats.length,
      invalides: r.invalides.length,
    }).toEqual(attendu);
    expect(r.aCreer.length + r.doublons.length + r.formats.length + r.invalides.length).toBe(500);
  });
});
