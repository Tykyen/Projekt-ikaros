import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  Min,
  ValidateNested,
} from 'class-validator';

/** Jedna položka v bulk reorderu (krok 6.5a/b). */
export class ReorderItemDto {
  @IsMongoId() id!: string;
  @IsInt() @Min(0) order!: number;
}

/** Bulk reorder body — `{ items: [{ id, order }, …] }`. */
export class ReorderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
