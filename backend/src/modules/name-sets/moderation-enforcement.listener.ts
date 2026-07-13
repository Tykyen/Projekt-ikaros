import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { NameSetsService } from './name-sets.service';
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
 * Spec 20B — vynucení content-level moderačních zásahů nad JMENNÝMI SADAMI
 * (21.2a). Vzor: plants listener. Reaguje jen na `targetType === name_set`:
 *   M2/M3 skrytí → moderationHidden (revert → false); M4 → HARD delete
 *   (revert nevratný — jen log); M5–M7 ignoruje (users listener).
 * Best-effort — na chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class NameSetsModerationEnforcementListener {
  private readonly logger = new Logger(
    NameSetsModerationEnforcementListener.name,
  );

  constructor(private readonly service: NameSetsService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.NameSet) return;
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
              ? `Jmenná sada ${p.targetId} smazána moderací (M4) — rozhodnutí ${p.decisionId}.`
              : `Smazání sady ${p.targetId} (M4) — nenalezena (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement sady ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.NameSet) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          this.logger.warn(
            `Revert M4 sady ${p.targetId} NELZE — hard delete je nevratný ` +
              `(rozhodnutí ${p.decisionId}). Obnovu musí udělat kurátor ručně.`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert sady ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
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
    this.logger.log(
      ok
        ? `Jmenná sada ${p.targetId} ${hidden ? 'skryta' : 'odkryta'} moderací — rozhodnutí ${p.decisionId}.`
        : `${hidden ? 'Skrytí' : 'Odkrytí'} sady ${p.targetId} — nenalezena (rozhodnutí ${p.decisionId}).`,
    );
  }
}
