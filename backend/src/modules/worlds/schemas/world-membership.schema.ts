import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { WorldRole } from '../interfaces/world-membership.interface';

export type WorldMembershipDocument =
  HydratedDocument<WorldMembershipSchemaClass>;

@Schema({ timestamps: false, collection: 'worldmemberships' })
export class WorldMembershipSchemaClass {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) worldId: string;
  @Prop({ type: Number, enum: WorldRole, default: WorldRole.Hrac })
  role: WorldRole;
  @Prop({ default: Date.now }) joinedAt: Date;
  @Prop() avatarUrl?: string;
  @Prop() characterPath?: string;
  @Prop() group?: string;
  /**
   * 6.8-followup — per-člen avatar vedení. V režimu `individual`
   * (`WorldSettings.pjChatPersona.mode`) vystupuje PJ/Pomocný PJ v chatu i headeru
   * s tímto obrázkem; chybí → fallback na avatar účtu. Self-service (vlastník).
   */
  @Prop({ type: String, default: undefined }) pjPersonaAvatarUrl?: string;
  @Prop({ default: false }) isFree: boolean;
  @Prop({ default: 0 }) akj: number;
  /** Krok 5.9 — uživatelské doladění vzhledu světa (přístupnost). */
  @Prop({ type: Object }) themeAdjust?: Record<string, number>;
  @Prop({ type: Object }) themeUserOverrides?: Record<string, string>;
  /**
   * 5.9b — per-člen vlastní MOTIV světa (override sdíleného `world.themeId`).
   * Platí JEN tomuto členovi, nikdy se nepropisuje do World. Absent/null =
   * dědí sdílený motiv PJ. Reverze 5.9 §5 (dřív skin uživatel neměnil).
   */
  @Prop({ type: String, default: undefined }) themeId?: string;
  /**
   * 5.9b — per-člen vlastní POZADÍ světa (override `world.themeBackgroundUrl`).
   * Funguje i samostatně (vlastní pozadí nad sdíleným motivem). Absent/null =
   * pozadí ze sdíleného motivu / vlastního zvoleného skinu.
   */
  @Prop({ type: String, default: undefined }) themeBackgroundUrl?: string;
  /**
   * 16.2c — per-člen skin deníku (per uživatel×svět). 7 stylů (sci-fi/fantasy/
   * horror/steampunk/nature/minimal/retro). Absent/undefined = dědí default dle
   * `world.system`. Self-service (vlastník membership).
   */
  @Prop({ type: String, default: undefined }) diarySkin?: string;
  /** Krok 6.2f — per-svět barva chatu (hex; null = dědit z globálního profilu). */
  @Prop({ type: String, default: null }) chatColor: string | null;
  /** Krok 6.2f — per-svět font chatu (klíč CHAT_FONT_KEYS; null = system fallback). */
  @Prop({ type: String, default: null }) chatFont: string | null;
  /** Krok 6.2f — per-svět velikost písma chatu (klíč CHAT_FONT_SIZE_KEYS; null = 1×). */
  @Prop({ type: String, default: null }) chatFontSize: string | null;
  /**
   * 16.1d — per-člen skin chatu (= motiv světa). Whitelist `WORLD_THEME_IDS`.
   * null = auto (dědí efektivní motiv světa). Self-service (vlastník membership).
   */
  @Prop({ type: String, default: null }) chatSkin: string | null;
  /**
   * Krok 6.3e — per-svět volba skinu kostek per typ
   * (`{ default: 'core-obsidian', '1d20': 'elemental-flame' }`).
   * `null` = default fallback (`core-obsidian`) pro všechny typy.
   */
  @Prop({ type: Object, default: null })
  diceSkinMapping: Record<string, string> | null;

  /**
   * Krok 6.3 D-NEW-dice-jail — pole skinů uvězněných hráčem (po smolných
   * hodech). Skiny v tomto seznamu se nezobrazují v hlavním gridu skin
   * pickeru, jen v záložce „Vězení". Memetic feature ze starého Matrixu.
   */
  @Prop({ type: [String], default: [] })
  jailedDiceSkins: string[];

  /**
   * 10.2-prep-1 — per-player scene assignment.
   * `null`/absent = hráč není přiřazený na žádnou scénu (klient zobrazí empty
   * state „PJ ti ještě nepřiřadil scénu"). Mění se výhradně přes `member.*` ops
   * v `worldOperations` (PJ-only, kromě `member.unassign` self-call).
   * Persistentní napříč session — hráč se po přihlášení vrací tam, kde byl.
   */
  @Prop({ type: String, default: null }) currentSceneId: string | null;

  /**
   * 6.7b/c — osobní stav chat sidebaru per hráč (nezávislý na globálním pořadí
   * a sbalení). Absence pole = fallback: pořadí dle globálního `order`, kanály
   * defaultně sbalené. `default: undefined` → dokud hráč nezasáhne, pole v DB
   * nevzniká.
   */
  @Prop({ type: [String], default: undefined }) chatGroupOrder?: string[];
  @Prop({ type: Object, default: undefined })
  chatChannelOrder?: Record<string, string[]>;
  @Prop({ type: [String], default: undefined }) chatExpandedGroups?: string[];
  /**
   * D-032 — osobní pořadí PŘIPNUTÝCH konverzací (`channelId` v cílovém pořadí).
   * Samotné připnutí je globální (`User.chatPreferences.pinnedChannelIds`),
   * pořadí je per-svět (zobrazují se jen pinned konverzace daného světa).
   */
  @Prop({ type: [String], default: undefined }) chatPinnedOrder?: string[];

  /** Poslední otevřená konverzace (cross-device seed). `channelId`. */
  @Prop({ type: String, default: undefined })
  chatLastActiveChannelId?: string;
}

export const WorldMembershipSchema = SchemaFactory.createForClass(
  WorldMembershipSchemaClass,
);
WorldMembershipSchema.index({ userId: 1, worldId: 1 }, { unique: true });
WorldMembershipSchema.index({ worldId: 1 });
// 10.2-prep-1 — PJ orchestrator query „kdo je aktuálně na scéně X".
WorldMembershipSchema.index({ worldId: 1, currentSceneId: 1 });
