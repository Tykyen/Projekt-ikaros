// backend/src/modules/campaign/campaign.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
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

interface RequestUser {
  id: string;
  role: UserRole;
  username: string;
}

@ApiTags('Campaign')
@ApiBearerAuth()
@Controller('campaign')
@UseGuards(JwtAuthGuard)
export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  private async role(user: RequestUser, worldId: string): Promise<WorldRole> {
    if (!worldId)
      throw new BadRequestException({
        code: 'WORLD_ID_REQUIRED',
        message: 'worldId je povinný parametr',
      });
    return this.service.getWorldRole(user.id, user.role, worldId);
  }

  private resolveIsShared(worldRole: WorldRole, requested?: boolean): boolean {
    return worldRole >= WorldRole.PomocnyPJ ? (requested ?? false) : false;
  }

  // ── Players ───────────────────────────────────────────────────────────────

  @Get('players')
  @ApiOperation({ summary: 'Hráčský pohled na kampaňová data' })
  @ApiResponse({ status: 200 })
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
  @ApiOperation({
    summary: 'Dashboard — krizové vztahy, aktivní linky, připnuté poznámky',
  })
  @ApiResponse({ status: 200 })
  async getDashboard(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.getDashboard(user.id, worldRole, worldId);
  }

  // ── Changelog ─────────────────────────────────────────────────────────────

  @Get('changelog')
  @ApiOperation({ summary: 'Auditní log změn (TTL 90 dní, max 200 záznamů)' })
  @ApiResponse({ status: 200 })
  async getChangelog(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const worldRole = await this.role(user, worldId);
    if (worldRole < WorldRole.PomocnyPJ) throw new ForbiddenException();
    return this.service.getChangelog(worldId, worldRole, limit, user.id);
  }

  // ── Subjects ──────────────────────────────────────────────────────────────

  @Get('subjects')
  @ApiOperation({ summary: 'Subjekty pavučiny vztahů (filtrováno dle role)' })
  @ApiResponse({ status: 200 })
  async findSubjects(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findSubjects(user.id, worldRole, worldId, {
      type,
      status,
      q,
    });
  }

  @Get('subjects/:id')
  @ApiOperation({ summary: 'Detail subjektu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findSubject(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findSubjectById(id, user.id, worldRole);
  }

  @Post('subjects')
  @ApiOperation({ summary: 'Vytvoření subjektu' })
  @ApiResponse({ status: 201 })
  async createSubject(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Body() dto: CreateCampaignSubjectDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.createSubject(
      user.id,
      user.username,
      worldRole,
      worldId,
      this.resolveIsShared(worldRole, dto.isShared),
      dto,
    );
  }

  @Put('subjects/:id')
  @ApiOperation({ summary: 'Aktualizace subjektu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  async updateSubject(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CreateCampaignSubjectDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateSubject(
      id,
      user.id,
      user.username,
      worldRole,
      dto,
    );
  }

  @Delete('subjects/:id')
  @ApiOperation({ summary: 'Smazání subjektu' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async deleteSubject(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteSubject(id, user.id, worldRole, user.username);
  }

  // ── Relationships ─────────────────────────────────────────────────────────

  @Get('relationships')
  @ApiOperation({ summary: 'Vztahy mezi subjekty' })
  @ApiResponse({ status: 200 })
  async findRelationships(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('subjectId') subjectId?: string,
    @Query('status') status?: string,
    @Query('storylineId') storylineId?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findRelationships(user.id, worldRole, worldId, {
      subjectId,
      status,
      storylineId,
    });
  }

  @Get('relationships/:id')
  @ApiOperation({ summary: 'Detail vztahu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findRelationship(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findRelationshipById(id, user.id, worldRole);
  }

  @Post('relationships')
  @ApiOperation({ summary: 'Vytvoření vztahu' })
  @ApiResponse({ status: 201 })
  async createRelationship(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Body() dto: CreateCampaignRelationshipDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.createRelationship(
      user.id,
      user.username,
      worldRole,
      worldId,
      this.resolveIsShared(worldRole, dto.isShared),
      dto,
    );
  }

  @Put('relationships/:id')
  @ApiOperation({ summary: 'Aktualizace vztahu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async updateRelationship(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CreateCampaignRelationshipDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateRelationship(
      id,
      user.id,
      user.username,
      worldRole,
      dto,
    );
  }

  @Delete('relationships/:id')
  @ApiOperation({ summary: 'Smazání vztahu' })
  @ApiResponse({ status: 204 })
  async deleteRelationship(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteRelationship(
      id,
      user.id,
      worldRole,
      user.username,
    );
  }

  // ── Storylines ────────────────────────────────────────────────────────────

  @Get('storylines')
  @ApiOperation({ summary: 'Příběhové linky' })
  @ApiResponse({ status: 200 })
  async findStorylines(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('level') level?: string,
    @Query('status') status?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findStorylines(user.id, worldRole, worldId, {
      level,
      status,
      subjectId,
    });
  }

  @Get('storylines/:id')
  @ApiOperation({ summary: 'Detail příběhové linky' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findStoryline(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findStorylineById(id, user.id, worldRole);
  }

  @Post('storylines')
  @ApiOperation({ summary: 'Vytvoření příběhové linky' })
  @ApiResponse({ status: 201 })
  async createStoryline(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Body() dto: CreateCampaignStorylineDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.createStoryline(
      user.id,
      user.username,
      worldRole,
      worldId,
      this.resolveIsShared(worldRole, dto.isShared),
      dto,
    );
  }

  @Put('storylines/:id')
  @ApiOperation({ summary: 'Aktualizace příběhové linky' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async updateStoryline(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CreateCampaignStorylineDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateStoryline(
      id,
      user.id,
      user.username,
      worldRole,
      dto,
    );
  }

  @Delete('storylines/:id')
  @ApiOperation({ summary: 'Smazání příběhové linky' })
  @ApiResponse({ status: 204 })
  async deleteStoryline(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteStoryline(id, user.id, worldRole, user.username);
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────

  @Get('scenarios')
  @ApiOperation({ summary: 'Scénáře' })
  @ApiResponse({ status: 200 })
  async findScenarios(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findScenarios(user.id, worldRole, worldId);
  }

  @Get('scenarios/:id')
  @ApiOperation({ summary: 'Detail scénáře' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findScenario(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findScenarioById(id, user.id, worldRole);
  }

  @Post('scenarios')
  @ApiOperation({ summary: 'Vytvoření scénáře' })
  @ApiResponse({ status: 201 })
  async createScenario(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Body() dto: CreateCampaignScenarioDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.createScenario(
      user.id,
      user.username,
      worldRole,
      worldId,
      this.resolveIsShared(worldRole, dto.isShared),
      dto,
    );
  }

  @Put('scenarios/:id')
  @ApiOperation({ summary: 'Aktualizace scénáře' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async updateScenario(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CreateCampaignScenarioDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateScenario(
      id,
      user.id,
      user.username,
      worldRole,
      dto,
    );
  }

  @Delete('scenarios/:id')
  @ApiOperation({ summary: 'Smazání scénáře' })
  @ApiResponse({ status: 204 })
  async deleteScenario(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteScenario(id, user.id, worldRole, user.username);
  }

  // ── QuickNotes ────────────────────────────────────────────────────────────

  @Get('quicknotes')
  @ApiOperation({ summary: 'Rychlé poznámky' })
  @ApiResponse({ status: 200 })
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
  @ApiOperation({ summary: 'Detail poznámky' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findQuickNote(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findQuickNoteById(id, user.id, worldRole);
  }

  @Post('quicknotes')
  @ApiOperation({ summary: 'Vytvoření poznámky' })
  @ApiResponse({ status: 201 })
  async createQuickNote(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Body() dto: CreateCampaignQuickNoteDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.createQuickNote(
      user.id,
      user.username,
      worldRole,
      worldId,
      this.resolveIsShared(worldRole, dto.isShared),
      dto,
    );
  }

  @Put('quicknotes/:id')
  @ApiOperation({ summary: 'Aktualizace poznámky' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async updateQuickNote(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CreateCampaignQuickNoteDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateQuickNote(
      id,
      user.id,
      user.username,
      worldRole,
      dto,
    );
  }

  @Delete('quicknotes/:id')
  @ApiOperation({ summary: 'Smazání poznámky' })
  @ApiResponse({ status: 204 })
  async deleteQuickNote(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteQuickNote(id, user.id, worldRole, user.username);
  }

  // ── ShopItems ─────────────────────────────────────────────────────────────

  @Get('shopitems')
  @ApiOperation({ summary: 'Položky obchodu' })
  @ApiResponse({ status: 200 })
  async findShopItems(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Query('group') group?: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findShopItems(user.id, worldRole, worldId, { group });
  }

  @Get('shopitems/:id')
  @ApiOperation({ summary: 'Detail položky obchodu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async findShopItem(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.findShopItemById(id, user.id, worldRole);
  }

  @Post('shopitems')
  @ApiOperation({ summary: 'Vytvoření položky obchodu' })
  @ApiResponse({ status: 201 })
  async createShopItem(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Body() dto: CreateCampaignShopItemDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.createShopItem(
      user.id,
      user.username,
      worldRole,
      worldId,
      this.resolveIsShared(worldRole, dto.isShared),
      dto,
    );
  }

  @Put('shopitems/:id')
  @ApiOperation({ summary: 'Aktualizace položky obchodu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  async updateShopItem(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
    @Body() dto: CreateCampaignShopItemDto,
  ) {
    const worldRole = await this.role(user, worldId);
    return this.service.updateShopItem(
      id,
      user.id,
      user.username,
      worldRole,
      dto,
    );
  }

  @Delete('shopitems/:id')
  @ApiOperation({ summary: 'Smazání položky obchodu' })
  @ApiResponse({ status: 204 })
  async deleteShopItem(
    @CurrentUser() user: RequestUser,
    @Query('worldId') worldId: string,
    @Param('id') id: string,
  ) {
    const worldRole = await this.role(user, worldId);
    await this.service.deleteShopItem(id, user.id, worldRole, user.username);
  }
}
