import { describe, expect, it } from "vitest";
import {
  clampLimit,
  dueFollowUpStep,
  isAgentMode,
  isProtectedSource,
  withUnsubscribeFooter,
  UNSUBSCRIBE_FOOTER,
} from "./agent-rules";

describe("agent rules", () => {
  it("claude_agents disables in-app AI", () => {
    expect(isAgentMode("claude_agents")).toBe(true);
    expect(isAgentMode("anthropic")).toBe(false);
  });
  it("companies limit is capped at 50", () => {
    expect(clampLimit("500")).toBe(50);
    expect(clampLimit("10")).toBe(10);
  });
  it("manual and Excel values are protected from agent overwrite", () => {
    expect(isProtectedSource("kezi")).toBe(true);
    expect(isProtectedSource("opten_excel")).toBe(true);
    expect(isProtectedSource("agent")).toBe(false);
  });
  it("every outgoing email gets the unsubscribe footer once", () => {
    const once = withUnsubscribeFooter("Szia");
    expect(once).toContain(UNSUBSCRIBE_FOOTER);
    expect(withUnsubscribeFooter(once)).toBe(once);
  });
  it("follow-up step 2 is due after schedule[0] days", () => {
    const sent = new Date("2026-10-01T09:00:00Z");
    expect(dueFollowUpStep(1, sent, [4, 10], new Date("2026-10-04T09:00:00Z"))).toBeNull();
    expect(dueFollowUpStep(1, sent, [4, 10], new Date("2026-10-05T09:00:00Z"))).toBe(2);
    expect(dueFollowUpStep(3, sent, [4, 10, 21], new Date("2026-12-01T09:00:00Z"))).toBeNull();
  });
});
