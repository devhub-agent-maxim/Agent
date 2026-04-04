/**
 * Invoice ingestion pipeline.
 *
 * Handles two ingest paths:
 *   1. Email — multipart form with a `from` field and a PDF `attachment`
 *   2. Manual upload — multipart form with a `file` PDF and optional metadata
 *
 * Both paths converge on extractInvoiceData() and return the same response
 * shape so downstream consumers don't need to care about how the PDF arrived.
 *
 * Design notes:
 * - We use the native Request / FormData API (Next.js App Router) — no multer.
 * - File size is validated before we touch the Anthropic API to avoid burning
 *   tokens on clearly bad input.
 * - The response includes an `ocrConfidence` placeholder (always 1.0 for now)
 *   that maps to the Prisma Invoice field — the reviewer should wire this to a
 *   real heuristic once we have calibration data.
 * - We deliberately do NOT persist to the database here; that belongs in the
 *   tRPC router layer so it can be wrapped in a transaction with vendor lookup.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractInvoiceData, InvoiceExtraction } from "./ocr";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB — generous for multi-page invoices
const PDF_MAGIC = "%PDF";

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface IngestSuccessResponse {
  success: true;
  source: "email" | "upload";
  extraction: InvoiceExtraction;
  /** Raw filename as provided by the sender/uploader */
  filename: string;
  /** Bytes of the received PDF */
  sizeBytes: number;
}

export interface IngestErrorResponse {
  success: false;
  error: string;
}

export type IngestResponse = IngestSuccessResponse | IngestErrorResponse;

// ---------------------------------------------------------------------------
// Validation schemas for request metadata
// ---------------------------------------------------------------------------

const EmailIngestMetaSchema = z.object({
  from: z.string().email("'from' must be a valid email address"),
  subject: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Shared helper: pull a PDF out of a FormData object
// ---------------------------------------------------------------------------

async function extractPdfFromFormData(
  formData: FormData,
  fieldName: string
): Promise<{ buffer: Buffer; filename: string }> {
  const entry = formData.get(fieldName);

  if (!entry || typeof entry === "string") {
    throw new Error(
      `Missing file field '${fieldName}'. Send a PDF as multipart/form-data.`
    );
  }

  const file = entry as File;
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    throw new Error(
      `Field '${fieldName}' must be a PDF file (got: ${file.type || file.name})`
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
    throw new Error(
      `PDF too large: ${arrayBuffer.byteLength} bytes (max ${MAX_PDF_BYTES})`
    );
  }

  const buffer = Buffer.from(arrayBuffer);

  // Sanity-check the PDF magic bytes — catches accidentally uploaded images etc.
  const header = buffer.subarray(0, 4).toString("ascii");
  if (header !== PDF_MAGIC) {
    throw new Error("File does not appear to be a valid PDF (bad magic bytes).");
  }

  return { buffer, filename: file.name };
}

// ---------------------------------------------------------------------------
// Handler: POST /api/ingest/email
//
// Expects multipart/form-data with:
//   from       (required) — sender email address
//   subject    (optional) — email subject line
//   attachment (required) — PDF file
// ---------------------------------------------------------------------------

export async function handleEmailIngest(
  req: NextRequest
): Promise<NextResponse<IngestResponse>> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  // Validate metadata
  const metaResult = EmailIngestMetaSchema.safeParse({
    from: formData.get("from"),
    subject: formData.get("subject"),
  });
  if (!metaResult.success) {
    return NextResponse.json(
      { success: false, error: metaResult.error.issues[0]?.message ?? "Invalid metadata" },
      { status: 400 }
    );
  }

  let buffer: Buffer;
  let filename: string;
  try {
    ({ buffer, filename } = await extractPdfFromFormData(formData, "attachment"));
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 }
    );
  }

  let extraction: InvoiceExtraction;
  try {
    extraction = await extractInvoiceData(buffer);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `OCR failed: ${(err as Error).message}` },
      { status: 422 }
    );
  }

  return NextResponse.json({
    success: true,
    source: "email",
    extraction,
    filename,
    sizeBytes: buffer.byteLength,
  });
}

// ---------------------------------------------------------------------------
// Handler: POST /api/ingest/upload
//
// Expects multipart/form-data with:
//   file       (required) — PDF file
//   tenantId   (optional) — forwarded from the authenticated session
// ---------------------------------------------------------------------------

export async function handleUploadIngest(
  req: NextRequest
): Promise<NextResponse<IngestResponse>> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Request must be multipart/form-data" },
      { status: 400 }
    );
  }

  let buffer: Buffer;
  let filename: string;
  try {
    ({ buffer, filename } = await extractPdfFromFormData(formData, "file"));
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 }
    );
  }

  let extraction: InvoiceExtraction;
  try {
    extraction = await extractInvoiceData(buffer);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `OCR failed: ${(err as Error).message}` },
      { status: 422 }
    );
  }

  return NextResponse.json({
    success: true,
    source: "upload",
    extraction,
    filename,
    sizeBytes: buffer.byteLength,
  });
}
