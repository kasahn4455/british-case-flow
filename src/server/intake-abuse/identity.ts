const SESSION_COOKIE_NAME = "intake_session";
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRUSTED_IP_RE = /^[0-9a-fA-F:.]{3,64}$/;

export class TrustedClientIpUnavailableError extends Error {
  constructor() {
    super("Trusted Cloudflare client IP header is unavailable");
    this.name = "TrustedClientIpUnavailableError";
  }
}

export function getTrustedClientIp(request: Request): string {
  const value = request.headers.get("cf-connecting-ip")?.trim();
  if (!value || !TRUSTED_IP_RE.test(value)) throw new TrustedClientIpUnavailableError();
  return value;
}

export function readIntakeSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== SESSION_COOKIE_NAME) continue;
    const value = decodeURIComponent(rawValue.join("="));
    return UUID_RE.test(value) ? value : null;
  }
  return null;
}

export function getOrCreateIntakeSession(cookieHeader: string | null): {
  sessionId: string;
  setCookie: string | null;
} {
  const existing = readIntakeSessionId(cookieHeader);
  if (existing) return { sessionId: existing, setCookie: null };

  const sessionId = crypto.randomUUID();
  return {
    sessionId,
    setCookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/api/intake; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  };
}

export async function hmacIdentifier(kind: "ip" | "session", value: string, pepper: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${kind}:${value}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
