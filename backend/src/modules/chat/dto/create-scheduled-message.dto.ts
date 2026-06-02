import {
  IsString,
  IsOptional,
  IsArray,
  IsDateString,
  MaxLength,
} from 'class-validator';

/**
 * 11.2-ext F — vstup pro naplánování zprávy. `ownerId/Name/Role` se neposílají
 * (server z auth user). `sendAt` ISO string (budoucnost — ověřeno v controlleru).
 */
export class CreateScheduledMessageDto {
  @IsString() channelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string;

  @IsOptional()
  @IsArray()
  attachments?: unknown[];

  @IsDateString() sendAt!: string;
}
