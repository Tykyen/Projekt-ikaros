import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsArray,
} from 'class-validator';

/** 20.5 — nová konverzace admin chatu (zakládá jen Superadmin). */
export class CreatePlatformChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  /** userIds členů (kromě zakladatele, který je přidán automaticky). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
