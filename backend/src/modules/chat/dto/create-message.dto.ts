import { IsString, MinLength, MaxLength, IsOptional, IsArray, Matches, IsUrl } from 'class-validator';

export class CreateMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content: string;

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'rpDate musí být ve formátu YYYY-MM-DD' })
  rpDate?: string;

  @IsOptional() @IsString() @MaxLength(24)
  replyToId?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  visibleTo?: string[];

  @IsOptional() @IsString() @MaxLength(64)
  overrideName?: string;

  @IsOptional() @IsUrl() @MaxLength(512)
  overrideAvatarUrl?: string;
}
