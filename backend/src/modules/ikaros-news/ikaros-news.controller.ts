import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
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

@ApiTags('Ikaros News')
@Controller('IkarosNews')
export class IkarosNewsController {
  constructor(private readonly service: IkarosNewsService) {}

  @Get()
  @ApiOperation({ summary: 'Platformové novinky (veřejné, bez JWT)' })
  @ApiResponse({ status: 200 })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vytvoření novinky (Admin/PJ/Superadmin)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403 })
  create(@Body() dto: CreateIkarosNewsDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Smazání novinky (Admin/PJ/Superadmin)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 403 })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user.role);
  }
}
