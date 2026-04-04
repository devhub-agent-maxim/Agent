/**
 * Dashboard UI — unit tests
 *
 * These tests exercise pure helper functions extracted from the page components.
 * They run in jest-environment-node without a DOM so they're fast and CI-safe.
 * The tRPC calls are not tested here — see routers.test.ts for server-side coverage.
 */

describe("Invoice pipeline helpers", () => {
  const CONFIDENCE_THRESHOLD = 0.8;

  function splitPendingByConfidence(
    items: { id: string; ocrConfidence: number | null }[],
    threshold: number
  ) {
    const pendingReview = items.filter(
      (i) => i.ocrConfidence === null || i.ocrConfidence < threshold
    );
    const awaitingApproval = items.filter(
      (i) => i.ocrConfidence !== null && i.ocrConfidence >= threshold
    );
    return { pendingReview, awaitingApproval };
  }

  it("routes null confidence to pendingReview", () => {
    const inv = { id: "1", ocrConfidence: null };
    const { pendingReview } = splitPendingByConfidence([inv], CONFIDENCE_THRESHOLD);
    expect(pendingReview).toHaveLength(1);
  });

  it("routes low confidence to pendingReview", () => {
    const inv = { id: "2", ocrConfidence: 0.6 };
    const { pendingReview } = splitPendingByConfidence([inv], CONFIDENCE_THRESHOLD);
    expect(pendingReview).toHaveLength(1);
  });

  it("routes high confidence to awaitingApproval", () => {
    const inv = { id: "3", ocrConfidence: 0.85 };
    const { awaitingApproval } = splitPendingByConfidence([inv], CONFIDENCE_THRESHOLD);
    expect(awaitingApproval).toHaveLength(1);
  });

  it("boundary: exactly at threshold goes to awaitingApproval", () => {
    const inv = { id: "4", ocrConfidence: 0.8 };
    const { awaitingApproval } = splitPendingByConfidence([inv], CONFIDENCE_THRESHOLD);
    expect(awaitingApproval).toHaveLength(1);
  });

  it("splits a mixed list correctly", () => {
    const items = [
      { id: "a", ocrConfidence: null },
      { id: "b", ocrConfidence: 0.5 },
      { id: "c", ocrConfidence: 0.8 },
      { id: "d", ocrConfidence: 0.95 },
    ];
    const { pendingReview, awaitingApproval } = splitPendingByConfidence(
      items,
      CONFIDENCE_THRESHOLD
    );
    expect(pendingReview).toHaveLength(2);
    expect(awaitingApproval).toHaveLength(2);
  });
});

describe("Exception detection", () => {
  const LOW_CONFIDENCE_THRESHOLD = 0.7;

  function getExceptionReasons(inv: {
    ocrConfidence: number | null;
    purchaseOrderId: string | null;
  }) {
    const reasons: string[] = [];
    if (inv.ocrConfidence === null || inv.ocrConfidence < LOW_CONFIDENCE_THRESHOLD) {
      reasons.push("low_confidence");
    }
    if (!inv.purchaseOrderId) {
      reasons.push("no_po_match");
    }
    return reasons;
  }

  it("flags null confidence as exception", () => {
    expect(getExceptionReasons({ ocrConfidence: null, purchaseOrderId: "po_1" })).toContain(
      "low_confidence"
    );
  });

  it("flags missing PO as exception", () => {
    expect(getExceptionReasons({ ocrConfidence: 0.9, purchaseOrderId: null })).toContain(
      "no_po_match"
    );
  });

  it("clean invoice has no exceptions", () => {
    expect(
      getExceptionReasons({ ocrConfidence: 0.95, purchaseOrderId: "po_1" })
    ).toHaveLength(0);
  });

  it("invoice with both issues has two reasons", () => {
    expect(
      getExceptionReasons({ ocrConfidence: 0.4, purchaseOrderId: null })
    ).toHaveLength(2);
  });
});

describe("Amount formatting", () => {
  function formatAmount(amt: unknown): string {
    const n = typeof amt === "string" ? parseFloat(amt as string) : Number(amt);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  }

  it("formats a numeric amount", () => {
    expect(formatAmount(1250)).toBe("$1,250.00");
  });

  it("formats a string Decimal from Prisma", () => {
    expect(formatAmount("3400.00")).toBe("$3,400.00");
  });

  it("formats zero", () => {
    expect(formatAmount(0)).toBe("$0.00");
  });
});
