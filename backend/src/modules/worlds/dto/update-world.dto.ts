import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  IsIn,
  IsUrl,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class UpdateWorldDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @IsArray() tones?: string[];
  @IsOptional() @IsString() playersWanted?: string;
  @IsOptional() @IsNumber() playerCount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(999) maxPlayers?: number | null;
  @IsOptional() @IsArray() dice?: string[];
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsString()
  @IsIn(['public', 'open', 'private', 'closed'])
  accessMode?: string;
}
