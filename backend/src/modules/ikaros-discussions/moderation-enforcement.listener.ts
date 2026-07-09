import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
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
 * Fáze B4d — vynucení content-level moderačních zásahů nad PŘÍSPĚVKY DISKUZÍ.
 * Naslouchá generickému `moderation.enforce` / `moderation.revert` a reaguje jen
 * na `targetType === discussion_post` (`targetId` = postId):
 *   - M2/M3 (skrytí)   → `moderationHidden = true`  (revert → false)
 *   - M4 (odstranění)  → smazání příspěvku (hard delete, NEVRATNÝ; revert jen log)
 *   - M5–M7            → ignoruje (account-level řeší modul `users`)
 *
 * Best-effort — na neznámém id / chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class DiscussionsModerationEnforcementListener {
  private readonly logger = new Logger(
    DiscussionsModerationEnforcementListener.name,
  );

  constructor(private readonly service: IkarosDiscussionsService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.DiscussionPost) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, true);
          break;
        case ModerationAction.Remove: {
          const ok = await this.service.moderationDeletePost(p.targetId);
          if (!ok) {
            this.logger.warn(
              `Smazání příspěvku ${p.targetId} moderací (M4) — nenalezen (rozhodnutí ${p.decisionId}).`,
            );
            return;
          }
          this.logger.log(
            `Příspěvek ${p.targetId} smazán moderací (M4) — rozhodnutí ${p.decisionId}.`,
          );
          break;
        }
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement příspěvku ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.DiscussionPost) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          this.logger.warn(
            `Revert M4 — smazaný příspěvek ${p.targetId} nelze vrátit (rozhodnutí ${p.decisionId}).`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert příspěvku ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  private async setHidden(
    p: ModerationEnforcePayload,
    hidden: boolean,
  ): Promise<void> {
    const ok = await this.service.setPostModerationHidden(
      p.targetId,
      hidden,
      hidden ? `Skryto moderací — rozhodnutí ${p.decisionId}` : undefined,
    );
    if (!ok) {
      this.logger.warn(
        `${hidden ? 'Skrytí' : 'Odkrytí'} příspěvku ${p.targetId} — nenalezen (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Příspěvek ${p.targetId} ${hidden ? 'skryt' : 'odkryt'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
