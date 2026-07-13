import {
  IsArray,
  IsDateString,
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

  /**
   * D-NEW-INV-DATA-SYNC (vzor 7.2k/D-073) — optimistic concurrency token.
   * PUT je záměrně full-replace (FE posílá vždy KOMPLETNÍ sadu; smazání měny
   * = poslání pole bez ní). Klient hydratuje z `updatedAt` posledního GET;
   * při souběžné změně vrátí BE 409 `CURRENCY_CONFLICT` místo tichého
   * přepsání (ztráta cizí měny). Optional — klient bez tokenu má legacy
   * chování bez checku.
   */
  @IsOptional() @IsDateString() expectedUpdatedAt?: string;
}
