import { router } from "../trpc";
import { invoiceRouter } from "./invoice";
import { vendorRouter } from "./vendor";
import { approvalRouter } from "./approval";
import { poRouter } from "./po";
import { dashboardRouter } from "./dashboard";
import { tenantRouter } from "./tenant";
import { glcodeRouter } from "./glcode";

export const appRouter = router({
  invoice: invoiceRouter,
  vendor: vendorRouter,
  approval: approvalRouter,
  po: poRouter,
  dashboard: dashboardRouter,
  tenant: tenantRouter,
  glcode: glcodeRouter,
});

export type AppRouter = typeof appRouter;
