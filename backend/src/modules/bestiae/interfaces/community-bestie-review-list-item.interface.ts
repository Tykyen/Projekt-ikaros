/**
 * 16.2b-2 — položka karty v pending frontě „komunitní bytosti ke schválení"
 * (Zpracovat tab). Analogie `ArticleReviewListItem`.
 */
export interface CommunityBestieReviewListItem {
  bestieId: string;
  name: string;
  latin?: string;
  kind?: string;
  /** Systémy, pro které bytost už má pravidlovou verzi. */
  systemIds: string[];
  authorId: string;
  submittedAt: string;
}
