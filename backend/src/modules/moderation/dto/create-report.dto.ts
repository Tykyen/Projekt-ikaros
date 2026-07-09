import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReportCategory, ReportTargetType } from '../enums/moderation.enums';

/**
 * Spec 20B — vytvoření reportu. `reporterId`/`reporterName` se berou z
 * `@CurrentUser`, NIKDY z body (anti-spoofing). Snapshot / autor / URL posílá FE.
 */
export class CreateReportDto {
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @IsString()
  targetId: string;

  @IsString()
  @IsOptional()
  targetUrl?: string;

  @IsString()
  @IsOptional()
  worldId?: string;

  @IsString()
  @MaxLength(5000)
  targetSnapshot: string;

  @IsString()
  targetAuthorName: string;

  @IsString()
  @IsOptional()
  targetAuthorId?: string;

  @IsEnum(ReportCategory)
  category: ReportCategory;

  @IsString()
  @MaxLength(2000)
  reason: string;

  @IsEmail()
  @IsOptional()
  reporterEmail?: string;

  @IsBoolean()
  goodFaith: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  evidence?: string;

  @IsBoolean()
  notifyMe: boolean;

  @IsBoolean()
  anonymous: boolean;
}
