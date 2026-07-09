/**
 * Spec 3.4 §7 — payloady karet ve Zpracovat tabu pro queue typy diskuzí.
 * Zrcadlí FE typy v `Projekt-ikaros-FE/src/shared/types/index.ts`.
 * B4d — `discussion_report` sjednocen do generického `content_report`
 * (modul `moderation`); jeho payload zde už není.
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

/** `discussion_join_request` — žádost o přidání do uzamčené diskuze. */
export interface DiscussionJoinRequestListItem {
  discussionId: string;
  discussionTitle: string;
  userId: string;
  username: string;
}
