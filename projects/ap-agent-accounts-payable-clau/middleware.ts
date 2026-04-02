import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Public routes that bypass Clerk authentication:
 *   - /api/ingest/* — webhook endpoints for email forwarding and external upload
 *     services that send invoices without a Clerk session.
 *   - Sign-in / sign-up pages.
 *   - Landing page.
 *
 * Everything else (dashboard, tRPC, settings) requires an active Clerk session.
 * Per-procedure authorization (role checks) happens in tRPC middleware, not here.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/ingest(.*)",
]);

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) {
    auth().protect();
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
