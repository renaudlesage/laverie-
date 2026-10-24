import { describe, expect, it } from 'vitest';
import { trouverSac } from './sacs.js';

const sacs = [
  { id: 's1', actif: true, technologie: 'qr', code: 'SACSTD0001' },
  { id: 's2', actif: true, technologie: 'nfc', code: '04AABB' },
  { id: 's3', actif: false, technologie: 'qr', code: 'SACOLD0001' },
  { id: 's4', actif: true, technologie: null, code: null },
];

describe('trouverSac', () => {
  it('par code et technologie', () => {
    expect(trouverSac(sacs, { technologie: 'qr', valeur: 'SACSTD0001' })?.id).toBe('s1');
  });

  it('douchette sans profil : UID tapé avec séparateurs', () => {
    expect(trouverSac(sacs, { technologie: null, valeur: '04:aa:bb' })?.id).toBe('s2');
  });

  it('ignore les sacs inactifs et une technologie différente', () => {
    expect(trouverSac(sacs, { technologie: 'qr', valeur: 'SACOLD0001' })).toBeNull();
    expect(trouverSac(sacs, { technologie: 'code_barres', valeur: 'SACSTD0001' })).toBeNull();
  });
});
