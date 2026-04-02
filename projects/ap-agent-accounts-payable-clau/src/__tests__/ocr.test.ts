/**
 * Unit tests for the OCR extraction pipeline.
 *
 * Strategy: mock the Anthropic SDK at the module boundary so no real API
 * calls are made. We inject a mock client instance directly into
 * extractInvoiceData() to keep the mock scope tight and avoid global
 * jest.mock() side-effects polluting other test files.
 *
 * What the reviewer should check:
 *  - The "throws ZodError" test verifies that a wrong-shape response causes
 *    a parse failure, not silent data loss.
 *  - The "throws on bad JSON" test covers the case where the model hallucinates
 *    markdown fences or a preamble instead of raw JSON.
 *  - The happy-path test confirms field mapping is correct, especially
 *    nullable fields (dueDate, poNumber).
 */

import { extractInvoiceData, InvoiceExtractionSchema } from "../server/services/ocr";
import { ZodError } from "zod";

// ---------------------------------------------------------------------------
// Minimal valid PDF fixture
// The Anthropic API only sees the base64-encoded bytes; we never try to render
// this in tests. The magic bytes (%PDF) satisfy our own validation check.
// ---------------------------------------------------------------------------
const MOCK_PDF_BUFFER = Buffer.from(
  "%PDF-1.4 mock invoice fixture for unit tests",
  "utf8"
);

// ---------------------------------------------------------------------------
// Shared mock invoice payload that the fake Anthropic client returns
// ---------------------------------------------------------------------------
const MOCK_INVOICE_DATA = {
  vendor: "Acme Supplies Ltd",
  amount: 4750.0,
  lineItems: [
    { description: "Widget Type A", quantity: 10, unitPrice: 250.0, amount: 2500.0 },
    { description: "Widget Type B", quantity: 5, unitPrice: 450.0, amount: 2250.0 },
  ],
  dueDate: "2024-04-15",
  poNumber: "PO-2024-0042",
  currency: "USD",
};

// ---------------------------------------------------------------------------
// Helper: build a minimal fake Anthropic client
// ---------------------------------------------------------------------------
function buildMockClient(responseText: string) {
  return {
    beta: {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: "text", text: responseText }],
        }),
      },
    },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractInvoiceData", () => {
  it("extracts and validates invoice data from a PDF buffer", async () => {
    const client = buildMockClient(JSON.stringify(MOCK_INVOICE_DATA));

    const result = await extractInvoiceData(MOCK_PDF_BUFFER, client);

    expect(result.vendor).toBe("Acme Supplies Ltd");
    expect(result.amount).toBe(4750.0);
    expect(result.currency).toBe("USD");
    expect(result.dueDate).toBe("2024-04-15");
    expect(result.poNumber).toBe("PO-2024-0042");
    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0]).toEqual({
      description: "Widget Type A",
      quantity: 10,
      unitPrice: 250.0,
      amount: 2500.0,
    });
  });

  it("handles nullable dueDate and poNumber gracefully", async () => {
    const payload = { ...MOCK_INVOICE_DATA, dueDate: null, poNumber: null };
    const client = buildMockClient(JSON.stringify(payload));

    const result = await extractInvoiceData(MOCK_PDF_BUFFER, client);

    expect(result.dueDate).toBeNull();
    expect(result.poNumber).toBeNull();
  });

  it("defaults currency to USD when not provided by the model", async () => {
    // Omit currency — Zod default should fill it in
    const { currency: _omitted, ...payloadWithoutCurrency } = MOCK_INVOICE_DATA;
    const client = buildMockClient(JSON.stringify(payloadWithoutCurrency));

    const result = await extractInvoiceData(MOCK_PDF_BUFFER, client);

    expect(result.currency).toBe("USD");
  });

  it("throws a descriptive error when the model returns non-JSON", async () => {
    const client = buildMockClient(
      "Here is the extracted data:\n```json\n{ broken json"
    );

    await expect(extractInvoiceData(MOCK_PDF_BUFFER, client)).rejects.toThrow(
      /OCR response is not valid JSON/
    );
  });

  it("throws a ZodError when the model returns JSON with missing required fields", async () => {
    // 'vendor' is required — omit it to trigger schema failure
    const badPayload = { amount: 100, lineItems: [], currency: "USD" };
    const client = buildMockClient(JSON.stringify(badPayload));

    await expect(extractInvoiceData(MOCK_PDF_BUFFER, client)).rejects.toBeInstanceOf(
      ZodError
    );
  });

  it("throws a ZodError when amount is negative (fails positive() constraint)", async () => {
    const badPayload = { ...MOCK_INVOICE_DATA, amount: -50 };
    const client = buildMockClient(JSON.stringify(badPayload));

    await expect(extractInvoiceData(MOCK_PDF_BUFFER, client)).rejects.toBeInstanceOf(
      ZodError
    );
  });

  it("throws when Anthropic returns a non-text content block", async () => {
    const client = {
      beta: {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: "tool_use", id: "x", name: "extract", input: {} }],
          }),
        },
      },
    } as any;

    await expect(extractInvoiceData(MOCK_PDF_BUFFER, client)).rejects.toThrow(
      /Unexpected Anthropic response content type/
    );
  });

  it("passes the PDF buffer as base64 in the document block", async () => {
    const client = buildMockClient(JSON.stringify(MOCK_INVOICE_DATA));

    await extractInvoiceData(MOCK_PDF_BUFFER, client);

    const callArgs = client.beta.messages.create.mock.calls[0][0];
    const docBlock = callArgs.messages[0].content[0];
    expect(docBlock.type).toBe("document");
    expect(docBlock.source.type).toBe("base64");
    expect(docBlock.source.media_type).toBe("application/pdf");
    expect(docBlock.source.data).toBe(MOCK_PDF_BUFFER.toString("base64"));
  });
});

// ---------------------------------------------------------------------------
// Schema unit test (fast, no I/O)
// ---------------------------------------------------------------------------

describe("InvoiceExtractionSchema", () => {
  it("validates a well-formed extraction object", () => {
    const result = InvoiceExtractionSchema.safeParse(MOCK_INVOICE_DATA);
    expect(result.success).toBe(true);
  });

  it("rejects an empty vendor string", () => {
    const result = InvoiceExtractionSchema.safeParse({
      ...MOCK_INVOICE_DATA,
      vendor: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a currency code that isn't 3 characters", () => {
    const result = InvoiceExtractionSchema.safeParse({
      ...MOCK_INVOICE_DATA,
      currency: "USDX",
    });
    expect(result.success).toBe(false);
  });
});
