import type { CharacterDiary } from '../character-subdocs/interfaces/character-diary.interface';

/**
 * D-066-ZBYTKY b — moderačně skrytý deník (spec 20B B4b) nesmí do exportu.
 *
 * Export (14.7c) čte diary repo přímo, MIMO moderation gate
 * `assertDiaryNotModerationHidden` v character-subdocs service → PJ-full ZIP
 * by obsahoval obsah, který PJ v UI nevidí (skrytý deník vidí jen platform
 * revieweři, vlastník i PJ dostanou 404). Konzistence: deník pro PJ
 * „neexistuje" → v exportu se celý VYNECHÁ (žádný placeholder — méně
 * invazivní vůči struktuře `characterSubdocs.diaries[]` i import fidelity).
 */
export function omitModerationHiddenDiaries<
  T extends Pick<CharacterDiary, 'moderationHidden'>,
>(diaries: T[]): T[] {
  return diaries.filter((d) => !d.moderationHidden);
}
