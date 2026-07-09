import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { IkarosMessagesService } from './ikaros-messages.service';
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
 * Fáze B5 (spec 20B) — vynucení moderačních zásahů nad ZPRÁVAMI POŠTY.
 * Naslouchá `moderation.enforce`, reaguje jen na `targetType === mail_message`:
 *   - M4 (odstranění) → zpráva skryta oběma stranám (mizí z pošty)
 *   - M2/M3 (skrytí)  → pošta nemá koncept „hidden" veřejného obsahu (je soukromá
 *                       1:1) → jen záznam; reálný zásah = account-level ban autora
 *                       (M5/M6) přes users listener
 *   - M5–M7           → ignoruje (account-level řeší modul `users`)
 *
 * Revert M4 je jen log — původní per-stranu stav mazání se nepamatuje, takže
 * automatické „odmazání" by mohlo odkrýt zprávu straně, která si ji sama smazala.
 *
 * Best-effort — na neznámém id / chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class IkarosMessagesModerationEnforcementListener {
  private readonly logger = new Logger(
    IkarosMessagesModerationEnforcementListener.name,
  );

  constructor(private readonly service: IkarosMessagesService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.MailMessage) return;
    try {
      switch (p.action) {
        case ModerationAction.Remove: {
          const ok = await this.service.moderationRemove(p.targetId);
          this.logger.log(
            ok
              ? `Zpráva pošty ${p.targetId} odstraněna moderací (M4) — rozhodnutí ${p.decisionId}.`
              : `Odstranění zprávy ${p.targetId} (M4) — nenalezena (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          this.logger.warn(
            `M2/M3 pro zprávu pošty ${p.targetId} — pošta nemá koncept skrytí ` +
              `veřejného obsahu; reálný zásah je account-level (ban autora M5/M6). ` +
              `Rozhodnutí ${p.decisionId}.`,
          );
          break;
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement zprávy pošty ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  onRevert(p: ModerationEnforcePayload): void {
    if (p.targetType !== ReportTargetType.MailMessage) return;
    if (p.action === ModerationAction.Remove) {
      this.logger.warn(
        `Revert M4 — odstraněnou zprávu pošty ${p.targetId} automaticky ` +
          `nevracíme (per-stranu stav se nepamatuje). Rozhodnutí ${p.decisionId}.`,
      );
    }
  }
}
