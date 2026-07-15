import { WorldInvite, WorldInviteStatus } from './world-invite.interface';

/**
 * 15.10 fáze B — repository abstrakce pro `worldinvites` kolekci.
 */
export interface IWorldInviteRepository {
  create(data: {
    worldId: string;
    kind: 'user' | 'link';
    invitedUserId?: string;
    token?: string;
    createdBy: string;
    role: number;
    expiresAt?: Date;
    maxUses?: number;
  }): Promise<WorldInvite>;

  findById(id: string): Promise<WorldInvite | null>;
  findByToken(token: string): Promise<WorldInvite | null>;
  /** Aktivní (pending) pozvánky světa — PJ přehled. */
  findActiveByWorld(worldId: string): Promise<WorldInvite[]>;
  /** Existující pending cílená pozvánka (svět, uživatel) — anti-duplicita. */
  findPendingUserInvite(
    worldId: string,
    invitedUserId: string,
  ): Promise<WorldInvite | null>;
  /** Pending cílené pozvánky pro uživatele — fronta „ke zpracování". */
  findPendingForUser(invitedUserId: string): Promise<WorldInvite[]>;
  countPendingForUser(invitedUserId: string): Promise<number>;

  updateStatus(
    id: string,
    status: WorldInviteStatus,
  ): Promise<WorldInvite | null>;
  incrementUsedCount(id: string): Promise<WorldInvite | null>;
  delete(id: string): Promise<boolean>;
}
