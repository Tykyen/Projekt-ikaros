import { IsString, IsOptional, MinLength, MaxLength, IsIn, IsNumber } from 'class-validator';

export class CreateWorldDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsString() @MinLength(2) @MaxLength(40) slug: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @IsString() @IsIn(['public', 'open', 'private', 'closed']) accessMode?: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsNumber() playerCount?: number;
}
