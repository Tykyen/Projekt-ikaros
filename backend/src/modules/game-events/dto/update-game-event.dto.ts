import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
  IsArray,
  ValidateNested,
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
