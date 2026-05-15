export type UsernameChangeStatus = 'pending' | 'approved' | 'rejected';

export interface UsernameChangeRequest {
  id: string;
  userId: string;
  username: string; // current username v době requestu
  requestedUsername: string;
  status: UsernameChangeStatus;
  requestedAt: Date;
  decidedBy?: string;
  decidedAt?: Date;
  decisionReason?: string;
  /** D-028 — kdy žadatel viděl rozhodnutí (toast po loginu). undefined = nezhlédnuto. */
  seenAt?: Date;
}
