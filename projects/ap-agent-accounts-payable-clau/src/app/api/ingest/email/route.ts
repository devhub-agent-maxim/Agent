import { type NextRequest } from "next/server";
import { handleEmailIngest } from "@/server/services/invoice-processor";

export const runtime = "nodejs"; // PDF processing requires Node.js runtime (not edge)
export const maxDuration = 120; // 2-minute cap matches the < 2 min target

export async function POST(req: NextRequest) {
  return handleEmailIngest(req);
}
