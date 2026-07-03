import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { AdminTasksService } from './admin-tasks.service';
import { CreateAdminTaskDto } from './dto/create-admin-task.dto';
import { UpdateAdminTaskDto } from './dto/update-admin-task.dto';

/**
 * 20.5 — úkoly týmu správy. Čtení = všichni admini; zápis autorizuje service
 * (vlastní úkol každý admin, cizí jen superadmin).
 */
@ApiTags('admin-tasks')
@Controller('admin-chat/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Superadmin, UserRole.Admin)
export class AdminTasksController {
  constructor(private readonly service: AdminTasksService) {}

  @Get()
  list() {
    return this.service.list();
  }

  /** Seznam členů týmu správy (i bez úkolů) — pro panel „Úkoly týmu". */
  @Get('staff')
  listStaff() {
    return this.service.listStaff();
  }

  @Post()
  create(@Body() dto: CreateAdminTaskDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.service.delete(id, user);
  }
}
