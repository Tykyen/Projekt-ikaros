import { Inject, Injectable } from '@nestjs/common';
import type { IPendingActionProvider } from '../../pending-actions/pending-action-provider.interface';
import { PendingActionType } from '../../pending-actions/pending-action-type.enum';
import { UserRole } from '../../users/interfaces/user.interface';
import type { IContentReportsRepository } from '../interfaces/content-reports-repository.interface';
import type {
  ContentReport,
  ContentReportListItem,
  ContentReportStatus,
} from '../interfaces/moderation-entities.interface';
import { isContentReviewer } from '../moderation.constants';

/** Fronta = nevyřízené reporty (pending + triaged). */
const OPEN_STATUSES: ContentReportStatus[] = ['pending', 'triaged'];

/**
 * Spec 20B §Role — provider pro Zpracovat tab (queue `content_report`).
 * `canHandle` gate = content reviewer set (správci komunity). Fronta zobrazuje
 * nevyřízené reporty; identita anonymního oznamovatele se NIKDY nevrací.
 */
@Injectable()
export class ContentReportProvider implements IPendingActionProvider<ContentReportListItem> {
  readonly type = PendingActionType.ContentReport;

  constructor(
    @Inject('IContentReportsRepository')
    private readonly reportsRepo: IContentReportsRepository,
  ) {}

  canHandle(_userId: string, role: UserRole): boolean {
    return isContentReviewer(role);
  }

  async countForUser(userId: string, role: UserRole): Promise<number> {
    if (!this.canHandle(userId, role)) return 0;
    return this.reportsRepo.countByStatus(OPEN_STATUSES);
  }

  async listForUser(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: ContentReportListItem[]; total: number }> {
    if (!this.canHandle(userId, role)) return { items: [], total: 0 };
    const offset = Math.max(0, (page - 1) * limit);
    const [reports, total] = await Promise.all([
      this.reportsRepo.findByStatus(OPEN_STATUSES, offset, limit),
      this.reportsRepo.countByStatus(OPEN_STATUSES),
    ]);
    const items: ContentReportListItem[] = reports.map((r) =>
      this.toListItem(r),
    );
    return { items, total };
  }

  private toListItem(r: ContentReport): ContentReportListItem {
    return {
      reportId: r.id,
      targetType: r.targetType,
      targetUrl: r.targetUrl,
      targetSnapshot: r.targetSnapshot,
      targetAuthorName: r.targetAuthorName,
      category: r.category,
      reason: r.reason,
      // Anonymní report — identitu oznamovatele NIKDY nevracíme moderátorovi.
      reporterName: r.anonymous ? null : (r.reporterName ?? null),
      createdAt: r.createdAtUtc.toISOString(),
    };
  }
}
