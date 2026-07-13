/** 21.5b — položka pending fronty „lektvary ke schválení" (Zpracovat tab). */
export interface CommunityPotionReviewListItem {
  potionId: string;
  name: string;
  aliases?: string;
  /** Druh lektvaru (léčivý/jed/…). */
  kind: string;
  /** Primární systém lektvaru. */
  systemId: string;
  authorId: string;
  submittedAt: string;
}
