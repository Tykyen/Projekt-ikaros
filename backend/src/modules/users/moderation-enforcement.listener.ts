import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { DAY_MS } from '../../common/constants/time.constants';
import { logError } from '../../common/logging/log-error.util';
import type { IUsersRepository } from './interfaces/users-repository.interface';
import { UserBanCacheService } from './services/user-ban-cache.service';
import {
  MODERATION_ENFORCE_EVENT,
  MODERATION_REVERT_EVENT,
  type ModerationEnforcePayload,
} from '../moderation/events/moderation-events';
import {
  ModerationAction,
  ReportTargetType,
} from '../moderation/enums/moderation.enums';

/** M5 (dočasné omezení účtu) — délka banu ve dnech. */
const RESTRICT_BAN_DAYS = 30;

/**
 * Fáze B4b — vynucení account-level moderačních zásahů (M5/M6/M7) v modulu
 * `users`. Naslouchá generickému eventu `moderation.enforce` / `moderation.revert`
 * a reaguje JEN na account-level akce (bez ohledu na `targetType` — zásah míří na
 * účet autora, ne na jednotlivý obsah):
 *   - M5 restrict  → dočasný ban `targetAuthorId` (30 dní)
 *   - M6 terminate → trvalý ban
 *   - M7 escalate  → jen log (mimo-platformní kanál je B5)
 *   - revert M5/M6 → unban
 *
 * Reuse: NElze volat `AdminService.banUser` (vyžaduje lidského `actor` +
 * `assertCanModerate` hierarchii, kterou systémová cesta nesplní). Aplikujeme
 * proto TENTÝŽ nízkoúrovňový ban stav jako `admin.banUser`/`unbanUser`
 * (`bannedAt/bannedUntil/banReason` + invalidace ban cache + real-time signál
 * `user.identity.changed`). Enforcement čte `bannedAt` z DB per-request
 * (`JwtAuthGuard`), takže ban platí okamžitě.
 *
 * Vše best-effort — na neznámém uživateli nebo chybě jen zaloguje, nikdy neshodí
 * (event listener nesmí propagovat výjimku zpět do `resolveReport`).
 */
@Injectable()
export class UsersModerationEnforcementListener {
  private readonly logger = new Logger(UsersModerationEnforcementListener.name);

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly banCache: UserBanCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(MODERATION_ENFORCE_EVENT)
  async onEnforce(p: ModerationEnforcePayload): Promise<void> {
    switch (p.action) {
      case ModerationAction.RestrictAccount: // M5 → dočasný ban
        await this.applyBan(p, false);
        break;
      case ModerationAction.TerminateAccount: // M6 → trvalý ban
        await this.applyBan(p, true);
        break;
      case ModerationAction.EscalateExternal: // M7 → account-level nic nevynucuje
        // B5 — vlastní eskalaci (zápis do etického kanálu správy) řeší
        // `ModerationEscalationListener` v platform-chat modulu; account-level
        // modul `users` k M7 jen zaznamená (M7 není ban).
        this.logger.warn(
          `M7 eskalace — rozhodnutí ${p.decisionId} ` +
            `(cíl ${p.targetType}/${p.targetId}). Zápis do etického kanálu ` +
            `zajišťuje platform-chat (B5); zde jen záznam.`,
        );
        break;
      case ModerationAction.HidePart:
      case ModerationAction.HideTemp:
      case ModerationAction.Remove:
        // M2–M4 na profil nemá „obsah" ke skrytí/smazání → no-op (ban účtu je
        // M5/M6). Ostatní typy (article/gallery/nabor/page/world_news/bestie/
        // mail_message) řeší content moduly.
        if (p.targetType === ReportTargetType.Profile) {
          this.logger.warn(
            `M2–M4 na profil ${p.targetId} nemá obsah ke skrytí/smazání — ` +
              `no-op (omezení účtu se řeší akcí M5/M6). Rozhodnutí ${p.decisionId}.`,
          );
        } else if (
          p.targetType === ReportTargetType.CharacterDiary ||
          p.targetType === ReportTargetType.ChatMessage
        ) {
          // B5 — deník postavy (subdokument) a chatová zpráva (WS gateway)
          // nemají přímočarý content-level enforcement → zatím JEN account-level
          // zásah (ban autora M5/M6). Vynucení skrytí/smazání obsahu je TODO.
          this.logger.warn(
            `Content-level ${p.action} pro ${p.targetType} ${p.targetId} zatím ` +
              `není vynuceno (subdoc / WS gateway) — dostupný je jen ` +
              `account-level zásah (ban M5/M6) autora. Rozhodnutí ${p.decisionId}.`,
          );
        }
        break;
      default:
        break; // M0/M1 se sem nikdy nedostanou (emit jen M2–M7).
    }
  }

  @OnEvent(MODERATION_REVERT_EVENT)
  async onRevert(p: ModerationEnforcePayload): Promise<void> {
    switch (p.action) {
      case ModerationAction.RestrictAccount:
      case ModerationAction.TerminateAccount:
        await this.applyUnban(p);
        break;
      case ModerationAction.EscalateExternal:
        this.logger.warn(
          `Revert M7 (rozhodnutí ${p.decisionId}) — eskalace proběhla mimo ` +
            `platformu, automaticky nic nevracíme (řeší B5).`,
        );
        break;
      default:
        break; // M2–M4 vrací content moduly.
    }
  }

  /**
   * Aplikuje ban účtu autora. Idempotentní — přepíše případný existující ban
   * (např. eskalace M5 → M6). Trvalý ban = `bannedUntil` undefined (jako
   * `admin.banUser` s durationDays=0).
   */
  private async applyBan(
    p: ModerationEnforcePayload,
    permanent: boolean,
  ): Promise<void> {
    const userId = p.targetAuthorId;
    if (!userId) {
      this.logger.warn(
        `${permanent ? 'M6' : 'M5'} bez targetAuthorId (rozhodnutí ${p.decisionId}) ` +
          `— nelze zabanovat účet, přeskakuji.`,
      );
      return;
    }
    try {
      const user = await this.usersRepo.findById(userId);
      if (!user) {
        this.logger.warn(
          `Ban účtu ${userId} přeskočen — uživatel nenalezen (rozhodnutí ${p.decisionId}).`,
        );
        return;
      }
      const now = new Date();
      const bannedUntil = permanent
        ? undefined
        : new Date(now.getTime() + RESTRICT_BAN_DAYS * DAY_MS);
      const banReason = permanent
        ? `Moderační zásah — trvalé ukončení účtu (M6), rozhodnutí ${p.decisionId}`
        : `Moderační zásah — dočasné omezení účtu (M5, ${RESTRICT_BAN_DAYS} dní), rozhodnutí ${p.decisionId}`;
      await this.usersRepo.update(userId, {
        bannedAt: now,
        banReason,
        bannedUntil,
      });
      // Vzor admin.banUser: invaliduj/naplň ban cache + force-disconnect živých
      // socketů a signál klientu (kind:'ban' = instant logout ve FE client.ts).
      this.banCache.set(userId, { bannedAt: now, bannedUntil, banReason });
      this.eventEmitter.emit('user.identity.changed', { userId, kind: 'ban' });
      this.logger.log(
        `Účet ${userId} zabanován moderací (${permanent ? 'trvale' : `${RESTRICT_BAN_DAYS} dní`}) ` +
          `— rozhodnutí ${p.decisionId}.`,
      );
    } catch (err) {
      logError(
        this.logger,
        `Ban účtu ${userId} (rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }

  /**
   * Zruší ban (revert overturned M5/M6). Mirror `admin.unbanUser` —
   * `bannedAt/bannedBy/banReason/bannedUntil` clear + invalidace cache + signál.
   * Pozn.: nerozlišujeme původ banu — pokud byl účet nezávisle zabanován adminem
   * z jiného důvodu, revert ho také odblokuje (přijatelné, moderace = zdroj
   * pravdy pro tento účet; zalogováno).
   */
  private async applyUnban(p: ModerationEnforcePayload): Promise<void> {
    const userId = p.targetAuthorId;
    if (!userId) {
      this.logger.warn(
        `Revert banu bez targetAuthorId (rozhodnutí ${p.decisionId}) — přeskakuji.`,
      );
      return;
    }
    try {
      const user = await this.usersRepo.findById(userId);
      if (!user) {
        this.logger.warn(
          `Unban účtu ${userId} přeskočen — uživatel nenalezen (rozhodnutí ${p.decisionId}).`,
        );
        return;
      }
      if (!user.bannedAt) {
        this.logger.warn(
          `Unban účtu ${userId} — účet není zabanován, no-op (rozhodnutí ${p.decisionId}).`,
        );
        return;
      }
      await this.usersRepo.update(userId, {
        bannedAt: undefined,
        bannedBy: undefined,
        banReason: undefined,
        bannedUntil: undefined,
      });
      this.banCache.invalidate(userId);
      this.eventEmitter.emit('user.identity.changed', {
        userId,
        kind: 'unban',
      });
      this.logger.log(
        `Účet ${userId} odblokován (revert overturned) — rozhodnutí ${p.decisionId}.`,
      );
    } catch (err) {
      logError(
        this.logger,
        `Unban účtu ${userId} (rozhodnutí ${p.decisionId}) selhal`,
        err,
      );
    }
  }
}
