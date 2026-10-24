import { describe, expect, it } from 'vitest';
import { candidats, extraireCodeUrl, normaliser, normaliserCodeApp, normaliserHex } from './normalisation.js';

const URL_PUBLIQUE = 'https://laverie.exemple.be';

describe('normaliser', () => {
  it('UID NFC avec deux-points → hexadécimal majuscule sans séparateur', () => {
    expect(normaliser({ technologie: 'nfc', valeur_brute: '04:a2:3b:1c:7f:52:80' })).toEqual({
      technologie: 'nfc',
      valeur: '04A23B1C7F5280',
    });
  });

  it('EPC UHF avec espaces et tirets', () => {
    expect(normaliser({ technologie: 'uhf', valeur_brute: 'e280 6894-0000 4000' })).toEqual({
      technologie: 'uhf',
      valeur: 'E280689400004000',
    });
  });

  it('refuse un UID NFC qui n’est pas hexadécimal', () => {
    expect(normaliser({ technologie: 'nfc', valeur_brute: 'XYZ' })).toBeNull();
  });

  it('QR de l’app : ne garde que le code', () => {
    expect(normaliser({ technologie: 'qr', valeur_brute: `${URL_PUBLIQUE}/v/7K3M9P2QXR` }, { urlPublique: URL_PUBLIQUE })).toEqual({
      technologie: 'qr',
      valeur: '7K3M9P2QXR',
    });
  });

  it('QR de l’app lu par une douchette sans profil : reconnu comme QR', () => {
    expect(normaliser({ valeur_brute: `${URL_PUBLIQUE}/v/7k3m9p2qxr\r` }, { urlPublique: URL_PUBLIQUE })).toEqual({
      technologie: 'qr',
      valeur: '7K3M9P2QXR',
    });
  });

  it('QR d’un autre site : valeur conservée telle quelle', () => {
    expect(normaliser({ technologie: 'qr', valeur_brute: 'https://autre.be/v/7K3M9P2QXR' }, { urlPublique: URL_PUBLIQUE })).toEqual({
      technologie: 'qr',
      valeur: 'https://autre.be/v/7K3M9P2QXR',
    });
  });

  it('code-barres avec espaces et caractères de contrôle : retirés, casse conservée', () => {
    expect(normaliser({ technologie: 'code_barres', valeur_brute: ' Ab 12\u001d34\t\n' })).toEqual({
      technologie: 'code_barres',
      valeur: 'Ab1234',
    });
  });

  it('valeur vide après nettoyage : illisible', () => {
    expect(normaliser({ technologie: 'code_barres', valeur_brute: ' \r\n' })).toBeNull();
  });
});

describe('codes de l’app', () => {
  it('tolère minuscules, tirets et lettres ambiguës', () => {
    expect(normaliserCodeApp('7k3m-9p2q-xr')).toBe('7K3M9P2QXR');
    expect(normaliserCodeApp('OIL0000000')).toBe('0110000000');
  });

  it('refuse une longueur ou un caractère invalide', () => {
    expect(normaliserCodeApp('7K3M9P2QX')).toBeNull();
    expect(normaliserCodeApp('7K3M9P2QXU')).toBeNull();
  });

  it('extrait le code avec ou sans / final et en http', () => {
    expect(extraireCodeUrl('http://laverie.exemple.be/v/7K3M9P2QXR/', `${URL_PUBLIQUE}/`)).toBe('7K3M9P2QXR');
    expect(extraireCodeUrl('https://laverie.exemple.be/autre/7K3M9P2QXR', URL_PUBLIQUE)).toBeNull();
  });
});

describe('candidats', () => {
  it('technologie connue : une seule recherche', () => {
    expect(candidats({ technologie: 'qr', valeur: 'ABC' })).toEqual([{ technologie: 'qr', valeur: 'ABC' }]);
  });

  it('technologie inconnue : valeur, forme hexadécimale et code de l’app', () => {
    expect(candidats({ technologie: null, valeur: '04:a2:3b' })).toEqual([
      { technologie: null, valeur: '04:a2:3b' },
      { technologie: null, valeur: '04A23B' },
    ]);
    expect(candidats({ technologie: null, valeur: '7k3m9p2qxr' })).toEqual([
      { technologie: null, valeur: '7k3m9p2qxr' },
      { technologie: null, valeur: '7K3M9P2QXR' },
    ]);
  });
});

describe('normaliserHex', () => {
  it('accepte points et espaces', () => {
    expect(normaliserHex('04.a2 3b')).toBe('04A23B');
  });
});
