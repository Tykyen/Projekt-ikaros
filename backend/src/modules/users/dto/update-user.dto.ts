import { IsString, IsOptional, MaxLength, IsUrl, Matches, IsObject } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(32) displayName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @Matches(/^[a-z0-9-]+\/[a-z0-9-]+$/) characterPath?: string;
  @IsOptional() @IsString() @MaxLength(64) ikarosSkin?: string;
  @IsOptional() @IsString() @MaxLength(32) username?: string;
  @IsOptional() @IsObject() themeSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() chatPreferences?: Record<string, unknown>;
}
