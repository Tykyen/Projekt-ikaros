import type {
  ModerationAction,
  ReportCategory,
  ReportTargetType,
} from '../enums/moderation.enums';

/**
 * Spec 20B — doménové entity modulu `moderation` (odděleno od Mongoose schémat,
 * pattern jako `IkarosDiscussionReport`). Repozitáře vracejí tyto typy.
 */

export type ContentReportStatus = 'pending' | 'triaged' | 'resolved';
export type ModerationAppealStatus = 'pending' | 'upheld' | 'overturned';
/** Výsledek přezkumu odvolání (B4a) — koncové stavy bez `pending`. */
export type ModerationAppealOutcome = Exclude<
  ModerationAppealStatus,
  'pending'
>;

/** Kolekce `content_reports` — nahlášený obsah. Reporty se NEMAŽOU (audit stopa). */
export interface ContentReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUrl?: string;
  worldId?: string;
  // Denormalizovaný snapshot obsahu — posílá FE (modul nezávisí na 11 cílových modulech).
  targetSnapshot: string;
  targetAuthorId?: string;
  targetAuthorName: string;
  category: ReportCategory;
  reason: string;
  // Reporter identita — volitelná (anonymní CSAM). NIKDY do výstupu při anonymous=true.
  reporterId?: string;
  reporterName?: string;
  reporterEmail?: string;
  goodFaith: boolean;
  evidence?: string;
  notifyMe: boolean;
  anonymous: boolean;
  status: ContentReportStatus;
  createdAtUtc: Date;
  ackSentAt?: Date;
  resolvedByModeratorId?: string;
  resolvedAtUtc?: Date;
}

/** Kolekce `moderation_decisions` — statement of reasons (DSA čl. 17). Nemaže se. */
export interface ModerationDecision {
  id: string;
  reportId?: string;
  targetType: ReportTargetType;
  targetId: string;
  targetSnapshot: string;
  worldId?: string;
  // Denormalizace z reportu — autor cíle (koho zásah notifikovat + `decisions/mine`)
  // a URL cíle (aby autor mohl na svůj (moderovaný) obsah přejít z odůvodnění).
  targetAuthorId?: string;
  targetUrl?: string;
  action: ModerationAction;
  reasonText: string;
  category?: ReportCategory;
  legalOrPolicyGround: string;
  automated: boolean;
  moderatorId: string;
  moderatorName: string;
  createdAtUtc: Date;
  authorNotifiedAt?: Date;
  reporterNotifiedAt?: Date;
  appealId?: string;
}

/** Kolekce `moderation_appeals` — odvolání (DSA čl. 20). Přezkum jiným moderátorem (B4a). */
export interface ModerationAppeal {
  id: string;
  decisionId: string;
  appellantId: string;
  appellantName: string;
  reason: string;
  status: ModerationAppealStatus;
  reviewerId?: string;
  reviewerNote?: string;
  createdAtUtc: Date;
  resolvedAtUtc?: Date;
}

/**
 * Spec 20B (B4a) — karta ve frontě přezkumu odvolání (`moderation_appeal`).
 * `action`/`targetType` jsou denormalizované z navázaného rozhodnutí (kontext
 * pro reviewera). Self-review (reviewer == moderátor) zastaví až review endpoint.
 */
export interface AppealReviewListItem {
  appealId: string;
  decisionId: string;
  appellantName: string;
  reason: string;
  action?: ModerationAction;
  targetType?: ReportTargetType;
  createdAt: string;
}

/**
 * Karta ve Zpracovat frontě (`content_report`). `reporterName` je `null`, pokud
 * byl report anonymní — identita oznamovatele se nesmí dostat k moderátorovi.
 */
export interface ContentReportListItem {
  reportId: string;
  targetType: ReportTargetType;
  targetUrl?: string;
  targetSnapshot: string;
  targetAuthorName: string;
  category: ReportCategory;
  reason: string;
  reporterName: string | null;
  createdAt: string;
}

/** Stav mého hlášení (pohled oznamovatele) — bez identity autora/cíle navíc. */
export interface MyReportItem {
  reportId: string;
  targetType: ReportTargetType;
  targetUrl?: string;
  category: ReportCategory;
  status: ContentReportStatus;
  createdAt: string;
}

/**
 * Spec 20B čl. 17 — odůvodnění zásahu vůči MÉMU obsahu (pohled autora,
 * `GET /moderation/decisions/mine`). Identita oznamovatele se NIKDY nevrací.
 * `appealId` = zda už autor podal odvolání (pro FE tlačítko „Odvolat se").
 */
export interface MyDecisionItem {
  decisionId: string;
  action: ModerationAction;
  reasonText: string;
  legalOrPolicyGround: string;
  category?: ReportCategory;
  targetType: ReportTargetType;
  targetUrl?: string;
  createdAt: string;
  appealId?: string;
}

/**
 * Spec 20B — položka moderačního logu (`GET /moderation/log`, reviewer-gated).
 * Plný auditní pohled na rozhodnutí (nejnovější první). Log se nikdy nemaže.
 */
export interface ModerationLogItem {
  decisionId: string;
  reportId?: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUrl?: string;
  action: ModerationAction;
  reasonText: string;
  legalOrPolicyGround: string;
  category?: ReportCategory;
  moderatorId: string;
  moderatorName: string;
  createdAt: string;
  authorNotifiedAt?: string;
  reporterNotifiedAt?: string;
  appealId?: string;
}
