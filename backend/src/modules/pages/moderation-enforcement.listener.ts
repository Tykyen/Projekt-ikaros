import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { UserRole } from '../users/interfaces/user.interface';
import { PagesService } from './pages.service';
import {
  MODERATION_ENFORCE_EVENT,
  MODERATION_REVERT_EVENT,
  type ModerationEnforcePayload,
} from '../moderation/events/moderation-events';
import {
  ModerationAction,
  ReportTargetType,
} from '../moderation/enums/moderation.enums';

/**
 * Fáze B4b — vynucení content-level zásahů nad STRÁNKAMI světa. Reaguje jen na
 * `targetType === page`: M2/M3 → `moderationHidden` (globální zásah — skryté i
 * pro PJ světa), M4 → `service.delete` (hard delete + cascade `page.deleted`;
 * nevratné, revert jen log). M5–M7 řeší modul `users`.
 *
 * M4 vyžaduje `worldId` (page je world-scoped; delete běží přes svět). Bez něj
 * nelze bezpečně smazat → logWarn a skip. Delete reusuje `service.delete` se
 * syntetickým elevovaným Superadmin requesterem (worldAdminBypass), aby proběhl
 * cascade úklid (Cloudinary/oblíbené/search index). Best-effort.
 */
@Injectable()
export class PagesModerationEnforcementListener {
  private readonly logger = new Logger(PagesModerationEnforcementListener.name);

  constructor(private readonly service: PagesService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Page) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, true);
          break;
        case ModerationAction.Remove:
          if (!p.worldId) {
            this.logger.warn(
              `M4 stránky ${p.targetId} bez worldId — nelze bezpečně smazat, ` +
                `přeskakuji (rozhodnutí ${p.decisionId}).`,
            );
            return;
          }
          await this.service.delete(p.targetId, p.worldId, {
            id: 'system',
            role: UserRole.Superadmin,
            elevatedWorldIds: [p.worldId],
          });
          this.logger.log(
            `Stránka ${p.targetId} smazána moderací (M4) — rozhodnutí ${p.decisionId}.`,
          );
          break;
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement stránky ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Page) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          this.logger.warn(
            `Revert M4 — smazanou stránku ${p.targetId} nelze vrátit (rozhodnutí ${p.decisionId}).`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert stránky ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
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
        `${hidden ? 'Skrytí' : 'Odkrytí'} stránky ${p.targetId} — nenalezena (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Stránka ${p.targetId} ${hidden ? 'skryta' : 'odkryta'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
