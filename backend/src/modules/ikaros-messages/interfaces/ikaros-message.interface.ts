export type IkarosMessageActionType = '' | 'world_join_request';

export interface IkarosMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  subject: string;
  body: string;
  sentAtUtc: Date;
  isRead: boolean;
  deletedBySender: boolean;
  deletedByRecipient: boolean;
  actionType: IkarosMessageActionType;
  actionWorldId?: string;
  actionUserId?: string;
  actionResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}
