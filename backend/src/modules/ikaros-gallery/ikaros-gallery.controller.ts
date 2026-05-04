import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IkarosGalleryService } from './ikaros-gallery.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateGalleryItemDto } from './dto/create-gallery-item.dto';
import { UpdateGalleryItemDto } from './dto/update-gallery-item.dto';
import { RateGalleryItemDto } from './dto/rate-gallery-item.dto';
import { RejectGalleryItemDto } from './dto/reject-gallery-item.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser { id: string; username: string; role: UserRole }

@Controller('ikaros-gallery')
@UseGuards(JwtAuthGuard)
export class IkarosGalleryController {
  constructor(private readonly service: IkarosGalleryService) {}

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

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findById(id, user.id, user.role, user.username);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateGalleryItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, file, user.id, user.username, user.role);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGalleryItemDto, @CurrentUser() user: RequestUser) {
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
  reject(@Param('id') id: string, @Body() dto: RejectGalleryItemDto, @CurrentUser() user: RequestUser) {
    return this.service.reject(id, dto.reason, user.role, user.username);
  }

  @Post(':id/rate')
  rate(@Param('id') id: string, @Body() dto: RateGalleryItemDto, @CurrentUser() user: RequestUser) {
    return this.service.rate(id, dto.stars, user.id, user.role);
  }
}
