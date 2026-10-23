import { describe, expect, it } from 'vitest';
import { messageErreur } from './erreurs.js';

describe('messageErreur', () => {
  it('traduit une contrainte CHECK connue', () => {
    expect(
      messageErreur({ code: '23514', message: 'new row for relation "traitements" violates check constraint "traitements_code_check"' }),
    ).toMatch(/^Code : lettres minuscules/);
  });

  it('ne laisse jamais passer le message anglais d’une contrainte inconnue', () => {
    expect(messageErreur({ code: '23514', message: 'new row for relation "x" violates check constraint "x_y_check"' })).toBe(
      'Valeur refusée par la base.',
    );
  });

  it('garde le message français d’un déclencheur', () => {
    const message = 'Article non activable : notice fabricant manquante';
    expect(messageErreur({ code: '23514', message })).toBe(message);
  });

  it('traduit doublon, droits et réseau', () => {
    expect(messageErreur({ code: '23505', message: 'duplicate key' })).toBe('Cette valeur existe déjà.');
    expect(messageErreur({ code: '42501', message: 'permission denied for table sites' })).toMatch(/droits/);
    expect(messageErreur({ message: 'Failed to fetch' })).toMatch(/Connexion impossible/);
  });
});
