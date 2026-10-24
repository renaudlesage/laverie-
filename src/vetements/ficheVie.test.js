import { describe, expect, it } from 'vitest';
import { ficheVieCsv } from './ficheVie.js';
import { lireCsv } from '../lib/csv.js';

describe('fiche de vie CSV', () => {
  const csv = ficheVieCsv({
    fiche: [['Article', 'Veste; modèle "2024"'], ['Statut', 'En service']],
    compteurs: [{ traitement: 'Lavage', passages: 12, limite: 50 }],
    identifiants: [{ technologie: 'QR', valeur: 'ABC', pose_le: '01/02/2026', retire_le: null, motif: null }],
    evenements: [{ date: '03/02/2026 10:00', evenement: 'Réforme', detail: 'Déchirure\nmanche', site: 'Poste', source: 'app', annule: false }],
  });

  it('commence par le BOM UTF-8 pour Excel', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('échappe séparateurs, guillemets et retours à la ligne, et se relit à l’identique', () => {
    const lignes = lireCsv(csv);
    expect(lignes).toContainEqual(['Article', 'Veste; modèle "2024"']);
    expect(lignes).toContainEqual(['03/02/2026 10:00', 'Réforme', 'Déchirure\nmanche', 'Poste', 'app', '']);
    expect(lignes).toContainEqual(['Lavage', '12', '50']);
  });
});
