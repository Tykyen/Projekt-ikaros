import { Injectable, Inject } from '@nestjs/common';
import type { IPendingActionProvider } from '../../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../../pending-actions/pending-action-type.enum';
import { UserRole } from '../../users/interfaces/user.interface';
import type { IIkarosDiscussionReportsRepository } from '../interfaces/ikaros-discussion-reports-repository.interface';
import type { DiscussionReportListItem } from '../interfaces/discussion-list-items.interface';

// 3.4 — hlášené příspěvky řeší správa diskuzí; bez world-scoped PJ.
const REVIEWER_ROLES: UserRole[] = [
  UserRole.Superadmin,
  UserRole.Admin,
  UserRole.SpravceDiskuzi,
];

/**
 * Spec 3.4 §7.2 — provider pro Zpracovat tab (queue `discussion_report`).
 * Fronta = nevyřízené reporty; každá karta má akce Smazat příspěvek / Ponechat.
 */
@Injectable()
export class DiscussionReportProvider implements IPendingActionProvider<DiscussionReportListItem> {
  readonly type = PendingActionType.DiscussionReport;

  constructor(
    @Inject('IIkarosDiscussionReportsRepository')
    private readonly reportsRepo: IIkarosDiscussionReportsRepository,
  ) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return REVIEWER_ROLES.includes(role);
  }

  async countForUser(userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(userId, role)) return 0;
    return this.reportsRepo.countUnresolved();
  }

  async listForUser(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: DiscussionReportListItem[]; total: number }> {
    if (!this.canHandle(userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [reports, total] = await Promise.all([
      this.reportsRepo.findUnresolved(offset, limit),
      this.reportsRepo.countUnresolved(),
    ]);
    const items: DiscussionReportListItem[] = reports.map((r) => ({
      reportId: r.id,
      discussionId: r.discussionId,
      discussionTitle: r.discussionTitle,
      postId: r.postId,
      postContentSnapshot: r.postContentSnapshot,
      postAuthorName: r.postAuthorName,
      reporterName: r.reporterName,
      reason: r.reason,
      createdAt: r.createdAtUtc.toISOString(),
    }));
    return { items, total };
  }
}
