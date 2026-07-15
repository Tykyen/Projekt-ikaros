import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { SceneTemplateSharingService } from './scene-template-sharing.service';
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
 * 22.5 (spec 20B B5) — vynucení moderačních zásahů nad SDÍLENÝMI ŠABLONAMI SCÉN.
 * Naslouchá `moderation.enforce`/`moderation.revert`, reaguje jen na
 * `targetType === scene_template`:
 *   - M2/M3 (skrytí)  → `moderationHidden = true` (revert → false)
 *   - M4 (odstranění) → stažení z katalogu + skrytí (revert → jen odkrytí;
 *                       fyzické smazání ponecháno autorovi, klony nezávislé)
 *   - M5–M7           → account-level, řeší modul users
 *
 * Best-effort: na neznámém id / chybě jen zaloguje, nikdy neshodí resolveReport.
 */
@Injectable()
export class SceneTemplateModerationListener {
  private readonly logger = new Logger(SceneTemplateModerationListener.name);

  constructor(private readonly sharing: SceneTemplateSharingService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.SceneTemplate) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.sharing.moderationSetHidden(
            p.targetId,
            true,
            `Skryto moderací — rozhodnutí ${p.decisionId}`,
          );
          break;
        case ModerationAction.Remove:
          await this.sharing.moderationRemove(p.targetId);
          break;
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement šablony scény ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.SceneTemplate) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
        case ModerationAction.Remove:
          await this.sharing.moderationSetHidden(p.targetId, false);
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert šablony scény ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }
}
