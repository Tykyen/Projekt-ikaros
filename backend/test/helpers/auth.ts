import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

export interface TestUserCreds {
  username: string;
  email: string;
  password: string;
  /** Register DTO vyžaduje boolean; default true (viz registerUser). */
  acceptedTerms?: boolean;
  /** Register DTO vyžaduje boolean (věková brána 15+); default false (viz registerUser). */
  isMinor?: boolean;
  /** Turnstile token; default 'dev-bypass'. S prázdným TURNSTILE_SECRET projde (DEV mode). */
  captchaToken?: string;
}

export interface AuthSession {
  userId: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(
  app: INestApplication,
  creds: TestUserCreds,
): Promise<AuthSession> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      acceptedTerms: true,
      isMinor: false,
      captchaToken: 'dev-bypass',
      ...creds,
    });

  if (res.status !== 201) {
    throw new Error(
      `register failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  const body = res.body as {
    user: { id: string; username: string };
    accessToken: string;
    refreshToken: string;
  };
  return {
    userId: body.user.id,
    username: body.user.username,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

export async function loginUser(
  app: INestApplication,
  identifier: string,
  password: string,
): Promise<AuthSession> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ identifier, password });

  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const body = res.body as {
    user: { id: string; username: string };
    accessToken: string;
    refreshToken: string;
  };
  return {
    userId: body.user.id,
    username: body.user.username,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
