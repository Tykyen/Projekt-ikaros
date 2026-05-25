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
  IsArray,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EventConfirmationDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsString()
  @MaxLength(128)
  userName!: string;
}

export class UpdateGameEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, {
    message: 'date musí být ISO 8601',
  })
  date?: string;

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
  @ValidateIf((o: UpdateGameEventDto) => o.imageFocalX !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number | null;

  @IsOptional()
  @ValidateIf((o: UpdateGameEventDto) => o.imageFocalY !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number | null;

  // 9.5+ — zoom 25–400, null = reset na default cover (100).
  @IsOptional()
  @ValidateIf((o: UpdateGameEventDto) => o.imageZoom !== null)
  @IsNumber()
  @Min(25)
  @Max(400)
  imageZoom?: number | null;

  // 9.5+ — fit režim ('cover' default, 'contain' = vidět celý). null = reset.
  @IsOptional()
  @ValidateIf((o: UpdateGameEventDto) => o.imageFit !== null)
  @IsIn(['cover', 'contain'])
  imageFit?: 'cover' | 'contain' | null;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventConfirmationDto)
  confirmedBy?: EventConfirmationDto[] | null;
}
