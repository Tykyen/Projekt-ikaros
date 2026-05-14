/**
 * Spec 1.4 — univerzální action queue (Zpracovat tab).
 *
 * Každý typ má jednoho `IPendingActionProvider` (BE) a jednoho card renderera
 * (FE). Spec roadmap-fe.md popisuje, kdy se jednotlivé typy zapnou:
 *
 *  - `username_request`  — 1.4 (přesun z 1.3b)
 *  - `friend_request`     — 1.8
 *  - `world_join_request` — 2.4
 *  - `article_pending_review`     — 3.2
 *  - `gallery_pending_review`     — 3.3
 *  - `discussion_report`          — 3.4
 *  - `discussion_join_request`    — 3.4
 *
 * Když nová fáze přidá svůj typ, doplní řádek sem + implementuje provider +
 * registruje ho v PendingActionsService při startu modulu.
 */
export enum PendingActionType {
  UsernameRequest = 'username_request',
  FriendRequest = 'friend_request',
  WorldJoinRequest = 'world_join_request',
  ArticlePendingReview = 'article_pending_review',
  GalleryPendingReview = 'gallery_pending_review',
  DiscussionReport = 'discussion_report',
  DiscussionJoinRequest = 'discussion_join_request',
}
