import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { CharacterSubdocsService } from './character-subdocs.service';
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
 * D-066 (spec 20B B4b) — vynucení content-level moderačních zásahů nad DENÍKEM
 * POSTAVY. Vzor: plants/bestiae `moderation-enforcement.listener.ts`. Reaguje
 * jen na `targetType === character_diary`:
 *   - M2/M3 (skrytí)   → `moderationHidden = true` (revert → false); skrytý
 *                        deník vidí jen platform reviewer set — vlastník i PJ
 *                        dostanou 404 (globální zásah, vzor pages)
 *   - M4 (odstranění)  → smazání deníkového subdokumentu (revert NEVRATNÝ —
 *                        příští GET lazy-create obnoví prázdný deník)
 *   - M5–M7            → ignoruje (account-level řeší modul `users`)
 *
 * Kontrakt targetId: deník je 1:1 subdokument postavy (`character_diaries`,
 * unikátní `characterId`) → report nese `targetId = characterId` postavy.
 *
 * Best-effort — na neznámém id / chybě jen zaloguje, nikdy neshodí `resolveReport`.
 */
@Injectable()
export class CharacterDiaryModerationEnforcementListener {
  private readonly logger = new Logger(
    CharacterDiaryModerationEnforcementListener.name,
  );

  constructor(private readonly service: CharacterSubdocsService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.CharacterDiary) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, true);
          break;
        case ModerationAction.Remove: {
          const ok = await this.service.moderationRemoveDiary(p.targetId);
          this.logger.log(
            ok
              ? `Deník postavy ${p.targetId} smazán moderací (M4) — rozhodnutí ${p.decisionId}.`
              : `Smazání deníku postavy ${p.targetId} (M4) — nenalezen (rozhodnutí ${p.decisionId}).`,
          );
          break;
        }
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement deníku postavy ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.CharacterDiary) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          // Subdokument je smazaný (lazy-create obnovil prázdný) → nevratné.
          this.logger.warn(
            `Revert M4 deníku postavy ${p.targetId} NELZE — subdokument je ` +
              `smazaný, obsah nenávratně pryč (rozhodnutí ${p.decisionId}).`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert deníku postavy ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  private async setHidden(
    p: ModerationEnforcePayload,
    hidden: boolean,
  ): Promise<void> {
    const ok = await this.service.setDiaryModerationHidden(
      p.targetId,
      hidden,
      hidden ? `Skryto moderací — rozhodnutí ${p.decisionId}` : undefined,
    );
    if (!ok) {
      this.logger.warn(
        `${hidden ? 'Skrytí' : 'Odkrytí'} deníku postavy ${p.targetId} — nenalezen (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Deník postavy ${p.targetId} ${hidden ? 'skryt' : 'odkryt'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
