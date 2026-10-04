"use client";

import { EventEditor } from "@/components/admin/events/event-editor";

/**
 * A new event. Nothing is created until it has a title and a date; the first
 * save creates it and the address becomes /admin/events/<id>.
 */
export default function NewEventPage() {
  return <EventEditor initial={null} />;
}
