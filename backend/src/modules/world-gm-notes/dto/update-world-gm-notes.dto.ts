import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateWorldGmNotesDto {
  @ApiProperty({ description: 'RichText obsah PJ poznámek (HTML)' })
  @IsString()
  content: string;
}
