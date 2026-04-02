import { router } from "../trpc";
import { invoiceRouter } from "./invoice";
import { vendorRouter } from "./vendor";
import { approvalRouter } from "./approval";
import { poRouter } from "./po";
import { dashboardRouter } from "./dashboard";

export const appRouter = router({
  invoice: invoiceRouter,
  vendor: vendorRouter,
  approval: approvalRouter,
  po: poRouter,
  dashboard: dashboardRouter,
});

export type AppRouter = typeof appRouter;
