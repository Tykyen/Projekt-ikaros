import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
  Min,
  Matches,
} from 'class-validator';

export class CreateGroupDto {
  @IsString() @MinLength(1) @MaxLength(64) name: string;
  @IsOptional() @IsNumber() @Min(0) order?: number;
  @IsOptional() @IsString() @MaxLength(512) imageUrl?: string;
  /** Krok 6.5c — slot `'0'..'11'`. */
  @IsOptional() @IsString() @Matches(/^([0-9]|1[01])$/) color?: string;
  /** Krok 6.5c — `[a-z0-9-]{1,32}`. */
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{1,32}$/) iconKey?: string;
}
