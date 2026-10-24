import { describe, expect, it } from 'vitest';
import { classerCorrespondances, resoudre } from './resolution.js';

describe('classerCorrespondances', () => {
  it('aucun identifiant : inconnu', () => {
    expect(classerCorrespondances([])).toEqual({ statut: 'inconnu', correspondances: [] });
  });

  it('un vêtement, même s’il est trouvé par deux valeurs candidates : trouvé', () => {
    const r = classerCorrespondances([
      { vetement_id: 'v1', technologie: 'nfc', valeur: '04A2' },
      { vetement_id: 'v1', technologie: 'qr', valeur: '04A2' },
    ]);
    expect(r.statut).toBe('trouve');
    expect(r.vetementId).toBe('v1');
  });

  it('deux vêtements : ambigu, choix demandé', () => {
    const r = classerCorrespondances([
      { vetement_id: 'v1', technologie: 'code_barres', valeur: '12345' },
      { vetement_id: 'v2', technologie: 'qr', valeur: '12345' },
    ]);
    expect(r.statut).toBe('ambigu');
    expect(r.correspondances.map((c) => c.vetement_id)).toEqual(['v1', 'v2']);
  });
});

// Client Supabase factice qui enregistre les filtres appliqués.
function clientFactice(reponse) {
  const filtres = [];
  const requete = {
    select: () => requete,
    eq: (col, val) => (filtres.push(['eq', col, val]), requete),
    in: (col, val) => (filtres.push(['in', col, val]), requete),
    then: (ok) => ok(reponse),
  };
  return { filtres, client: { from: () => requete } };
}

describe('resoudre', () => {
  it('filtre sur la technologie quand elle est connue', async () => {
    const { client, filtres } = clientFactice({ data: [{ vetement_id: 'v1' }], error: null });
    const r = await resoudre({ technologie: 'nfc', valeur: '04A2' }, { client, organisationId: 'o1' });
    expect(r.statut).toBe('trouve');
    expect(filtres).toContainEqual(['eq', 'technologie', 'nfc']);
    expect(filtres).toContainEqual(['eq', 'actif', true]);
    expect(filtres).toContainEqual(['in', 'valeur', ['04A2']]);
  });

  it('sans technologie : cherche aussi la forme hexadécimale, sans filtre de technologie', async () => {
    const { client, filtres } = clientFactice({ data: [], error: null });
    const r = await resoudre({ technologie: null, valeur: '04:a2' }, { client, organisationId: 'o1' });
    expect(r.statut).toBe('inconnu');
    expect(filtres.some(([, col]) => col === 'technologie')).toBe(false);
    expect(filtres).toContainEqual(['in', 'valeur', ['04:a2', '04A2']]);
  });

  it('erreur réseau : statut erreur', async () => {
    const { client } = clientFactice({ data: null, error: { message: 'Failed to fetch' } });
    expect((await resoudre({ technologie: 'qr', valeur: 'X' }, { client, organisationId: 'o1' })).statut).toBe('erreur');
  });
});
