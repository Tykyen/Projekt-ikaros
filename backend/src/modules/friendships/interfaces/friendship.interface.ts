export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface Friendship {
  id: string;
  requesterId: string;
  recipientId: string;
  status: FriendshipStatus;
  requestedAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
}

export interface FriendBlock {
  id: string;
  blockerId: string;
  blockedId: string;
  blockedAt: Date;
}

export type FriendStatusKind =
  | 'self'
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'accepted'
  | 'blocked_by_me';
