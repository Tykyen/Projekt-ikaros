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
  // 3.5 — threading
  conversationId: string;
  replyToId?: string;
  createdAt: Date;
  updatedAt: Date;
}
