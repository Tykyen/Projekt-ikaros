import type { UserRole } from '../../users/interfaces/user.interface';

export interface DataExportUser {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  characterPath?: string;
  role: UserRole;
  themeSettings: Record<string, unknown>;
  chatPreferences: Record<string, unknown>;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  isOnline: boolean;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataExportWorldMembership {
  worldId: string;
  role: number;
  joinedAt: string;
  group?: string;
  characterPath?: string;
}

export interface DataExportFriendship {
  id: string;
  counterpartUserId: string;
  direction: 'outgoing' | 'incoming';
  status: 'pending' | 'accepted';
  requestedAt: string;
  acceptedAt?: string;
}

export interface DataExportFriendBlock {
  blockedUserId: string;
  blockedAt: string;
}

export interface DataExportUsernameRequest {
  requestedUsername: string;
  status: string;
  requestedAt: string;
}

export interface DataExportAuditEntry {
  action: string;
  actorUsername: string;
  reason: string | null;
  createdAt: string;
}

export interface DataExportPayload {
  exportedAt: string;
  version: '1.0';
  user: DataExportUser;
  worldMemberships: DataExportWorldMembership[];
  friendships: DataExportFriendship[];
  friendBlocks: DataExportFriendBlock[];
  pendingUsernameRequest: DataExportUsernameRequest | null;
  adminAuditLog: DataExportAuditEntry[];
}
