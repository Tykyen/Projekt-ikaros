import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateGameEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  worldId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, {
    message: 'date musí být ISO 8601 (YYYY-MM-DDTHH:mm...)',
  })
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(https?:\/\/|\/)/, {
    message: 'imageUrl musí být absolutní URL nebo cesta začínající /',
  })
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetGroup?: string | null;

  @IsOptional()
  @IsBoolean()
  groupOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmable?: boolean;
}
