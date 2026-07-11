import {
  Injectable,
  Inject,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { IUsersRepository } from '../../modules/users/interfaces/users-repository.interface';
import { ALLOW_PENDING_DELETION } from '../decorators/allow-pending-deletion.decorator';
import { UserRole } from '../../modules/users/interfaces/user.interface';
import type { RequestUser } from '../interfaces/request-user.interface';
import { WorldElevationsService } from '../../modules/world-elevations/world-elevations.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly reflector: Reflector,
    private readonly elevationService: WorldElevationsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    if (result) {
      const request = context
        .switchToHttp()
        .getRequest<{ user?: RequestUser }>();
      // R-07 — `JwtStrategy.validate` vrací `{ id: payload.sub, … }`, NE `{ sub }`.
      // Dřív tu bylo `request.user?.sub` → vždy `undefined` → CELÝ gate níže byl
      // mrtvý (smazaný/pending/banned účet s 7d tokenem prošel týden). Čteme `.id`
      // (stejně jako @CurrentUser a všechny controllery).
      const userId = request.user?.id;
      if (userId) {
        // 1.3c (N-6b) — per-request gate na stav účtu. Access token žije až 7 dní,
        // takže login-only reject by smazaného/pending/banned usera nechal týden aktivního.
        // Optional routy (OptionalJwtAuthGuard) gate záměrně nemají — jsou public read-only.
        const user = await this.usersRepo.findById(userId);
        if (!user || user.isDeleted)
          throw new UnauthorizedException({
            code: 'DELETED',
            message: 'Účet byl smazán',
          });
        // R-08 — ban enforcement per-request (ban nastavený za běhu, token žije 7d).
        // FE `client.ts` na kód BANNED dělá instant logout.
        if (user.bannedAt)
          throw new UnauthorizedException({
            code: 'BANNED',
            message: 'Účet byl zablokován',
          });
        const allowPending = this.reflector.getAllAndOverride<boolean>(
          ALLOW_PENDING_DELETION,
          [context.getHandler(), context.getClass()],
        );
        if (!allowPending && user.deletionRequestedAt)
          throw new UnauthorizedException({
            code: 'DELETION_PENDING',
            message: 'Účet je naplánován ke smazání',
          });
        // SESS — freshness role: access token je stateless (TTL 3 dny). Bez
        // tohoto by demotovaný Admin držel práva ze STARÉ JWT až do expirace
        // (a „odhlásit všude" by roli neaktualizovalo). DB = zdroj pravdy;
        // usera tu už načítáme kvůli ban/delete gate, jen přepíšeme roli.
        if (request.user) request.user.role = user.role;
        // Elevation („nahození práv") — jen pro platform Admin/Superadmin.
        // Naplní seznam světů, kde má admin aktivní bypass. Běžných uživatelů
        // se extra lookup netýká (výkon). Helper: `worldAdminBypass`.
        if (request.user && request.user.role <= UserRole.Admin) {
          request.user.elevatedWorldIds =
            await this.elevationService.listWorldIdsForUser(userId);
        }
        void this.usersRepo.updateLastSeen(userId).catch((err: Error) => {
          this.logger.warn(
            `updateLastSeen failed for ${userId}: ${err.message}`,
          );
        });
      }
    }
    return result;
  }
}
