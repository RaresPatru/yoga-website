import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { sendAnnouncement } from "@/lib/announcements";

/**
 * Sends an announcement (lib/announcements.ts), or, with `retry`, tries its
 * failed recipients again. The request carries only which announcement: who
 * receives it is decided by the server from the audience she saved, and only
 * people who opted in are included, whatever the browser says.
 *
 * Up to five minutes, which covers thousands of recipients at a hundred per
 * request to Resend. A send cut short keeps its place: each recipient is
 * marked as it goes, and the next attempt carries on from the ones left.
 */
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
    const body = await request.json().catch(() => ({}));

    const outcome = await sendAnnouncement(id, { retry: body?.retry === true });
    if (!outcome.ok) {
      const status = outcome.refused === "not_found" ? 404 : outcome.refused === "empty" ? 400 : 409;
      return NextResponse.json({ error: outcome.refused, code: outcome.refused }, { status });
    }
    return NextResponse.json(outcome.report);
  } catch (error) {
    console.error("Announcement send failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
