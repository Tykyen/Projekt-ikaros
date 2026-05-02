import { IsString, MinLength, MaxLength, IsOptional, IsArray } from 'class-validator';

export class CreateGlobalMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  content: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  visibleTo?: string[];
}
