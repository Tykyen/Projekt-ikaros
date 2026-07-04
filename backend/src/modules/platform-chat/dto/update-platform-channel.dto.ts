import {
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  IsBoolean,
} from 'class-validator';

/** 20.5 — úprava konverzace (přejmenování / správa členů; jen Superadmin). */
export class UpdatePlatformChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  /** true = přepnout na „všichni admini" (accessMode 'all'). */
  @IsOptional()
  @IsBoolean()
  allMembers?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
