import type { ChatAttachment } from './chat-attachment.interface';

/**
 * 16.5c — reference na interaktivní mapu atlasu poslanou do chatu. Neukládá
 * obrázek ani piny — jen odkaz; FE dopočítá náhled/piny z živé mapy dle
 * viditelnosti příjemce (leak-safe). `title` = snapshot pro fallback, když mapa
 * zmizí / není dostupná.
 */
export interface ChatMapRef {
  worldMapId: string;
  worldId: string;
  title: string;
}

/** Výsledek hledání ve zprávách (krok 6.6). */
export interface ChatSearchResult {
  messageId: string;
  channelId: string;
  channelName: string;
  senderName: string;
  /** D-040 — tombstone overlay v search results stejně jako u běžných zpráv. */
  senderIsDeleted?: boolean;
  content: string;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  worldId: string | null;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  /**
   * D-040 — true znamená že platformový účet odesílatele byl anonymizován
   * (hard cleanup). FE rendruje tombstone overlay + „Smazaný účet" label místo
   * původního displayName. Default `false` pro nové zprávy (živý autor) a pro
   * historické zprávy bez enrich (zpětná kompatibilita).
   */
  senderIsDeleted?: boolean;
  overrideName?: string;
  overrideAvatarUrl?: string;
  /** 6.2-followup — slug karty (Page) NPC/postavy pro klikací jméno v chatu. */
  overridePageSlug?: string;
  content: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  /** Systémová zpráva (příchod/odchod uživatele) — FE ji renderuje jinak. */
  isSystem?: boolean;
  /** Spec 15.8 — zpráva od hosta (anonyma) v Hospodě (odznak „host" na FE). */
  isAnonymous?: boolean;
  rpDate?: string;
  replyToId?: string;
  replyToPreview?: string;
  replyToSenderName?: string;
  visibleTo?: string[];
  reactions: Record<string, string[]>;
  attachments?: ChatAttachment[];
  /** 16.5c — poslaná interaktivní mapa (odkaz, ne obrázek). */
  mapRef?: ChatMapRef | null;
  expiresAt?: Date;
  customFont: string | null;
  /** Krok 6.2f — klíč CHAT_FONT_SIZE_KEYS (xs/sm/normal/lg/xl/xxl); null = 1×. */
  customFontSize: string | null;
  color: string | null;
  isDiceRoll: boolean;
  /** Krok 6.2h — klientský nonce pro idempotentní retry (UUID v4). */
  clientNonce?: string | null;
  /** Krok 6.2i — userIds, kteří jsou v textu zmíněni (`@username`). */
  mentions: string[];
  /**
   * Krok 6.3d — strukturovaná data hodu kostkou pro 3D render
   * (faces, total, type, modifier, ...). `null` u nediceových zpráv.
   */
  dicePayload: Record<string, unknown> | null;
  /**
   * Krok 6.3e — skin použitý odesílatelem v okamžiku hodu (zafixované, aby
   * ostatní hráči viděli stejnou kostku). `null` u nediceových zpráv nebo
   * když odesílatel nevybral (= default `core-obsidian`).
   */
  diceSkin: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Spec 13.2a — položka „Souhrn chatů": zpráva napříč všemi mými světy obohacená
 * o název světa a kanálu (kvůli grupování ve FE centru). Cross-world agregace,
 * access-safe (server vrací jen kanály, kam mám přístup).
 */
export interface ChatFeedItem extends ChatMessage {
  worldName: string;
  /** Slug světa — pro deep-link z notifikačního feedu na `/svet/:slug/chat`. */
  worldSlug: string;
  channelName: string;
}
