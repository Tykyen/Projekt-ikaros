import type { NotificationPreferences } from '../../../common/notifications/notification-preferences';

export enum UserRole {
  Superadmin = 1,
  Admin = 2,
  /**
   * D-NEW-INV-CLEANUP — legacy GLOBÁLNÍ world role (před D-053; dnes world role
   * žijí v membershipech jako `WorldRole`). Hodnoty 4 (Korektor), 6 (Ctenar),
   * 7 (Zadatel), 8 (Zakaz) odstraněny — v kódu se nepoužívaly. Čísla zůstávají
   * REZERVOVANÁ, nerecyklovat! Kdyby DB (`users.role` = Number) starou hodnotu
   * přesto držela, čtení nevaliduje a gating je fail-closed (`role <= Admin`,
   * `=== konkrétní role`) → chová se jako běžný uživatel.
   *
   * `PJ` (3) ponechán: runtime reference (default `scheduledMessages.ownerRole`)
   * + řada specs napříč moduly; globálně ho po D-053 žádný user nemá.
   */
  PJ = 3,
  /** Běžný uživatel — DEFAULT role při registraci (auth.service, user.schema).
   *  FE enum tuhle hodnotu nepojmenovává, pracuje s ní jen numericky. */
  Hrac = 5,
  Ikarus = 9,
  SpravceClanku = 10,
  SpravceGalerie = 11,
  SpravceDiskuzi = 12,
  /**
   * Spec 15.8 — host (anonym) z guest JWT, BEZ DB účtu. Sentinel mimo řadu
   * 1–12: gating jede přes „nižší číslo = vyšší práva" (`role <= X`), takže 99
   * nikdy neprojde žádný gate ani `@Roles(...)` → guest se nikam mimo Hospodu
   * nedostane automaticky (druhá pojistka vedle GuestOrMemberGuard). NENÍ to
   * přiřaditelná DB role — žije jen v guest tokenu / `RequestUser`.
   */
  Guest = 99,
}

// D-NEW-INV-CLEANUP — `canEditPlatformPages` odstraněn (mrtvý flag, R-05:
// BE ho nikde nevynucoval, FE toggle skryt). Ve starých user docech může
// hodnota v `adminPermissions` subdoc přežívat — nikde se nečte, neškodí.
export interface AdminPermissions {
  canManageAdmins: boolean;
  canModerateContent: boolean;
}

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  canManageAdmins: false,
  canModerateContent: false,
};

/**
 * D-040 — Tombstone info pro batch enrichment v chat/articles/discussions/galerie.
 * Vrací jen pole nutná pro render avataru a display name; ostatní user fields
 * (email, banned, atd.) se nevracejí, ať to není leak v public endpoint response.
 */
export interface TombstoneInfo {
  /** True = uživatel byl anonymizován (hard cleanup po 30denním holdu). */
  isDeleted: boolean;
  displayName: string;
  avatarUrl?: string;
}

export interface DeletionPromotion {
  worldId: string;
  worldName: string;
  worldSlug: string;
  promotedUserId: string;
  promotedUsername: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  displayName?: string;
  avatarUrl?: string;
  /** D-19.2 — velikost blobu avataru v bytech; staré dokumenty nemají. */
  avatarBytes?: number;
  profileImageUrl?: string;
  characterPath?: string;
  themeSettings: Record<string, unknown>;
  chatPreferences: Record<string, unknown>;
  favoriteDiscussionIds: string[];
  likedDiscussionIds: string[];
  // 3.7 — oblíbené (záložky) napříč globálním obsahem
  favoriteArticleIds: string[];
  favoriteGalleryIds: string[];
  // 3.7 — připnuté (podmnožina oblíbených, sidebar, max 5/typ)
  pinnedDiscussionIds: string[];
  pinnedArticleIds: string[];
  pinnedGalleryIds: string[];
  isOnline: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;

  // SP0 rozšíření (2026-05-14):
  isDeleted?: boolean;
  deletionRequestedAt?: Date;
  deletionReason?: string;
  /** N-6b (1.3c §2.5) — timestamp hard-cleanupu (anonymizace cronem). */
  deletedAt?: Date;
  bannedAt?: Date;
  bannedUntil?: Date;
  banReason?: string;
  adminPermissions?: AdminPermissions;
  defaultAvatarType?: string;
  usernameChangedAt?: Date;

  // SP2 rozšíření (2026-05-14):
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
  deletionRequestedBy?: string;
  deletionPromotions?: DeletionPromotion[];

  // F-03 (GDPR) — doklad souhlasu s podmínkami při registraci.
  acceptedTermsAt?: Date;
  termsVersion?: string;

  // 20C (spec-20C §C2/C3) — deklarativní věk + režim ochrany nezletilých.
  isMinor?: boolean;
  minorSelfDeclaredAt?: Date;
  parentalConsentStatus?: 'pending' | 'granted' | 'not_required';

  // SP3 / D-052 (2026-05-14):
  hiddenPresence?: boolean;

  // D-045 (2026-05-23) — privacy „skrýt mě v adresáři uživatelů".
  hiddenInDirectory?: boolean;

  // SP4 (2026-05-14):
  bannedBy?: string;

  // 3.5 / D-057 (2026-05-15) — friend-only privacy:
  profileVisibility?: 'public' | 'friends';

  // D-072 (2026-05-16) — barva chatu (hex #RRGGBB), default #FFFFFF:
  chatColor: string;

  // 1.3a BE catch-up (2026-05-16) — profilová pole:
  city?: string;
  bio?: string;
  characterName?: string;
  characterBio?: string;
  characterAvatarUrl?: string;
  /** D-19.2 — velikost blobu avataru postavy v bytech; staré docs nemají. */
  characterAvatarBytes?: number;
  themeId?: string;
  lastLoginAt?: Date;

  // 8.3 / D-074 (2026-05-23) — oblíbené postavy v adresáři per svět.
  // Mapa `worldId → slug[]`. Default `{}` (žádné oblíbené ve světě).
  favoriteCharacters: Record<string, string[]>;
  // 5.2-followup — osobní oblíbené stránky per svět. `worldId → slug[]`, pořadí významné.
  favoritePageSlugs: Record<string, string[]>;

  // 14.1 — 2FA / TOTP (spec-14.1). `totpSecretEnc` + `backupCodeHashes` jsou
  // citlivé → sanitize() je nikdy nevrací ven (viz SafeUser v auth.service).
  totpEnabled?: boolean;
  totpSecretEnc?: string | null;
  backupCodeHashes?: string[];
  totpEnabledAt?: Date;
  twoFactorMethod?: string;

  // SESS (pentest PT-35e) — verze access tokenu; bump = zneplatnění starých tokenů.
  tokenVersion?: number;
  // PT-35a — per-účet 2FA brute-force lockout (čítač neúspěchů + čas zámku).
  failedTotpAttempts?: number;
  totpLockedUntil?: Date | null;

  // 15.9 — notifikační preference (push). undefined = použij defaulty z kódu.
  notificationPreferences?: NotificationPreferences;

  // 19.4 — freemium status „Podporovatel" (spec-19.4). Ručně udělený flag.
  isSupporter?: boolean;
  supporterSince?: Date;
}

/**
 * 8.3 / D-075 — položka cross-world přehledu „moje postavy" na profilu.
 * Agregát přes membershipy s `characterPath`. Vrací logged-in user.
 */
export interface MyCharacterEntry {
  worldId: string;
  worldName: string;
  worldSlug: string;
  worldImageUrl?: string;
  characterId: string;
  characterSlug: string;
  characterName: string;
  isNpc: boolean;
  /** Spec 9.2 — Character.kind. FE vykreslí různou ikonu pro persona/location. */
  kind: 'persona' | 'location';
  // 9.1 (cleanup) — characterImageUrl odebrán. Avatar žije v Page (přes
  // characterRef); FE může načíst přes /pages/<slug>.
}

export interface PublicUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
  /** Poslední aktivita uživatele. `undefined`, má-li zapnutý „neviditelný" mód
   *  (`hiddenPresence`) — presence se pak ostatním neukazuje. */
  lastSeenAt?: Date;
  // 19.4 — status Podporovatel (badge na veřejném profilu).
  isSupporter?: boolean;
}

export interface PublicUserListItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  createdAt: Date;
  defaultAvatarType?: string;
  worldsCount: number;
  deleted?: boolean;
  pendingDeletion?: boolean;
  // 19.4 — status Podporovatel + kdy (badge v adresáři + zeď „podporovatel od").
  isSupporter?: boolean;
  supporterSince?: Date;
}

export interface PublicUserProfile extends PublicUserListItem {
  lastSeenAt: string | null;
  // 1.4 §15 — poslední přihlášení; posílá se JEN platformovému Adminovi
  // (admin-gated v publicProfileV14), ne-admin pole vůbec nedostane.
  lastLoginAt?: string | null;
  // 1.3a — veřejně viditelná profilová pole + postava v Campu.
  bio?: string;
  city?: string;
  characterName?: string;
  characterBio?: string;
  characterAvatarUrl?: string;
}

/**
 * 19.4 — leak-safe položka zdi podporovatelů (veřejný endpoint /users/supporters).
 * BEZ role/emailu/worldsCount — jen co veřejná zeď potřebuje.
 */
export interface SupporterListItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  defaultAvatarType?: string;
  supporterSince: string | null;
}
