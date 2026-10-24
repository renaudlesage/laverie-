import { describe, expect, it } from 'vitest';
import { ecrireCsv, lireCsv } from './csv.js';

describe('ecrireCsv', () => {
  it('écrit un CSV pour Excel (BOM, « ; ») et se relit à l’identique', () => {
    const texte = ecrireCsv(['Code', 'Note'], [['A;1', 'dit "oui"'], ['B2', null]]);
    expect(texte.startsWith('﻿')).toBe(true);
    expect(texte).toContain('"A;1";"dit ""oui"""');
    expect(lireCsv(texte)).toEqual([
      ['Code', 'Note'],
      ['A;1', 'dit "oui"'],
      ['B2', ''],
    ]);
  });
});
