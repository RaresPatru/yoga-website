import { PostHog } from "posthog-node";

export function getPostHogServerClient() {
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
  });
}
