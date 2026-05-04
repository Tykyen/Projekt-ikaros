import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export class CreateCampaignSubjectDto {
  @IsString() name: string;
  @IsOptional() @IsIn(['PC', 'NPC', 'LOCATION', 'ORG', 'FACTION']) type?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsIn(['active', 'archived']) status?: string;
  @IsOptional() @IsString() linkedPageSlug?: string;
  @IsOptional() @IsString() linkedCharacterSlug?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
