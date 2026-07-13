import { omitModerationHiddenDiaries } from './export-moderation.util';

/**
 * D-066-ZBYTKY b — export světa (14.7c) nesmí vynést deník skrytý moderací
 * (spec 20B B4b): PJ ho v UI nevidí (404, vidí jen platform revieweři),
 * záloha ZIP ho proto konzistentně vynechá. Když tento test zčervená,
 * moderation leak v exportu se vrátil.
 */
describe('omitModerationHiddenDiaries (D-066-ZBYTKY b)', () => {
  const diary = (over: {
    characterId: string;
    moderationHidden?: boolean;
  }) => ({
    characterId: over.characterId,
    sections: [{ id: 's1', text: 'tajný obsah' }],
    moderationHidden: over.moderationHidden,
  });

  it('vynechá deník s moderationHidden:true, ostatní zachová', () => {
    const out = omitModerationHiddenDiaries([
      diary({ characterId: 'c1' }),
      diary({ characterId: 'c2', moderationHidden: true }),
      diary({ characterId: 'c3', moderationHidden: false }),
    ]);
    expect(out.map((d) => d.characterId)).toEqual(['c1', 'c3']);
  });

  it('skrytý obsah se v žádné podobě nedostane do výsledku', () => {
    const out = omitModerationHiddenDiaries([
      diary({ characterId: 'c-hidden', moderationHidden: true }),
    ]);
    expect(out).toEqual([]);
    expect(JSON.stringify(out)).not.toContain('tajný obsah');
  });

  it('deník bez flagu (legacy dokument, undefined) zůstává', () => {
    const out = omitModerationHiddenDiaries([diary({ characterId: 'c1' })]);
    expect(out).toHaveLength(1);
  });

  it('prázdné pole → prázdné pole', () => {
    expect(omitModerationHiddenDiaries([])).toEqual([]);
  });
});
