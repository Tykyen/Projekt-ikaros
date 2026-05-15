/**
 * Spec 2.4 — pre-membership entita pro vstup do open/private světů.
 *
 * Žadatel vs Čtenář vs Hráč (per role matrix 3.6a + PJ 2026-05-14):
 *  - **Žádost o vstup** (`WorldAccessRequest`) = mimo `world_memberships`,
 *    user ještě není člen. PJ schvaluje v Zpracovat tabu (`world_access_request`).
 *  - **Čtenář** (`WorldRole.Ctenar` = 1) = schválený člen, pasivně čte.
 *  - **Žadatel** (`WorldRole.Zadatel` = 0) = člen čekající na **postavu** (fáze 5+).
 *  - **Hráč** (`WorldRole.Hrac` = 2) = má postavu, hraje.
 */
export interface WorldAccessRequest {
  id: string;
  worldId: string;
  userId: string;
  requestedAt: Date;
}

/**
 * Spec 2.4 — payload pending položky `world_access_request` (Zpracovat tab PJ).
 * Vrací `WorldAccessRequestProvider.listForUser`.
 */
export interface WorldAccessRequestListItem {
  /** ID `WorldAccessRequest` — slouží pro approve/reject endpointy. */
  accessRequestId: string;
  worldId: string;
  worldName: string;
  worldSlug: string;
  /** ISO timestamp žádosti. */
  requestedAt: string;
  requester: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

/**
 * Spec 2.4 — payload `GET /worlds/my-access-requests`. Per-user pending
 * žádosti current logged-in usera s embedded world summary (pro FE labely).
 */
export interface MyWorldAccessRequest {
  accessRequest: WorldAccessRequest;
  world: {
    id: string;
    name: string;
    slug: string;
    accessMode: string;
  };
}
