import { describe, expect, it } from 'vitest';
import { appliquer, operer, RegleRefusee, seuilAtteint, verifier } from './machine.js';

const base = {
  id: 'v1', statut: 'en_laverie', contamine: false, site_id: 'lav', porteur_id: null, lot_id: null,
  derniere_lecture_le: null, controle_renforce: false, nominatif: false,
};
const lot = { id: 'l1', type: 'traitement', statut: 'ouvert', circuit: 'standard', site_id: 'lav', traitement_id: 't1' };
const quand = '2026-10-24T10:00:00Z';

describe('appliquer (copie de prive.appliquer)', () => {
  it('suit le cycle laverie complet', () => {
    let e = { ...base, statut: 'en_service', porteur_id: 'p1', site_id: 'poste' };
    e = appliquer(e, 'collecte', { lot: 'sac', quand });
    expect(e).toMatchObject({ statut: 'collecte', lot_id: 'sac' });
    e = appliquer(e, 'reception', { site: 'lav', quand });
    expect(e).toMatchObject({ statut: 'en_laverie', site_id: 'lav', lot_id: null });
    e = appliquer(e, 'ajout_lot', { lot: 'l1', quand });
    e = appliquer(e, 'traitement', { lot: 'l1', quand });
    expect(e).toMatchObject({ statut: 'traite', lot_id: null, controle_renforce: false });
    e = appliquer(e, 'controle', { quand, d: { verdict: 'conforme' } });
    e = appliquer(e, 'livraison', { site: 'poste', quand });
    expect(e).toMatchObject({ statut: 'en_service', site_id: 'poste', porteur_id: 'p1' });
  });

  it('refuse une transition interdite avec le message de la base', () => {
    expect(() => appliquer({ ...base, statut: 'traite' }, 'ajout_lot', { lot: 'l1', quand })).toThrow(
      'Transition impossible : « ajout_lot » depuis le statut « traite »',
    );
  });

  it('ne lève le drapeau contaminé qu’au contrôle conforme décontaminant', () => {
    const e = appliquer({ ...base, statut: 'traite', contamine: true }, 'controle', {
      quand, d: { verdict: 'conforme', renforce: true, decontamine: true },
    });
    expect(e).toMatchObject({ statut: 'pret', contamine: false, controle_renforce: true });
  });
});

describe('verifier (règles d’ingestion)', () => {
  it('refuse un vêtement contaminé dans un lot standard (LC001)', () => {
    try {
      verifier({ type: 'ajout_lot', lot_id: 'l1', survenu_le: quand }, { v: { ...base, contamine: true }, lot });
      throw new Error('aurait dû refuser');
    } catch (e) {
      expect(e).toBeInstanceOf(RegleRefusee);
      expect(e.code).toBe('LC001');
      expect(e.message).toMatch(/Mélange de circuits/);
    }
  });

  it('refuse un vêtement standard dans un sac contaminé', () => {
    const sac = { id: 's', type: 'sac_collecte', statut: 'ouvert', circuit: 'contamine' };
    expect(() => verifier({ type: 'collecte', lot_id: 's', survenu_le: quand }, { v: { ...base, statut: 'en_stock' }, lot: sac })).toThrow(
      /Mélange de circuits/,
    );
  });

  it('exige le même site pour l’ajout au lot', () => {
    expect(() => verifier({ type: 'ajout_lot', lot_id: 'l1', survenu_le: quand }, { v: { ...base, site_id: 'autre' }, lot })).toThrow(
      /pas réceptionné sur le site/,
    );
  });

  it('exige le contrôle renforcé pour un vêtement contaminé ou à sa limite', () => {
    const ev = { type: 'controle', survenu_le: quand, donnees: { verdict: 'conforme' } };
    expect(() => verifier(ev, { v: { ...base, statut: 'traite', contamine: true } })).toThrow(/renforcé obligatoire/);
    expect(() => verifier(ev, { v: { ...base, statut: 'traite' }, seuil: true })).toThrow(/limite/);
    const ok = verifier({ ...ev, donnees: { verdict: 'conforme', renforce: true } }, { v: { ...base, statut: 'traite', contamine: true } });
    expect(ok.etat).toMatchObject({ statut: 'pret', contamine: false });
  });

  it('exige un motif pour réparer ou réformer', () => {
    expect(() => verifier({ type: 'controle', survenu_le: quand, donnees: { verdict: 'a_reparer' } }, { v: { ...base, statut: 'traite' } })).toThrow(
      /Motif obligatoire/,
    );
  });

  it('refuse la réception d’un sac non expédié', () => {
    const v = { ...base, statut: 'collecte', lot_id: 's' };
    expect(() =>
      verifier({ type: 'reception', site_id: 'lav', survenu_le: quand }, { v, lotDuVetement: { id: 's', statut: 'ouvert' }, site: { type: 'laverie_interne' } }),
    ).toThrow(/pas été expédié/);
  });
});

describe('operer (opérations sur les lots)', () => {
  it('clôture : un passage par vêtement en traitement, sur le traitement du lot', () => {
    const contenu = [
      { ...base, id: 'a', statut: 'en_traitement', lot_id: 'l1' },
      { ...base, id: 'b', statut: 'en_traitement', lot_id: 'l1' },
    ];
    const r = operer({ type: 'cloturer_lot', lot_id: 'l1', survenu_le: quand }, { lot, contenu });
    expect(r.lot.statut).toBe('cloture');
    expect(r.passages).toEqual([
      { vetement_id: 'a', traitement_id: 't1' },
      { vetement_id: 'b', traitement_id: 't1' },
    ]);
    expect(r.vetements.every((v) => v.statut === 'traite')).toBe(true);
  });

  it('un lot avorté ne compte rien ; un lot déjà clôturé est un doublon', () => {
    const contenu = [{ ...base, id: 'a', statut: 'en_traitement', lot_id: 'l1' }];
    const r = operer({ type: 'avorter_lot', lot_id: 'l1', survenu_le: quand }, { lot, contenu });
    expect(r.passages).toEqual([]);
    expect(r.vetements[0].statut).toBe('en_laverie');
    expect(operer({ type: 'cloturer_lot', lot_id: 'l1' }, { lot: { ...lot, statut: 'cloture' }, contenu })).toEqual({ doublon: true });
  });

  it('refuse un traitement incompatible avec le circuit', () => {
    expect(() =>
      operer(
        { type: 'ouvrir_lot', lot_id: 'n', circuit: 'contamine', survenu_le: quand },
        { site: { id: 'lav', type: 'laverie_interne' }, traitement: { id: 't', actif: true, circuit: 'standard' } },
      ),
    ).toThrow(/incompatible/);
  });
});

describe('seuilAtteint', () => {
  it('compare passages et limites, puis l’âge', () => {
    expect(seuilAtteint({ compteurs: [{ traitement_id: 't', passages: 50 }], limites: { t: 50 } })).toBe(true);
    expect(seuilAtteint({ compteurs: [{ traitement_id: 't', passages: 49 }], limites: { t: 50 } })).toBe(false);
    expect(seuilAtteint({ dureeVieMois: 12, misEnServiceLe: '2020-01-01' }, new Date('2026-01-01'))).toBe(true);
    expect(seuilAtteint({ dureeVieMois: 120, misEnServiceLe: '2020-01-01' }, new Date('2026-01-01'))).toBe(false);
  });
});
