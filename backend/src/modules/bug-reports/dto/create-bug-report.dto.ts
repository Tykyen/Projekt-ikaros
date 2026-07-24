import {
  IsDefined,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Spec 25.1 — auto-kontext. `whitelist+forbidNonWhitelisted` je globálně ON,
 * takže FE musí poslat PŘESNĚ tato pole (jinak 400). `reporterId` NIKDY z body.
 */
export class BugReportContextDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  route?: string;

  @IsString()
  @MaxLength(500)
  url: string;

  @IsIn(['ikaros', 'world'])
  scope: 'ikaros' | 'world';

  @IsIn(['ikaros', 'world', 'tm'])
  speaker: 'ikaros' | 'world' | 'tm';

  @IsString()
  @IsOptional()
  worldId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  buildVersion?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  userAgent?: string;
}

/** Spec 25.1 — vytvoření hlášení chyby (anon i přihlášený). */
export class CreateBugReportDto {
  @IsString()
  @MaxLength(4000)
  text: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  // @IsDefined povinné: bez něj @ValidateNested chybějící `context` PŘESKOČÍ
  // (class-validator nevaliduje undefined) → propadne do Mongoose required → 500.
  @IsDefined()
  @ValidateNested()
  @Type(() => BugReportContextDto)
  context: BugReportContextDto;
}
