import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

/**
 * 9.4-I — DTO pro PUT /worlds/:worldId/weather-generators/reorder.
 *
 * `orderedIds` MUSÍ obsahovat **všechny** generátory daného světa.
 * Service validuje, že:
 *  - počet IDs == počet generátorů světa
 *  - každé ID v poli existuje a patří do worldId
 *  - žádné duplicitní IDs
 */
export class ReorderGeneratorsDto {
  @ApiProperty({
    type: [String],
    description:
      'Seznam IDs generátorů v požadovaném pořadí. Index 0 = první karta na stránce.',
    example: ['60d5ecb74e3e2c3d8c5a1234', '60d5ecb74e3e2c3d8c5a5678'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderedIds!: string[];
}
