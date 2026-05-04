// backend/src/modules/campaign/campaign.controller.ts
import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards,
  ForbiddenException, BadRequestException, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { CreateCampaignSubjectDto } from './dto/create-campaign-subject.dto';
import { CreateCampaignRelationshipDto } from './dto/create-campaign-relationship.dto';
import { CreateCampaignStorylineDto } from './dto/create-campaign-storyline.dto';
import { CreateCampaignScenarioDto } from './dto/create-campaign-scenario.dto';
import { CreateCampaignQuickNoteDto } from './dto/create-campaign-quick-note.dto';
import { CreateCampaignShopItemDto } from './dto/create-campaign-shop-item.dto';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

interface RequestUser { id: string; role: UserRole; username: string; }

@Controller('campaign')
@UseGuards(JwtAuthGuard)
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  private async role(user: RequestUser, worldId: string): Promise<WorldRole> {
    if (!worldId) throw new BadRequestException('worldId je povinný parametr');
    return this.service.getWorldRole(user.id, user.role, worldId);
  }

  // ── Players ───────────────────────────────────────────────────────────────

  @Get('players')
  async getPlayers(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
  ) {
    const worldRole = await this.role(user, worldId);
    if (worldRole < WorldRole.PJ) throw new ForbiddenException();
    return this.service.getPlayers(user.id, worldId);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  async getDashboard(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.getDashboard(user.id, worldRole, worldId);
  }

  // ── Changelog ─────────────────────────────────────────────────────────────

  @Get('changelog')
  async getChangelog(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const worldRole = await this.role(user, worldId);
    if (worldRole < WorldRole.PomocnyPJ) throw new ForbiddenException();
    return this.service.getChangelog(worldId, worldRole, limit);
  }

  // ── Subjects ──────────────────────────────────────────────────────────────

  @Get('subjects')
  async findSubjects(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findSubjects(user.id, worldRole, worldId, { type, status, q });
  }

  @Get('subjects/:id')
  async findSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findSubjectById(id, user.id, worldRole);
  }

  @Post('subjects')
  async createSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignSubjectDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createSubject(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('subjects/:id')
  async updateSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignSubjectDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateSubject(id, user.id, user.username, worldRole, dto);
  }

  @Delete('subjects/:id')
  async deleteSubject(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteSubject(id, user.id, worldRole, user.username);
  }

  // ── Relationships ─────────────────────────────────────────────────────────

  @Get('relationships')
  async findRelationships(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('subjectId') subjectId?: string,
    @Query('status') status?: string,
    @Query('storylineId') storylineId?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findRelationships(user.id, worldRole, worldId, { subjectId, status, storylineId });
  }

  @Get('relationships/:id')
  async findRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findRelationshipById(id, user.id, worldRole);
  }

  @Post('relationships')
  async createRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignRelationshipDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createRelationship(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('relationships/:id')
  async updateRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignRelationshipDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateRelationship(id, user.id, user.username, worldRole, dto);
  }

  @Delete('relationships/:id')
  async deleteRelationship(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteRelationship(id, user.id, worldRole, user.username);
  }

  // ── Storylines ────────────────────────────────────────────────────────────

  @Get('storylines')
  async findStorylines(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('level') level?: string,
    @Query('status') status?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findStorylines(user.id, worldRole, worldId, { level, status, subjectId });
  }

  @Get('storylines/:id')
  async findStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findStorylineById(id, user.id, worldRole);
  }

  @Post('storylines')
  async createStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignStorylineDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createStoryline(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('storylines/:id')
  async updateStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignStorylineDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateStoryline(id, user.id, user.username, worldRole, dto);
  }

  @Delete('storylines/:id')
  async deleteStoryline(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteStoryline(id, user.id, worldRole, user.username);
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────

  @Get('scenarios')
  async findScenarios(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findScenarios(user.id, worldRole, worldId);
  }

  @Get('scenarios/:id')
  async findScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findScenarioById(id, user.id, worldRole);
  }

  @Post('scenarios')
  async createScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignScenarioDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createScenario(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('scenarios/:id')
  async updateScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignScenarioDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateScenario(id, user.id, user.username, worldRole, dto);
  }

  @Delete('scenarios/:id')
  async deleteScenario(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteScenario(id, user.id, worldRole, user.username);
  }

  // ── QuickNotes ────────────────────────────────────────────────────────────

  @Get('quicknotes')
  async findQuickNotes(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('status') status?: string,
    @Query('pinned') pinned?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findQuickNotes(user.id, worldRole, worldId, {
      status,
      pinned: pinned !== undefined ? pinned === 'true' : undefined,
    });
  }

  @Get('quicknotes/:id')
  async findQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findQuickNoteById(id, user.id, worldRole);
  }

  @Post('quicknotes')
  async createQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignQuickNoteDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createQuickNote(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('quicknotes/:id')
  async updateQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignQuickNoteDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateQuickNote(id, user.id, user.username, worldRole, dto);
  }

  @Delete('quicknotes/:id')
  async deleteQuickNote(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteQuickNote(id, user.id, worldRole, user.username);
  }

  // ── ShopItems ─────────────────────────────────────────────────────────────

  @Get('shopitems')
  async findShopItems(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('group') group?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findShopItems(user.id, worldRole, worldId, { group });
  }

  @Get('shopitems/:id')
  async findShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    return this.service.findShopItemById(id, user.id, worldRole);
  }

  @Post('shopitems')
  async createShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Body() dto: CreateCampaignShopItemDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.createShopItem(user.id, user.username, worldRole, worldId, dto.isShared ?? false, dto);
  }

  @Put('shopitems/:id')
  async updateShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string, @Body() dto: CreateCampaignShopItemDto) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateShopItem(id, user.id, user.username, worldRole, dto);
  }

  @Delete('shopitems/:id')
  async deleteShopItem(@CurrentUser() user: RequestUser, @Query('worldId') worldId: string, @Param('id') id: string) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteShopItem(id, user.id, worldRole, user.username);
  }
}
