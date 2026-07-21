import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createAdminClient();

    const { data: entry, error: findError } = await supabase
      .from("waiting_list")
      .select("*, events!inner(*)")
      .eq("id", token)
      .is("claimed_at", null)
      .single();

    if (findError || !entry) {
      return NextResponse.json(
        { error: "Invalid or expired claim link" },
        { status: 404 }
      );
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("register_for_event", {
      p_event_id: entry.event_id,
      p_full_name: entry.full_name,
      p_email: entry.email,
      p_phone: entry.phone,
      p_payment_status: "free",
    });

    if (rpcError) throw rpcError;

    if (rpcResult?.error) {
      return NextResponse.json(
        { error: rpcResult.error },
        { status: 409 }
      );
    }

    const registration = rpcResult;

    await supabase
      .from("waiting_list")
      .update({
        claimed_at: new Date().toISOString(),
        claimed_registration_id: registration.id,
      })
      .eq("id", token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Claim spot error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
