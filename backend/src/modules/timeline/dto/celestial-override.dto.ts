import { IsString, IsNotEmpty } from 'class-validator';

export class CelestialOverrideDto {
  @IsString()
  @IsNotEmpty()
  bodyId: string;

  @IsString()
  value: string;
}
