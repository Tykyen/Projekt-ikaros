/** 21.5d — položka pending fronty „hádanky ke schválení" (Zpracovat tab). */
export interface CommunityRiddleReviewListItem {
  riddleId: string;
  /** Zkrácené zadání (hádanka nemá name — spec R4). */
  question: string;
  difficulty: string;
  authorId: string;
  submittedAt: string;
}
