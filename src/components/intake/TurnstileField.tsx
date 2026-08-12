/// <reference types="vite/types/importMeta.d.ts" />

import { useEffect, useRef, useState } from "react";

type TurnstileWidgetId = string | number;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      retry: "auto";
      "retry-interval": number;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": (errorCode: string) => boolean;
    },
  ) => TurnstileWidgetId;
  reset: (widgetId: TurnstileWidgetId) => void;
  remove: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cloudflare-turnstile-explicit";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function clearFailedScript() {
  const existing = document.getElementById(SCRIPT_ID);
  existing?.remove();
  scriptPromise = null;
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Turnstile script failed to load")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  }).catch((error) => {
    clearFailedScript();
    throw error;
  });

  return scriptPromise;
}

function turnstileErrorMessage(errorCode: string) {
  if (errorCode === "110100" || errorCode === "110110" || errorCode === "400020") {
    return `Human verification is misconfigured (Cloudflare ${errorCode}). Please contact support.`;
  }
  if (errorCode === "110200") {
    return `This domain is not authorised for human verification (Cloudflare ${errorCode}).`;
  }
  if (errorCode === "200500") {
    return `Human verification was blocked from loading (Cloudflare ${errorCode}). Disable content blockers or try another network, then retry.`;
  }
  return `Human verification failed (Cloudflare ${errorCode}). Please retry or use another browser/network.`;
}

export function TurnstileField({
  onTokenChange,
  resetKey,
}: {
  onTokenChange: (token: string) => void;
  resetKey: number;
}) {
  const siteKey = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!siteKey) return;
    let disposed = false;
    setLoadError("");

    loadTurnstileScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "intake-submit",
          theme: "auto",
          size: "flexible",
          retry: "auto",
          "retry-interval": 5000,
          callback: (token) => {
            setLoadError("");
            onTokenChange(token);
          },
          "expired-callback": () => onTokenChange(""),
          "error-callback": (errorCode) => {
            onTokenChange("");
            setLoadError(turnstileErrorMessage(errorCode));
            return true;
          },
        });
      })
      .catch(() => {
        setLoadError(
          "Human verification script could not be loaded. Disable content blockers or try another network, then retry.",
        );
      });

    return () => {
      disposed = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onTokenChange, retryKey]);

  useEffect(() => {
    onTokenChange("");
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey, onTokenChange]);

  if (!siteKey) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-foreground"
      >
        Human verification is not configured in this environment. Submission is disabled.
      </p>
    );
  }

  return (
    <div>
      <div ref={containerRef} aria-label="Human verification" />
      {loadError ? (
        <div className="mt-2 space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground"
            onClick={() => {
              onTokenChange("");
              if (!window.turnstile) clearFailedScript();
              setRetryKey((value) => value + 1);
            }}
          >
            Retry human verification
          </button>
        </div>
      ) : null}
    </div>
  );
}
