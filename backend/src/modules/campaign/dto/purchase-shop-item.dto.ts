import { IsString, IsOptional, IsNumber, IsUUID, Min } from 'class-validator';

export class PurchaseShopItemDto {
  @IsString() characterId: string;
  @IsString() accountId: string;
  @IsOptional() @IsNumber() @Min(1) quantity?: number;
  /** Cílová sekce inventáře; když chybí → auto „Nakoupeno z obchodu". */
  @IsOptional() @IsString() sectionId?: string;
  /**
   * D-PURCHASE-IDEMPOTENCY — klientský nonce (UUID v4, vzor chat 6.2h).
   * Retry / double-click se stejným nonce = replay 1. nákupu, NE 2. odečet.
   * Volitelný kvůli zpětné kompatibilitě (FE ho začne posílat později).
   */
  @IsOptional() @IsUUID() clientNonce?: string;
}
