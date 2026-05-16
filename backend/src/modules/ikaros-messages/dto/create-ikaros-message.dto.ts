import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsMongoId,
} from 'class-validator';

export class CreateIkarosMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;

  @IsString()
  @MinLength(1)
  recipientId: string;

  @IsString()
  @MinLength(1)
  recipientName: string;

  /** 3.5 — pokud vyplněno, zpráva je odpověď ve vlákně rodiče. */
  @IsOptional()
  @IsMongoId()
  replyToId?: string;
}
