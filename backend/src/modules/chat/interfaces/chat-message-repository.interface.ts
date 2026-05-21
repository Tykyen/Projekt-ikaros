import type { ChatMessage } from './chat-message.interface';
import type { ChatAttachment } from './chat-attachment.interface';

export interface IChatMessageRepository {
  findById(id: string): Promise<ChatMessage | null>;
  findByChannelId(
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<ChatMessage[]>;
  countAfter(channelId: string, messageId: string): Promise<number>;
  /** D-NEW-chat-mention-sidebar-dot — počet self-mention zpráv po last-read. */
  countMentionsAfter(
    channelId: string,
    messageId: string,
    userId: string,
  ): Promise<number>;
  /** Krok 6.6 — substring hledání v `content` napříč zadanými konverzacemi. */
  searchInChannels(
    channelIds: string[],
    query: string,
    limit: number,
  ): Promise<ChatMessage[]>;
  /** Krok 6.2h — idempotence: najde už uloženou zprávu se shodným nonce. */
  findByNonce(
    channelId: string,
    clientNonce: string,
  ): Promise<ChatMessage | null>;
  save(data: Partial<ChatMessage>): Promise<ChatMessage>;
  update(id: string, data: Partial<ChatMessage>): Promise<ChatMessage | null>;
  softDeleteByChannelId(channelId: string): Promise<void>;
  softDeleteByWorldId(worldId: string): Promise<void>;
  addReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<ChatMessage | null>;
  removeReaction(
    messageId: string,
    emoji: string,
    userId: string,
  ): Promise<ChatMessage | null>;
  pruneChannel(
    channelId: string,
    olderThan: Date,
    keepLast: number,
  ): Promise<{ deletedCount: number; attachments: ChatAttachment[] }>;
}
