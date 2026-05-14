import type { Friendship } from './friendship.interface';

export interface IFriendshipsRepository {
  create(requesterId: string, recipientId: string): Promise<Friendship>;
  findById(id: string): Promise<Friendship | null>;
  /** Pending/accepted between dvojicí (oba směry). */
  findActiveBetween(a: string, b: string): Promise<Friendship | null>;
  /** Last rejected (oba směry) — pro cool-down lookup, sender=a, recipient=b. */
  findLatestRejected(
    requesterId: string,
    recipientId: string,
  ): Promise<Friendship | null>;
  accept(id: string, acceptedAt: Date): Promise<Friendship | null>;
  markRejected(id: string, rejectedAt: Date): Promise<Friendship | null>;
  remove(id: string): Promise<boolean>;
  listAcceptedForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Friendship[]; total: number }>;
  listOutgoingPendingForUser(userId: string): Promise<Friendship[]>;
  listIncomingPendingForUser(userId: string): Promise<Friendship[]>;
  countIncomingPendingForUser(userId: string): Promise<number>;
  /** Smaže všechny aktivní (pending+accepted) friendship mezi dvojicí — pro block side-effect. */
  removeAllActiveBetween(a: string, b: string): Promise<void>;
}
