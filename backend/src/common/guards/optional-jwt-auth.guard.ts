import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

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
  canActivate(context: ExecutionContext) {
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser | undefined {
    // Anonymní průchod: jakákoliv chyba (chybějící/neplatný token) → user = undefined, NE throw.
    if (err || !user) {
      return undefined;
    }
    return user;
  }
}
