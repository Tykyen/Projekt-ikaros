import { Injectable, Inject, ExecutionContext, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { IUsersRepository } from '../../modules/users/interfaces/users-repository.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    if (result) {
      const request = context
        .switchToHttp()
        .getRequest<{ user?: { sub?: string } }>();
      const userId = request.user?.sub;
      if (userId) {
        void this.usersRepo.updateLastSeen(userId).catch((err: Error) => {
          this.logger.warn(
            `updateLastSeen failed for ${userId}: ${err.message}`,
          );
        });
      }
    }
    return result;
  }
}
