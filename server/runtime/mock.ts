// =====================================================
// MockRuntime — canned page state + fake execution.
//
// Used in Phase A so the entire approval flow (Johnny proposes → manager approves
// → runtime executes → audit log records result) can be exercised end-to-end
// without a real browser.
// =====================================================

import { createHash } from "crypto";
import type { BrowserRuntime, PageState, ExecutionResult } from "./index";
import type { ManagedSession, PendingAction } from "@shared/schema";

// 1x1 transparent PNG, base64-encoded. Stand-in for a real screenshot.
const PLACEHOLDER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function hashState(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export class MockRuntime implements BrowserRuntime {
  readonly kind = "mock";

  async readPage(session: ManagedSession, opts?: { url?: string }): Promise<PageState> {
    const site = session.site;
    // Site-specific canned pages so Johnny's prompt sees something believable.
    const cannedByUrl: Record<string, { title: string; url: string; text: string }> = {
      fiverr: {
        title: "Mock Fiverr Inbox",
        url: "https://www.fiverr.com/inbox/mock-seller",
        text:
          "Inbox (3 unread)\n" +
          "— Buyer @alex_marketer (2h ago): Hi, can you deliver 5 logo variants by Friday?\n" +
          "— Buyer @nadia_studio (5h ago): What's your turnaround for a brand kit?\n" +
          "— Buyer @sam_devs (1d ago): Following up on my last message, are you available?",
      },
      alibaba: {
        title: "Mock Alibaba — Messages",
        url: "https://message.alibaba.com/message/messenger.htm",
        text:
          "Suppliers awaiting reply:\n" +
          "— Shenzhen LED Co.: \"We can offer 5,000 units at $2.10/unit, MOQ 1,000.\"\n" +
          "— Guangzhou Pack Ltd.: \"Sample requested — please confirm shipping address.\"\n" +
          "— Yiwu Trading: \"Quote attached for the OEM run.\"",
      },
      other: {
        title: "Mock Page",
        url: opts?.url || "https://example.com/",
        text: "Mock page content. This site uses the generic 'other' runtime stub.",
      },
    };

    const canned = cannedByUrl[site] || cannedByUrl.other;
    const url = opts?.url || canned.url;
    const capturedAt = new Date().toISOString();
    const stateHash = hashState([session.id.toString(), site, url, canned.text]);

    return {
      title: canned.title,
      url,
      visibleText: canned.text,
      screenshot: PLACEHOLDER_PNG,
      stateHash,
      capturedAt,
    };
  }

  async executeApprovedAction(session: ManagedSession, action: PendingAction): Promise<ExecutionResult> {
    // The mock always succeeds. It echoes back a plausible response so the
    // audit log has something human-readable to display.
    const afterStateHash = hashState([
      session.id.toString(),
      session.site,
      action.actionType,
      action.payload,
      "executed",
    ]);

    let responseText = "Mock send succeeded";
    if (action.actionType === "send_message") {
      responseText = "Mock: message delivered to recipient inbox.";
    } else if (action.actionType === "request_quote") {
      responseText = "Mock: quote request submitted; supplier will respond within 24h.";
    }

    return {
      ok: true,
      executedAt: Date.now(),
      responseText,
      afterStateHash,
    };
  }
}
