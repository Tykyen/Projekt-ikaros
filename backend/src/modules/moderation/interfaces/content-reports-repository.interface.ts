import type { ReportTargetType } from '../enums/moderation.enums';
import type {
  ContentReport,
  ContentReportStatus,
} from './moderation-entities.interface';

/** Spec 20B — repo pro kolekci `content_reports`. Reporty se nikdy nemažou. */
export interface IContentReportsRepository {
  create(data: Omit<ContentReport, 'id'>): Promise<ContentReport>;
  findById(id: string): Promise<ContentReport | null>;
  /** Nevyřízené (dle stavů, typicky ['pending','triaged']) — fronta moderace. */
  findByStatus(
    statuses: ContentReportStatus[],
    skip: number,
    limit: number,
  ): Promise<ContentReport[]>;
  countByStatus(statuses: ContentReportStatus[]): Promise<number>;
  /** Označí resolved + zapíše moderátora a čas. */
  markResolved(id: string, moderatorId: string): Promise<void>;
  /** čl. 16/3 — zaznamená, že oznamovatel dostal potvrzení příjmu. */
  markAckSent(id: string): Promise<void>;
  findByReporter(reporterId: string): Promise<ContentReport[]>;
  findByTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ContentReport[]>;
  /** ABU (styl 34) — dedup otevřených reportů téhož oznamovatele na týž cíl. */
  existsPendingByReporterAndTarget(
    reporterId: string,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<boolean>;
}
