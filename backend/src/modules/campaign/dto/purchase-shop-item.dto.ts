import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class PurchaseShopItemDto {
  @IsString() characterId: string;
  @IsString() accountId: string;
  @IsOptional() @IsNumber() @Min(1) quantity?: number;
  /** Cílová sekce inventáře; když chybí → auto „Nakoupeno z obchodu". */
  @IsOptional() @IsString() sectionId?: string;
}
