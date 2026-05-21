import { PartialType } from '@nestjs/mapped-types';
import { CreateWorldPageTemplateDto } from './create-world-page-template.dto';

/**
 * Update DTO — všechna pole optional. `key` lze měnit (s validací unikátnosti
 * v service vrstvě).
 */
export class UpdateWorldPageTemplateDto extends PartialType(
  CreateWorldPageTemplateDto,
) {}
