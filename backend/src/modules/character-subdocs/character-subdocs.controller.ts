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

interface RequestUser {
  id: string;
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
    return this.subdocsService.getDiary(character.id);
  }

  @Patch('diary')
  @ApiOperation({ summary: 'Aktualizace deníku postavy' })
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 403, description: 'Přístup zamítnut' })
  async updateDiary(
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
    return this.subdocsService.updateDiary(character.id, body);
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
    const character = await this.charactersService.assertSubdocAccess(
      slug,
      worldId,
      user.id,
    );
    return this.subdocsService.getCalendar(character.id);
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
    return this.subdocsService.getFinance(character.id);
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
    return this.subdocsService.updateFinance(character.id, body);
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
    return this.subdocsService.getInventory(character.id);
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
    return this.subdocsService.updateInventory(character.id, body);
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
