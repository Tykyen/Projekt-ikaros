/** 21.5c — položka pending fronty „kouzla ke schválení" (Zpracovat tab). */
export interface CommunitySpellReviewListItem {
  spellId: string;
  name: string;
  aliases?: string;
  /** Primární systém kouzla. */
  systemId: string;
  authorId: string;
  submittedAt: string;
}
