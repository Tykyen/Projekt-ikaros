import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { ChatService } from './chat.service';
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
 * D-066 (spec 20B B4b) — vynucení content-level moderačních zásahů nad
 * CHATOVOU ZPRÁVOU. Vzor: plants/bestiae `moderation-enforcement.listener.ts`.
 * Reaguje jen na `targetType === chat_message` (`targetId` = id zprávy —
 * FE `MessageItem` posílá `message.id`):
 *   - M2/M3 (skrytí)   → `moderationHidden = true` (revert → false); obsah
 *                        zůstává v DB, ale API/WS výstup se maskuje pro
 *                        všechny + živý `chat:message:updated`
 *   - M4 (odstranění)  → soft delete jako PJ mazání (`chat:message:deleted`
 *                        živě + Cloudinary úklid příloh); revert NEVRATNÝ
 *                        (obsah nahrazen tombstone textem)
 *   - M5–M7            → ignoruje (account-level řeší modul `users`)
 *
 * Best-effort — na neznámém id / chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class ChatModerationEnforcementListener {
  private readonly logger = new Logger(ChatModerationEnforcementListener.name);

  constructor(private readonly service: ChatService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.ChatMessage) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, true);
          break;
        case ModerationAction.Remove: {
          const ok = await this.service.moderationRemoveMessage(p.targetId);
          this.logger.log(
            ok
              ? `Zpráva ${p.targetId} smazána moderací (M4) — rozhodnutí ${p.decisionId}.`
              : `Smazání zprávy ${p.targetId} (M4) — nenalezena / už smazaná (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement zprávy ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.ChatMessage) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          // Soft delete nahradil obsah tombstone textem → nevratné.
          this.logger.warn(
            `Revert M4 zprávy ${p.targetId} NELZE — obsah byl při smazání ` +
              `nahrazen (rozhodnutí ${p.decisionId}).`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert zprávy ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  private async setHidden(
    p: ModerationEnforcePayload,
    hidden: boolean,
  ): Promise<void> {
    const ok = await this.service.moderationSetMessageHidden(
      p.targetId,
      hidden,
      hidden ? `Skryto moderací — rozhodnutí ${p.decisionId}` : undefined,
    );
    if (!ok) {
      this.logger.warn(
        `${hidden ? 'Skrytí' : 'Odkrytí'} zprávy ${p.targetId} — nenalezena / smazaná (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Zpráva ${p.targetId} ${hidden ? 'skryta' : 'odkryta'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
