import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { PlatformChatService } from './platform-chat.service';
import {
  MODERATION_ENFORCE_EVENT,
  type ModerationEnforcePayload,
} from '../moderation/events/moderation-events';
import {
  ModerationAction,
  ReportCategory,
} from '../moderation/enums/moderation.enums';

/**
 * Fáze B5 (spec 20B) — eskalace moderačních zásahů do etického kanálu správy
 * (20.5 „Chat správy"). Naslouchá generickému `moderation.enforce` a do
 * vyhrazené konverzace `staff-moderation-escalation` pošle systémovou zprávu:
 *   - akce M7 (EscalateExternal) — předání příslušnému orgánu mimo platformu,
 *   - kategorie `minor_safety` (jakákoli vynucená akce M2–M7) — citlivý případ.
 *
 * Zpráva nese jen typ akce, cíl, svět a `decisionId` — NIKDY identitu
 * oznamovatele (ta se do enforcement payloadu vůbec nedostává). Best-effort:
 * posílání je uvnitř `PlatformChatService` obalené try/catch, listener sám nic
 * neshodí (event-emitter je fire-and-forget z `resolveReport`).
 *
 * Listener žije v `platform-chat` (jednosměrná závislost: platform-chat →
 * users/chat), ne v `users` modulu — ten na platform-chat nesahá, aby nevznikl
 * kruhový import. `moderation` importuje jen typy/konstanty eventu (žádný modul).
 */
@Injectable()
export class ModerationEscalationListener {
  private readonly logger = new Logger(ModerationEscalationListener.name);

  constructor(private readonly platformChat: PlatformChatService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    const isEscalate = p.action === ModerationAction.EscalateExternal;
    const isMinorSafety = p.category === ReportCategory.MinorSafety;
    if (!isEscalate && !isMinorSafety) return;
    try {
      const when = new Date().toLocaleString('cs-CZ');
      const lines: string[] = [];
      if (isEscalate) {
        lines.push('🚨 Moderační eskalace (M7) — předání mimo platformu.');
      }
      if (isMinorSafety) {
        lines.push(
          '⚠️ Citlivý případ — kategorie ochrany nezletilých (minor_safety).',
        );
      }
      lines.push(`Akce: ${p.action}`);
      lines.push(`Cíl: ${p.targetType} / ${p.targetId}`);
      if (p.worldId) lines.push(`Svět: ${p.worldId}`);
      lines.push(`Rozhodnutí: ${p.decisionId}`);
      lines.push(`Čas: ${when}`);
      await this.platformChat.postModerationSystemMessage(lines.join('\n'));
    } catch (err) {
      logError(
        this.logger,
        `Eskalace rozhodnutí ${p.decisionId} do etického kanálu selhala`,
        err,
      );
    }
  }
}
