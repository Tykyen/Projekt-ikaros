import type { ClientSession } from 'mongoose';
import type { CampaignPurchase } from './campaign-purchase.interface';

export interface ICampaignPurchaseRepository {
  findMany(
    filter: Record<string, unknown>,
    sort?: Record<string, unknown>,
  ): Promise<CampaignPurchase[]>;
  findById(id: string): Promise<CampaignPurchase | null>;
  /**
   * RC-E5 — volitelná `session` zařadí purchase log do `withTransaction` scope
   * nákupu (atomicita napříč účet/inventář/log).
   */
  create(
    data: Partial<CampaignPurchase>,
    session?: ClientSession,
  ): Promise<CampaignPurchase>;
  update(
    id: string,
    data: Partial<CampaignPurchase>,
  ): Promise<CampaignPurchase | null>;
  /**
   * RC-E2 fix — atomicky označí nákup jako vrácený JEN když je `status:'active'`.
   * Vrací aktualizovaný doc, nebo null když už nebyl aktivní (= souběžné storno
   * prohrálo závod). Brání double-refundu.
   */
  markRefundedIfActive(id: string): Promise<CampaignPurchase | null>;
}
