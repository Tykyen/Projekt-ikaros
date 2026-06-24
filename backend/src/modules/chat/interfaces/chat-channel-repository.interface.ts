import type {
  ChatChannel,
  ChatCombatant,
  ChatCombatState,
  ChatCombatConfig,
} from './chat-channel.interface';

export interface IChatChannelRepository {
  findById(id: string): Promise<ChatChannel | null>;
  findGlobal(): Promise<ChatChannel | null>;
  /** Globální kanál podle `type` — rozlišuje Hospodu a Rozcestí I.–III. */
  findGlobalByType(type: string): Promise<ChatChannel | null>;
  findByGroupId(groupId: string): Promise<ChatChannel[]>;
  findByWorldId(worldId: string): Promise<ChatChannel[]>;
  save(data: Partial<ChatChannel>): Promise<ChatChannel>;
  update(id: string, data: Partial<ChatChannel>): Promise<ChatChannel | null>;
  delete(id: string): Promise<boolean>;
  softDeleteByWorldId(worldId: string): Promise<void>;
  restoreByWorldId(worldId: string): Promise<void>;
  /** Krok 6.5b — bulk update pořadí konverzací (jedna `bulkWrite`). */
  bulkUpdateOrders(items: { id: string; order: number }[]): Promise<void>;
  // 16.1e — atomické operace nad combat rosterem (race-safe per-instance).
  addCombatant(
    channelId: string,
    combatant: ChatCombatant,
  ): Promise<ChatChannel | null>;
  updateCombatant(
    channelId: string,
    combatantId: string,
    patch: Record<string, unknown>,
  ): Promise<ChatChannel | null>;
  removeCombatant(
    channelId: string,
    combatantId: string,
  ): Promise<ChatChannel | null>;
  setCombat(
    channelId: string,
    combat: ChatCombatState,
  ): Promise<ChatChannel | null>;
  setCombatConfig(
    channelId: string,
    config: ChatCombatConfig,
  ): Promise<ChatChannel | null>;
}
