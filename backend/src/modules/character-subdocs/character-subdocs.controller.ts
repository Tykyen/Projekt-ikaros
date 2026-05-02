import { Controller, Get, Patch, Post, Param, Body, UseGuards } from '@nestjs/common';
import { CharacterSubdocsService } from './character-subdocs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CharactersService } from '../characters/characters.service';

interface RequestUser { id: string }

@Controller('worlds/:worldId/characters/:slug')
@UseGuards(JwtAuthGuard)
export class CharacterSubdocsController {
  constructor(
    private readonly subdocsService: CharacterSubdocsService,
    private readonly charactersService: CharactersService,
  ) {}

  @Get('diary')
  async getDiary(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.getDiary(character.id);
  }

  @Patch('diary')
  async updateDiary(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.updateDiary(character.id, body);
  }

  @Get('calendar')
  async getCalendar(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.getCalendar(character.id);
  }

  @Patch('calendar')
  async updateCalendar(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.updateCalendar(character.id, body);
  }

  @Get('finance')
  async getFinance(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.getFinance(character.id);
  }

  @Patch('finance')
  async updateFinance(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.updateFinance(character.id, body);
  }

  @Post('finance/add-monthly')
  async addMonthly(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.addMonthly(character.id);
  }

  @Post('finance/undo')
  async undoLastTransaction(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.undoLastTransaction(character.id);
  }

  @Get('inventory')
  async getInventory(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.getInventory(character.id);
  }

  @Patch('inventory')
  async updateInventory(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.updateInventory(character.id, body);
  }

  @Get('notes')
  async getNotes(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.getNotes(character.id);
  }

  @Patch('notes')
  async updateNotes(
    @Param('worldId') worldId: string,
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
  ) {
    const character = await this.charactersService.assertSubdocAccess(slug, worldId, user.id);
    return this.subdocsService.updateNotes(character.id, body);
  }
}
