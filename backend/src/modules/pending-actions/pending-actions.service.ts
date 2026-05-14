import { Injectable, Logger } from '@nestjs/common';
import { AdminPermissions, UserRole } from '../users/interfaces/user.interface';
import { IPendingActionProvider } from './pending-action-provider.interface';
import { PendingActionType } from './pending-action-type.enum';

/**
 * Spec 1.4 — agregátor pending akcí napříč moduly.
 *
 * Service drží registry providerů per `PendingActionType`. Konkrétní moduly
 * (1.8 friendships, 2.4 world join, 3.x content moderation, …) volají
 * `register()` v `onModuleInit()` a tím své akce zapnou v Zpracovat tabu.
 *
 * FE volá:
 *  - `GET /api/pending-actions/count` → suma napříč canHandle providery
 *  - `GET /api/pending-actions?type=...&page=...` → položky jednoho typu
 */
@Injectable()
export class PendingActionsService {
  private readonly logger = new Logger(PendingActionsService.name);
  private readonly providers = new Map<
    PendingActionType,
    IPendingActionProvider
  >();

  register(provider: IPendingActionProvider): void {
    if (this.providers.has(provider.type)) {
      this.logger.warn(
        `Overwriting provider for type=${provider.type}; this should not happen.`,
      );
    }
    this.providers.set(provider.type, provider);
    this.logger.log(`Registered pending action provider: ${provider.type}`);
  }

  getRegisteredTypes(): PendingActionType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Suma pending položek pro uživatele napříč všemi providery, kde
   * `canHandle(role) === true`. Použito pro badge v pravém panelu /
   * tab nav.
   */
  async countForUser(
    userId: string,
    role: UserRole,
    adminPerms?: AdminPermissions,
  ): Promise<number> {
    let total = 0;
    for (const provider of this.providers.values()) {
      const ok = await provider.canHandle(userId, role, adminPerms);
      if (!ok) continue;
      total += await provider.countForUser(userId, role);
    }
    return total;
  }

  /**
   * Vrátí pending položky jednoho typu. Provider rozhodne, jestli requester
   * vůbec smí typ vidět (canHandle); pokud ne, vrátíme prázdný response.
   */
  async listForType(
    type: PendingActionType,
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
    adminPerms?: AdminPermissions,
  ): Promise<{ items: unknown[]; total: number }> {
    const provider = this.providers.get(type);
    if (!provider) return { items: [], total: 0 };
    const ok = await provider.canHandle(userId, role, adminPerms);
    if (!ok) return { items: [], total: 0 };
    return provider.listForUser(userId, role, page, limit);
  }
}
