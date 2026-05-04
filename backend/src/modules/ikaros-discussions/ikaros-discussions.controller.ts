import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { IkarosDiscussionsService } from './ikaros-discussions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { PatchDiscussionDto } from './dto/patch-discussion.dto';
import { RejectDiscussionDto } from './dto/reject-discussion.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { AddPostDto } from './dto/add-post.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; username: string; role: UserRole }

@Controller('ikaros-discussions')
@UseGuards(JwtAuthGuard)
export class IkarosDiscussionsController {
  constructor(private readonly service: IkarosDiscussionsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.id, user.role, user.username);
  }

  @Get('pending')
  findPending(@CurrentUser() user: RequestUser) {
    return this.service.findPending(user.role, user.username);
  }

  @Get('my-favorites')
  findMyFavorites(@CurrentUser() user: RequestUser) {
    return this.service.findMyFavorites(user.id);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  create(@Body() dto: CreateDiscussionDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role, user.username);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: PatchDiscussionDto, @CurrentUser() user: RequestUser) {
    return this.service.patch(id, dto, user.id, user.role, user.username);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, user.role, user.username);
  }

  @Post(':id/reject')
  @HttpCode(204)
  async reject(@Param('id') id: string, @Body() dto: RejectDiscussionDto, @CurrentUser() user: RequestUser) {
    await this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/invite')
  invite(@Param('id') id: string, @Body() dto: InviteUserDto, @CurrentUser() user: RequestUser) {
    return this.service.invite(id, dto.userId, user.id, user.role, user.username);
  }

  @Post(':id/toggle-favorite')
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.toggleFavorite(id, user.id);
  }

  @Get(':id/posts')
  getPosts(
    @Param('id') id: string,
    @Query('skip') skip: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getPosts(id, user.id, user.role, user.username, parseInt(skip ?? '0', 10), parseInt(limit ?? '50', 10));
  }

  @Post(':id/posts')
  addPost(@Param('id') id: string, @Body() dto: AddPostDto, @CurrentUser() user: RequestUser) {
    return this.service.addPost(id, dto.content, user.id, user.username);
  }

  @Delete(':id/posts/:postId')
  @HttpCode(204)
  async deletePost(@Param('id') id: string, @Param('postId') postId: string, @CurrentUser() user: RequestUser) {
    await this.service.deletePost(id, postId, user.id, user.role, user.username);
  }
}
