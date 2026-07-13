/**
 * 21.2a — CreateNameSetDto pro `POST /api/name-sets/community`. Zakládá sadu
 * jako NÁVRH. Jmenné seznamy = pole stringů (FE editor = textarea, jedno
 * jméno na řádek; dedup dělá service). Vzor: create-plant.dto.ts.
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FEMALE_SURNAME_RULES,
  NAME_SET_CATEGORIES,
  type FemaleSurnameRule,
  type NameSetCategory,
} from '../interfaces/name-set.interface';

/** Max položek jednoho seznamu (ochrana; cíl sad je ~800). */
export const NAME_LIST_MAX = 6000;

export class NameSetDemographyDto {
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  lifespanMult?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10_000)
  fertilityFrom?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10_000)
  fertilityTo?: number;
}

export class CreateNameSetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(NAME_SET_CATEGORIES)
  category!: NameSetCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  surnameNote?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NAME_LIST_MAX)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  maleNames?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NAME_LIST_MAX)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  femaleNames?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NAME_LIST_MAX)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  surnames?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NAME_LIST_MAX)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  epithets?: string[];

  @IsOptional()
  @IsIn(FEMALE_SURNAME_RULES)
  femaleSurnameRule?: FemaleSurnameRule;

  @IsOptional()
  @IsBoolean()
  frequencySorted?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => NameSetDemographyDto)
  demography?: NameSetDemographyDto;
}
