import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CharacterAccountsService } from './character-accounts.service';
import { CharactersService } from '../characters/characters.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import type { FantasyDateLike } from './interfaces/character-account.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

interface CreateAccountBody {
  label: string;
  /** Default = primary; pro shared lze přidat další postavy. */
  ownerCharacterIds?: string[];
  currency: string;
  accountType?: string;
  accessLocationCharacterId?: string | null;
  notes?: string;
}

interface UpdateAccountBody {
  label?: string;
  notes?: string;
  incomeEntries?: { id: string; label: string; amount: number }[];
  expenseEntries?: { id: string; label: string; amount: number }[];
  // Settings — PJ-only (service hlídá)
  accountType?: string;
  accessLocationCharacterId?: string | null;
  currency?: string;
  /** Spec 8.x-prep §4.3 (B3) — povolit hráči-vlastníkovi vlastní adjust. */
  allowPlayerSelfAdjust?: boolean;
}

interface TransferBody {
  toAccountId: string;
  amount: number;
  description: string;
  /** Spec 8.x-prep §4.4 (B4) — herní datum. */
  inGameDate?: FantasyDateLike | null;
}

interface AddMonthlyBody {
  /** Spec 8.x-prep §4.4 (B4) — herní datum. Optional, FE typicky pošle. */
  inGameDate?: FantasyDateLike | null;
}

interface CoOwnerBody {
  characterId: string;
}

interface ChangeCurrencyBody {
  currency: string;
  /** true = přepočítat kurzem; false = jen přeznačit (změnit kód měny). */
  convert: boolean;
}

/**
 * 8.6 — REST API pro per-postava finanční účty (multi-account, shared, transfer).
 * Permission rozhoduje service per akce (read / write-content / write-settings / delete).
 *
 * Routy jsou pod `worlds/:worldId` jako sourozenec `character-subdocs.controller.ts`.
 * Account ID je opaque MongoDB id (ne slug); listing & create jdou přes slug postavy.
 */
@ApiTags('Character Accounts')
@ApiBearerAuth()
@Controller('worlds/:worldId')
@UseGuards(JwtAuthGuard)
export class CharacterAccountsController {
  constructor(
    private readonly accountsService: CharacterAccountsService,
    private readonly charactersService: CharactersService,
  ) {}

  @Get('characters/:slug/accounts')
  @ApiOperation({ summary: 'Seznam účtů postavy (včetně sdílených)' })
  @ApiResponse({ status: 200, description: 'OK' })
  async list(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    // Reuse subdoc access guard pro permission check na postavu.
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.accountsService.listAccountsForCharacter(character.id);
  }

  @Post('characters/:slug/accounts')
  @ApiOperation({ summary: 'Vytvořit nový účet pro postavu' })
  async create(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: CreateAccountBody,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.accountsService.createAccount(worldId, {
      label: body.label,
      primaryOwnerCharacterId: character.id,
      ownerCharacterIds: body.ownerCharacterIds,
      currency: body.currency,
      accountType: body.accountType,
      accessLocationCharacterId: body.accessLocationCharacterId,
      notes: body.notes,
    });
  }

  @Get('accounts/:accountId')
  @ApiOperation({ summary: 'Detail účtu' })
  async getOne(
    @Param('accountId') accountId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accountsService.assertReadAccess(accountId, user);
  }

  @Patch('accounts/:accountId')
  @ApiOperation({ summary: 'Update účtu (content nebo settings)' })
  async update(
    @Param('accountId') accountId: string,
    @Body() body: UpdateAccountBody,
    @CurrentUser() user: RequestUser,
  ) {
    // Rozdělíme patch na content (label/notes/entries) a settings (typ/měna/...)
    const contentKeys: (keyof UpdateAccountBody)[] = [
      'label',
      'notes',
      'incomeEntries',
      'expenseEntries',
    ];
    const settingsKeys: (keyof UpdateAccountBody)[] = [
      'accountType',
      'accessLocationCharacterId',
      'currency',
      'allowPlayerSelfAdjust',
    ];
    const hasContent = contentKeys.some((k) => body[k] !== undefined);
    const hasSettings = settingsKeys.some((k) => body[k] !== undefined);

    if (hasContent) {
      await this.accountsService.assertWriteContentAccess(accountId, user);
      await this.accountsService.updateAccountContent(accountId, {
        label: body.label,
        notes: body.notes,
        incomeEntries: body.incomeEntries,
        expenseEntries: body.expenseEntries,
      });
    }
    if (hasSettings) {
      await this.accountsService.assertWriteSettingsAccess(accountId, user);
      await this.accountsService.updateAccountSettings(accountId, {
        accountType: body.accountType,
        accessLocationCharacterId: body.accessLocationCharacterId,
        currency: body.currency,
        allowPlayerSelfAdjust: body.allowPlayerSelfAdjust,
      });
    }
    return this.accountsService.getAccount(accountId);
  }

  @Patch('accounts/:accountId/currency')
  @ApiOperation({
    summary: 'Změna měny účtu — přepočet kurzem nebo jen přeznačení',
  })
  @ApiResponse({ status: 400, description: 'CURRENCY_RATE_MISSING' })
  async changeCurrency(
    @Param('accountId') accountId: string,
    @Body() body: ChangeCurrencyBody,
    @CurrentUser() user: RequestUser,
  ) {
    await this.accountsService.assertWriteSettingsAccess(accountId, user);
    return this.accountsService.changeCurrency(
      accountId,
      body.currency,
      body.convert === true,
    );
  }

  @Delete('accounts/:accountId')
  @ApiOperation({ summary: 'Smazat účet' })
  async remove(
    @Param('accountId') accountId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.accountsService.assertDeleteAccess(accountId, user);
    await this.accountsService.deleteAccount(accountId);
    return { ok: true };
  }

  @Post('accounts/:accountId/add-monthly')
  @ApiOperation({ summary: 'Zaúčtovat měsíční bilanci (income - expense)' })
  async addMonthly(
    @Param('accountId') accountId: string,
    @Body() body: AddMonthlyBody = {},
    @CurrentUser() user: RequestUser,
  ) {
    await this.accountsService.assertWriteContentAccess(accountId, user);
    return this.accountsService.addMonthly(
      accountId,
      user.id,
      body?.inGameDate,
    );
  }

  @Post('accounts/:accountId/adjust')
  @ApiOperation({
    summary: 'Manuální vklad / výběr (PJ+ vždy, hráč jen s flagem)',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (FORBIDDEN_ADJUST nebo PLAYER_ADJUST_DISABLED)',
  })
  async adjust(
    @Param('accountId') accountId: string,
    @Body() dto: AdjustBalanceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accountsService.adjust(
      accountId,
      {
        amount: dto.amount,
        reason: dto.reason,
        inGameDate: dto.inGameDate ?? null,
      },
      user,
    );
  }

  @Post('accounts/:accountId/undo')
  @ApiOperation({ summary: 'Vrátit poslední transakci' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (FORBIDDEN_ADJUST nebo PLAYER_ADJUST_DISABLED)',
  })
  @ApiResponse({
    status: 409,
    description: 'UNDO_LINKED_TRANSACTION (nákup/převod se vrací stornem)',
  })
  async undo(
    @Param('accountId') accountId: string,
    @CurrentUser() user: RequestUser,
  ) {
    // PT-43d — undo je mutace zůstatku jako adjust → stejný gate. Dřív stačil
    // write-content, takže hráč obcházel `allowPlayerSelfAdjust:false`.
    await this.accountsService.assertCanAdjust(accountId, user);
    return this.accountsService.undoLast(accountId);
  }

  @Post('accounts/:accountId/transfer')
  @ApiOperation({ summary: 'Převod z účtu na jiný účet' })
  async transfer(
    @Param('accountId') accountId: string,
    @Body() body: TransferBody,
    @CurrentUser() user: RequestUser,
  ) {
    // Permission: musí mít write-content na zdroj. Cíl není gatován
    // (transfer příchozí je benigní operace, viz Q8.3 instant doručení).
    await this.accountsService.assertWriteContentAccess(accountId, user);
    return this.accountsService.transfer(
      {
        fromAccountId: accountId,
        toAccountId: body.toAccountId,
        amount: body.amount,
        description: body.description,
        inGameDate: body.inGameDate ?? null,
      },
      user.id,
    );
  }

  @Post('accounts/:accountId/co-owners')
  @ApiOperation({ summary: 'Přidat spoluvlastníka účtu (PJ-only)' })
  async addCoOwner(
    @Param('accountId') accountId: string,
    @Body() body: CoOwnerBody,
    @CurrentUser() user: RequestUser,
  ) {
    await this.accountsService.assertWriteSettingsAccess(accountId, user);
    return this.accountsService.addCoOwner(accountId, body.characterId);
  }

  @Delete('accounts/:accountId/co-owners/:characterId')
  @ApiOperation({ summary: 'Odebrat spoluvlastníka účtu (PJ-only)' })
  async removeCoOwner(
    @Param('accountId') accountId: string,
    @Param('characterId') characterId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.accountsService.assertWriteSettingsAccess(accountId, user);
    return this.accountsService.removeCoOwner(accountId, characterId);
  }

  @Post('accounts/:accountId/transfer-primary')
  @ApiOperation({
    summary: 'Převod primary ownership účtu na jiného co-owner (D-8.6)',
  })
  async transferPrimary(
    @Param('accountId') accountId: string,
    @Body() body: CoOwnerBody,
    @CurrentUser() user: RequestUser,
  ) {
    await this.accountsService.assertWriteSettingsAccess(accountId, user);
    return this.accountsService.transferPrimaryOwnership(
      accountId,
      body.characterId,
    );
  }
}
