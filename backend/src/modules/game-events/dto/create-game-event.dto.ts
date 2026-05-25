import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
  Min,
  Max,
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
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number;

  // 9.5+ — zoom v procentech (25–400, default null = 100 = cover).
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(400)
  imageZoom?: number;

  // 9.5+ — fit režim ('cover' default, 'contain' = vidět celý).
  @IsOptional()
  @IsIn(['cover', 'contain'])
  imageFit?: 'cover' | 'contain';

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
