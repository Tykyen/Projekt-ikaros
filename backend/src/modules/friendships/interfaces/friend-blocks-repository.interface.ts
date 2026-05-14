import type { FriendBlock } from './friendship.interface';

export interface IFriendBlocksRepository {
  create(blockerId: string, blockedId: string): Promise<FriendBlock>;
  findActive(blockerId: string, blockedId: string): Promise<FriendBlock | null>;
  remove(blockerId: string, blockedId: string): Promise<boolean>;
  listByBlocker(blockerId: string): Promise<FriendBlock[]>;
  /** Kontrola, zda existuje block kterýmkoli směrem. */
  existsBetween(a: string, b: string): Promise<boolean>;
}
