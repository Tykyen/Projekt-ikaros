import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendFriendRequestDto {
  @ApiProperty({ description: 'Cílový userId' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  userId: string;
}
