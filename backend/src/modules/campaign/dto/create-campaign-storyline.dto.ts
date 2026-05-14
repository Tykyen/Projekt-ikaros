import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
} from 'class-validator';
import type {
  CampaignStorylineLevel,
  CampaignStorylineStatus,
} from '../interfaces/campaign-storyline.interface';

export class CreateCampaignStorylineDto {
  @IsString() title: string;
  @IsOptional() @IsIn(['macro', 'mid', 'micro']) level?: CampaignStorylineLevel;
  @IsOptional()
  @IsIn(['active', 'dormant', 'escalating', 'climax', 'closed'])
  status?: CampaignStorylineStatus;
  @IsOptional() @IsString() phase?: string;
  @IsOptional() @IsString() summary?: string;
  @IsOptional() @IsString() whatHappened?: string;
  @IsOptional() @IsString() truth?: string;
  @IsOptional() @IsString() playersBelief?: string;
  @IsOptional() @IsString() gmIntent?: string;
  @IsOptional() @IsString() nextStep?: string;
  @IsOptional() @IsArray() subjectIds?: string[];
  @IsOptional() @IsArray() relationshipIds?: string[];
  @IsOptional() @IsBoolean() isShared?: boolean;
}
