import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { logWarn } from '../../common/logging/log-error.util';
import { IkarosMessagesService } from '../ikaros-messages/ikaros-messages.service';
import { MailerService } from '../mailer/mailer.service';
import type { IContentReportsRepository } from './interfaces/content-reports-repository.interface';
import type { IModerationDecisionsRepository } from './interfaces/moderation-decisions-repository.interface';
import type { IModerationAppealsRepository } from './interfaces/moderation-appeals-repository.interface';
import type {
  ContentReport,
  ModerationAppeal,
  ModerationAppealOutcome,
  ModerationDecision,
  ModerationLogItem,
  MyDecisionItem,
  MyReportItem,
} from './interfaces/moderation-entities.interface';
import { ModerationAction } from './enums/moderation.enums';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { CreateAppealDto } from './dto/create-appeal.dto';
import { ReviewAppealDto } from './dto/review-appeal.dto';
import {
  MODERATION_ACTION_LABELS,
  isAccountLevelReviewer,
  isContentReviewer,
  requiresAccountLevel,
} from './moderation.constants';
import {
  MODERATION_ENFORCE_EVENT,
  MODERATION_REVERT_EVENT,
  type ModerationEnforcePayload,
} from './events/moderation-events';

/**
 * Systémový odesílatel in-app oznámení (Pošta / notifikační centrum). Bez role
 * → obchází D-057 friend-only check (vzor ikaros-articles / SystemEventsListener).
 */
const SYSTEM_SENDER = { id: 'system', username: 'Systém' };
/** Fallback jména příjemce, kdyby denormalizovaný název chyběl (in-app vyžaduje). */
const RECIPIENT_FALLBACK = 'Uživatel';
/** In-app zpráva má `body` maxlength 5000 (ikaros-message schema) — pojistka. */
const MAX_MESSAGE_BODY = 5000;
/** Moderační log — default velikost stránky. */
const LOG_PAGE_DEFAULT = 50;
const LOG_PAGE_MAX = 100;

/**
 * Spec 20B — intake reportů + fronta + reporter status + resolve (statement of
 * reasons do logu) + Fáze B3: potvrzení příjmu (čl. 16/3), notifikace autorovi
 * (čl. 17) i oznamovateli, moderační log a přehled zásahů vůči vlastnímu obsahu.
 *
 * Notifikace jsou best-effort: selhání mailu/in-app NIKDY neshodí
 * `createReport`/`resolveReport` (try/catch + logWarn, vzor jinde v projektu).
 * Cross-modul enforcement (skutečné skrytí/smazání/ban) je B4b — `resolveReport`
 * vyšle event `moderation.enforce` (akce M2–M7), `reviewAppeal` při `overturned`
 * event `moderation.revert`; listenery žijí v cílových modulech (users/content).
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @Inject('IContentReportsRepository')
    private readonly reportsRepo: IContentReportsRepository,
    @Inject('IModerationDecisionsRepository')
    private readonly decisionsRepo: IModerationDecisionsRepository,
    @Inject('IModerationAppealsRepository')
    private readonly appealsRepo: IModerationAppealsRepository,
    private readonly messages: IkarosMessagesService,
    private readonly mailer: MailerService,
    // B4b — event-driven vynucení zásahů (ban / skrytí / smazání) v cílových modulech.
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * B4b — akce, které se skutečně VYNUCUJÍ v cílovém modulu (M2–M7). M0_none a
   * M1_notice jsou jen komunikace (notifikace autorovi), nikoli zásah do dat.
   */
  private isEnforceableAction(action: ModerationAction): boolean {
    return (
      action !== ModerationAction.None && action !== ModerationAction.Notice
    );
  }

  /** B4b — sestaví payload enforcement/revert eventu z uloženého rozhodnutí. */
  private toEnforcePayload(
    decision: ModerationDecision,
  ): ModerationEnforcePayload {
    return {
      targetType: decision.targetType,
      targetId: decision.targetId,
      targetAuthorId: decision.targetAuthorId,
      worldId: decision.worldId,
      action: decision.action,
      category: decision.category,
      decisionId: decision.id,
    };
  }

  /**
   * Vytvoří report. `reporterId`/`reporterName` z tokenu (ne z body). Snapshot,
   * autor a URL cíle posílá FE (decoupling od 11 cílových modulů). Po uložení
   * pošle oznamovateli potvrzení příjmu (čl. 16/3).
   */
  async createReport(
    user: RequestUser,
    dto: CreateReportDto,
  ): Promise<{ id: string }> {
    // ABU (styl 34) — dedup: 1 oznamovatel nesmí spamovat týž cíl otevřenými
    // reporty (zahlcení moderační fronty + notifikací + e-mailů). Existující
    // pending report na týž cíl → Conflict místo duplikátu.
    if (
      await this.reportsRepo.existsPendingByReporterAndTarget(
        user.id,
        dto.targetType,
        dto.targetId,
      )
    ) {
      throw new ConflictException({
        code: 'REPORT_DUPLICATE',
        message: 'Tento obsah jsi už nahlásil/a; report čeká na vyřízení.',
      });
    }
    const report = await this.reportsRepo.create({
      targetType: dto.targetType,
      targetId: dto.targetId,
      targetUrl: dto.targetUrl,
      worldId: dto.worldId,
      targetSnapshot: dto.targetSnapshot,
      targetAuthorId: dto.targetAuthorId,
      targetAuthorName: dto.targetAuthorName,
      category: dto.category,
      reason: dto.reason,
      // Identita se vždy ULOŽÍ (audit), ale výstupy ji při anonymous=true skryjí.
      reporterId: user.id,
      reporterName: user.username,
      reporterEmail: dto.reporterEmail,
      goodFaith: dto.goodFaith,
      evidence: dto.evidence,
      notifyMe: dto.notifyMe,
      anonymous: dto.anonymous,
      status: 'pending',
      createdAtUtc: new Date(),
    });

    await this.sendReportAck(user, report, dto);
    return { id: report.id };
  }

  /**
   * čl. 16/3 — potvrzení příjmu oznamovateli. In-app vždy; e-mail jen když má
   * `reporterEmail` a `notifyMe=true`. Anonymita: potvrzení jde oznamovateli
   * (známe jeho userId z tokenu) — to je OK, anonymita skrývá vůči moderátorovi
   * a autorovi, ne vůči sobě. Best-effort — selhání nesmí shodit report.
   */
  private async sendReportAck(
    user: RequestUser,
    report: ContentReport,
    dto: CreateReportDto,
  ): Promise<void> {
    try {
      const when = report.createdAtUtc.toLocaleString('cs-CZ');
      await this.messages.create(
        {
          recipientId: user.id,
          recipientName: user.username || RECIPIENT_FALLBACK,
          subject: 'Hlášení přijato',
          body:
            `Přijali jsme tvé hlášení (ID ${report.id}) dne ${when}. ` +
            `Posoudíme ho co nejdříve.`,
        },
        SYSTEM_SENDER,
      );

      if (dto.reporterEmail && dto.notifyMe) {
        await this.mailer.sendModerationReportAck({
          to: dto.reporterEmail,
          username: user.username || RECIPIENT_FALLBACK,
          reportId: report.id,
          submittedAt: report.createdAtUtc,
        });
      }

      await this.reportsRepo.markAckSent(report.id);
    } catch (err) {
      logWarn(
        this.logger,
        `Potvrzení příjmu reportu ${report.id} selhalo`,
        err,
      );
    }
  }

  /** Stav mých hlášení (pohled oznamovatele). */
  async myReports(userId: string): Promise<MyReportItem[]> {
    const reports = await this.reportsRepo.findByReporter(userId);
    return reports.map((r) => ({
      reportId: r.id,
      targetType: r.targetType,
      targetUrl: r.targetUrl,
      category: r.category,
      status: r.status,
      createdAt: r.createdAtUtc.toISOString(),
    }));
  }

  /**
   * Vyřízení reportu. Guard: moderátor musí být v content reviewer setu;
   * account-level akce (M5–M7) a kategorie minor_safety jen Superadmin/Admin.
   * Zapíše `moderation_decision` + označí report resolved, pak (B4b) vyšle
   * `moderation.enforce` (akce M2–M7 → skrytí/smazání/ban v cílovém modulu) a
   * (B3) notifikuje autora (statement of reasons) i oznamovatele.
   */
  async resolveReport(
    moderator: RequestUser,
    reportId: string,
    dto: ResolveReportDto,
  ): Promise<{ decisionId: string }> {
    if (!isContentReviewer(moderator.role)) {
      throw new ForbiddenException({
        code: 'MODERATION_FORBIDDEN',
        message: 'Nedostatečná oprávnění k moderaci.',
      });
    }

    const report = await this.reportsRepo.findById(reportId);
    if (!report) {
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: 'Hlášení nenalezeno.',
      });
    }

    // Account-level akce / minor_safety → jen Superadmin/Admin.
    if (
      requiresAccountLevel(dto.action, report.category) &&
      !isAccountLevelReviewer(moderator.role)
    ) {
      throw new ForbiddenException({
        code: 'MODERATION_ACCOUNT_LEVEL_FORBIDDEN',
        message:
          'Zásah na úrovni účtu nebo kategorie ochrany nezletilých smí provést jen Admin/Superadmin.',
      });
    }

    const decision: Omit<ModerationDecision, 'id'> = {
      reportId: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      targetSnapshot: report.targetSnapshot,
      worldId: report.worldId,
      targetAuthorId: report.targetAuthorId,
      targetUrl: report.targetUrl,
      action: dto.action,
      reasonText: dto.reasonText,
      category: report.category,
      legalOrPolicyGround: dto.legalOrPolicyGround,
      automated: false,
      moderatorId: moderator.id,
      moderatorName: moderator.username,
      createdAtUtc: new Date(),
    };
    const saved = await this.decisionsRepo.create(decision);

    await this.reportsRepo.markResolved(report.id, moderator.id);

    // B4b — vynucení zásahu (ban / skrytí / smazání) v cílovém modulu. Jen akce
    // M2–M7; M0_none/M1_notice nejsou zásah do dat. Event je fire-and-forget —
    // listenery jsou best-effort (nesmí shodit resolve), enforcement neblokuje
    // zápis rozhodnutí ani notifikace.
    if (this.isEnforceableAction(saved.action)) {
      this.eventEmitter.emit(
        MODERATION_ENFORCE_EVENT,
        this.toEnforcePayload(saved),
      );
    }

    // B3 — obě vyrozumění jsou best-effort (nesmí shodit resolve).
    await this.notifyAuthor(report, saved, dto);
    await this.notifyReporterResolved(report, saved);

    return { decisionId: saved.id };
  }

  /**
   * čl. 17 — statement of reasons autorovi obsahu. Jen když cíl má autora a akce
   * není M0_none (bez zásahu). Obsahuje typ akce slovně, odůvodnění, právní/
   * smluvní základ a poučení o odvolání. Identita oznamovatele se NIKDY
   * nezpřístupní autorovi.
   */
  private async notifyAuthor(
    report: ContentReport,
    decision: ModerationDecision,
    dto: ResolveReportDto,
  ): Promise<void> {
    if (!report.targetAuthorId) return;
    if (dto.action === ModerationAction.None) return;
    try {
      const label = MODERATION_ACTION_LABELS[dto.action];
      const body = (
        `K tvému obsahu jsme přijali moderační opatření: ${label}.\n\n` +
        `Odůvodnění: ${dto.reasonText}\n` +
        `Právní / smluvní základ: ${dto.legalOrPolicyGround}\n\n` +
        `Proti tomuto rozhodnutí se můžeš odvolat.`
      ).slice(0, MAX_MESSAGE_BODY);
      await this.messages.create(
        {
          recipientId: report.targetAuthorId,
          recipientName: report.targetAuthorName || RECIPIENT_FALLBACK,
          subject: 'Rozhodnutí moderace o tvém obsahu',
          body,
        },
        SYSTEM_SENDER,
      );
      await this.decisionsRepo.markAuthorNotified(decision.id);
    } catch (err) {
      logWarn(
        this.logger,
        `Oznámení autorovi k rozhodnutí ${decision.id} selhalo`,
        err,
      );
    }
  }

  /**
   * Vyrozumění oznamovateli o vyřízení — jen když si přál (`notifyMe`). BEZ
   * detailů zásahu na cizí účet (jen „posouzeno / vyřízeno"). In-app vždy,
   * e-mail navíc když má `reporterEmail`.
   */
  private async notifyReporterResolved(
    report: ContentReport,
    decision: ModerationDecision,
  ): Promise<void> {
    if (!report.notifyMe) return;
    if (!report.reporterId) return;
    try {
      const name = report.reporterName || RECIPIENT_FALLBACK;
      await this.messages.create(
        {
          recipientId: report.reporterId,
          recipientName: name,
          subject: 'Tvé hlášení bylo vyřízeno',
          body:
            `Tvé hlášení (ID ${report.id}) jsme posoudili a vyřídili. ` +
            `Děkujeme, že pomáháš udržet platformu bezpečnou.`,
        },
        SYSTEM_SENDER,
      );

      if (report.reporterEmail) {
        await this.mailer.sendModerationReportResolved({
          to: report.reporterEmail,
          username: name,
          reportId: report.id,
        });
      }

      await this.decisionsRepo.markReporterNotified(decision.id);
    } catch (err) {
      logWarn(
        this.logger,
        `Oznámení oznamovateli k reportu ${report.id} selhalo`,
        err,
      );
    }
  }

  /**
   * čl. 17 — odůvodnění zásahů vůči MÉMU obsahu (pohled autora). Identita
   * oznamovatele se do výstupu NIKDY nedostane (v decision není uložena).
   */
  async myDecisions(userId: string): Promise<MyDecisionItem[]> {
    const decisions = await this.decisionsRepo.findByAuthor(userId);
    return decisions.map((d) => ({
      decisionId: d.id,
      action: d.action,
      reasonText: d.reasonText,
      legalOrPolicyGround: d.legalOrPolicyGround,
      category: d.category,
      targetType: d.targetType,
      targetUrl: d.targetUrl,
      createdAt: d.createdAtUtc.toISOString(),
      appealId: d.appealId,
    }));
  }

  /**
   * B4a (DSA čl. 20) — podání odvolání proti moderačnímu rozhodnutí. Smí JEN
   * autor moderovaného obsahu (`decision.targetAuthorId === user.id`). Jedno
   * odvolání na rozhodnutí (`decision.appealId` → Conflict). Identita z tokenu.
   */
  async submitAppeal(
    user: RequestUser,
    decisionId: string,
    dto: CreateAppealDto,
  ): Promise<{ appealId: string }> {
    const decision = await this.decisionsRepo.findById(decisionId);
    if (!decision) {
      throw new NotFoundException({
        code: 'DECISION_NOT_FOUND',
        message: 'Rozhodnutí nenalezeno.',
      });
    }

    // Jen autor svého rozhodnutí se může odvolat.
    if (decision.targetAuthorId !== user.id) {
      throw new ForbiddenException({
        code: 'APPEAL_FORBIDDEN',
        message: 'Odvolat se může jen autor moderovaného obsahu.',
      });
    }

    // Jedno odvolání na rozhodnutí.
    if (decision.appealId) {
      throw new ConflictException({
        code: 'APPEAL_ALREADY_EXISTS',
        message: 'Proti tomuto rozhodnutí už bylo podáno odvolání.',
      });
    }

    const appeal = await this.appealsRepo.create({
      decisionId: decision.id,
      appellantId: user.id,
      appellantName: user.username,
      reason: dto.reason,
      status: 'pending',
      createdAtUtc: new Date(),
    });
    await this.decisionsRepo.setAppealId(decision.id, appeal.id);

    return { appealId: appeal.id };
  }

  /**
   * B4a (DSA čl. 20) — přezkum odvolání JINÝM moderátorem. Gate = content
   * reviewer set.
   *
   * ⚠️ INVARIANT: reviewer NESMÍ přezkoumat vlastní rozhodnutí
   * (`user.id !== decision.moderatorId`) → jinak Forbidden
   * `APPEAL_SELF_REVIEW_FORBIDDEN`. Decision se dohledá přes `appeal.decisionId`.
   */
  async reviewAppeal(
    user: RequestUser,
    appealId: string,
    dto: ReviewAppealDto,
  ): Promise<{ status: ModerationAppealOutcome }> {
    if (!isContentReviewer(user.role)) {
      throw new ForbiddenException({
        code: 'MODERATION_FORBIDDEN',
        message: 'Nedostatečná oprávnění k moderaci.',
      });
    }

    const appeal = await this.appealsRepo.findById(appealId);
    if (!appeal) {
      throw new NotFoundException({
        code: 'APPEAL_NOT_FOUND',
        message: 'Odvolání nenalezeno.',
      });
    }

    // Jedno vyřízení na odvolání — už přezkoumané se znovu nepřezkoumává.
    if (appeal.status !== 'pending') {
      throw new ConflictException({
        code: 'APPEAL_ALREADY_REVIEWED',
        message: 'Toto odvolání už bylo přezkoumáno.',
      });
    }

    const decision = await this.decisionsRepo.findById(appeal.decisionId);
    if (!decision) {
      throw new NotFoundException({
        code: 'DECISION_NOT_FOUND',
        message: 'Navázané rozhodnutí nenalezeno.',
      });
    }

    // ⚠️ INVARIANT — moderátor nesmí přezkoumat vlastní rozhodnutí (DSA čl. 20).
    if (user.id === decision.moderatorId) {
      throw new ForbiddenException({
        code: 'APPEAL_SELF_REVIEW_FORBIDDEN',
        message: 'Vlastní rozhodnutí nemůžeš přezkoumat — musí jiný moderátor.',
      });
    }

    await this.appealsRepo.markReviewed(appeal.id, {
      status: dto.outcome,
      reviewerId: user.id,
      reviewerNote: dto.reviewerNote,
    });

    // B4b — zrušené rozhodnutí (overturned) → revert zásahu v cílovém modulu.
    // Jen při overturned a jen pro vynutitelné akce (M2–M7); M0/M1 nic
    // nevynucovaly, není co vracet. Fire-and-forget — listenery jsou best-effort
    // (nesmí shodit review). Pozn.: M4_remove je nevratný (obsah smazán) —
    // listener to jen zaloguje.
    if (
      dto.outcome === 'overturned' &&
      this.isEnforceableAction(decision.action)
    ) {
      this.eventEmitter.emit(
        MODERATION_REVERT_EVENT,
        this.toEnforcePayload(decision),
      );
    }

    await this.notifyAppellant(appeal, dto.outcome, dto.reviewerNote);

    return { status: dto.outcome };
  }

  /**
   * B4a — vyrozumění odvolatele o výsledku přezkumu (in-app). Best-effort —
   * selhání nesmí shodit review.
   */
  private async notifyAppellant(
    appeal: ModerationAppeal,
    outcome: ModerationAppealOutcome,
    reviewerNote: string,
  ): Promise<void> {
    try {
      const outcomeLabel =
        outcome === 'upheld'
          ? 'Rozhodnutí bylo potvrzeno a zůstává v platnosti.'
          : 'Rozhodnutí bylo zrušeno.';
      const body = (
        `Tvé odvolání proti moderačnímu rozhodnutí bylo přezkoumáno.\n\n` +
        `Výsledek: ${outcomeLabel}\n` +
        `Vyjádření moderátora: ${reviewerNote}`
      ).slice(0, MAX_MESSAGE_BODY);
      await this.messages.create(
        {
          recipientId: appeal.appellantId,
          recipientName: appeal.appellantName || RECIPIENT_FALLBACK,
          subject: 'Výsledek tvého odvolání',
          body,
        },
        SYSTEM_SENDER,
      );
    } catch (err) {
      logWarn(
        this.logger,
        `Oznámení o výsledku odvolání ${appeal.id} selhalo`,
        err,
      );
    }
  }

  /**
   * Moderační log (audit) — reviewer-gated (stejná brána jako resolve). Nejnovější
   * první, paginovaný.
   */
  async moderationLog(
    user: RequestUser,
    offset = 0,
    limit = LOG_PAGE_DEFAULT,
  ): Promise<{ items: ModerationLogItem[]; total: number }> {
    if (!isContentReviewer(user.role)) {
      throw new ForbiddenException({
        code: 'MODERATION_FORBIDDEN',
        message: 'Nedostatečná oprávnění k moderaci.',
      });
    }
    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.min(Math.max(1, limit), LOG_PAGE_MAX);
    const [decisions, total] = await Promise.all([
      this.decisionsRepo.findAll(safeOffset, safeLimit),
      this.decisionsRepo.countAll(),
    ]);
    return {
      items: decisions.map((d) => this.toLogItem(d)),
      total,
    };
  }

  private toLogItem(d: ModerationDecision): ModerationLogItem {
    return {
      decisionId: d.id,
      reportId: d.reportId,
      targetType: d.targetType,
      targetId: d.targetId,
      targetUrl: d.targetUrl,
      action: d.action,
      reasonText: d.reasonText,
      legalOrPolicyGround: d.legalOrPolicyGround,
      category: d.category,
      moderatorId: d.moderatorId,
      moderatorName: d.moderatorName,
      createdAt: d.createdAtUtc.toISOString(),
      authorNotifiedAt: d.authorNotifiedAt?.toISOString(),
      reporterNotifiedAt: d.reporterNotifiedAt?.toISOString(),
      appealId: d.appealId,
    };
  }
}
