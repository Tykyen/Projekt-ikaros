import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { logError } from '../../../common/logging/log-error.util';
import type { ICampaignShopItemRepository } from '../interfaces/campaign-shop-item-repository.interface';
import type { ICampaignShopGroupRepository } from '../interfaces/campaign-shop-group-repository.interface';
import type { ICampaignPurchaseRepository } from '../interfaces/campaign-purchase-repository.interface';
import type { CampaignPurchase } from '../interfaces/campaign-purchase.interface';
import type { CampaignShopItem } from '../interfaces/campaign-shop-item.interface';
import type { CampaignShopGroup } from '../interfaces/campaign-shop-group.interface';
import { CharacterAccountsService } from '../../character-subdocs/character-accounts.service';
import { CharacterSubdocsService } from '../../character-subdocs/character-subdocs.service';
import { WorldCurrenciesService } from '../../world-currencies/world-currencies.service';
import { CharactersService } from '../../characters/characters.service';
import type { Character } from '../../characters/interfaces/character.interface';
import type { PurchaseShopItemDto } from '../dto/purchase-shop-item.dto';
import type { RequestUser } from '../../../common/interfaces/request-user.interface';

const AUTO_SECTION_TITLE = 'Nakoupeno z obchodu';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Krok 11.3 §5 — atomický nákup / storno přes 3 moduly (katalog ↔ účet ↔
 * vybavení). Sleva + převod počítá BE (autorita); FE číslo je jen náhled.
 *
 * RC-E5 (race-condition audit) — nákup je 3 kroky (1) append do inventáře,
 * (2) odečet z účtu, (3) purchase log. Dřív bez transakce: pád kroku (3) nechal
 * peníze odečtené + položku v inventáři, ale BEZ purchase logu → nešlo stornovat
 * (nevratný částečný stav, peníze pryč). Teď: všechny 3 kroky v jediné
 * `withTransaction` (vzor RC-E3 — replica set) → pád kdekoli rollbackne vše.
 * Fallback bez replica setu (single-instance prod) = sekvenční s plnou
 * kompenzací (revert účtu + odebrání inventáře) i při selhání kroku (3).
 */
@Injectable()
export class CampaignPurchaseService {
  private readonly logger = new Logger(CampaignPurchaseService.name);

  constructor(
    @Inject('ICampaignShopItemRepository')
    private readonly shopRepo: ICampaignShopItemRepository,
    @Inject('ICampaignShopGroupRepository')
    private readonly shopGroupRepo: ICampaignShopGroupRepository,
    @Inject('ICampaignPurchaseRepository')
    private readonly purchaseRepo: ICampaignPurchaseRepository,
    private readonly accountsService: CharacterAccountsService,
    private readonly subdocsService: CharacterSubdocsService,
    private readonly currenciesService: WorldCurrenciesService,
    private readonly charactersService: CharactersService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /** Efektivní sleva %: položka > podskupina > skupina (nesčítá se). */
  private effectiveDiscount(
    item: Pick<CampaignShopItem, 'discountPercent'>,
    group: CampaignShopGroup | null,
    subgroup: CampaignShopGroup | null,
  ): number {
    let d = 0;
    if (item.discountPercent > 0) d = item.discountPercent;
    else if (subgroup && subgroup.discountPercent > 0)
      d = subgroup.discountPercent;
    else if (group && group.discountPercent > 0) d = group.discountPercent;
    return Math.min(100, Math.max(0, d));
  }

  async purchase(
    worldId: string,
    itemId: string,
    requester: RequestUser,
    dto: PurchaseShopItemDto,
  ): Promise<{ purchase: CampaignPurchase; newBalance: number }> {
    const buyerUserId = requester.id;
    const quantity =
      dto.quantity && dto.quantity > 0 ? Math.floor(dto.quantity) : 1;

    const item = await this.shopRepo.findById(itemId);
    if (!item || item.worldId !== worldId)
      throw new NotFoundException({
        code: 'CAMPAIGN_ITEM_NOT_FOUND',
        message: 'Položka nenalezena',
      });

    const character = await this.charactersService.findById(dto.characterId);
    if (!character || character.worldId !== worldId)
      throw new NotFoundException({
        code: 'CHARACTER_NOT_FOUND',
        message: 'Postava nenalezena',
      });

    // Hráč smí kupovat jen své postavě; PJ/staff komukoli.
    const isStaff = await this.charactersService.isWorldStaff(
      worldId,
      requester,
    );
    // FIX-5 (defense-in-depth) — mirror vzoru z characters.service.ts
    // (`isOwner = !character.isNpc && character.userId === requesterId`).
    // NPC nesmí nakupovat, i kdyby jí kvůli stale-userId bugu (convert
    // CP→NPC) zůstala userId shodná s buyerem.
    const isOwner = !character.isNpc && character.userId === buyerUserId;
    if (!isStaff && !isOwner)
      throw new ForbiddenException({
        code: 'NOT_YOUR_CHARACTER',
        message: 'Nakupovat smíš jen své postavě.',
      });

    // Permission na účet + jeho načtení (PJ ok; hráč jen owner s self-adjust).
    const account = await this.accountsService.assertCanAdjust(
      dto.accountId,
      requester,
    );
    if (account.worldId !== worldId)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    if (!account.ownerCharacterIds.includes(dto.characterId))
      throw new ForbiddenException({
        code: 'ACCOUNT_NOT_OWNED_BY_CHARACTER',
        message: 'Účet nepatří této postavě.',
      });

    // Cena po slevě + převod do měny účtu.
    const group = item.groupId
      ? await this.shopGroupRepo.findById(item.groupId)
      : null;
    const subgroup = item.subgroupId
      ? await this.shopGroupRepo.findById(item.subgroupId)
      : null;
    const discount = this.effectiveDiscount(item, group, subgroup);
    const unitEff = round4(item.price * (1 - discount / 100));
    const totalEff = round4(unitEff * quantity);

    const itemCurrency = item.currencyCode || account.currency;
    let paidAmount = totalEff;
    if (itemCurrency && account.currency && itemCurrency !== account.currency) {
      const conv = await this.currenciesService.convert(
        worldId,
        { amount: totalEff, from: itemCurrency, to: account.currency },
        buyerUserId,
      );
      paidAmount = conv.result;
    }
    paidAmount = round4(paidAmount);

    if (paidAmount > 0 && account.balance < paidAmount)
      throw new ConflictException({
        code: 'INSUFFICIENT_FUNDS',
        message: 'Na účtu není dostatek prostředků.',
        balance: account.balance,
        required: paidAmount,
      });

    const reason =
      quantity > 1 ? `Nákup: ${item.name} ×${quantity}` : `Nákup: ${item.name}`;

    // Lazy-create gate inventáře MIMO transakci (read-side; NPC/Lokace nemají
    // výbavu, PC subdoc se případně lazy-creatne) — nesmí být v tx kvůli
    // možnému lazy-create write konfliktu se session a re-checku rodiče.
    await this.subdocsService.getInventory(
      character.id,
      character.isNpc,
      character.kind,
    );

    // RC-E5 — všechny 3 zápisy (inventář / účet / purchase log) atomicky.
    // Buduje plný `purchaseData` payload sdílený mezi tx i fallback cestou.
    const buildPurchaseData = (
      accountTransactionId: string,
      sectionId: string,
      invItemId: string,
    ): Partial<CampaignPurchase> => ({
      worldId,
      characterId: dto.characterId,
      buyerUserId,
      shopItemId: itemId,
      itemSnapshot: {
        name: item.name,
        groupName: group?.name,
        subgroupName: subgroup?.name,
        unitPrice: item.price,
        currencyCode: itemCurrency,
        discountPercent: discount,
        referenceLink: item.referenceLink,
      },
      quantity,
      unitPriceOriginal: item.price,
      discountPercent: discount,
      accountId: dto.accountId,
      accountTransactionId,
      paidAmount,
      paidCurrency: account.currency,
      inventorySectionId: sectionId,
      inventoryItemId: invItemId,
      status: 'active',
    });

    const session = await this.connection.startSession();
    try {
      let result: { purchase: CampaignPurchase; newBalance: number } | null =
        null;
      try {
        await session.withTransaction(async () => {
          result = await this.runPurchaseSteps(
            { worldId, item, quantity, paidAmount, reason, dto, buyerUserId },
            buildPurchaseData,
            session,
          );
        });
      } catch (txErr) {
        const msg = (txErr as Error).message || '';
        // Replica set není (dev / single-instance prod) → sekvenční fallback
        // s plnou kompenzací (vzor RC-E3 `transferSequentialFallback`).
        if (
          msg.includes('replica set') ||
          msg.includes('Transaction numbers') ||
          msg.includes('IllegalOperation')
        ) {
          this.logger.warn(
            'Mongo replica set not available, falling back to sequential purchase with compensation (RC-E5).',
          );
          return await this.purchaseSequentialFallback(
            {
              worldId,
              item,
              quantity,
              paidAmount,
              reason,
              dto,
              buyerUserId,
              requester,
            },
            character,
            buildPurchaseData,
          );
        }
        throw txErr;
      }
      return result!;
    } finally {
      await session.endSession();
    }
  }

  /**
   * RC-E5 — 3 zápisové kroky nákupu v rámci jedné session (`withTransaction`).
   * Pád kdekoli → withTransaction abort → rollback všech tří. Drží invariant
   * „peníze se neztratí ani neduplikují": odečet z účtu a purchase log jsou
   * commitnuté výhradně společně.
   */
  private async runPurchaseSteps(
    ctx: {
      worldId: string;
      item: CampaignShopItem;
      quantity: number;
      paidAmount: number;
      reason: string;
      dto: PurchaseShopItemDto;
      buyerUserId: string;
    },
    buildPurchaseData: (
      accountTransactionId: string,
      sectionId: string,
      invItemId: string,
    ) => Partial<CampaignPurchase>,
    session: ClientSession,
  ): Promise<{ purchase: CampaignPurchase; newBalance: number }> {
    const { item, quantity, paidAmount, reason, dto, buyerUserId } = ctx;

    // (1) Append do inventáře.
    const { sectionId, itemId: invItemId } =
      await this.subdocsService.appendInventoryItem(
        dto.characterId,
        { text: item.name, quantity, note: '' },
        AUTO_SECTION_TITLE,
        dto.sectionId,
        session,
      );

    // (2) Odečet z účtu (atomický `$gte` floor; RC-E1).
    let accountTransactionId = '';
    let newBalance = ctx.item.price; // přepíše se níže
    if (paidAmount > 0) {
      const updatedAcc = await this.accountsService.debitIfSufficient(
        dto.accountId,
        paidAmount,
        reason,
        buyerUserId,
        null,
        session,
      );
      newBalance = updatedAcc.balance;
      accountTransactionId =
        updatedAcc.transactions[updatedAcc.transactions.length - 1]?.id ?? '';
    } else {
      // Položka zdarma — balance se nemění, načti aktuální.
      const acc = await this.accountsService.getAccount(dto.accountId);
      newBalance = acc.balance;
    }

    // (3) Purchase log — commit jen společně s odečtem.
    const purchase = await this.purchaseRepo.create(
      buildPurchaseData(accountTransactionId, sectionId, invItemId),
      session,
    );

    return { purchase, newBalance };
  }

  /**
   * RC-E5 — fallback bez replica setu (single-instance prod). Sekvenční s plnou
   * kompenzací: když selže odečet → odeber inventář; když selže purchase log →
   * vrať peníze (kredit) + odeber inventář. Invariant „peníze se neztratí" drží
   * i tady — částečný stav se vždy kompenzuje, nezůstane peníze-bez-logu.
   */
  private async purchaseSequentialFallback(
    ctx: {
      worldId: string;
      item: CampaignShopItem;
      quantity: number;
      paidAmount: number;
      reason: string;
      dto: PurchaseShopItemDto;
      buyerUserId: string;
      requester: RequestUser;
    },
    character: Character,
    buildPurchaseData: (
      accountTransactionId: string,
      sectionId: string,
      invItemId: string,
    ) => Partial<CampaignPurchase>,
  ): Promise<{ purchase: CampaignPurchase; newBalance: number }> {
    const { item, quantity, paidAmount, reason, dto, buyerUserId } = ctx;

    // (1) Append do inventáře.
    const { sectionId, itemId: invItemId } =
      await this.subdocsService.appendInventoryItem(
        dto.characterId,
        { text: item.name, quantity, note: '' },
        AUTO_SECTION_TITLE,
        dto.sectionId,
      );

    // (2) Odečet z účtu (kompenzace vybavení při selhání).
    let accountTransactionId = '';
    let newBalance = 0;
    if (paidAmount > 0) {
      try {
        const updatedAcc = await this.accountsService.debitIfSufficient(
          dto.accountId,
          paidAmount,
          reason,
          buyerUserId,
        );
        newBalance = updatedAcc.balance;
        accountTransactionId =
          updatedAcc.transactions[updatedAcc.transactions.length - 1]?.id ?? '';
      } catch (err) {
        await this.removeFromInventory(character, sectionId, invItemId).catch(
          () => undefined,
        );
        throw err;
      }
    } else {
      const acc = await this.accountsService.getAccount(dto.accountId);
      newBalance = acc.balance;
    }

    // (3) Purchase log — při selhání kompenzuj OBA předchozí kroky (RC-E5):
    // vrať peníze + odeber inventář, ať nezůstane peníze-bez-logu.
    try {
      const purchase = await this.purchaseRepo.create(
        buildPurchaseData(accountTransactionId, sectionId, invItemId),
      );
      return { purchase, newBalance };
    } catch (err) {
      if (paidAmount > 0) {
        try {
          // Kompenzační kredit zpět na účet (peníze se nesmí ztratit).
          await this.accountsService.adjust(
            dto.accountId,
            {
              amount: paidAmount,
              reason: `Storno (neúspěšný nákup): ${item.name}`,
            },
            ctx.requester,
          );
        } catch (revertErr) {
          logError(
            this.logger,
            `RC-E5 kompenzační revert účtu selhal pro ${dto.accountId} (paidAmount ${paidAmount}). Ruční oprava nutná.`,
            revertErr,
          );
        }
      }
      await this.removeFromInventory(character, sectionId, invItemId).catch(
        () => undefined,
      );
      throw err;
    }
  }

  async refund(
    worldId: string,
    purchaseId: string,
    requester: RequestUser,
  ): Promise<{ purchase: CampaignPurchase; newBalance: number }> {
    const userId = requester.id;
    const purchase = await this.purchaseRepo.findById(purchaseId);
    if (!purchase || purchase.worldId !== worldId)
      throw new NotFoundException({
        code: 'PURCHASE_NOT_FOUND',
        message: 'Nákup nenalezen',
      });
    if (purchase.status !== 'active')
      throw new ConflictException({
        code: 'PURCHASE_ALREADY_REFUNDED',
        message: 'Nákup už byl vrácen.',
      });

    const character = await this.charactersService.findById(
      purchase.characterId,
    );
    const isStaff = await this.charactersService.isWorldStaff(
      worldId,
      requester,
    );
    // FIX-5 (defense-in-depth) — viz `purchase`: NPC nesmí stornovat, i kdyby
    // jí zůstala stale userId shodná s požadavkem.
    const isOwner =
      !!character && !character.isNpc && character.userId === userId;
    if (!isStaff && !isOwner)
      throw new ForbiddenException({
        code: 'NOT_YOUR_CHARACTER',
        message: 'Storno smíš jen u svého nákupu.',
      });

    // RC-E2 fix — atomický flip statusu PŘED kreditem. Souběžná storna téhož
    // nákupu: jen jedno projde filtrem `{status:'active'}` → peníze se vrátí
    // max 1×. (Brzký `status!=='active'` check výše zůstává jako rychlá pojistka.)
    const flipped = await this.purchaseRepo.markRefundedIfActive(purchaseId);
    if (!flipped)
      throw new ConflictException({
        code: 'PURCHASE_ALREADY_REFUNDED',
        message: 'Nákup už byl vrácen.',
      });

    // Vrať peníze na účet (tolerantní k chybějícímu účtu při čtení balance).
    // DUR (styl 43) — kredit je PO atomickém flipu statusu. Když selže, vrať
    // status na 'active' (kompenzace), ať storno nezůstane 'refunded' bez peněz
    // = trvalá ztráta + hráč navždy zablokován `PURCHASE_ALREADY_REFUNDED`.
    // (Reziduum: pád procesu PŘESNĚ mezi flipem a kreditem řeší jen plná
    // transakce — vyžaduje session-threading přes accountsService.adjust; dluh.)
    let newBalance = 0;
    try {
      if (purchase.paidAmount > 0) {
        const acc = await this.accountsService.adjust(
          purchase.accountId,
          {
            amount: purchase.paidAmount,
            reason: `Storno: ${purchase.itemSnapshot.name}`,
          },
          requester,
        );
        newBalance = acc.balance;
      } else {
        const acc = await this.accountsService
          .getAccount(purchase.accountId)
          .catch(() => null);
        newBalance = acc?.balance ?? 0;
      }
    } catch (err) {
      await this.purchaseRepo
        .markActiveIfRefunded(purchaseId)
        .catch(() => undefined);
      throw err;
    }

    // Odeber položku z vybavení — tolerantně (hráč ji mohl smazat ručně).
    if (character) {
      await this.removeFromInventory(
        character,
        purchase.inventorySectionId,
        purchase.inventoryItemId,
      ).catch(() => undefined);
    }

    return { purchase: flipped, newBalance };
  }

  async listPurchases(
    worldId: string,
    requester: RequestUser,
    characterId?: string,
  ): Promise<CampaignPurchase[]> {
    const userId = requester.id;
    const filter: Record<string, unknown> = { worldId };
    const isStaff = await this.charactersService.isWorldStaff(
      worldId,
      requester,
    );
    if (isStaff) {
      if (characterId) filter.characterId = characterId;
    } else {
      // N-24 — hráč může mít víc postav; vidí nákupy všech svých postav.
      // characterId (pokud zadán) se respektuje jen když patří hráči.
      const characters = await this.charactersService.findUserCharacters(
        userId,
        worldId,
      );
      const ids = characters.map((c) => c.id);
      if (ids.length === 0) return [];
      filter.characterId =
        characterId && ids.includes(characterId) ? characterId : { $in: ids };
    }
    return this.purchaseRepo.findMany(filter);
  }

  // ── Inventář helpers ───────────────────────────────────────────────────

  private async removeFromInventory(
    character: Character,
    sectionId: string,
    itemId: string,
  ): Promise<void> {
    const inv = await this.subdocsService.getInventory(
      character.id,
      character.isNpc,
      character.kind,
    );
    const sections = inv.sections.map((sec) =>
      sec.id === sectionId
        ? { ...sec, items: sec.items.filter((it) => it.id !== itemId) }
        : sec,
    );
    // FIX-12 — updateInventory nyní vyžaduje isNpc/kind (stejná brána jako getInventory).
    await this.subdocsService.updateInventory(
      character.id,
      { sections },
      character.isNpc,
      character.kind,
    );
  }
}
