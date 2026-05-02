import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../modules/users/interfaces/user.interface';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user || user.role > UserRole.Admin) {
      throw new ForbiddenException('Nedostatečná oprávnění');
    }
    return true;
  }
}
