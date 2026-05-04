import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode,
} from '@nestjs/common';
import { IkarosArticlesService } from './ikaros-articles.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { RateArticleDto } from './dto/rate-article.dto';
import { RejectArticleDto } from './dto/reject-article.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; username: string; role: UserRole }

@Controller('ikaros-articles')
@UseGuards(JwtAuthGuard)
export class IkarosArticlesController {
  constructor(private readonly service: IkarosArticlesService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.role, user.username);
  }

  @Get('my')
  findMy(@CurrentUser() user: RequestUser) {
    return this.service.findMy(user.id);
  }

  @Get('pending')
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('stats')
  findStats(@CurrentUser() user: RequestUser) {
    return this.service.findStats(user.id);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.update(id, dto, user.id, user.role, user.username);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.id, user.role, user.username);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submit(id, user.id, user.role);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/rate')
  rate(@Param('id') id: string, @Body() dto: RateArticleDto, @CurrentUser() user: RequestUser) {
    return this.service.rate(id, dto.stars, user.id, user.role);
  }
}
