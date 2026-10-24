import { describe, expect, it } from 'vitest';
import { MANIFESTE, manifesteZone } from './_manifeste.js';

const ORG = '729a40f6-0000-4000-8000-000000000001';

describe('manifesteZone', () => {
  it('met les icônes du logo de la zone, versionnées', () => {
    const m = manifesteZone('https://x.supabase.co/', ORG, '1730000000000');
    expect(m.icons).toHaveLength(3);
    expect(m.icons[0].src).toBe(`https://x.supabase.co/storage/v1/object/public/logos/${ORG}/icone-192.png?v=1730000000000`);
    expect(m.icons[2].purpose).toBe('maskable');
    expect(m.id).toBe('/');
    expect(m.start_url).toBe('/');
  });

  it('garde le manifeste par défaut si la zone ou la version sont invalides', () => {
    expect(manifesteZone('https://x.supabase.co', 'pas-un-uuid', '1')).toBe(MANIFESTE);
    expect(manifesteZone('https://x.supabase.co', ORG, 'abc')).toBe(MANIFESTE);
    expect(manifesteZone('https://x.supabase.co', ORG, '')).toBe(MANIFESTE);
    expect(manifesteZone(undefined, ORG, '1')).toBe(MANIFESTE);
  });
});
