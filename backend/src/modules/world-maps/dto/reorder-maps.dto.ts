import { IsArray, IsString } from 'class-validator';

export class ReorderMapsDto {
  @IsArray() @IsString({ each: true }) orderedIds: string[];
}
