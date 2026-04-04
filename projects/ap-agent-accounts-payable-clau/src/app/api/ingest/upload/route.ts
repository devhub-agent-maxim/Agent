import { type NextRequest } from "next/server";
import { handleUploadIngest } from "@/server/services/invoice-processor";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handleUploadIngest(req);
}
