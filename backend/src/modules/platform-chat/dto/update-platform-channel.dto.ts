import { IsString, MaxLength, IsOptional, IsArray } from 'class-validator';

/** 20.5 — úprava konverzace (přejmenování / správa členů; jen Superadmin). */
export class UpdatePlatformChannelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
