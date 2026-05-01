import { IsString, IsOptional, MaxLength, IsUrl, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(32) displayName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @Matches(/^[a-z0-9-]+\/[a-z0-9-]+$/) characterPath?: string;
  @IsOptional() @IsString() @MaxLength(64) ikarosSkin?: string;
}
