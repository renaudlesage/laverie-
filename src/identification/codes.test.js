import { describe, expect, it } from 'vitest';
import { formaterCode, genererCode, urlCode } from './codes.js';
import { extraireCodeUrl, normaliserCodeApp } from './normalisation.js';

describe('codes générés', () => {
  it('10 caractères Crockford base32, relus à l’identique', () => {
    for (let i = 0; i < 200; i++) {
      const code = genererCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
      expect(normaliserCodeApp(code)).toBe(code);
    }
  });

  it('pas de collision sur 10 000 tirages', () => {
    const codes = new Set(Array.from({ length: 10000 }, genererCode));
    expect(codes.size).toBe(10000);
  });

  it('format imprimé lisible, ressaisi sans erreur', () => {
    expect(formaterCode('7K3M9P2QXR')).toBe('7K3M 9P2Q XR');
    expect(normaliserCodeApp('7k3m 9p2q xr')).toBe('7K3M9P2QXR');
  });

  it('URL encodée dans le QR, relue par la normalisation', () => {
    const url = urlCode('7K3M9P2QXR', 'https://laverie.exemple.be/');
    expect(url).toBe('https://laverie.exemple.be/v/7K3M9P2QXR');
    expect(extraireCodeUrl(url, 'https://laverie.exemple.be')).toBe('7K3M9P2QXR');
  });
});
