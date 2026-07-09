import type { ReportTargetType } from '../enums/moderation.enums';
import type { ModerationDecision } from './moderation-entities.interface';

/** Spec 20B — repo pro kolekci `moderation_decisions` (moderační log, neměnný). */
export interface IModerationDecisionsRepository {
  create(data: Omit<ModerationDecision, 'id'>): Promise<ModerationDecision>;
  findById(id: string): Promise<ModerationDecision | null>;
  findByTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ModerationDecision[]>;
  /** Odůvodnění zásahů vůči autorovi (`decisions/mine`), nejnovější první. */
  findByAuthor(authorId: string): Promise<ModerationDecision[]>;
  /** Moderační log — paginovaně, nejnovější první. */
  findAll(offset: number, limit: number): Promise<ModerationDecision[]>;
  countAll(): Promise<number>;
  /** čl. 17 — označí, že bylo odesláno odůvodnění autorovi. */
  markAuthorNotified(id: string): Promise<void>;
  /** Označí, že oznamovatel dostal vyrozumění o vyřízení. */
  markReporterNotified(id: string): Promise<void>;
  /** B4a — naváže podané odvolání (jedno na rozhodnutí, DSA čl. 20). */
  setAppealId(decisionId: string, appealId: string): Promise<void>;
}
