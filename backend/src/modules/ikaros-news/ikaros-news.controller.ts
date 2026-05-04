import { Controller, Get, Post, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { IkarosNewsService } from './ikaros-news.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateIkarosNewsDto } from './dto/create-ikaros-news.dto';
import { UserRole } from '../users/interfaces/user.interface';

interface RequestUser {
  id: string;
  username: string;
  role: UserRole;
}

@Controller('IkarosNews')
export class IkarosNewsController {
  constructor(private readonly service: IkarosNewsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateIkarosNewsDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.username, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.role);
  }
}
