import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorldCurrencyItemDto {
  @IsOptional() @IsString() id?: string;
  @IsString() code: string;
  @IsString() name: string;
  @IsString() symbol: string;
  @IsNumber() @Min(0.0001) rate: number;
}

export class UpdateWorldCurrenciesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorldCurrencyItemDto)
  items: WorldCurrencyItemDto[];
}
