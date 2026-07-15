/**
 * 15.10 fáze B — pozvánka do světa (cílená `user` / odkaz `link`).
 */
export type WorldInviteKind = 'user' | 'link';
export type WorldInviteStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'revoked'
  | 'expired';

export interface WorldInvite {
  id: string;
  worldId: string;
  kind: WorldInviteKind;
  invitedUserId?: string;
  token?: string;
  createdBy: string;
  role: number;
  status: WorldInviteStatus;
  expiresAt?: Date;
  maxUses?: number;
  usedCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Přehled aktivních pozvánek světa (PJ). `token` jen u odkazu. */
export interface WorldInviteListItem {
  id: string;
  kind: WorldInviteKind;
  status: WorldInviteStatus;
  token?: string;
  invitedUser?: { id: string; username: string; avatarUrl?: string };
  expiresAt?: string;
  maxUses?: number;
  usedCount: number;
  createdAt?: string;
}

/**
 * Položka fronty „ke zpracování" pro POZVANÉHO (cílená pozvánka `user`).
 * Vrací `WorldInviteProvider.listForUser`.
 */
export interface WorldInvitePendingItem {
  inviteId: string;
  worldId: string;
  worldName: string;
  worldSlug: string;
  invitedBy?: { id: string; username: string; avatarUrl?: string };
  createdAt: string;
}
