export interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string;
  senderId: string;
  senderName: string;
  content: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
