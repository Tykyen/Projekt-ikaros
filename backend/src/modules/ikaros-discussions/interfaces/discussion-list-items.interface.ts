/**
 * Spec 3.4 §7 — payloady karet ve Zpracovat tabu pro tři queue typy diskuzí.
 * Zrcadlí FE typy v `Projekt-ikaros-FE/src/shared/types/index.ts`.
 */

/** `discussion_pending_review` — diskuze čekající na schválení. */
export interface DiscussionReviewListItem {
  discussionId: string;
  title: string;
  descriptionExcerpt: string;
  creatorId: string;
  creatorName: string;
  submittedAt: string;
}

/** `discussion_report` — nahlášený příspěvek. */
export interface DiscussionReportListItem {
  reportId: string;
  discussionId: string;
  discussionTitle: string;
  postId: string;
  postContentSnapshot: string;
  postAuthorName: string;
  reporterName: string;
  reason: string;
  createdAt: string;
}

/** `discussion_join_request` — žádost o přidání do uzamčené diskuze. */
export interface DiscussionJoinRequestListItem {
  discussionId: string;
  discussionTitle: string;
  userId: string;
  username: string;
}
