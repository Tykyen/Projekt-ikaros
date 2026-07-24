import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { AlertService } from '../../common/alerting/alert.service';
import type { IBugReportsRepository } from './interfaces/bug-reports-repository.interface';
import type {
  BugReport,
  BugReportStatus,
} from './interfaces/bug-report.interface';
import { CreateBugReportDto } from './dto/create-bug-report.dto';

const LIST_LIMIT_DEFAULT = 50;
const LIST_LIMIT_MAX = 100;

/**
 * Spec 25.1 — intake hlášení chyb (anon i přihlášený) + admin výpis + resolve.
 * Discord notifikace je best-effort (AlertService má vlastní try/catch, NIKDY
 * neshodí `create`). Reporter identita z tokenu, ne z body (anti-spoofing).
 */
@Injectable()
export class BugReportsService {
  constructor(
    @Inject('IBugReportsRepository')
    private readonly repo: IBugReportsRepository,
    private readonly alerts: AlertService,
  ) {}

  async create(
    user: RequestUser | undefined,
    dto: CreateBugReportDto,
  ): Promise<{ id: string }> {
    const report = await this.repo.create({
      text: dto.text,
      email: dto.email,
      context: dto.context,
      reporterId: user?.id,
      status: 'new',
      createdAtUtc: new Date(),
    });

    // Fire-and-forget Discord notifikace. Unikátní dedupeKey per report — jinak
    // by default klíč `info:Nový bug report` v 10min cooldownu spolkl druhý report.
    const kdo = user?.id ? `uživatel ${user.username ?? user.id}` : 'anonym';
    void this.alerts.alert(
      'info',
      'Nový bug report',
      `Od: ${kdo}\nKde: ${dto.context.route ?? dto.context.url}\n\n${dto.text.slice(0, 1500)}`,
      { dedupeKey: `bug:${report.id}` },
    );

    return { id: report.id };
  }

  async list(
    status: BugReportStatus | undefined,
    offset: number,
    limit: number,
  ): Promise<{ items: BugReport[]; total: number }> {
    const statuses: BugReportStatus[] = status ? [status] : ['new', 'resolved'];
    const skip = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
    const take =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), LIST_LIMIT_MAX)
        : LIST_LIMIT_DEFAULT;
    const [items, total] = await Promise.all([
      this.repo.findByStatus(statuses, skip, take),
      this.repo.countByStatus(statuses),
    ]);
    return { items, total };
  }

  async resolve(user: RequestUser, id: string): Promise<{ ok: true }> {
    const found = await this.repo.findById(id);
    if (!found) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Hlášení nenalezeno.',
      });
    }
    await this.repo.markResolved(id, user.id);
    return { ok: true };
  }
}
