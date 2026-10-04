import { redirect } from "next/navigation";
import { CONTENT_SECTIONS } from "@/lib/site-content-schema";

/** "Conținut site" opens on its first section. */
export default function ContentPage() {
  redirect(`/admin/content/${CONTENT_SECTIONS[0].id}`);
}
