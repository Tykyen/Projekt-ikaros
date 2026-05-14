import {
  IsString,
  IsOptional,
  IsArray,
  MinLength,
  MaxLength,
  IsIn,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateWorldDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsString() @MinLength(2) @MaxLength(40) slug: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tones?: string[];
  @IsOptional() @IsString() @MaxLength(500) playersWanted?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dice?: string[];
  @IsOptional()
  @IsString()
  @IsIn(['public', 'open', 'private', 'closed'])
  accessMode?: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsNumber() playerCount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(999) maxPlayers?: number;
}
