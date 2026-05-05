import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveIkarosMessageDto {
  @IsBoolean()
  accept: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;

  @IsOptional() @IsNumber()
  role?: number;

  @IsOptional() @IsString()
  group?: string;

  @IsOptional() @IsString()
  characterPath?: string;

  @IsOptional() @IsBoolean()
  isFree?: boolean;
}
