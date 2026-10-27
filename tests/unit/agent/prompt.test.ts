import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../../src/agent/prompt.js";
import { REFUND_WINDOW_DAYS } from "../../../src/domain/policy.js";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt();

  it("states the refund window from the policy code, so the two can't drift", () => {
    expect(prompt).toContain(`within ${REFUND_WINDOW_DAYS} days of delivery`);
  });

  it("tells the model to look up before acting", () => {
    expect(prompt).toMatch(/look up before you act/i);
    expect(prompt).toContain("check_refund_policy before issue_refund");
  });

  it("forbids claiming a refund that issue_refund did not confirm", () => {
    expect(prompt).toContain("Never claim a refund happened unless issue_refund returned ok");
  });
});
