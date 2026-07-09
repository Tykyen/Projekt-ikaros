import { IsIn, IsString, MaxLength } from 'class-validator';
import type { ModerationAppealOutcome } from '../interfaces/moderation-entities.interface';

/**
 * Spec 20B (B4a, DSA čl. 20) — přezkum odvolání JINÝM moderátorem.
 * ⚠️ Invariant `reviewerId != decision.moderatorId` se vynucuje v service
 * (moderátor nesmí přezkoumat vlastní rozhodnutí).
 *
 * `outcome`:
 *  - `upheld`     — rozhodnutí potvrzeno (zásah zůstává v platnosti),
 *  - `overturned` — rozhodnutí zrušeno (zásah se má vrátit zpět — enforcement B4b).
 */
export class ReviewAppealDto {
  @IsIn(['upheld', 'overturned'])
  outcome: ModerationAppealOutcome;

  @IsString()
  @MaxLength(2000)
  reviewerNote: string;
}
