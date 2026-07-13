import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { RiddlesService } from './riddles.service';
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
 * 21.5d (spec 20B) — vynucení content-level moderačních zásahů nad HÁDANKAMI.
 * Reaguje jen na `targetType === riddle`:
 *   - M2/M3 (skrytí)   → `moderationHidden = true`  (revert → false)
 *   - M4 (odstranění)  → HARD delete (revert NEVRATNÝ — jen log)
 *   - M5–M7            → ignoruje (account-level řeší modul `users`)
 * Best-effort — na chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class RiddlesModerationEnforcementListener {
  private readonly logger = new Logger(
    RiddlesModerationEnforcementListener.name,
  );

  constructor(private readonly service: RiddlesService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Riddle) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, true);
          break;
        case ModerationAction.Remove: {
          const ok = await this.service.moderationRemove(p.targetId);
          this.logger.log(
            ok
              ? `Hádanka ${p.targetId} smazána moderací (M4, hard delete) — rozhodnutí ${p.decisionId}.`
              : `Smazání hádanky ${p.targetId} (M4) — nenalezena (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement hádanky ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Riddle) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          // Hádanky nemají soft-delete → M4 je hard delete a revert nevratný.
          this.logger.warn(
            `Revert M4 hádanky ${p.targetId} NELZE — hard delete je nevratný ` +
              `(rozhodnutí ${p.decisionId}). Obnovu musí udělat kurátor ručně.`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert hádanky ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  private async setHidden(
    p: ModerationEnforcePayload,
    hidden: boolean,
  ): Promise<void> {
    const ok = await this.service.moderationSetHidden(
      p.targetId,
      hidden,
      hidden ? `Skryto moderací — rozhodnutí ${p.decisionId}` : undefined,
    );
    if (!ok) {
      this.logger.warn(
        `${hidden ? 'Skrytí' : 'Odkrytí'} hádanky ${p.targetId} — nenalezena (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Hádanka ${p.targetId} ${hidden ? 'skryta' : 'odkryta'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
