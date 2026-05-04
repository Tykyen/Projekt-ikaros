import { IsString, IsOptional, IsArray, IsBoolean, IsIn } from 'class-validator';

export class CreateCampaignQuickNoteDto {
  @IsString() title: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsIn(['open', 'done']) status?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsArray() subjectIds?: string[];
  @IsOptional() @IsArray() storylineIds?: string[];
  @IsOptional() @IsBoolean() isShared?: boolean;
}
