import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorldCurrencyItemDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @Matches(/^[A-Z0-9]{1,8}$/) @MaxLength(8) code: string;
  @IsString() @MinLength(1) @MaxLength(40) name: string;
  @IsString() @MaxLength(8) symbol: string;
  @IsNumber() @Min(0.0001) @Max(1000000) rate: number;
}

export class UpdateWorldCurrenciesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorldCurrencyItemDto)
  items: WorldCurrencyItemDto[];
}
