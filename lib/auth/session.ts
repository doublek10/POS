import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { RoleName } from '@prisma/client';

const SESSION_COOKIE = 'pos_session';
const ALG = 'HS256';

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  companyId: string;
  branchId?: string | null;
  role: RoleName;
  name: string;
  [key: string]: unknown; // required by jose's JWTPayload constraint
}

/**
 * Creates a signed, httpOnly session cookie. This is the ONLY place
 * user identity is established server-side — every API route trusts
 * this cookie, never any client-supplied userId/role/companyId field.
 */
export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secretKey());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function destroySession() {
  cookies().delete(SESSION_COOKIE);
}

/**
 * Reads and verifies the session from the incoming request's cookies.
 * Returns null if there is no valid session — callers must handle
 * the unauthenticated case explicitly, never assume a session exists.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
