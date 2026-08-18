import { NextResponse } from 'next/server';
import { getSession, SessionPayload } from '@/lib/auth/session';
import { roleHasPermission } from './catalogue';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Loads the session and asserts it carries `permission`.
 *
 * THIS is the enforcement point referenced throughout the spec ("do
 * not rely on hiding buttons in the frontend"). Every mutating route
 * (and most reads) call this before touching the database. It throws
 * ApiError rather than returning a response so callers can just
 * `await requirePermission(...)` at the top of a try block.
 */
export async function requirePermission(permission: string): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, 'Not authenticated');
  }
  if (!roleHasPermission(session.role, permission)) {
    throw new ApiError(403, `Role ${session.role} lacks permission "${permission}"`);
  }
  return session;
}

/** Convert an ApiError (or unknown error) into a NextResponse. */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
