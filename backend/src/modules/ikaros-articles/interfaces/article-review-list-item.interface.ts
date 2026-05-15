/**
 * Spec 3.2a — payload jedné karty v Zpracovat tabu pro queue typ
 * `article_pending_review`. FE renderer (3.2d) z toho staví Left/Mid/Actions.
 */
export interface ArticleReviewListItem {
  articleId: string;
  title: string;
  /** Prvních 200 znaků obsahu, stripped HTML. */
  preview: string;
  category: string;
  authorId: string;
  authorName: string;
  /** ISO timestamp odeslání (článkový `updatedAtUtc` v Pending statusu). */
  submittedAt: string;
}
