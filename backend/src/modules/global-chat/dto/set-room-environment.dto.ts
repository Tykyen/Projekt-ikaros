import { IsIn, IsString, Matches } from 'class-validator';

/** Změna sdíleného prostředí Rozcestí — viz spec 4.2a §4.3. */
export class SetRoomEnvironmentDto {
  @IsIn(['fantasy', 'scifi', 'mystic'])
  style: 'fantasy' | 'scifi' | 'mystic';

  /** ID lokace '1'–'20' (20 lokací na styl). */
  @IsString()
  @Matches(/^([1-9]|1[0-9]|20)$/, { message: 'placeId musí být 1–20' })
  placeId: string;
}
