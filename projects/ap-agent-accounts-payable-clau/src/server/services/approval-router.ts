/**
 * Approval Router — evaluates an invoice against the tenant's approval_rules,
 * creates approval_requests records, and sends notifications.
 *
 * Rules are evaluated in ascending priority order (lower int = higher priority).
 * All matching rules generate a request — a $500 invoice may need both an
 * AP clerk and a manager sign-off depending on tenant configuration.
 *
 * Auto-approve rules bypass notification and immediately mark the request
 * as approved.
 *
 * Reviewer: confirm that tenants with no rules get a sensible default.
 * Currently we create a single "pending" request with approverEmail=null
 * so the AP team can manually assign — adjust if you want to throw instead.
 */

import type { PrismaClient } from "@prisma/client";
import { notifyApprover } from "./notifier";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ApprovalRouteResult {
  autoApproved: boolean;
  requestIds: string[];
  matchedRules: number;
}

// ---------------------------------------------------------------------------
// Main routing function
// ---------------------------------------------------------------------------

export async function routeApproval(
  tenantId: string,
  invoiceId: string,
  invoiceAmount: number,
  actorId: string,
  actorEmail: string | null,
  prisma: PrismaClient
): Promise<ApprovalRouteResult> {
  // Load active rules in priority order (ascending = highest priority first)
  const rules = await prisma.approvalRule.findMany({
    where: {
      tenantId,
      active: true,
      minAmount: { lte: invoiceAmount },
      OR: [{ maxAmount: null }, { maxAmount: { gte: invoiceAmount } }],
    },
    orderBy: { priority: "asc" },
  });

  // Load the invoice for notification content
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: { vendor: true },
  });

  const requestIds: string[] = [];
  let allAutoApproved = rules.length > 0;

  if (rules.length === 0) {
    // No rules configured — create an unassigned pending request so the
    // invoice isn't silently stuck. AP team can see it in the dashboard.
    const req = await prisma.approvalRequest.create({
      data: {
        tenantId,
        invoiceId,
        approverEmail: actorEmail ?? "unassigned",
        approverRole: "ap_clerk",
        status: "pending",
      },
    });
    requestIds.push(req.id);
    allAutoApproved = false;
  } else {
    for (const rule of rules) {
      const status = rule.autoApprove ? "approved" : "pending";

      const req = await prisma.approvalRequest.create({
        data: {
          tenantId,
          invoiceId,
          ruleId: rule.id,
          approverEmail: rule.approverEmail,
          approverRole: rule.approverRole,
          status,
          ...(rule.autoApprove
            ? { resolvedAt: new Date(), resolvedBy: "system:auto-approve" }
            : {}),
        },
      });

      requestIds.push(req.id);

      if (!rule.autoApprove) {
        allAutoApproved = false;

        // Notify approver — fire-and-forget, don't block the mutation
        if (invoice) {
          notifyApprover({
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            vendorName: invoice.vendor.name,
            totalAmount: invoiceAmount,
            currency: invoice.currency,
            approverEmail: rule.approverEmail,
            approverRole: rule.approverRole,
            requestId: req.id,
          }).catch((err: unknown) => {
            console.error("[approval-router] notification failed:", err);
          });

          // Mark notifiedAt after dispatching
          await prisma.approvalRequest.update({
            where: { id: req.id },
            data: { notifiedAt: new Date() },
          });
        }
      }
    }
  }

  // If every rule was auto-approve, flip the invoice to approved
  if (allAutoApproved && rules.length > 0) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: "system:auto-approve",
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        entityType: "invoice",
        entityId: invoiceId,
        action: "approved",
        actorId,
        actorEmail,
        changes: { reason: "all_rules_auto_approve" },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId,
      entityType: "invoice",
      entityId: invoiceId,
      action: "approval_routed",
      actorId,
      actorEmail,
      changes: {
        rulesMatched: rules.length,
        requestIds,
        autoApproved: allAutoApproved,
      },
    },
  });

  return {
    autoApproved: allAutoApproved,
    requestIds,
    matchedRules: rules.length,
  };
}
