import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CharacterSubdocsService } from './character-subdocs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CharactersService } from '../characters/characters.service';
import { UpdateCharacterDiaryDto } from './dto/update-character-diary.dto';
import { RemapDiaryKeysDto } from './dto/remap-diary-keys.dto';
import type { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  /** D-066 — platformová role pro gate moderačně skrytého deníku. */
  role: UserRole;
}

@ApiTags('Character Subdocs')
@ApiBearerAuth()
@Controller('worlds/:worldId/characters/:slug')
@UseGuards(JwtAuthGuard)
export class CharacterSubdocsController {
  constructor(
    private readonly subdocsService: CharacterSubdocsService,
    private readonly charactersService: CharactersService,
  ) {}

  @Get('diary')
  @ApiOperation({ summary: 'Načtení deníku postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async getDiary(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    // D-066 — role rozhoduje, zda viewer smí vidět moderačně skrytý deník.
    return this.subdocsService.getDiary(character.id, worldId, user.role);
  }

  @Patch('diary')
  @ApiOperation({ summary: 'Aktualizace deníku postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async updateDiary(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: UpdateCharacterDiaryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.subdocsService.updateDiary(
      character.id,
      dto as unknown as Parameters<typeof this.subdocsService.updateDiary>[1],
      // D-066 — skrytý deník needituje nikdo mimo reviewer set.
      user.role,
    );
  }

  /**
   * 8.5 D-DIARY-1 — přejmenování keys v customData postavy po rename bloku
   * v personalDiarySchema. PJ akce z editoru.
   */
  @Post('diary/remap')
  @ApiOperation({ summary: 'Přejmenování klíčů customData postavy (PJ+)' })
  @ApiResponse({ status: 201, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async remapDiaryKeys(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() dto: RemapDiaryKeysDto,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.subdocsService.remapCustomDataKeys(character.id, dto.mapping);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Načtení kalendáře postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async getCalendar(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    // Spec 9.2 — `read` action umožňuje Lokaci číst kalendář všem členům
    // světa, ne jen PomocnyPJ+. Persona zachovává původní striktnější chování.
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
      { action: 'read' },
    );
    return this.subdocsService.getCalendar(character.id, worldId);
  }

  @Put('calendar')
  @ApiOperation({ summary: 'Aktualizace kalendáře postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async updateCalendar(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
      { action: 'write' },
    );
    return this.subdocsService.updateCalendar(character.id, body);
  }

  @Get('finance')
  @ApiOperation({ summary: 'Načtení financí postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async getFinance(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    // 8.1-FIR — service rozhodne mezi lazy-create (PC) a NOT_APPLICABLE (NPC/Lokace).
    return this.subdocsService.getFinance(
      character.id,
      character.isNpc,
      character.kind,
    );
  }

  @Patch('finance')
  @ApiOperation({ summary: 'Aktualizace financí postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async updateFinance(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    // FIX-12 — stejná NPC/Lokace brána jako getFinance.
    return this.subdocsService.updateFinance(
      character.id,
      body,
      character.isNpc,
      character.kind,
    );
  }

  @Post('finance/add-monthly')
  @ApiOperation({ summary: 'Přičtení měsíčního příjmu k financím postavy' })
  @ApiResponse({ status: 201, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async addMonthly(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.subdocsService.addMonthly(character.id);
  }

  @Post('finance/undo')
  @ApiOperation({ summary: 'Vrácení poslední finanční transakce' })
  @ApiResponse({ status: 201, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async undoLastTransaction(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.subdocsService.undoLastTransaction(character.id);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Načtení inventáře postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async getInventory(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    // 8.1-FIR — service rozhodne mezi lazy-create (PC) a NOT_APPLICABLE (NPC/Lokace).
    return this.subdocsService.getInventory(
      character.id,
      character.isNpc,
      character.kind,
    );
  }

  @Patch('inventory')
  @ApiOperation({ summary: 'Aktualizace inventáře postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async updateInventory(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    // FIX-12 — stejná NPC/Lokace brána jako getInventory.
    return this.subdocsService.updateInventory(
      character.id,
      body,
      character.isNpc,
      character.kind,
    );
  }

  @Get('notes')
  @ApiOperation({ summary: 'Načtení poznámek postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async getNotes(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.subdocsService.getNotes(character.id);
  }

  @Patch('notes')
  @ApiOperation({ summary: 'Aktualizace poznámek postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async updateNotes(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.subdocsService.updateNotes(character.id, body);
  }
}
