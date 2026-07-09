import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { logError } from '../../common/logging/log-error.util';
import { UserRole } from '../users/interfaces/user.interface';
import { IkarosGalleryService } from './ikaros-gallery.service';
import {
  MODERATION_ENFORCE_EVENT,
  MODERATION_REVERT_EVENT,
  type ModerationEnforcePayload,
} from '../moderation/events/moderation-events';
import {
  ModerationAction,
  ReportTargetType,
} from '../moderation/enums/moderation.enums';

/** Systémový aktér pro reuse `service.delete` (Superadmin obchází ownership guard). */
const SYSTEM_ACTOR = {
  id: 'system',
  username: 'Systém',
  role: UserRole.Superadmin,
};

/**
 * Fáze B4b — vynucení content-level zásahů nad GALERIÍ (obrázky). Reaguje jen na
 * `targetType === gallery`: M2/M3 → skrytí, M4 → smazání (hard delete, uvolní i
 * Cloudinary asset; nevratné, revert jen log). M5–M7 řeší modul `users`.
 * Best-effort — na neznámém id / chybě jen zaloguje.
 */
@Injectable()
export class GalleryModerationEnforcementListener {
  private readonly logger = new Logger(
    GalleryModerationEnforcementListener.name,
  );

  constructor(private readonly service: IkarosGalleryService) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Gallery) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, true);
          break;
        case ModerationAction.Remove:
          await this.service.delete(
            p.targetId,
            SYSTEM_ACTOR.id,
            SYSTEM_ACTOR.role,
            SYSTEM_ACTOR.username,
          );
          this.logger.log(
            `Obrázek ${p.targetId} smazán moderací (M4) — rozhodnutí ${p.decisionId}.`,
          );
          break;
        default:
          break; // M5–M7 řeší users listener.
      }
    } catch (err) {
      logError(
        this.logger,
        `Enforcement obrázku ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    if (p.targetType !== ReportTargetType.Gallery) return;
    try {
      switch (p.action) {
        case ModerationAction.HidePart:
        case ModerationAction.HideTemp:
          await this.setHidden(p, false);
          break;
        case ModerationAction.Remove:
          this.logger.warn(
            `Revert M4 — smazaný obrázek ${p.targetId} nelze vrátit (rozhodnutí ${p.decisionId}).`,
          );
          break;
        default:
          break;
      }
    } catch (err) {
      logError(
        this.logger,
        `Revert obrázku ${p.targetId} (${p.action}, rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  private async setHidden(
    p: ModerationEnforcePayload,
    hidden: boolean,
  ): Promise<void> {
    const ok = await this.service.setModerationHidden(
      p.targetId,
      hidden,
      hidden ? `Skryto moderací — rozhodnutí ${p.decisionId}` : undefined,
    );
    if (!ok) {
      this.logger.warn(
        `${hidden ? 'Skrytí' : 'Odkrytí'} obrázku ${p.targetId} — nenalezen (rozhodnutí ${p.decisionId}).`,
      );
      return;
    }
    this.logger.log(
      `Obrázek ${p.targetId} ${hidden ? 'skryt' : 'odkryt'} moderací — rozhodnutí ${p.decisionId}.`,
    );
  }
}
