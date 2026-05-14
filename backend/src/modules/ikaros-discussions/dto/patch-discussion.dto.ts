import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class PatchDiscussionDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  bulletin?: string;

  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;
}
