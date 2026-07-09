import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { UserRole } from '../users/interfaces/user.interface';
import { IkarosArticlesService } from './ikaros-articles.service';
import {
  MODERATION_ENFORCE_EVENT,
  MODERATION_REVERT_EVENT,
  type ModerationEnforcePayload,
} from '../moderation/events/moderation-events';
import {
  ModerationAction,
  ReportTargetType,
} from '../moderation/enums/moderation.enums';

/** Systémový aktér pro reuse `service.delete` (Superadmin obchází ownership guard). */
const SYSTEM_ACTOR = {
  id: 'system',
  username: 'Systém',
  role: UserRole.Superadmin,
};

/**
 * Fáze B4b — vynucení content-level moderačních zásahů nad ČLÁNKY. Naslouchá
 * generickému `moderation.enforce` / `moderation.revert` a reaguje jen na
 * `targetType === article`:
 *   - M2/M3 (skrytí)   → `moderationHidden = true`  (revert → false)
 *   - M4 (odstranění)  → `service.delete` (hard delete, NEVRATNÝ; revert jen log)
 *   - M5–M7            → ignoruje (account-level řeší modul `users`)
 *
 * Best-effort — na neznámém id / chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class ArticlesModerationEnforcementListener {
  private readonly logger = new Logger(
    ArticlesModerationEnforcementListener.name,
  );

  constructor(private readonly service: IkarosArticlesService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Article) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, true);
          break;
        case ModerationAction.Remove:
          await this.service.delete(
            p.targetId,
            SYSTEM_ACTOR.id,
            SYSTEM_ACTOR.role,
            SYSTEM_ACTOR.username,
          );
          this.logger.log(
            `Článek ${p.targetId} smazán moderací (M4) — rozhodnutí ${p.decisionId}.`,
          );
          break;
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement článku ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Article) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          this.logger.warn(
            `Revert M4 — smazaný článek ${p.targetId} nelze vrátit (rozhodnutí ${p.decisionId}).`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert článku ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  private async setHidden(
    p: ModerationEnforcePayload,
    hidden: boolean,
  ): Promise<void> {
    const ok = await this.service.setModerationHidden(
      p.targetId,
      hidden,
      hidden ? `Skryto moderací — rozhodnutí ${p.decisionId}` : undefined,
    );
    if (!ok) {
      this.logger.warn(
        `${hidden ? 'Skrytí' : 'Odkrytí'} článku ${p.targetId} — nenalezen (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Článek ${p.targetId} ${hidden ? 'skryt' : 'odkryt'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
