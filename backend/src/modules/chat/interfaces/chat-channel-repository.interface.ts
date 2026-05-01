import type { ChatChannel } from './chat-channel.interface';

export interface IChatChannelRepository {
  findById(id: string): Promise<ChatChannel | null>;
  findByGroupId(groupId: string): Promise<ChatChannel[]>;
  findByWorldId(worldId: string): Promise<ChatChannel[]>;
  save(data: Partial<ChatChannel>): Promise<ChatChannel>;
  update(id: string, data: Partial<ChatChannel>): Promise<ChatChannel | null>;
  delete(id: string): Promise<boolean>;
  softDeleteByWorldId(worldId: string): Promise<void>;
}
