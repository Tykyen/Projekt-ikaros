import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
  IsBoolean,
} from 'class-validator';

/** 20.5 — nová konverzace admin chatu (zakládá jen Superadmin). */
export class CreatePlatformChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  /** true = konverzace pro VŠECHNY adminy (accessMode 'all'); jinak jen `memberIds`. */
  @IsOptional()
  @IsBoolean()
  allMembers?: boolean;

  /** userIds členů (kromě zakladatele, který je přidán automaticky). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
