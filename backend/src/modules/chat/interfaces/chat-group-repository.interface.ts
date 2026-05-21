import type { ChatGroup } from './chat-group.interface';

export interface IChatGroupRepository {
  findById(id: string): Promise<ChatGroup | null>;
  findByWorldId(worldId: string): Promise<ChatGroup[]>;
  countByWorldId(worldId: string): Promise<number>;
  save(data: Partial<ChatGroup>): Promise<ChatGroup>;
  update(id: string, data: Partial<ChatGroup>): Promise<ChatGroup | null>;
  delete(id: string): Promise<boolean>;
  /** Krok 6.5a — bulk update pořadí kanálů (jedna `bulkWrite`). */
  bulkUpdateOrders(items: { id: string; order: number }[]): Promise<void>;
}
