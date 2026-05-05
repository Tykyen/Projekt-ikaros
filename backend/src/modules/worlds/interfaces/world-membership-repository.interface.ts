import { WorldMembership } from './world-membership.interface';

export interface IWorldMembershipRepository {
  findById(id: string): Promise<WorldMembership | null>;
  findByWorldId(worldId: string, filters?: { role?: number; group?: string }): Promise<WorldMembership[]>;
  findByUserId(userId: string): Promise<WorldMembership[]>;
  findByUserAndWorld(userId: string, worldId: string): Promise<WorldMembership | null>;
  countByWorldId(worldId: string): Promise<number>;
  save(membership: Partial<WorldMembership>): Promise<WorldMembership>;
  update(id: string, data: Partial<WorldMembership>): Promise<WorldMembership | null>;
  delete(id: string): Promise<boolean>;
}
