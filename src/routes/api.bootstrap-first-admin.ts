import { createFileRoute } from "@tanstack/react-router";

const BOOTSTRAP_URL =
  "https://dbjhfrmnjvqmfhthiegg.supabase.co/functions/v1/bootstrap-first-admin";

export const Route = createFileRoute("/api/bootstrap-first-admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const token = requestUrl.searchParams.get("token");
        if (!token) return new Response("Not found", { status: 404 });

        const upstream = new URL(BOOTSTRAP_URL);
        upstream.searchParams.set("token", token);

        try {
          const response = await fetch(upstream, {
            method: "GET",
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
          });
          const body = await response.text();
          return new Response(body, {
            status: response.status,
            headers: {
              "content-type": response.headers.get("content-type") ?? "application/json",
              "cache-control": "no-store",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return Response.json({ ok: false, error: "bootstrap_upstream_unavailable" }, { status: 503 });
        }
      },
    },
  },
});
