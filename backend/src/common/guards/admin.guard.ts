import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '../../modules/users/interfaces/user.interface';
import type { RequestUser } from '../interfaces/request-user.interface';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    if (!user || user.role > UserRole.Admin) {
      throw new ForbiddenException({
        code: 'NOT_PLATFORM_ADMIN',
        message: 'Nedostatečná oprávnění',
      });
    }
    return true;
  }
}
