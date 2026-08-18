import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /admin routes except /admin/login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const cookies = request.cookies;
    const hasAdminSession = cookies.has('admin_session') && cookies.get('admin_session')?.value === 'true';
    const hasSupabaseAuth = Array.from(cookies.getAll()).some(c => c.name.includes('sb-') || c.name.includes('supabase'));

    if (!hasAdminSession && !hasSupabaseAuth) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
