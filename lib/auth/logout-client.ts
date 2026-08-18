'use client';

import { apiFetch } from '@/lib/api-client';

/**
 * Signs the user out via POST. Logout is a state change (it destroys the
 * session cookie), so it must never be a plain `<a href>` GET link — a GET
 * that mutates state can be triggered by browser prefetching, crawlers, or
 * CSRF, without the user actually intending to sign out. This is why
 * /api/auth/logout only exports a POST handler; use this helper from any
 * "Sign out" button instead of linking to the route directly.
 */
export async function signOut() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
}
