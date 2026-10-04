import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { inviteEventParticipants } from "@/lib/reviews";

/**
 * "Trimite invitațiile" on an ended event: a personal link to write a
 * testimonial for everyone on it who may write one and has not been sent a
 * link that still works. Answers how many were emailed, which the editor tells
 * her, since the emails go out in her name.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
    }

    const result = await inviteEventParticipants(id);
    if ("refused" in result) {
      return NextResponse.json(
        { error: result.refused, code: result.refused },
        { status: result.refused === "not_found" ? 404 : 409 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Review invitations failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
