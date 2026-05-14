import type { ChatMessage } from './chat-message.interface';

export interface IChatMessageRepository {
  findById(id: string): Promise<ChatMessage | null>;
  findByChannelId(
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<ChatMessage[]>;
  countAfter(channelId: string, messageId: string): Promise<number>;
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
  ): Promise<number>;
}
