import type { ChatAttachment } from './chat-attachment.interface';

export interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string | null;
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
  attachments?: ChatAttachment[];
  expiresAt?: Date;
  customFont?: string | null;
  isDiceRoll?: boolean;
  color?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
