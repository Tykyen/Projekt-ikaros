import { IsOptional, IsString } from 'class-validator';

export class ConvertCharacterDto {
  @IsOptional() @IsString() userId?: string;
}
