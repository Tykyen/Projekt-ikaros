import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 8.5 — typy bloků v deníkovém schématu.
 *
 * BE legacy z presetů (krok 7d): `number | text | textarea`.
 * Nové UI typy (krok 8.5): `stat | bar | list`. Whitelist se otevírá pro oba.
 * FE renderer drží mapování (stat ≈ number).
 */
export const DIARY_BLOCK_TYPES = [
  'stat',
  'bar',
  'list',
  'text',
  'number',
  'textarea',
  // D-DIARY-3 — `image`: blok drží referenci na obrázek (avatar, ikona,
  // token); URL ukládáme v `config.imageUrl`. `customData[id]` může
  // override per-postava (vlastní obrázek konkrétního hráče), nebo zůstane
  // prázdné = renderuje se `config.imageUrl` ze schématu.
  'image',
  // D-DIARY-3 — `relation`: link na jinou postavu (přátelství, nepřátelství,
  // mentor). `customData[id]` drží slug cílové postavy; FE rezolvuje jméno+avatar
  // přes existující `useCharacter(slug)` hook a renderuje jako klikatelný link.
  'relation',
  // D-DIARY-3 — `formula`: computed value z jiných číselných bloků.
  // `config.expression` drží jednoduchý výraz typu `HP_current / HP_max * 100`.
  // Whitelist tokenů: čísla, jména bloků (key), +, -, *, /, (, ). Žádný
  // arbitrary JS eval — vlastní safe parser.
  'formula',
] as const;
export type DiaryBlockType = (typeof DIARY_BLOCK_TYPES)[number];

export class DiarySchemaBlockDto {
  /** Stabilní UUID — FE generuje při create bloku. BE ho jen ukládá. */
  @IsOptional() @IsString() id?: string;

  @IsString() @IsNotEmpty() @MaxLength(64) key: string;
  @IsString() @IsNotEmpty() @MaxLength(120) label: string;

  @IsString() @IsIn([...DIARY_BLOCK_TYPES]) type: string;

  @IsOptional() @IsObject() config?: Record<string, unknown>;

  @IsInt() @Min(0) order: number;

  @IsOptional() @IsString() @MaxLength(64) layoutArea?: string;
}

export class CreateDiarySchemaVersionDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DiarySchemaBlockDto)
  schema: DiarySchemaBlockDto[];
}
