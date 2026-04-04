/**
 * OCR service: extracts structured invoice data from a PDF buffer using
 * Claude's native document understanding (pdfs-2024-09-25 beta).
 *
 * Key design choices:
 * - Accept an optional Anthropic client so tests can inject a mock without
 *   patching module-level singletons.
 * - Validate the raw LLM response through a Zod schema before returning —
 *   this is the only place where unstructured text becomes typed data.
 * - Keep the prompt in a named constant so it's easy to tune without
 *   touching the function signature.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Pinned to the model specified in the task brief. Update here if the
// prod deployment needs a different tier.
export const OCR_MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// Zod schemas (single source of truth for the extraction shape)
// ---------------------------------------------------------------------------

export const LineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
});

export const InvoiceExtractionSchema = z.object({
  vendor: z.string().min(1),
  amount: z.number().positive(),
  lineItems: z.array(LineItemSchema),
  dueDate: z.string().nullable(), // ISO 8601 date string or null
  poNumber: z.string().nullable(),
  currency: z.string().length(3).default("USD"), // ISO 4217
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are an accounts payable specialist. Extract structured data from this invoice.

Return ONLY valid JSON — no markdown fences, no explanation, no extra keys.

Required schema:
{
  "vendor": "<supplier company name>",
  "amount": <total invoice amount as a number, no currency symbols>,
  "lineItems": [
    { "description": "<item>", "quantity": <n>, "unitPrice": <n>, "amount": <n> }
  ],
  "dueDate": "<ISO 8601 date e.g. 2024-03-15, or null>",
  "poNumber": "<PO reference number or null>",
  "currency": "<3-letter ISO code, default USD>"
}`;

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extracts invoice fields from a PDF buffer using Claude vision.
 *
 * @param pdfBuffer  Raw PDF bytes
 * @param client     Optional Anthropic client (inject in tests)
 * @returns          Validated InvoiceExtraction
 * @throws           ZodError if the model returns unexpected shape
 * @throws           Error if the model returns non-JSON or an unexpected content type
 */
export async function extractInvoiceData(
  pdfBuffer: Buffer,
  client?: Anthropic
): Promise<InvoiceExtraction> {
  const anthropic =
    client ??
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const base64Pdf = pdfBuffer.toString("base64");

  // The documents beta lets Claude read PDFs natively — no page-to-image
  // conversion needed, and it preserves table structure better than
  // pure text extraction for line items.
  const response = await (anthropic.beta.messages as any).create({
    model: OCR_MODEL,
    max_tokens: 2048,
    betas: ["pdfs-2024-09-25"],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          },
          {
            type: "text",
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  });

  const firstContent = response.content[0];
  if (!firstContent || firstContent.type !== "text") {
    throw new Error(
      `Unexpected Anthropic response content type: ${firstContent?.type ?? "empty"}`
    );
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(firstContent.text);
  } catch {
    throw new Error(
      `OCR response is not valid JSON. Raw (first 300 chars): ${firstContent.text.slice(0, 300)}`
    );
  }

  // Zod parse — throws ZodError with field-level details on mismatch
  return InvoiceExtractionSchema.parse(rawJson);
}
