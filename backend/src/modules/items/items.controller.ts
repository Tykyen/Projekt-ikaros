/**
 * 21.5e — Items REST controller (předměty). Community routy pod
 * `items/community/*`. POZOR na pořadí: statické `community` segmenty před
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
import { ItemsService } from './items.service';
import { ItemCommentsService } from './item-comments.service';
import { CreateCommunityItemDto } from './dto/create-community-item.dto';
import { UpdateItemLoreDto } from './dto/update-item-lore.dto';
import { ProposeItemStatblockDto } from './dto/propose-item-statblock.dto';
import { CreateItemCommentDto } from './dto/create-item-comment.dto';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(
    private readonly service: ItemsService,
    private readonly commentsService: ItemCommentsService,
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
    @Body() dto: CreateCommunityItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user);
  }

  /** Jádro (název/druh/suroviny/oznámení/cena) — staty tudy NEjdou. */
  @Patch('community/:id/lore')
  updateLore(
    @Param('id') id: string,
    @Body() dto: UpdateItemLoreDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateLore(id, dto, user);
  }

  /** Návrh / kurátorská úprava pravidlové verze pro systém. */
  @Post('community/:id/statblock')
  proposeStatblock(
    @Param('id') id: string,
    @Body() dto: ProposeItemStatblockDto,
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

  /** Kurátor schválí předmět (přesun do schválené knihovny). */
  @Post('community/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user);
  }

  @Delete('community/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.remove(id, user);
  }

  // ─── Dvouúrovňová diskuse: targetType 'item' (lore) / 'statblock' ───

  @Get('community/:id/comments')
  listComments(
    @Param('id') id: string,
    @Query('targetType') targetType: 'item' | 'statblock',
    @Query('systemId') systemId: string | undefined,
  ) {
    return this.commentsService.list(id, targetType, systemId);
  }

  @Post('community/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: CreateItemCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(id, dto, user);
  }
}
