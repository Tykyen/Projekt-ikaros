import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
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
import type { PageSection } from '../../pages/interfaces/page.interface';
import type { PurchaseShopItemDto } from '../dto/purchase-shop-item.dto';
import { UserRole } from '../../users/interfaces/user.interface';

const AUTO_SECTION_TITLE = 'Nakoupeno z obchodu';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Krok 11.3 §5 — atomický nákup / storno přes 3 moduly (katalog ↔ účet ↔
 * vybavení). Sleva + převod počítá BE (autorita); FE číslo je jen náhled.
 *
 * Atomicita bez Mongo session: pořadí (1) inventář → (2) odečet z účtu;
 * při selhání kroku 2 se inventář kompenzuje (odebrání položky). Permission
 * na účet se ověří *předem* (`assertCanAdjust`), aby se nezapisoval inventář
 * zbytečně.
 */
@Injectable()
export class CampaignPurchaseService {
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
    buyerUserId: string,
    dto: PurchaseShopItemDto,
    buyerRole?: UserRole,
  ): Promise<{ purchase: CampaignPurchase; newBalance: number }> {
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
      buyerUserId,
      buyerRole,
    );
    if (!isStaff && character.userId !== buyerUserId)
      throw new ForbiddenException({
        code: 'NOT_YOUR_CHARACTER',
        message: 'Nakupovat smíš jen své postavě.',
      });

    // Permission na účet + jeho načtení (PJ ok; hráč jen owner s self-adjust).
    const account = await this.accountsService.assertCanAdjust(
      dto.accountId,
      buyerUserId,
      buyerRole,
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

    // (1) Přidej do vybavení.
    const { sectionId, itemId: invItemId } = await this.addToInventory(
      character,
      item.name,
      quantity,
      dto.sectionId,
    );

    // (2) Odečti z účtu (kompenzace vybavení při selhání).
    let accountTransactionId = '';
    let newBalance = account.balance;
    if (paidAmount > 0) {
      try {
        const reason =
          quantity > 1
            ? `Nákup: ${item.name} ×${quantity}`
            : `Nákup: ${item.name}`;
        const updatedAcc = await this.accountsService.adjust(
          dto.accountId,
          { amount: -paidAmount, reason },
          buyerUserId,
          buyerRole,
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
    }

    // (3) Purchase log.
    const purchase = await this.purchaseRepo.create({
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

    return { purchase, newBalance };
  }

  async refund(
    worldId: string,
    purchaseId: string,
    userId: string,
    userRole?: UserRole,
  ): Promise<{ purchase: CampaignPurchase; newBalance: number }> {
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
      userId,
      userRole,
    );
    if (!isStaff && character?.userId !== userId)
      throw new ForbiddenException({
        code: 'NOT_YOUR_CHARACTER',
        message: 'Storno smíš jen u svého nákupu.',
      });

    // Vrať peníze na účet (tolerantní k chybějícímu účtu při čtení balance).
    let newBalance = 0;
    if (purchase.paidAmount > 0) {
      const acc = await this.accountsService.adjust(
        purchase.accountId,
        {
          amount: purchase.paidAmount,
          reason: `Storno: ${purchase.itemSnapshot.name}`,
        },
        userId,
        userRole,
      );
      newBalance = acc.balance;
    } else {
      const acc = await this.accountsService
        .getAccount(purchase.accountId)
        .catch(() => null);
      newBalance = acc?.balance ?? 0;
    }

    // Odeber položku z vybavení — tolerantně (hráč ji mohl smazat ručně).
    if (character) {
      await this.removeFromInventory(
        character,
        purchase.inventorySectionId,
        purchase.inventoryItemId,
      ).catch(() => undefined);
    }

    const updated = await this.purchaseRepo.update(purchaseId, {
      status: 'refunded',
      refundedAt: new Date(),
    });
    return { purchase: updated as CampaignPurchase, newBalance };
  }

  async listPurchases(
    worldId: string,
    userId: string,
    characterId?: string,
    requesterRole?: UserRole,
  ): Promise<CampaignPurchase[]> {
    const filter: Record<string, unknown> = { worldId };
    const isStaff = await this.charactersService.isWorldStaff(
      worldId,
      userId,
      requesterRole,
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

  private async addToInventory(
    character: Character,
    name: string,
    quantity: number,
    sectionId?: string,
  ): Promise<{ sectionId: string; itemId: string }> {
    const inv = await this.subdocsService.getInventory(
      character.id,
      character.isNpc,
      character.kind,
    );
    const sections: PageSection[] = inv.sections.map((sec) => ({
      ...sec,
      items: [...sec.items],
    }));
    const newItem = { id: randomUUID(), text: name, quantity, note: '' };

    let target = sectionId
      ? sections.find((sec) => sec.id === sectionId)
      : undefined;
    if (!target)
      target = sections.find((sec) => sec.title === AUTO_SECTION_TITLE);

    if (target) {
      target.items.push(newItem);
    } else {
      target = {
        id: randomUUID(),
        title: AUTO_SECTION_TITLE,
        content: '',
        order: sections.length,
        isCollapsed: false,
        items: [newItem],
      };
      sections.push(target);
    }

    await this.subdocsService.updateInventory(character.id, { sections });
    return { sectionId: target.id, itemId: newItem.id };
  }

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
    await this.subdocsService.updateInventory(character.id, { sections });
  }
}
