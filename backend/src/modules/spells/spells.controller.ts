/**
 * 21.5c — Spells REST controller (kouzla). Community routy pod `spells/community/*`.
 *
 * POZOR na pořadí rout: statické `community` segmenty MUSÍ být před dynamickým
 * `:id` (parity s bestiae/plants). Zde jsou VŠECHNY routy `community/*`.
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
import { SpellsService } from './spells.service';
import { SpellCommentsService } from './spell-comments.service';
import { CreateCommunitySpellDto } from './dto/create-community-spell.dto';
import { UpdateSpellLoreDto } from './dto/update-spell-lore.dto';
import { ProposeSpellStatblockDto } from './dto/propose-spell-statblock.dto';
import { CreateSpellCommentDto } from './dto/create-spell-comment.dto';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('spells')
@UseGuards(JwtAuthGuard)
export class SpellsController {
  constructor(
    private readonly service: SpellsService,
    private readonly commentsService: SpellCommentsService,
  ) {}

  @Get('community')
  list(
    @Query('status') status: 'draft' | 'approved' | undefined,
    @Query('systemId') systemId: string | undefined,
    @Query('tag') tag: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list({ status, systemId, tag }, user);
  }

  @Get('community/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post('community')
  create(
    @Body() dto: CreateCommunitySpellDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user);
  }

  /** Lore (jádro) — staty tudy NEjdou (jen přes /statblock). */
  @Patch('community/:id/lore')
  updateLore(
    @Param('id') id: string,
    @Body() dto: UpdateSpellLoreDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateLore(id, dto, user);
  }

  /** Návrh / kurátorská úprava pravidlové verze pro systém. */
  @Post('community/:id/statblock')
  proposeStatblock(
    @Param('id') id: string,
    @Body() dto: ProposeSpellStatblockDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.proposeStatblock(id, dto, user);
  }

  /** Kurátor schválí jednu pravidlovou verzi (balancnuté). */
  @Post('community/:id/statblock/:systemId/approve')
  approveStatblock(
    @Param('id') id: string,
    @Param('systemId') systemId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.approveStatblock(id, systemId, user);
  }

  /** Kurátor schválí kouzlo (přesun do schválené knihovny). */
  @Post('community/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user);
  }

  @Delete('community/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.remove(id, user);
  }

  // ─── Dvouúrovňová diskuse: targetType 'spell' (lore) / 'statblock' (systém) ───

  @Get('community/:id/comments')
  listComments(
    @Param('id') id: string,
    @Query('targetType') targetType: 'spell' | 'statblock',
    @Query('systemId') systemId: string | undefined,
  ) {
    return this.commentsService.list(id, targetType, systemId);
  }

  @Post('community/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateSpellCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(id, dto, user);
  }
}
