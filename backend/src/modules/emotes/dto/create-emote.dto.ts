import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateEmoteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @Matches(/^[a-z0-9_]{2,32}$/, {
    message: 'Shortcode musí obsahovat jen a-z, 0-9, _ a mít 2–32 znaků',
  })
  shortcode: string;

  @IsString()
  @IsNotEmpty()
  imageId: string;
}
