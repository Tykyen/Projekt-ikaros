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
  /** Zkrácený text poslední zprávy — náhled v sidebaru. */
  lastMessagePreview?: string;
  order: number;
  isDeleted: boolean;
  type: string;
  imageUrl?: string;
  createdAt: Date;
}
