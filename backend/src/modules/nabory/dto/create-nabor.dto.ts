import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NABOR_SYSTEM_IDS, NABOR_GENRES } from '../constants/rpg';

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
  // 19.3b — canonical id z nabídky, NE volný text (viz constants/rpg.ts).
  @IsOptional() @IsIn(NABOR_SYSTEM_IDS) system?: string;
  @IsOptional() @IsIn(NABOR_GENRES) genre?: string;
  @IsIn(MODES) mode: string;
  @IsOptional() @IsString() @MaxLength(60) place?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) seatsTotal?: number;
}
