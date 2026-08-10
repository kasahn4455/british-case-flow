/// <reference types="vite/types/importMeta.d.ts" />

import { useEffect, useRef, useState } from "react";

type TurnstileWidgetId = string | number;

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
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

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile script failed to load")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.defer = true;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function TurnstileField(props: {
  onTokenChange: (token: string) => void;
  resetKey: number;
}) {
  const siteKey = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    let disposed = false;

    loadTurnstileScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.turnstile) return;
        window.turnstile.ready(() => {
          if (disposed || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action: "intake-submit",
            theme: "auto",
            size: "flexible",
            callback: (token) => props.onTokenChange(token),
            "expired-callback": () => props.onTokenChange(""),
            "error-callback": () => {
              props.onTokenChange("");
              setLoadError(true);
            },
          });
        });
      })
      .catch(() => setLoadError(true));

    return () => {
      disposed = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, props.onTokenChange]);

  useEffect(() => {
    props.onTokenChange("");
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [props.resetKey, props.onTokenChange]);

  if (!siteKey) {
    return (
      <p role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
        Human verification is not configured in this environment. Submission is disabled.
      </p>
    );
  }

  return (
    <div>
      <div ref={containerRef} aria-label="Human verification" />
      {loadError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Human verification could not be loaded. Please refresh and try again.
        </p>
      ) : null}
    </div>
  );
}
