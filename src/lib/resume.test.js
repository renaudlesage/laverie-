import { describe, expect, it } from 'vitest';
import { construireResume } from '../../supabase/functions/resume-alertes/resume.ts';

describe('résumé quotidien des alertes', () => {
  it('compose sujet, texte et HTML (échappé)', () => {
    const r = construireResume({
      zone: 'ZS <test>',
      ouvertes: { seuil_atteint: 1, non_revenu: 3 },
      nouvelles: [
        { type: 'seuil_atteint', niveau: 'critique', message: 'Lavage : 25 / 25 passages', ouverte_le: '2026-10-24T06:00:00Z', article: 'Veste', code: 'TEST000001' },
        { type: 'non_revenu', niveau: 'attention', message: 'Collecté le …', ouverte_le: '2026-10-24T07:00:00Z' },
      ],
      totalNouvelles: 5,
      lien: 'https://app.exemple',
    });
    expect(r.sujet).toBe('ZS <test> — 5 nouvelle(s) alerte(s), dont 1 critique(s)');
    expect(r.texte).toContain('- [Limite de passages atteinte] Veste TEST000001 : Lavage : 25 / 25 passages');
    expect(r.texte).toContain('… et 3 autre(s).');
    expect(r.texte).toContain('Alertes ouvertes : 4');
    expect(r.texte).toContain('https://app.exemple/alertes');
    expect(r.html).toContain('ZS &lt;test&gt;');
    expect(r.html).not.toContain('<test>');
  });
});
