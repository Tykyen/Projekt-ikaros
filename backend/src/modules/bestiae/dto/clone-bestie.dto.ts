/**
 * 10.2d-prep-B — CloneBestieDto pro `POST /api/bestiae/:id/clone`.
 */
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CloneBestieDto {
  @IsIn(['user', 'world'])
  scope!: 'user' | 'world';

  @IsOptional()
  @IsString()
  worldId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  newName?: string;
}
