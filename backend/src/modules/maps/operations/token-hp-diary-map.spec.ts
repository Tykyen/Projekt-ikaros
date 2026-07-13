import { buildDiaryHpPatch } from './token-hp-diary-map';

// D-NEW-INV-DATA-SYNC — mapování token HP → per-system diary klíče.
// Klíče zrcadlí FE `resolveCharacterHp.ts` (read strana kontraktu).
describe('buildDiaryHpPatch', () => {
  it('dnd5e: currentHp + maxHp → dnd_hpCur + dnd_hpMax', () => {
    expect(buildDiaryHpPatch('dnd5e', { currentHp: 7, maxHp: 22 })).toEqual({
      dnd_hpCur: 7,
      dnd_hpMax: 22,
    });
  });

  it('jen currentHp → jen current klíč (coc)', () => {
    expect(buildDiaryHpPatch('coc', { currentHp: 4 })).toEqual({
      coc_hp_cur: 4,
    });
  });

  it('matrix: max je konstanta → maxHp se zahodí, current jde do matrix_health', () => {
    expect(buildDiaryHpPatch('matrix', { currentHp: 3, maxHp: 99 })).toEqual({
      matrix_health: 3,
    });
  });

  it('drd16 legacy klíče bez prefixu', () => {
    expect(buildDiaryHpPatch('drd16', { currentHp: 2, maxHp: 9 })).toEqual({
      hp_current: 2,
      hp_max: 9,
    });
  });

  it.each(['shadowrun', 'fae', 'fate', 'drdplus', 'drd2'])(
    'systém bez jednoznačného HP mapování (%s) → null',
    (systemId) => {
      expect(buildDiaryHpPatch(systemId, { currentHp: 5, maxHp: 10 })).toBe(
        null,
      );
    },
  );

  it('neznámý systém → null', () => {
    expect(buildDiaryHpPatch('neexistuje', { currentHp: 5 })).toBe(null);
  });

  it('bez hodnot / NaN → null (nic k propsání)', () => {
    expect(buildDiaryHpPatch('dnd5e', {})).toBe(null);
    expect(buildDiaryHpPatch('dnd5e', { currentHp: NaN })).toBe(null);
  });
});
