import type { WorldRole } from '../../worlds/interfaces/world-membership.interface';

/**
 * 16.1e — bojovník v combat rosteru konverzace. Discriminated union dle původu HP:
 *  - `character` (PC i NPC): HP/staty drží DENÍK postavy → tady jen reference (slug).
 *  - `bestie`: nemá deník → nese vlastní perzistentní instanci (snapshot z katalogu,
 *    editovatelné HP). Single source HP = `systemStats['health.current'|'health.max']`.
 */
export interface ChatCombatantBase {
  id: string;
  /** Řazení v liště (desc). */
  initiative: number;
  /** V boji (lišta) vs. mimo boj (bench). */
  inCombat: boolean;
  /** U `character` rozlišuje PC/NPC → visibility flag (R3). */
  isNpc?: boolean;
  createdAt: Date;
}

export interface ChatCharacterCombatant extends ChatCombatantBase {
  kind: 'character';
  /** Slug postavy/NPC — HP/staty se čtou live z deníku, nic se neduplikuje. */
  characterSlug: string;
}

export interface ChatBestieCombatant extends ChatCombatantBase {
  kind: 'bestie';
  /** Ref na katalogovou bestii (templateId). */
  bestieId: string;
  /** Snapshot jména (PJ může přejmenovat: „Skřet #2"). */
  name: string;
  imageUrl?: string;
  /** Snapshot per-system statů, editovatelné (health.current/max…). */
  systemStats: Record<string, unknown>;
  /** Snapshot schopností. */
  abilities: { name: string; description: string }[];
  /** Instance poznámky (ne katalogové lore). */
  notes: string;
}

export type ChatCombatant = ChatCharacterCombatant | ChatBestieCombatant;

/** 16.1e — stav boje konverzace (R6). Před `active` jen roster, žádné kolo/pointer. */
export interface ChatCombatState {
  active: boolean;
  round: number;
  currentCombatantId?: string;
}

/**
 * 16.1e — per-konverzace přepínač viditelnosti HP hráčům (R3, parita s mapou
 * scene.config). Chybí klíč = world default (16.1e-E) ?? `true`.
 */
export interface ChatCombatConfig {
  showHpPc?: boolean;
  showHpNpc?: boolean;
  showHpBestie?: boolean;
}

export interface ChatChannel {
  id: string;
  groupId: string | null;
  worldId: string | null;
  name: string;
  isGlobal: boolean;
  accessMode: 'all' | 'roles' | 'members';
  allowedRoles: WorldRole[];
  allowedMemberIds: string[];
  lastMessageAt?: Date;
  /** Zkrácený text poslední zprávy — náhled v sidebaru. */
  lastMessagePreview?: string;
  order: number;
  isDeleted: boolean;
  type: string;
  imageUrl?: string;
  /** 6.7a — userId hráče, jehož je tato konverzace soukromou linkou s vedením. */
  linkedMemberUserId?: string;
  /** 16.1e — combat roster konverzace (PC/NPC reference + bestie instance). */
  combatants?: ChatCombatant[];
  /** 16.1e — stav boje (R6). */
  combat?: ChatCombatState;
  /** 16.1e — per-konverzace viditelnost HP hráčům (R3). */
  chatCombatConfig?: ChatCombatConfig;
  createdAt: Date;
}
