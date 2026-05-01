import type { ChatMessage } from './chat-message.interface';

export interface IChatMessageRepository {
  findById(id: string): Promise<ChatMessage | null>;
  findByChannelId(channelId: string, opts: { before?: string; limit: number }): Promise<ChatMessage[]>;
  countAfter(channelId: string, messageId: string): Promise<number>;
  save(data: Partial<ChatMessage>): Promise<ChatMessage>;
  update(id: string, data: Partial<ChatMessage>): Promise<ChatMessage | null>;
  softDeleteByWorldId(worldId: string): Promise<void>;
}
