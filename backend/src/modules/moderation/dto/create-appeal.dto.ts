import { IsString, MaxLength } from 'class-validator';

/**
 * Spec 20B (B4a, DSA čl. 20) — podání odvolání proti moderačnímu rozhodnutí.
 * Odvolání smí podat JEN autor moderovaného obsahu (guard v service dle
 * `decision.targetAuthorId`). `appellantId`/`appellantName` se berou z tokenu,
 * NIKDY z body.
 */
export class CreateAppealDto {
  @IsString()
  @MaxLength(2000)
  reason: string;
}
