/**
 * 21.5b — Potions REST controller (lektvary). Community routy pod
 * `potions/community/*`. POZOR na pořadí: statické `community` segmenty před
 * dynamickým `:id` (parity s bestiae/plants/spells).
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
import { PotionsService } from './potions.service';
import { PotionCommentsService } from './potion-comments.service';
import { CreateCommunityPotionDto } from './dto/create-community-potion.dto';
import { UpdatePotionLoreDto } from './dto/update-potion-lore.dto';
import { ProposePotionStatblockDto } from './dto/propose-potion-statblock.dto';
import { CreatePotionCommentDto } from './dto/create-potion-comment.dto';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('potions')
@UseGuards(JwtAuthGuard)
export class PotionsController {
  constructor(
    private readonly service: PotionsService,
    private readonly commentsService: PotionCommentsService,
  ) {}

  @Get('community')
  list(
    @Query('status') status: 'draft' | 'approved' | undefined,
    @Query('systemId') systemId: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('tag') tag: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list({ status, systemId, kind, tag }, user);
  }

  @Get('community/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post('community')
  create(
    @Body() dto: CreateCommunityPotionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user);
  }

  /** Jádro (název/druh/suroviny/oznámení/cena) — staty tudy NEjdou. */
  @Patch('community/:id/lore')
  updateLore(
    @Param('id') id: string,
    @Body() dto: UpdatePotionLoreDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateLore(id, dto, user);
  }

  /** Návrh / kurátorská úprava pravidlové verze pro systém. */
  @Post('community/:id/statblock')
  proposeStatblock(
    @Param('id') id: string,
    @Body() dto: ProposePotionStatblockDto,
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

  /** Kurátor schválí lektvar (přesun do schválené knihovny). */
  @Post('community/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user);
  }

  @Delete('community/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.remove(id, user);
  }

  // ─── Dvouúrovňová diskuse: targetType 'potion' (lore) / 'statblock' ───

  @Get('community/:id/comments')
  listComments(
    @Param('id') id: string,
    @Query('targetType') targetType: 'potion' | 'statblock',
    @Query('systemId') systemId: string | undefined,
  ) {
    return this.commentsService.list(id, targetType, systemId);
  }

  @Post('community/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreatePotionCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(id, dto, user);
  }
}
