import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STRANY = ['hledam-hru', 'hledam-hrace'];
const MOTIVY = [
  'fantasy',
  'dark-fantasy',
  'vesmir',
  'cyberpunk',
  'steampunk',
  'apokalypsa',
  'horor',
  'mystery',
  'historie',
  'moderni',
  'western',
  'ikaros',
];
const MODES = ['online', 'zivo'];

export class CreateNaborDto {
  @IsIn(STRANY) strana: string;
  @IsIn(MOTIVY) motiv: string;
  @IsOptional() @IsString() worldId?: string;
  @IsString() @MaxLength(80) title: string;
  @IsString() @MaxLength(600) body: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) system?: string;
  @IsIn(MODES) mode: string;
  @IsOptional() @IsString() @MaxLength(60) place?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) seatsTotal?: number;
}
