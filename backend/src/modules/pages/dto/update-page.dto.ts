import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString } from 'class-validator';
import { CreatePageDto } from './create-page.dto';

/**
 * 7.2k — UpdatePageDto rozšířen o `expectedUpdatedAt` optimistic concurrency
 * token. Klient hydratuje z `page.updatedAt` při načtení v editoru a posílá
 * zpátky. Service ho vyfiltruje před uložením do repo (není to Page field).
 */
export class UpdatePageDto extends PartialType(CreatePageDto) {
  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}
