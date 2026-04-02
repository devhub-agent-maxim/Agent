import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  // Public routes — sign-in, sign-up, and the tRPC endpoint is protected
  // per-procedure via tenantProcedure middleware, not here.
  publicRoutes: ["/", "/sign-in(.*)", "/sign-up(.*)"],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
