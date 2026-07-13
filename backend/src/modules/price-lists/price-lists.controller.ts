/**
 * 21.5f — PriceLists REST controller (ceníky). Community routy pod
 * `price-lists/community/*`. Celý controller login-required (parity rodiny
 * Společné tvorby — rozhodnutí 21.5a). Statické segmenty před `:id`.
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
import { PriceListsService } from './price-lists.service';
import { PriceListCommentsService } from './price-list-comments.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { CreatePriceListCommentDto } from './dto/create-price-list-comment.dto';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('price-lists')
@UseGuards(JwtAuthGuard)
export class PriceListsController {
  constructor(
    private readonly service: PriceListsService,
    private readonly comments: PriceListCommentsService,
  ) {}

  @Get('community')
  list(
    @Query('status') status: 'draft' | 'approved' | undefined,
    @Query('tag') tag: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.list({ status, tag }, user);
  }

  @Get('community/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user);
  }

  @Post('community')
  create(@Body() dto: CreatePriceListDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch('community/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePriceListDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post('community/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user);
  }

  @Delete('community/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.remove(id, user);
  }

  // ── Komentáře (jedna úroveň — celý ceník) ──

  @Get('community/:id/comments')
  listComments(@Param('id') id: string) {
    return this.comments.list(id);
  }

  @Post('community/:id/comments')
  createComment(
    @Param('id') id: string,
    @Body() dto: CreatePriceListCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.comments.create(id, dto, user);
  }
}
