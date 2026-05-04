import { UserRole } from '../../modules/users/interfaces/user.interface';

export interface RequestUser {
  id: string;
  role: UserRole;
  username?: string;
}
