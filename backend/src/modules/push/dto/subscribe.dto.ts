import { IsString, IsNotEmpty } from 'class-validator';

export class SubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
  @IsString() @IsNotEmpty() p256dh: string;
  @IsString() @IsNotEmpty() auth: string;
}

export class UnsubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
}
