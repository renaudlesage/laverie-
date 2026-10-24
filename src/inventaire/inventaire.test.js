import { describe, expect, it } from 'vitest';
import { ecartsInventaire } from './ecarts.js';
import { dotations } from '../porteurs/dotations.js';

describe('écarts d’inventaire', () => {
  it('sépare présents, trouvés en plus et manquants', () => {
    const attendus = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const lus = [{ vetementId: 'a' }, { vetementId: 'x', vetement: { statut: 'perdu' } }];
    const e = ecartsInventaire(attendus, lus);
    expect(e.presents.map((v) => v.id)).toEqual(['a']);
    expect(e.enPlus.map((l) => l.vetementId)).toEqual(['x']);
    expect(e.manquants.map((v) => v.id)).toEqual(['b', 'c']);
  });
});

describe('historique de dotation', () => {
  it('clôt chaque attribution par le premier événement de fin qui la suit', () => {
    const attributions = [
      { id: 'a2', numero: 30, vetement_id: 'v1' },
      { id: 'a1', numero: 10, vetement_id: 'v1' },
      { id: 'a3', numero: 40, vetement_id: 'v2' },
    ];
    const suivants = [
      { numero: 10, vetement_id: 'v1', type: 'attribution' },
      { numero: 20, vetement_id: 'v1', type: 'restitution' },
      { numero: 30, vetement_id: 'v1', type: 'attribution' },
      { numero: 35, vetement_id: 'v2', type: 'restitution' },
    ];
    const d = dotations(attributions, suivants);
    expect(d.find((x) => x.id === 'a1').fin.type).toBe('restitution');
    expect(d.find((x) => x.id === 'a2').fin).toBeUndefined();
    expect(d.find((x) => x.id === 'a3').fin).toBeUndefined();
  });
});
