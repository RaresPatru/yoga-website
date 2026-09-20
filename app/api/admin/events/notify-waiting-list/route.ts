import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { notifyWaitingList } from "@/lib/notify-waiting-list";

/**
 * Offers an event's free seats to its waiting list. Called by the admin panel
 * after she saves an event.
 *
 * WHY SAVING AN EVENT SENDS EMAIL AT ALL
 *
 * Capacity is how many people can book on the website, and she moves it in both
 * directions: up when she opens a bigger room, down to hold a couple of places
 * back for a collaborator or a gift. NULL and 0 mean sold out, and the only
 * thing on offer then is the waiting list.
 *
 * So the waiting list is a queue that can only be released by an edit she
 * makes. Before this route existed there was nothing to release it — she could
 * change 0 to 15 and the fifteen people who had been waiting a fortnight would
 * never hear about it, because the only code that emailed them lived in the
 * Stripe webhook and only ran on a refund.
 *
 * WHY IT TAKES NO NUMBERS
 *
 * Only an event id. How many seats are free is read out of the database by
 * notifyWaitingList(), from the same view register_for_event() agrees with, so
 * a link it sends is a link that route will honour. Nothing about who gets
 * emailed, or how many, can be influenced by what the browser puts in the body
 * — the same reason prices are never read from a request here.
 *
 * That also makes the call safe to fire after *every* save rather than only
 * after a capacity change. If no seats are free, or nobody is waiting, it does
 * nothing and says so. If seats are free and people are waiting — which can
 * happen without her touching capacity at all, when a pending checkout that
 * made the event look full simply expires — the queue gets released instead of
 * sitting there while the room stays half empty.
 *
 * Nobody is emailed twice: an entry holding a claim link that has not yet
 * lapsed is skipped, so saving the same event four times in a minute sends one
 * batch.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await request.json();

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "eventId is required" }, { status: 400 });
    }

    const notified = await notifyWaitingList(eventId);

    // The count is for the panel to tell her what just happened in her name.
    // Sending email on her behalf and saying nothing about it is how she ends
    // up learning about it from somebody who replies to one.
    return NextResponse.json({ notified });
  } catch (error) {
    console.error("Waiting list notification failed:", error);
    return NextResponse.json({ error: "Notification failed" }, { status: 500 });
  }
}
