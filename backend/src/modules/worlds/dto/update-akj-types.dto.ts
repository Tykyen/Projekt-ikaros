import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AkjTypeDto } from './update-world-settings.dto';

/**
 * Krok 5.3d — dedikované DTO pro `PUT /worlds/:worldId/settings/akj-types`.
 * Vlastní endpoint (oproti plnému `PUT .../settings`), aby AKJ úrovně mohl
 * spravovat i PomocnyPJ, aniž by získal přístup ke zbytku WorldSettings.
 */
export class UpdateAkjTypesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AkjTypeDto)
  akjTypes: AkjTypeDto[];
}
