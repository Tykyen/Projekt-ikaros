import { IsEnum, IsString, MaxLength } from 'class-validator';
import { ModerationAction } from '../enums/moderation.enums';

/**
 * Spec 20B — vyřízení reportu (statement of reasons, DSA čl. 17).
 * B1: jen zaznamená `moderation_decision` + označí report resolved.
 * NEPROVÁDÍ cross-modul akci (skrytí/smazání/ban) — to je M4+ sub-krok.
 */
export class ResolveReportDto {
  @IsEnum(ModerationAction)
  action: ModerationAction;

  @IsString()
  @MaxLength(2000)
  reasonText: string;

  @IsString()
  legalOrPolicyGround: string;
}
