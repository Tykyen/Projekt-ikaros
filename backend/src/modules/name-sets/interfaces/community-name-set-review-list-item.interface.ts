/**
 * 21.2a — položka pending fronty „jmenné sady ke schválení" (Zpracovat tab).
 */
export interface CommunityNameSetReviewListItem {
  nameSetId: string;
  name: string;
  category: string;
  /** Souhrn velikostí seznamů (orientace kurátora). */
  counts: { male: number; female: number; surnames: number };
  authorId: string;
  submittedAt: string;
}
