/**
 * Spec 3.2a — kontrakt pro mark-as-read tracking.
 *
 * `upsertRead` musí být idempotentní (opakovaný call = no-op, kvůli unique
 * indexu `(userId, articleId)`).
 */
export interface IArticleReadsRepository {
  upsertRead(userId: string, articleId: string): Promise<void>;
  isRead(userId: string, articleId: string): Promise<boolean>;
  countReadByUserForArticleIds(
    userId: string,
    articleIds: string[],
  ): Promise<number>;
}
