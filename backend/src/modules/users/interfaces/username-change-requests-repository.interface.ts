import type {
  UsernameChangeRequest,
  UsernameChangeStatus,
} from './username-change-request.interface';

export interface IUsernameChangeRequestsRepository {
  create(input: {
    userId: string;
    username: string;
    requestedUsername: string;
  }): Promise<UsernameChangeRequest>;

  findById(id: string): Promise<UsernameChangeRequest | null>;

  findPendingByUserId(userId: string): Promise<UsernameChangeRequest | null>;

  /**
   * D-028 — poslední rozhodnutá (approved/rejected) žádost daného usera,
   * kterou ještě neviděl (`seenAt` chybí). Řazeno `decidedAt` sestupně.
   */
  findLastUnseenDecidedByUserId(
    userId: string,
  ): Promise<UsernameChangeRequest | null>;

  /** D-028 — označí žádost za zhlédnutou (`seenAt = now`). */
  markSeen(id: string): Promise<void>;

  listPaginated(opts: {
    status?: UsernameChangeStatus;
    page: number;
    limit: number;
  }): Promise<{ items: UsernameChangeRequest[]; total: number }>;

  update(
    id: string,
    data: Partial<UsernameChangeRequest>,
  ): Promise<UsernameChangeRequest | null>;

  deletePending(userId: string): Promise<void>;
}
