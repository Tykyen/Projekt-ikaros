import { Controller, Get, Patch, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from './interfaces/user.interface';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: { id: string }) {
    return this.usersService.findById(user.id);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() requester: { id: string; role: UserRole },
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.usersService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() requester: { id: string; role: UserRole },
  ) {
    if (requester.id !== id && requester.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return this.usersService.update(id, dto);
  }
}
