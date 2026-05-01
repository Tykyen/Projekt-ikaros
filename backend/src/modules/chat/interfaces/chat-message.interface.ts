export interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  overrideName?: string;
  overrideAvatarUrl?: string;
  content: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  rpDate?: string;
  replyToId?: string;
  replyToPreview?: string;
  replyToSenderName?: string;
  visibleTo?: string[];
  reactions: Record<string, string[]>;
  createdAt: Date;
  updatedAt: Date;
}
