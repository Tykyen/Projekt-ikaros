import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { BestiaeService } from './bestiae.service';
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
 * Fáze B5 (spec 20B) — vynucení content-level moderačních zásahů nad BESTIEMI.
 * Naslouchá `moderation.enforce` / `moderation.revert`, reaguje jen na
 * `targetType === bestie`:
 *   - M2/M3 (skrytí)   → `moderationHidden = true`  (revert → false)
 *   - M4 (odstranění)  → soft delete (revert → restore; bestie soft delete je vratné)
 *   - M5–M7            → ignoruje (account-level řeší modul `users`)
 *
 * Best-effort — na neznámém id / chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class BestiaeModerationEnforcementListener {
  private readonly logger = new Logger(
    BestiaeModerationEnforcementListener.name,
  );

  constructor(private readonly service: BestiaeService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Bestie) return;
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
              ? `Bestie ${p.targetId} smazána moderací (M4) — rozhodnutí ${p.decisionId}.`
              : `Smazání bestie ${p.targetId} (M4) — nenalezena (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement bestie ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Bestie) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove: {
          const ok = await this.service.moderationRestore(p.targetId);
          this.logger.log(
            ok
              ? `Bestie ${p.targetId} obnovena (revert M4) — rozhodnutí ${p.decisionId}.`
              : `Obnova bestie ${p.targetId} (revert M4) — nenalezena (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert bestie ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
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
        `${hidden ? 'Skrytí' : 'Odkrytí'} bestie ${p.targetId} — nenalezena (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Bestie ${p.targetId} ${hidden ? 'skryta' : 'odkryta'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
