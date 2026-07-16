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
const STATUSY = ['open', 'closed', 'expired'];

export class PatchNaborDto {
  @IsOptional() @IsString() @MaxLength(80) title?: string;
  @IsOptional() @IsString() @MaxLength(600) body?: string;
  @IsOptional() @IsIn(MOTIVY) motiv?: string;
  // 19.3b — canonical id z nabídky, NE volný text (viz constants/rpg.ts).
  @IsOptional() @IsIn(NABOR_SYSTEM_IDS) system?: string;
  @IsOptional() @IsIn(NABOR_GENRES) genre?: string;
  @IsOptional() @IsIn(MODES) mode?: string;
  @IsOptional() @IsString() @MaxLength(60) place?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) seatsTotal?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) seatsTaken?: number;
  @IsOptional() @IsIn(STATUSY) status?: string;
}
