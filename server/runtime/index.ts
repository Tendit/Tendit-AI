// =====================================================
// BrowserRuntime — abstraction for the actual logged-in browser surface.
//
// Phase A ships only the "mock" runtime (canned page state, fake exec result).
// Phase B+ will add "local_chrome" (Puppeteer/Playwright attached to a real profile)
// and "browserless" (remote browser service). Those throw "not yet implemented"
// from the factory until they're built — we want the type surface stable now
// so the rest of Tendit can wire against it.
// =====================================================

import type { ManagedSession, PendingAction } from "@shared/schema";

export interface PageState {
  title: string;
  url: string;
  visibleText: string;
  // Base64-encoded PNG (no data URL prefix). Always small in mock mode.
  screenshot?: string;
  // Stable hash of the page state — used so audit logs can detect drift between
  // "what Johnny saw when he proposed" vs "what the page looks like when we execute".
  stateHash: string;
  capturedAt: string;
}

export interface ExecutionResult {
  ok: boolean;
  executedAt: number;
  responseText?: string;
  error?: string;
  // Echoed back so the audit log can record the post-action page hash.
  afterStateHash?: string;
}

export interface BrowserRuntime {
  /**
   * Identifier returned by getRuntime() — useful for logs.
   */
  readonly kind: string;

  /**
   * Read the current page state for this session (what the user-as-Johnny sees).
   * Implementations may navigate to a session-relevant page (e.g. Fiverr inbox)
   * before returning.
   */
  readPage(session: ManagedSession, opts?: { url?: string }): Promise<PageState>;

  /**
   * Execute an action that has ALREADY been approved by a human manager.
   * Implementations MUST NOT execute pending or rejected actions — the caller
   * is responsible for state checks, but defensive impls may double-check.
   */
  executeApprovedAction(session: ManagedSession, action: PendingAction): Promise<ExecutionResult>;
}

// Factory — returns a runtime instance keyed by session.runtime.
// Cached per process so we don't spin up a new browser on every call.
const runtimeCache = new Map<string, BrowserRuntime>();

export function getRuntime(kind: string): BrowserRuntime {
  const cached = runtimeCache.get(kind);
  if (cached) return cached;

  let instance: BrowserRuntime;
  switch (kind) {
    case "mock": {
      // Lazy require so this file stays cheap if mock isn't used.
      const { MockRuntime } = require("./mock");
      instance = new MockRuntime();
      break;
    }
    case "local_chrome":
      throw new Error("BrowserRuntime 'local_chrome' is not yet implemented (Phase B).");
    case "browserless":
      throw new Error("BrowserRuntime 'browserless' is not yet implemented (Phase B).");
    default:
      throw new Error(`Unknown BrowserRuntime kind: ${kind}`);
  }

  runtimeCache.set(kind, instance);
  return instance;
}
