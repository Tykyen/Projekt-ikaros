import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RejectArticleDto {
  @IsString() @IsOptional() @MaxLength(1000)
  reason?: string;
}
