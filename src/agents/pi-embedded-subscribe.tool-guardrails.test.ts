import { describe, expect, it, vi } from "vitest";

import { subscribeEmbeddedPiSession } from "./pi-embedded-subscribe.js";

type StubSession = {
  subscribe: (fn: (evt: unknown) => void) => () => void;
};

describe("subscribeEmbeddedPiSession tool guardrails", () => {
  it("resets tool call budget per assistant message", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onToolGuardrailTriggered = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run-tool-budget",
      toolGuardrails: {
        maxConsecutiveToolErrors: 3,
        maxToolCallsPerTurn: 2,
        toolErrorAction: "abort",
      },
      onToolGuardrailTriggered,
    });

    handler?.({ type: "message_start", message: { role: "assistant" } });
    handler?.({
      type: "tool_execution_end",
      toolName: "read",
      toolCallId: "tool-1",
      isError: false,
      result: "ok",
    });
    handler?.({
      type: "tool_execution_end",
      toolName: "read",
      toolCallId: "tool-2",
      isError: false,
      result: "ok",
    });

    expect(onToolGuardrailTriggered).toHaveBeenCalledTimes(1);
    expect(onToolGuardrailTriggered.mock.calls[0]?.[0]?.type).toBe("tool_call_budget_exceeded");

    handler?.({ type: "message_start", message: { role: "assistant" } });
    handler?.({
      type: "tool_execution_end",
      toolName: "read",
      toolCallId: "tool-3",
      isError: false,
      result: "ok",
    });

    expect(onToolGuardrailTriggered).toHaveBeenCalledTimes(1);
  });

  it("emits consecutive error guardrail events", () => {
    let handler: ((evt: unknown) => void) | undefined;
    const session: StubSession = {
      subscribe: (fn) => {
        handler = fn;
        return () => {};
      },
    };

    const onToolGuardrailTriggered = vi.fn();

    subscribeEmbeddedPiSession({
      session: session as unknown as Parameters<typeof subscribeEmbeddedPiSession>[0]["session"],
      runId: "run-tool-errors",
      toolGuardrails: {
        maxConsecutiveToolErrors: 2,
        maxToolCallsPerTurn: 50,
        toolErrorAction: "warn",
      },
      onToolGuardrailTriggered,
    });

    handler?.({
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId: "tool-err-1",
      isError: true,
      result: { error: "Boom" },
    });
    handler?.({
      type: "tool_execution_end",
      toolName: "bash",
      toolCallId: "tool-err-2",
      isError: true,
      result: { error: "Boom" },
    });

    expect(onToolGuardrailTriggered).toHaveBeenCalledTimes(1);
    expect(onToolGuardrailTriggered.mock.calls[0]?.[0]?.type).toBe("consecutive_error_limit");
  });
});
