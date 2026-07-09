/**
 * 10.2d-prep-B — Bestiae REST controller.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user.interface';
import { BestiaeService } from './bestiae.service';
import { CreateBestieDto } from './dto/create-bestie.dto';
import { UpdateBestieDto } from './dto/update-bestie.dto';
import { CloneBestieDto } from './dto/clone-bestie.dto';
import { CreateCommunityBestieDto } from './dto/create-community-bestie.dto';
import { UpdateBestieLoreDto } from './dto/update-bestie-lore.dto';
import { CloneCommunityBestieDto } from './dto/clone-community-bestie.dto';
import { ProposeStatblockDto } from './dto/propose-statblock.dto';
import { CreateBestieCommentDto } from './dto/create-bestie-comment.dto';
import { BestieCommentsService } from './bestie-comments.service';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('bestiae')
@UseGuards(JwtAuthGuard)
export class BestiaeController {
  constructor(
    private readonly service: BestiaeService,
    private readonly commentsService: BestieCommentsService,
  ) {}

  @Get()
  list(
    @Query('systemId') systemId: string,
    @Query('worldId') worldId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list(systemId, user, worldId);
  }

  // ─────── 16.2b-2 komunitní (globální) bestiář ───────
  // POZOR: statické `community` routy MUSÍ být před `:id`, jinak by je `:id`
  // zachytilo jako id.

  @Get('community')
  listCommunity(
    @Query('status') status: 'draft' | 'approved' | undefined,
    @Query('kind') kind: string | undefined,
    @Query('systemId') systemId: string | undefined,
  ) {
    return this.service.listCommunity({ status, kind, systemId });
  }

  @Get('community/:id')
  getCommunity(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findCommunityById(id, user);
  }

  @Post('community')
  createCommunity(
    @Body() dto: CreateCommunityBestieDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createCommunity(dto, user);
  }

  @Patch('community/:id/lore')
  updateCommunityLore(
    @Param('id') id: string,
    @Body() dto: UpdateBestieLoreDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateCommunityLore(id, dto, user);
  }

  @Post('community/:id/clone')
  cloneCommunity(
    @Param('id') id: string,
    @Body() dto: CloneCommunityBestieDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.cloneCommunity(id, dto, user);
  }

  /** Návrh / kurátorská úprava pravidlové verze statů (spec §2a). */
  @Post('community/:id/statblock')
  proposeStatblock(
    @Param('id') id: string,
    @Body() dto: ProposeStatblockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.proposeStatblock(id, dto, user);
  }

  /** Kurátor schválí jednu pravidlovou verzi. */
  @Post('community/:id/statblock/:systemId/approve')
  approveStatblock(
    @Param('id') id: string,
    @Param('systemId') systemId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.approveStatblock(id, systemId, user);
  }

  /** Kurátor schválí bytost (přesun do schválené knihovny). */
  @Post('community/:id/approve')
  approveBeast(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approveBeast(id, user);
  }

  // ─── Dvouúrovňová diskuse: targetType 'beast' (lore) / 'statblock' (systém) ───

  @Get('community/:id/comments')
  listComments(
    @Param('id') id: string,
    @Query('targetType') targetType: 'beast' | 'statblock',
    @Query('systemId') systemId: string | undefined,
  ) {
    return this.commentsService.list(id, targetType, systemId);
  }

  @Post('community/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateBestieCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(id, dto, user);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post()
  create(@Body() dto: CreateBestieDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBestieDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.softDelete(id, user);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.restore(id, user);
  }

  @Post(':id/clone')
  clone(
    @Param('id') id: string,
    @Body() dto: CloneBestieDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.clone(id, dto, user);
  }
}
