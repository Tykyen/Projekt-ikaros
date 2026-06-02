import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminStatsService } from './admin-stats.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { IsEnum } from 'class-validator';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { AdminDeleteUserDto } from './dto/admin-delete-user.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { SetAdminPermissionsDto } from './dto/set-admin-permissions.dto';
import { BulkBanDto } from './dto/bulk-ban.dto';
import { BulkUnbanDto } from './dto/bulk-unban.dto';
import { BulkRoleChangeDto } from './dto/bulk-role-change.dto';
import type {
  AdminAuditAction,
  AuditTargetType,
} from './interfaces/admin-audit-log.interface';

class UpdateRoleDto {
  @IsEnum(UserRole) role: UserRole;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminStatsService: AdminStatsService,
  ) {}

  // ─── Stats — platform overview (12.1) ─────────────────────────────────────

  @Get('stats/overview')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Platformové statistiky pro admin dashboard (Admin+)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  getStatsOverview() {
    return this.adminStatsService.getOverview();
  }

  // ─── Users — listing / create / role ──────────────────────────────────────

  @Get('users')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Seznam uživatelů s filtrací (username/role) a stránkováním',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  getUsers(
    @Query('username') username?: string,
    @Query('role') role?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('hasPendingDeletion') hasPendingDeletion?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.adminService.getUsers({
      username,
      role: role !== undefined ? Number(role) : undefined,
      page: Math.max(1, Number(page)),
      limit: Math.min(100, Math.max(1, Number(limit))),
      hasPendingDeletion: hasPendingDeletion === 'true',
      includeDeleted: includeDeleted === 'true',
    });
  }

  @Patch('users/:id/role')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Změna role uživatele' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.updateUserRole(
      actor as unknown as User,
      id,
      dto.role,
    );
  }

  @Post('users')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Vytvoření uživatele adminem' })
  @ApiResponse({ status: 201, description: 'Uživatel vytvořen' })
  @ApiResponse({ status: 403, description: 'Nedostatečná oprávnění' })
  @ApiResponse({ status: 409, description: 'Username nebo email již existuje' })
  createUser(
    @Body() dto: CreateUserAdminDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.createUser(actor as unknown as User, dto);
  }

  // ─── Users — moderation (ban / delete) ────────────────────────────────────

  @Post('users/:id/ban')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Ban uživatele (trvalý nebo timed)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Nedostatečná hierarchie' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  @ApiResponse({ status: 409, description: 'Uživatel už je zabanovaný' })
  banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.banUser(actor as unknown as User, id, dto);
  }

  @Post('users/:id/unban')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Zrušení banu uživatele' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Nedostatečná hierarchie' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  @ApiResponse({ status: 409, description: 'Uživatel není zabanovaný' })
  unbanUser(@Param('id') id: string, @CurrentUser() actor: RequestUser) {
    return this.adminService.unbanUser(actor as unknown as User, id);
  }

  @Post('users/:id/request-deletion')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Admin spustí 30denní soft-delete účtu (s PJ handover plánem)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'SOLE_PJ_BLOCK (jediný PJ)' })
  @ApiResponse({ status: 403, description: 'Nedostatečná hierarchie' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  @ApiResponse({ status: 409, description: 'Účet už čeká / je smazán' })
  requestUserDeletion(
    @Param('id') id: string,
    @Body() dto: AdminDeleteUserDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.requestUserDeletion(
      actor as unknown as User,
      id,
      dto,
    );
  }

  @Post('users/:id/cancel-deletion')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin revertne pending soft-delete' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Nedostatečná hierarchie' })
  @ApiResponse({
    status: 404,
    description: 'Uživatel / pending request nenalezen',
  })
  @ApiResponse({ status: 409, description: 'Účet už byl odstraněn' })
  cancelUserDeletion(
    @Param('id') id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.cancelUserDeletion(actor as unknown as User, id);
  }

  // ─── Users — admin permissions (Superadmin-only) ──────────────────────────

  @Patch('users/:id/admin-permissions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Superadmin)
  @ApiOperation({
    summary:
      'Granular update admin oprávnění (Superadmin only). Aplikuje jen pole, která jsou v request body.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'SELF_FORBIDDEN nebo NOT_ADMIN' })
  @ApiResponse({ status: 403, description: 'Nedostatečná role' })
  @ApiResponse({ status: 404, description: 'Uživatel nenalezen' })
  setAdminPermissions(
    @Param('id') id: string,
    @Body() dto: SetAdminPermissionsDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.setAdminPermissions(
      actor as unknown as User,
      id,
      dto,
    );
  }

  // ─── Username change requests ─────────────────────────────────────────────

  @Get('username-requests')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Seznam username change requests s filtrací' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  listUsernameRequests(
    @Query('status') status?: 'pending' | 'approved' | 'rejected',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.listUsernameRequests({
      status,
      page: Math.max(1, Number(page)),
      limit: Math.min(100, Math.max(1, Number(limit))),
    });
  }

  @Post('username-requests/:id/approve')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Schválení username change requestu' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404, description: 'Žádost neexistuje' })
  @ApiResponse({
    status: 409,
    description: 'Žádost už rozhodnuta nebo username obsazen mezi-tím',
  })
  approveUsernameRequest(
    @Param('id') id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.approveUsernameRequest(
      actor as unknown as User,
      id,
    );
  }

  @Post('username-requests/:id/reject')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Zamítnutí username change requestu (s důvodem)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404, description: 'Žádost neexistuje' })
  @ApiResponse({ status: 409, description: 'Žádost už rozhodnuta' })
  rejectUsernameRequest(
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.rejectUsernameRequest(
      actor as unknown as User,
      id,
      dto,
    );
  }

  // ─── Bulk actions ─────────────────────────────────────────────────────────

  @Post('users/bulk-ban')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Bulk ban (best-effort, per-user hierarchy check). Vrátí successful + failed lists.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  bulkBan(@Body() dto: BulkBanDto, @CurrentUser() actor: RequestUser) {
    return this.adminService.bulkBan(actor as unknown as User, dto);
  }

  @Post('users/bulk-unban')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Bulk unban (best-effort)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  bulkUnban(@Body() dto: BulkUnbanDto, @CurrentUser() actor: RequestUser) {
    return this.adminService.bulkUnban(actor as unknown as User, dto);
  }

  @Post('users/bulk-role-change')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Bulk role change (best-effort, per-user hierarchy check)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  bulkRoleChange(
    @Body() dto: BulkRoleChangeDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.adminService.bulkRoleChange(actor as unknown as User, dto);
  }

  // ─── Audit log ────────────────────────────────────────────────────────────

  @Get('audit-log')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary:
      'Audit log moderation akcí. Filtrace action / actorId / targetId, stránkování.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  listAuditLog(
    @Query('action') action?: AdminAuditAction,
    @Query('actorId') actorId?: string,
    @Query('targetId') targetId?: string,
    @Query('targetType') targetType?: AuditTargetType,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.adminService.listAuditLog({
      action,
      actorId,
      targetId,
      targetType,
      page: Math.max(1, Number(page)),
      limit: Math.min(100, Math.max(1, Number(limit))),
    });
  }

  // ─── Recent pages (pre-existing) ──────────────────────────────────────────

  @Get('recent-pages')
  @UseGuards(RolesGuard)
  @Roles(UserRole.Superadmin, UserRole.Admin, UserRole.PJ)
  @ApiOperation({
    summary: 'Nedávno upravené stránky (Superadmin vidí vše, PJ jen své světy)',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  getRecentPages(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getRecentPages(
      user,
      Math.min(100, Math.max(1, Number(limit))),
    );
  }
}
