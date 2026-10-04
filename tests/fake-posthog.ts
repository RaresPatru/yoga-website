import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";

/**
 * A stand-in for PostHog, for the test suite.
 *
 * The site never sends statistics from this machine to PostHog itself
 * (lib/analytics.ts), so until there was something here to receive them,
 * nothing about the statistics could be tested: not what is sent, not what is
 * cleaned out of it, not that nothing is stored in the browser. This server
 * accepts what posthog-js sends and keeps it in memory.
 *
 * The test build reaches it because playwright.config.ts sets
 * NEXT_PUBLIC_POSTHOG_HOST to its address, which analyticsHost() honours
 * only for an address on this machine. Tests read what arrived from
 * /__events and clear it with /__control (tests/analytics-helpers.ts).
 *
 * Like PostHog, it refuses events that do not carry the project's key in
 * their `token` property: PostHog files every event under that key and throws
 * away one without it, so an event the site has mangled must fail here too.
 * Refused requests, and any other request (PostHog's settings, its feature
 * flags, a script), are listed under /__requests as not accepted, because the
 * site should never make one.
 */

export const FAKE_POSTHOG_PORT = 12112;
export const FAKE_POSTHOG_URL = `http://127.0.0.1:${FAKE_POSTHOG_PORT}`;
/** The key the test build carries (playwright.config.ts). */
export const FAKE_POSTHOG_KEY = "phc_test_stand_in";

export interface RecordedEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp?: string;
  uuid?: string;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: string;
  accepted: boolean;
}

const state = {
  events: [] as RecordedEvent[],
  requests: [] as RecordedRequest[],
};

/** The paths posthog-js sends events to, old and new. */
const CAPTURE = /^\/(?:e|i\/v0\/e|batch|capture|track|engage)\/?$/;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * The events in one request. posthog-js sends gzip (recognised by its first
 * two bytes, whatever the query says), plain JSON, or, from sendBeacon, a form
 * field `data=` holding base64.
 */
function eventsIn(url: URL, body: Buffer): RecordedEvent[] {
  const compression = url.searchParams.get("compression");
  const gzipped = body.length > 2 && body[0] === 0x1f && body[1] === 0x8b;
  let text = (gzipped ? gunzipSync(body) : body).toString("utf8");
  if (text.startsWith("data=")) {
    text = Buffer.from(decodeURIComponent(text.slice(5).split("&")[0]), "base64").toString("utf8");
  } else if (compression === "base64") {
    text = Buffer.from(text, "base64").toString("utf8");
  }
  if (!text.trim()) return [];
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { batch?: unknown }).batch)
      ? (parsed as { batch: unknown[] }).batch
      : [parsed];
  return list.filter((item): item is RecordedEvent => !!item && typeof (item as RecordedEvent).event === "string");
}

/*
 * The pages are on localhost:3100 and this is 127.0.0.1:12112, another
 * origin, so the browser checks it may send here before it does.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

export function startFakePosthog(): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", FAKE_POSTHOG_URL);
      const path = url.pathname;
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS);
        return res.end();
      }

      if (path === "/__events") return send(res, 200, state.events);
      if (path === "/__requests") return send(res, 200, state.requests);
      if (path === "/__control" && req.method === "POST") {
        state.events = [];
        state.requests = [];
        return send(res, 200, { reset: true });
      }

      const request = { method: req.method ?? "GET", path, query: url.search, accepted: false };
      state.requests.push(request);
      if (req.method !== "POST" || !CAPTURE.test(path)) {
        return send(res, 404, { error: "The site should not ask for this." });
      }

      const events = eventsIn(url, await readBody(req));
      if (events.some((event) => event.properties?.token !== FAKE_POSTHOG_KEY)) {
        return send(res, 401, { error: "Project API key invalid." });
      }
      request.accepted = true;
      state.events.push(...events);
      return send(res, 200, { status: 1 });
    } catch (error) {
      console.error("[fake-posthog] failed:", error);
      send(res, 400, { error: String(error) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_POSTHOG_PORT, "127.0.0.1", () => resolve(server));
  });
}
