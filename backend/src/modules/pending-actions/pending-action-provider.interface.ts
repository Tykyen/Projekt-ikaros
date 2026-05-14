import { AdminPermissions, UserRole } from '../users/interfaces/user.interface';
import { PendingActionType } from './pending-action-type.enum';

/**
 * Spec 1.4 — kontrakt mezi PendingActionsService a konkrétními queue typy.
 *
 * Každý modul, který má pending akce vyžadující rozhodnutí (přátele, world
 * join, content moderation, …), implementuje tento interface a registruje se
 * v PendingActionsService.
 *
 * `canHandle` se volá pro každého uživatele, který si načítá Zpracovat tab —
 * provider rozhodne, zda jeho položky vůbec zobrazí (na základě role +
 * permissions). To dovoluje granular gate: SpravceClanku vidí jen
 * `article_pending_review`, Admin/Superadmin vidí všechno.
 */
export interface IPendingActionProvider<TItem = unknown> {
  readonly type: PendingActionType;

  /**
   * Zda uživatel s touto rolí + permissions vidí tento queue typ.
   * Měla by být lightweight (synchronní logika nad rolí); pokud potřebuje
   * DB lookup (např. „je manažerem diskuze?"), vrátí Promise.
   */
  canHandle(
    userId: string,
    role: UserRole,
    adminPerms?: AdminPermissions,
  ): boolean | Promise<boolean>;

  /** Počet pending položek pro uživatele (pro badge na tabu/pravém panelu). */
  countForUser(userId: string, role: UserRole): Promise<number>;

  /** Paginovaný seznam pending položek pro uživatele. */
  listForUser(
    userId: string,
    role: UserRole,
    page: number,
    limit: number,
  ): Promise<{ items: TItem[]; total: number }>;
}
