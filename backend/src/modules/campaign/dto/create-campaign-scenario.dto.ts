import { IsString, IsOptional, IsArray, IsBoolean, IsObject } from 'class-validator';

export class CreateCampaignScenarioDto {
  @IsString() title: string;
  @IsOptional() @IsObject() contentData?: Record<string, unknown>;
  @IsOptional() @IsString() linkedPageSlug?: string;
  @IsOptional() @IsArray() subjectIds?: string[];
  @IsOptional() @IsArray() storylineIds?: string[];
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsBoolean() isShared?: boolean;
}
