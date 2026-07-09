import type {
  ModerationAction,
  ReportCategory,
  ReportTargetType,
} from '../enums/moderation.enums';

/**
 * Fáze B4b — event-driven vynucení moderačních zásahů (M2–M7).
 *
 * `ModerationService.resolveReport` po zápisu rozhodnutí vyšle `moderation.enforce`
 * (jen pro akce M2–M7; M0/M1 nejsou zásah). `reviewAppeal` při `overturned`
 * vyšle `moderation.revert` se stejným payloadem z navázaného rozhodnutí.
 *
 * Listenery žijí v CÍLOVÝCH modulech (users = ban, content moduly = skrytí/smazání)
 * a ignorují `targetType`, který jim nepatří. Vzor `@OnEvent` + `EventEmitter2`
 * jako jinde v projektu (SystemEventsListener, universe, account transfer).
 */
export const MODERATION_ENFORCE_EVENT = 'moderation.enforce';
export const MODERATION_REVERT_EVENT = 'moderation.revert';

/**
 * Payload obou eventů. Denormalizováno z `moderation_decision` — listener nikdy
 * nesahá zpět do `moderation` modulu (jednosměrná závislost). `decisionId` je
 * pro korelaci v logu; `targetAuthorId`/`worldId` jsou volitelné (ne každý cíl
 * má autora / svět).
 */
export interface ModerationEnforcePayload {
  targetType: ReportTargetType;
  targetId: string;
  targetAuthorId?: string;
  worldId?: string;
  action: ModerationAction;
  /**
   * B5 — kategorie hlášení (DSA čl. 16). Denormalizováno z rozhodnutí, aby
   * listener v etickém kanálu poznal citlivé případy (`minor_safety`) bez
   * zpětné vazby do `moderation` modulu. Identita oznamovatele se NEpřenáší.
   */
  category?: ReportCategory;
  decisionId: string;
}
