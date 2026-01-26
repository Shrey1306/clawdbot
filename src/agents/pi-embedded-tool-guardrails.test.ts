import { describe, expect, it } from "vitest";
import {
  checkConsecutiveToolError,
  normalizeErrorKey,
  resolveToolGuardrails,
} from "./pi-embedded-tool-guardrails.js";
import type { ClawdbotConfig } from "../config/config.js";

describe("pi-embedded-tool-guardrails", () => {
  describe("resolveToolGuardrails", () => {
    it("returns defaults when no config provided", () => {
      const result = resolveToolGuardrails(undefined);
      expect(result.maxConsecutiveToolErrors).toBe(3);
      expect(result.maxToolCallsPerTurn).toBe(50);
      expect(result.toolErrorAction).toBe("abort");
    });

    it("returns defaults when config has no toolGuardrails", () => {
      const cfg = { agents: { defaults: {} } } as ClawdbotConfig;
      const result = resolveToolGuardrails(cfg);
      expect(result.maxConsecutiveToolErrors).toBe(3);
      expect(result.maxToolCallsPerTurn).toBe(50);
      expect(result.toolErrorAction).toBe("abort");
    });

    it("uses top-level guardrails when toolGuardrails is not set", () => {
      const cfg = {
        agents: {
          defaults: {
            maxConsecutiveToolErrors: 4,
            maxToolCallsPerTurn: 12,
            toolErrorAction: "escalate" as const,
          },
        },
      } as ClawdbotConfig;
      const result = resolveToolGuardrails(cfg);
      expect(result.maxConsecutiveToolErrors).toBe(4);
      expect(result.maxToolCallsPerTurn).toBe(12);
      expect(result.toolErrorAction).toBe("escalate");
    });

    it("uses configured values when provided", () => {
      const cfg = {
        agents: {
          defaults: {
            toolGuardrails: {
              maxConsecutiveToolErrors: 5,
              maxToolCallsPerTurn: 20,
              toolErrorAction: "warn" as const,
            },
          },
        },
      } as ClawdbotConfig;
      const result = resolveToolGuardrails(cfg);
      expect(result.maxConsecutiveToolErrors).toBe(5);
      expect(result.maxToolCallsPerTurn).toBe(20);
      expect(result.toolErrorAction).toBe("warn");
    });

    it("prefers toolGuardrails when both top-level and nested values are set", () => {
      const cfg = {
        agents: {
          defaults: {
            maxConsecutiveToolErrors: 10,
            maxToolCallsPerTurn: 99,
            toolErrorAction: "warn" as const,
            toolGuardrails: {
              maxConsecutiveToolErrors: 2,
              maxToolCallsPerTurn: 7,
              toolErrorAction: "abort" as const,
            },
          },
        },
      } as ClawdbotConfig;
      const result = resolveToolGuardrails(cfg);
      expect(result.maxConsecutiveToolErrors).toBe(2);
      expect(result.maxToolCallsPerTurn).toBe(7);
      expect(result.toolErrorAction).toBe("abort");
    });

    it("clamps maxConsecutiveToolErrors to valid range", () => {
      // Below minimum
      const cfgLow = {
        agents: { defaults: { toolGuardrails: { maxConsecutiveToolErrors: 0 } } },
      } as ClawdbotConfig;
      expect(resolveToolGuardrails(cfgLow).maxConsecutiveToolErrors).toBe(1);

      // Above maximum
      const cfgHigh = {
        agents: { defaults: { toolGuardrails: { maxConsecutiveToolErrors: 100 } } },
      } as ClawdbotConfig;
      expect(resolveToolGuardrails(cfgHigh).maxConsecutiveToolErrors).toBe(25);
    });

    it("clamps maxToolCallsPerTurn to valid range", () => {
      // Below minimum
      const cfgLow = {
        agents: { defaults: { toolGuardrails: { maxToolCallsPerTurn: 0 } } },
      } as ClawdbotConfig;
      expect(resolveToolGuardrails(cfgLow).maxToolCallsPerTurn).toBe(1);

      // Above maximum
      const cfgHigh = {
        agents: { defaults: { toolGuardrails: { maxToolCallsPerTurn: 500 } } },
      } as ClawdbotConfig;
      expect(resolveToolGuardrails(cfgHigh).maxToolCallsPerTurn).toBe(200);
    });

    it("falls back to default for invalid toolErrorAction", () => {
      const cfg = {
        agents: { defaults: { toolGuardrails: { toolErrorAction: "invalid" } } },
      } as unknown as ClawdbotConfig;
      expect(resolveToolGuardrails(cfg).toolErrorAction).toBe("abort");
    });

    it("handles non-finite numeric values", () => {
      const cfg = {
        agents: {
          defaults: {
            toolGuardrails: {
              maxConsecutiveToolErrors: Number.NaN,
              maxToolCallsPerTurn: Number.POSITIVE_INFINITY,
            },
          },
        },
      } as ClawdbotConfig;
      const result = resolveToolGuardrails(cfg);
      expect(result.maxConsecutiveToolErrors).toBe(3);
      expect(result.maxToolCallsPerTurn).toBe(50);
    });

    it("floors fractional values", () => {
      const cfg = {
        agents: {
          defaults: {
            toolGuardrails: { maxConsecutiveToolErrors: 5.9, maxToolCallsPerTurn: 30.1 },
          },
        },
      } as ClawdbotConfig;
      const result = resolveToolGuardrails(cfg);
      expect(result.maxConsecutiveToolErrors).toBe(5);
      expect(result.maxToolCallsPerTurn).toBe(30);
    });
  });

  describe("normalizeErrorKey", () => {
    it("returns empty string for undefined", () => {
      expect(normalizeErrorKey(undefined)).toBe("");
    });

    it("returns empty string for empty/whitespace string", () => {
      expect(normalizeErrorKey("")).toBe("");
      expect(normalizeErrorKey("   ")).toBe("");
    });

    it("trims whitespace and lowercases", () => {
      expect(normalizeErrorKey("  Error MESSAGE  ")).toBe("error message");
    });

    it("truncates long error messages", () => {
      const longError = "x".repeat(600);
      const result = normalizeErrorKey(longError);
      expect(result.length).toBe(500);
    });

    it("handles typical error messages", () => {
      expect(normalizeErrorKey("to required")).toBe("to required");
      expect(normalizeErrorKey("Permission denied")).toBe("permission denied");
    });
  });

  describe("checkConsecutiveToolError", () => {
    it("returns count 1 when no previous error", () => {
      const result = checkConsecutiveToolError(
        { toolName: "exec", error: "permission denied" },
        undefined,
      );
      expect(result.toolName).toBe("exec");
      expect(result.errorMessage).toBe("permission denied");
      expect(result.count).toBe(1);
    });

    it("increments count for same tool and error", () => {
      const prev = { toolName: "exec", errorMessage: "permission denied", count: 2 };
      const result = checkConsecutiveToolError(
        { toolName: "exec", error: "Permission denied" },
        prev,
      );
      expect(result.count).toBe(3);
      expect(result.toolName).toBe("exec");
      expect(result.errorMessage).toBe("permission denied");
    });

    it("resets count for different tool name", () => {
      const prev = { toolName: "exec", errorMessage: "permission denied", count: 5 };
      const result = checkConsecutiveToolError(
        { toolName: "read", error: "permission denied" },
        prev,
      );
      expect(result.count).toBe(1);
      expect(result.toolName).toBe("read");
    });

    it("resets count for different error message", () => {
      const prev = { toolName: "exec", errorMessage: "permission denied", count: 5 };
      const result = checkConsecutiveToolError({ toolName: "exec", error: "file not found" }, prev);
      expect(result.count).toBe(1);
      expect(result.errorMessage).toBe("file not found");
    });

    it("handles undefined error gracefully", () => {
      const result = checkConsecutiveToolError({ toolName: "exec", error: undefined }, undefined);
      expect(result.errorMessage).toBe("");
      expect(result.count).toBe(1);
    });

    it("matches error after normalization (case-insensitive)", () => {
      const prev = { toolName: "message", errorMessage: "to required", count: 1 };
      const result = checkConsecutiveToolError({ toolName: "message", error: "TO REQUIRED" }, prev);
      expect(result.count).toBe(2);
    });
  });
});
