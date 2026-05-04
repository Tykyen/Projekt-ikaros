import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export class CreateCampaignStorylineDto {
  @IsString() title: string;
  @IsOptional() @IsIn(['macro', 'mid', 'micro']) level?: string;
  @IsOptional() @IsIn(['active', 'dormant', 'escalating', 'climax', 'closed']) status?: string;
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
