import { Injectable, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestUser } from '../interfaces/request-user.interface';

/**
 * Spec 15.8 — pustí ČLENA i HOSTA (guest JWT) na endpoint Hospody.
 *
 * - Člen → projde plným `JwtAuthGuard` member gate (deleted/banned/pending/
 *   elevation per-request).
 * - Host (guest) → guest NEMÁ DB účet, takže member gate by selhal na
 *   `findById(anon-id) = null` → falešné „DELETED". Proto pro hosta **přeskočíme
 *   member gate** a pustíme ho jen na základě platného guest tokenu.
 *
 * Scope hosta na Hospodu NEHLÍDÁ tento guard, ale handler (`room !== 'hospoda'`
 * → 403) + sentinel `UserRole.Guest` (neprojde žádný role gating jinde).
 */
@Injectable()
export class GuestOrMemberGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Passport validace (naplní `req.user` z tokenu přes JwtStrategy) — voláme
    // ji přes grandparent `AuthGuard('jwt')`, ODDĚLENĚ od `JwtAuthGuard` member
    // gate (ten je v `JwtAuthGuard.canActivate` a pro hosta by spadl).
    const passportProto = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate(ctx: ExecutionContext): Promise<boolean> | boolean;
    };
    const ok = (await passportProto.canActivate.call(this, context)) as boolean;
    if (!ok) return false;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();

    // Host (guest) — platný token stačí; member DB gate přeskočen.
    if (request.user?.isGuest) return true;

    // Člen — plný JwtAuthGuard member gate (zopakuje passport + stav účtu).
    return await super.canActivate(context);
  }
}
