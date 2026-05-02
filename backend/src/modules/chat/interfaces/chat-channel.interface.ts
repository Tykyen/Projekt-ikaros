import type { WorldRole } from '../../worlds/interfaces/world-membership.interface';

export interface ChatChannel {
  id: string;
  groupId: string | null;
  worldId: string | null;
  name: string;
  isGlobal: boolean;
  accessMode: 'all' | 'roles' | 'members';
  allowedRoles: WorldRole[];
  allowedMemberIds: string[];
  lastMessageAt?: Date;
  order: number;
  isDeleted: boolean;
  createdAt: Date;
}
