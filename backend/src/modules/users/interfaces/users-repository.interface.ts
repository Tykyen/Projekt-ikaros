import { User, UserRole } from './user.interface';

export interface FindPublicPaginatedOpts {
  q?: string;
  sort?: 'new' | 'recent' | 'username';
  page: number;
  limit: number;
  includeDeleted: boolean;
  /** D-045 (2026-05-23) — admin/Superadmin vidí i `hiddenInDirectory: true`. */
  includeHidden?: boolean;
}

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  /** Krok 6.2i — batch lookup pro mentions (case-insensitive). */
  findByUsernames(usernames: string[]): Promise<User[]>;
  /** D-040 — batch lookup pro tombstone enrichment v chat/articles/discussions/galerie. */
  findByIds(ids: string[]): Promise<User[]>;
  findFirstByRole(role: UserRole): Promise<User | null>;
  findByRoles(roles: UserRole[]): Promise<User[]>;
  findOnlineSince(since: Date): Promise<string[]>;
  /** 12.1 — počet aktivních (non-tombstone) účtů založených od `since`. */
  countCreatedSince(since: Date): Promise<number>;
  /** FIX-68 (12.1) — celkový počet aktivních (non-tombstone) účtů. */
  countActive(): Promise<number>;
  /** 12.1 — počet účtů v pending-deletion holdu (deletionRequestedAt, !isDeleted). */
  countPendingDeletion(): Promise<number>;
  /**
   * 1.3c (N-3) — účty s prošlým 30denním holdem (deletionRequestedAt < cutoff, !isDeleted).
   * AccountCleanupCron je anonymizuje (hard cleanup).
   */
  findExpiredPendingDeletion(cutoff: Date): Promise<User[]>;
  /**
   * 1.3c (N-3) — nevratná anonymizace PII (passwordHash/email/bio/lastLoginAt) +
   * `isDeleted:true`/`deletedAt`. Zachovává username/displayName/avatarUrl/chatColor
   * pro referenční integritu (audit, @mentions, tombstone). Používá `$unset` —
   * `update()` přes `$set:undefined` by PII nesmazal.
   */
  anonymizeForHardDelete(id: string, anonymizedEmail: string): Promise<void>;
  /**
   * CD-08 (cascade-delete audit) — odeber smazaný page slug ze všech
   * `favoritePageSlugs[worldId]` (úklid po delete stránky).
   */
  pullFavoritePageSlug(worldId: string, slug: string): Promise<void>;
  findAllPaginated(opts: {
    username?: string;
    role?: UserRole;
    page: number;
    limit: number;
    /**
     * FIX-1 (BE oprava dávka, 2026-07) — skryje tombstone (`isDeleted:true`)
     * účty z `items` i `total` (vzor `findPublicPaginated`); default false.
     */
    includeDeleted?: boolean;
  }): Promise<{ items: User[]; total: number }>;
  findPublicPaginated(
    opts: FindPublicPaginatedOpts,
  ): Promise<{ items: User[]; total: number }>;
  /** 19.4 — zeď podporovatelů (isSupporter=true, leak-safe, řazení supporterSince). */
  findSupporters(): Promise<User[]>;
  save(user: Partial<User>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  updateLastSeen(id: string): Promise<void>;
  updateLastLogin(id: string, at: Date): Promise<void>;
  /** SESS (pentest PT-35e) — atomicky bumpne `tokenVersion` ($inc); zneplatní staré access tokeny. */
  incrementTokenVersion(id: string): Promise<void>;
  /**
   * PT-35a — atomicky inkrementuje `failedTotpAttempts`; při dosažení `maxAttempts`
   * nastaví `totpLockedUntil` (now + `lockMs`) a čítač vynuluje. Vrací, zda je účet nově zamčen.
   */
  recordTotpFailure(
    id: string,
    maxAttempts: number,
    lockMs: number,
  ): Promise<{ locked: boolean }>;
  /** PT-35a — vynuluje čítač neúspěchů + odemkne účet (po úspěšném 2FA loginu). */
  resetTotpFailures(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;

  // Migration support pro case-insensitive username (viz UsersService.onModuleInit).
  findUsernameCaseConflicts(): Promise<
    Array<{ lower: string; usernames: string[] }>
  >;
  backfillUsernameLower(): Promise<{ updated: number }>;
}
