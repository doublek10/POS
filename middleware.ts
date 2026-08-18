import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

// Route-level gate: redirects unauthenticated users away from protected
// pages. This is a UX convenience only — it is NOT the security boundary.
// The real boundary is requirePermission() inside every API route, which
// runs regardless of what this middleware does.
const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/webhooks')) {
    // Webhooks are authenticated by provider-specific signature
    // verification inside the route itself, not by session cookie.
    return NextResponse.next();
  }

  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession && (pathname.startsWith('/app') || pathname.startsWith('/api'))) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
