import type { BugReport, BugReportStatus } from './bug-report.interface';

/** Spec 25.1 — repo pro kolekci `bug_reports`. Reporty se nikdy nemažou. */
export interface IBugReportsRepository {
  create(data: Omit<BugReport, 'id'>): Promise<BugReport>;
  findById(id: string): Promise<BugReport | null>;
  /** Výpis pro admin inbox (nejnovější první). */
  findByStatus(
    statuses: BugReportStatus[],
    skip: number,
    limit: number,
  ): Promise<BugReport[]>;
  countByStatus(statuses: BugReportStatus[]): Promise<number>;
  /** Označí resolved + zapíše admina a čas. */
  markResolved(id: string, userId: string): Promise<void>;
}
