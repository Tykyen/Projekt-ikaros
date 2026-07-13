import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { ItemsService } from './items.service';
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
 * 21.5e (spec 20B) — vynucení content-level moderačních zásahů nad LEKTVARY.
 * Vzor: spells `moderation-enforcement.listener.ts`. Reaguje jen na
 * `targetType === item`:
 *   - M2/M3 (skrytí)   → `moderationHidden = true`  (revert → false)
 *   - M4 (odstranění)  → HARD delete (revert NEVRATNÝ — jen log)
 *   - M5–M7            → ignoruje (account-level řeší modul `users`)
 *
 * Best-effort — na neznámém id / chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class ItemsModerationEnforcementListener {
  private readonly logger = new Logger(ItemsModerationEnforcementListener.name);

  constructor(private readonly service: ItemsService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Item) return;
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
              ? `Předmět ${p.targetId} smazán moderací (M4, hard delete) — rozhodnutí ${p.decisionId}.`
              : `Smazání předmětu ${p.targetId} (M4) — nenalezen (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement předmětu ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Item) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          // Předměty nemají soft-delete → M4 je hard delete a revert nevratný.
          this.logger.warn(
            `Revert M4 předmětu ${p.targetId} NELZE — hard delete je nevratný ` +
              `(rozhodnutí ${p.decisionId}). Obnovu musí udělat kurátor ručně.`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert předmětu ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
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
        `${hidden ? 'Skrytí' : 'Odkrytí'} předmětu ${p.targetId} — nenalezen (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Předmět ${p.targetId} ${hidden ? 'skryt' : 'odkryt'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
