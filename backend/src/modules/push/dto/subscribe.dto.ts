import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
  @IsString() @IsNotEmpty() p256dh: string;
  @IsString() @IsNotEmpty() auth: string;
  /**
   * Předchozí endpoint při rotaci odběru (`pushsubscriptionchange`) — server ho
   * smaže, aby se nehromadily mrtvé subscriptions stejného zařízení.
   */
  @IsString() @IsOptional() oldEndpoint?: string;
}

export class UnsubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
}
