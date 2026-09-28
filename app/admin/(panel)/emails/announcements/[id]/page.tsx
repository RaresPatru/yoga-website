"use client";

import { use } from "react";
import { AnnouncementScreen } from "@/components/admin/emails/announcement-screen";

/** One announcement: its editor while it is a draft, what it did once it is sent. */
export default function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AnnouncementScreen id={id} />;
}
