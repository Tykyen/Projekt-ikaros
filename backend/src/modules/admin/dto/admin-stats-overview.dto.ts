/**
 * 12.1 — platformové statistiky pro admin dashboard (`GET /admin/stats/overview`).
 * Snapshot, ne realtime. Každá metrika je robustní — při chybě dílčího modulu
 * vrací `0` místo selhání celé odpovědi (viz AdminStatsService).
 */
export interface AdminStatsOverview {
  users: {
    /** Aktivní (non-tombstone) účty. */
    total: number;
    /** Aktivní za posledních 25 h (presence threshold přes lastSeenAt). */
    online: number;
    /** Nové účty za posledních 7 dní. */
    newLast7Days: number;
    /** Účty v pending-deletion holdu. */
    pendingDeletion: number;
  };
  worlds: {
    total: number;
  };
  content: {
    articles: number;
    galleryImages: number;
    discussions: number;
  };
  queue: {
    /** Čekající žádosti o změnu username (admin akce ve Zpracovat queue). */
    pendingUsernameRequests: number;
  };
  /** ISO timestamp vygenerování snapshotu. */
  generatedAt: string;
}
