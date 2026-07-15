/**
 * Spec 1.4 — univerzální action queue (Zpracovat tab).
 *
 * Každý typ má jednoho `IPendingActionProvider` (BE) a jednoho card renderera
 * (FE). Spec roadmap-fe.md popisuje, kdy se jednotlivé typy zapnou:
 *
 *  - `username_request`           — 1.4 (přesun z 1.3b)
 *  - `friend_request`             — 1.8
 *  - `world_access_request`       — 2.4 (přejmenováno z `world_join_request`)
 *  - `article_pending_review`     — 3.2
 *  - `gallery_pending_review`     — 3.3
 *  - `discussion_pending_review`  — 3.4
 *  - `discussion_join_request`    — 3.4
 *    (`discussion_report` byl v B4d sjednocen do `content_report`)
 *  - `content_report`             — 20.1/20.3 (generický report & moderace, B1)
 *  - `moderation_appeal`          — 20B/B4a (odvolání proti rozhodnutí, DSA čl. 20)
 *
 * Když nová fáze přidá svůj typ, doplní řádek sem + implementuje provider +
 * registruje ho v PendingActionsService při startu modulu.
 */
export enum PendingActionType {
  UsernameRequest = 'username_request',
  FriendRequest = 'friend_request',
  WorldAccessRequest = 'world_access_request',
  // 15.10 fáze B — cílená pozvánka do světa čekající na přijetí POZVANÝM.
  WorldInvite = 'world_invite',
  ArticlePendingReview = 'article_pending_review',
  GalleryPendingReview = 'gallery_pending_review',
  DiscussionPendingReview = 'discussion_pending_review',
  // B4d — `discussion_report` sjednocen do generického `content_report`
  // (modul `moderation`); typ odstraněn.
  DiscussionJoinRequest = 'discussion_join_request',
  // 20.1/20.3 (B1) — generická fronta reportů napříč plochami (modul `moderation`).
  ContentReport = 'content_report',
  // 20B/B4a — fronta odvolání proti moderačnímu rozhodnutí (přezkum jiným moderátorem).
  ModerationAppeal = 'moderation_appeal',
  // 16.2b-2 — komunitní bytosti (scope='community', status='draft') čekající na
  // povýšení do schválené knihovny. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunityBestiePendingReview = 'community_bestie_pending_review',
  // 21.5a — komunitní rostliny herbáře (scope='community', status='draft')
  // čekající na schválení. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunityPlantPendingReview = 'community_plant_pending_review',
  // 21.5c — komunitní kouzla (scope='community', status='draft') čekající na
  // schválení. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunitySpellPendingReview = 'community_spell_pending_review',
  // 21.5b — komunitní lektvary (scope='community', status='draft') čekající na
  // schválení. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunityPotionPendingReview = 'community_potion_pending_review',
  // 21.5e — komunitní předměty (scope='community', status='draft') čekající na
  // schválení. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunityItemPendingReview = 'community_item_pending_review',
  // 21.5d — komunitní hádanky (scope='community', status='draft') čekající na
  // schválení. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunityRiddlePendingReview = 'community_riddle_pending_review',
  // 21.5f — komunitní ceníky (scope='community', status='draft') čekající na
  // schválení. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunityPriceListPendingReview = 'community_price_list_pending_review',
  // 21.2a — komunitní jmenné sady (scope='community', status='draft') čekající
  // na schválení. Vidí kurátoři (správci diskusí/článků + Admin).
  CommunityNameSetPendingReview = 'community_name_set_pending_review',
  // 22.5 — publikované šablony scén (published, reviewStatus='pending') čekající
  // na schválení do veřejného katalogu. Vidí kurátoři (jako ostatní knihovny).
  CommunitySceneTemplatePendingReview = 'community_scene_template_pending_review',
}
