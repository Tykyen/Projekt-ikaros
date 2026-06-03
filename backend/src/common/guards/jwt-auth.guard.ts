import {
  Injectable,
  Inject,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { IUsersRepository } from '../../modules/users/interfaces/users-repository.interface';
import { ALLOW_PENDING_DELETION } from '../decorators/allow-pending-deletion.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject('IUsersRepository') private readonly usersRepo: IUsersRepository,
    private readonly reflector: Reflector,
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
        // 1.3c (N-6b) — per-request gate na stav účtu. Access token žije až 7 dní,
        // takže login-only reject by smazaného/pending usera nechal týden aktivního.
        // Optional routy (OptionalJwtAuthGuard) gate záměrně nemají — jsou public read-only.
        const user = await this.usersRepo.findById(userId);
        if (!user || user.isDeleted)
          throw new UnauthorizedException({
            code: 'DELETED',
            message: 'Účet byl smazán',
          });
        const allowPending = this.reflector.getAllAndOverride<boolean>(
          ALLOW_PENDING_DELETION,
          [context.getHandler(), context.getClass()],
        );
        if (!allowPending && user.deletionRequestedAt)
          throw new UnauthorizedException({
            code: 'DELETION_PENDING',
            message: 'Účet je naplánován ke smazání',
          });
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
