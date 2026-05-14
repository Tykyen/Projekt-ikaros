import { IsString, IsNotEmpty } from 'class-validator';

export class InviteUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
