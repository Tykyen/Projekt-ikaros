export interface RefreshToken {
  jti: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  familyId: string;
  type: 'refresh';
}
