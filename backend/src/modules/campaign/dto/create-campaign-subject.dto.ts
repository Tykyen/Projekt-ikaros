import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
} from 'class-validator';
import type {
  CampaignSubjectType,
  CampaignSubjectStatus,
} from '../interfaces/campaign-subject.interface';

export class CreateCampaignSubjectDto {
  @IsString() name: string;
  @IsOptional()
  @IsIn(['PC', 'NPC', 'LOCATION', 'ORG', 'FACTION', 'STATE', 'OTHER'])
  type?: CampaignSubjectType;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsIn(['active', 'archived']) status?: CampaignSubjectStatus;
  @IsOptional() @IsString() linkedPageSlug?: string;
  @IsOptional() @IsString() linkedCharacterSlug?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isShared?: boolean;
}
