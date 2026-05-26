import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 9.4 — Explicit set in-game date pro svět.
 *
 * `year` může být negativní (BCE). Gregorian-equivalent Date je konstruován
 * pres `setUTCFullYear(year, monthIndex, day)`. Pro custom kalendář se
 * monthIndex validuje proti `calendar.months.length` v service.
 */
export class SetInGameDateDto {
  @ApiProperty({
    description: 'Gregorian rok (může být negativní = BCE).',
    example: 2026,
  })
  @IsInt()
  @Min(-25000)
  @Max(99999)
  year!: number;

  @ApiProperty({
    description:
      '0-based měsíc (0=leden v Gregoriánu, custom kalendář 0..N-1).',
    example: 4,
  })
  @IsInt()
  @Min(0)
  @Max(36) // max 37 měsíců fantasy kalendář
  monthIndex!: number;

  @ApiProperty({ description: '1-based den v měsíci.', example: 15 })
  @IsInt()
  @Min(1)
  @Max(40) // max 40 dní fantasy
  day!: number;

  @ApiProperty({
    required: false,
    description: 'Hodina (0-23). Pokud chybí, použije se 12 (poledne).',
    example: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @ApiProperty({
    required: false,
    description: 'Minuta (0-59). Pokud chybí, použije se 0.',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  minute?: number;

  @ApiProperty({
    required: false,
    default: false,
    description:
      'Pokud true, BE vygeneruje weather pro všechny generátory světa s novým datem.',
  })
  @IsOptional()
  @IsBoolean()
  regenerateAll?: boolean;
}
