import { ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '../../modules/users/interfaces/user.interface';
import type { IUsersRepository } from '../../modules/users/interfaces/users-repository.interface';
import type { RequestUser } from '../interfaces/request-user.interface';
import { WorldElevationsService } from '../../modules/world-elevations/world-elevations.service';

/**
 * Optional JWT auth guard.
 *
 * Pokud je v requestu validní Bearer token, naparuje `request.user` jako JwtAuthGuard.
 * Pokud token chybí nebo je neplatný, **nehází** — request projde s `user = undefined`.
 *
 * Použití na read-only endpointech, kde anonymní uživatel vidí jen public/open zdroje,
 * ale přihlášený uživatel vidí navíc svoje private zdroje (např. private světy).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly elevationService: WorldElevationsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (request.user) {
      // PT-35e — dřív se role brala ze STARÉ JWT a účet se NEověřoval proti DB
      // (na rozdíl od JwtAuthGuard). Demotovaný Admin / zabanovaný uživatel tak
      // držel elevovaný přístup k private zdrojům na read endpointech až do
      // expirace tokenu (~3 dny). Optional kontrakt = NEházíme: nepoužitelný účet
      // degradujeme na anonyma (user = undefined), roli bereme čerstvou z DB.
      const dbUser = await this.usersRepo.findById(request.user.id);
      if (!dbUser || dbUser.isDeleted || dbUser.bannedAt) {
        request.user = undefined;
        return result;
      }
      request.user.role = dbUser.role;
      // Elevation — jen pro platform Admin/Superadmin (viz JwtAuthGuard).
      if (request.user.role <= UserRole.Admin) {
        request.user.elevatedWorldIds =
          await this.elevationService.listWorldIdsForUser(request.user.id);
      }
    }
    return result;
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser | undefined {
    // Anonymní průchod: jakákoliv chyba (chybějící/neplatný token) → user = undefined, NE throw.
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
