import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RejectDiscussionDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;
}
