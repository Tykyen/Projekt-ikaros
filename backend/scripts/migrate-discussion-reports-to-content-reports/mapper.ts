/**
 * B4d — mapper legacy `ikaros_discussion_reports` → generický `content_reports`
 * (modul `moderation`). Pure funkce (testovatelná bez DB).
 *
 * Legacy report nemá kategorii → `other`; nemá `targetAuthorId` (jen jméno),
 * ani goodFaith/notifyMe/anonymous → bezpečné defaulty. `status` odvozen z
 * `resolved`. `targetUrl` = cesta na diskuzi (postId je fragment vlákna).
 */

/** Tvar legacy dokumentu z kolekce `ikaros_discussion_reports`. */
export interface LegacyDiscussionReport {
  _id: unknown;
  discussionId: string;
  discussionTitle?: string;
  postId: string;
  postContentSnapshot: string;
  postAuthorName: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  createdAtUtc: Date;
  resolved?: boolean;
}

/** Cílový tvar dokumentu v kolekci `content_reports` (bez `_id`). */
export interface ContentReportDoc {
  targetType: 'discussion_post';
  targetId: string;
  targetUrl: string;
  targetSnapshot: string;
  targetAuthorName: string;
  category: 'other';
  reason: string;
  reporterId: string;
  reporterName: string;
  goodFaith: boolean;
  notifyMe: boolean;
  anonymous: boolean;
  status: 'pending' | 'resolved';
  createdAtUtc: Date;
}

/** Idempotency klíč — dvojice (targetId, createdAtUtc). */
export function dedupeKey(targetId: string, createdAtUtc: Date): string {
  return `${targetId}|${new Date(createdAtUtc).getTime()}`;
}

/** Pure — sestaví content_report dokument z legacy reportu. */
export function mapLegacyReport(r: LegacyDiscussionReport): ContentReportDoc {
  return {
    targetType: 'discussion_post',
    targetId: r.postId,
    targetUrl: `/ikaros/diskuze/${r.discussionId}`,
    targetSnapshot: r.postContentSnapshot,
    targetAuthorName: r.postAuthorName,
    category: 'other',
    reason: r.reason,
    reporterId: r.reporterId,
    reporterName: r.reporterName,
    goodFaith: true,
    notifyMe: false,
    anonymous: false,
    status: r.resolved ? 'resolved' : 'pending',
    createdAtUtc: r.createdAtUtc,
  };
}
