export type AdminAuditAction =
  | 'ROLE_CHANGE'
  | 'USER_CREATE'
  | 'USERNAME_REQUEST_APPROVED'
  | 'USERNAME_REQUEST_REJECTED'
  | 'BAN'
  | 'UNBAN'
  | 'DELETE'
  | 'UNDELETE'
  | 'DELETION_REACTIVATED'
  | 'HARD_DELETE'
  | 'PERMISSIONS_CHANGE'
  | 'ADMIN_PERMISSIONS_CHANGE'
  | 'ACCOUNT_SELF_DELETE_REQUEST'
  | 'ACCOUNT_DELETE_REQUEST'
  | 'ACCOUNT_DELETE_CANCEL'
  | 'ACCOUNT_SELF_REACTIVATE'
  | 'ACCOUNT_HARD_DELETE'
  | 'BULK_BAN'
  | 'BULK_UNBAN'
  | 'BULK_ROLE_CHANGE'
  // D-067 — audit nad novinkami Ikaros (entita ikaros-news).
  | 'IKAROS_NEWS_ARCHIVE'
  | 'IKAROS_NEWS_UNARCHIVE'
  | 'IKAROS_NEWS_DELETE'
  // Elevation — admin si „nahodil"/„složil" pravomoci ve světě.
  | 'WORLD_ELEVATION_ACTIVATED'
  | 'WORLD_ELEVATION_REVOKED';

/**
 * D-067 — typ cílové entity audit záznamu. `user` = výchozí (akce nad
 * uživatelem); `ikaros-news` = akce nad novinkou. Starší záznamy bez pole
 * se interpretují jako `user`.
 */
export type AuditTargetType = 'user' | 'ikaros-news' | 'world';

export interface AdminAuditLogEntry {
  id: string;
  actorId: string;
  actorUsername: string;
  targetId: string;
  /** Jméno cíle — username uživatele nebo název novinky (dle `targetType`). */
  targetUsername: string;
  targetType: AuditTargetType;
  action: AdminAuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Date;
}

export interface RecordAuditInput {
  actorId: string;
  actorUsername: string;
  targetId: string;
  targetUsername: string;
  /** Volitelné — neuvedeno = `user` (zpětná kompatibilita). */
  targetType?: AuditTargetType;
  action: AdminAuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
}

export interface ListAuditOpts {
  actorId?: string;
  targetId?: string;
  action?: AdminAuditAction;
  targetType?: AuditTargetType;
  page: number;
  limit: number;
}

export interface IAdminAuditLogRepository {
  record(input: RecordAuditInput): Promise<void>;
  listPaginated(
    opts: ListAuditOpts,
  ): Promise<{ items: AdminAuditLogEntry[]; total: number }>;
}
