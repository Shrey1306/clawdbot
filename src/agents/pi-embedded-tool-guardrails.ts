import type { ClawdbotConfig } from "../config/config.js";
import type { ToolErrorAction } from "../config/types.agent-defaults.js";

const DEFAULT_MAX_CONSECUTIVE_TOOL_ERRORS = 3;
const DEFAULT_MAX_TOOL_CALLS_PER_TURN = 50;
const DEFAULT_TOOL_ERROR_ACTION: ToolErrorAction = "abort";

const MAX_CONSECUTIVE_TOOL_ERRORS_LIMIT = 25;
const MAX_TOOL_CALLS_PER_TURN_LIMIT = 200;

/** Error key truncation limit for normalization. */
const ERROR_KEY_MAX_CHARS = 500;

export type ToolGuardrailsResolved = {
  maxConsecutiveToolErrors: number;
  maxToolCallsPerTurn: number;
  toolErrorAction: ToolErrorAction;
};

export type ConsecutiveToolError = {
  toolName: string;
  errorMessage: string;
  count: number;
};

export type ToolGuardrailEvent = {
  type: "consecutive_error_limit" | "tool_call_budget_exceeded";
  toolName?: string;
  errorMessage?: string;
  count: number;
  limit: number;
  action: ToolErrorAction;
};

/**
 * Resolve tool guardrails configuration from agent defaults.
 * Follows the `resolvePingPongTurns` pattern from sessions-send-helpers.ts.
 */
export function resolveToolGuardrails(cfg?: ClawdbotConfig): ToolGuardrailsResolved {
  const defaults = cfg?.agents?.defaults;
  const guardrails = defaults?.toolGuardrails;

  const rawConsecutive = guardrails?.maxConsecutiveToolErrors ?? defaults?.maxConsecutiveToolErrors;
  const maxConsecutiveToolErrors =
    typeof rawConsecutive === "number" && Number.isFinite(rawConsecutive)
      ? Math.max(1, Math.min(MAX_CONSECUTIVE_TOOL_ERRORS_LIMIT, Math.floor(rawConsecutive)))
      : DEFAULT_MAX_CONSECUTIVE_TOOL_ERRORS;

  const rawBudget = guardrails?.maxToolCallsPerTurn ?? defaults?.maxToolCallsPerTurn;
  const maxToolCallsPerTurn =
    typeof rawBudget === "number" && Number.isFinite(rawBudget)
      ? Math.max(1, Math.min(MAX_TOOL_CALLS_PER_TURN_LIMIT, Math.floor(rawBudget)))
      : DEFAULT_MAX_TOOL_CALLS_PER_TURN;

  const rawAction = guardrails?.toolErrorAction ?? defaults?.toolErrorAction;
  const toolErrorAction: ToolErrorAction =
    rawAction === "warn" || rawAction === "escalate" || rawAction === "abort"
      ? rawAction
      : DEFAULT_TOOL_ERROR_ACTION;

  return { maxConsecutiveToolErrors, maxToolCallsPerTurn, toolErrorAction };
}

/**
 * Normalize an error message for comparison.
 * - Trims whitespace
 * - Converts to lowercase
 * - Truncates to ERROR_KEY_MAX_CHARS
 */
export function normalizeErrorKey(error: string | undefined): string {
  if (!error) return "";
  const trimmed = error.trim();
  if (trimmed.length === 0) return "";
  const truncated =
    trimmed.length > ERROR_KEY_MAX_CHARS ? trimmed.slice(0, ERROR_KEY_MAX_CHARS) : trimmed;
  return truncated.toLowerCase();
}

/**
 * Check if the current tool error is consecutive with the previous one.
 * Returns the updated consecutive error state.
 *
 * - If toolName and normalized error match previous, increment count
 * - Otherwise, reset to count 1
 */
export function checkConsecutiveToolError(
  currentError: { toolName: string; error?: string },
  previousError: ConsecutiveToolError | undefined,
): ConsecutiveToolError {
  const normalizedError = normalizeErrorKey(currentError.error);

  if (
    previousError &&
    previousError.toolName === currentError.toolName &&
    previousError.errorMessage === normalizedError
  ) {
    return {
      toolName: currentError.toolName,
      errorMessage: normalizedError,
      count: previousError.count + 1,
    };
  }

  return {
    toolName: currentError.toolName,
    errorMessage: normalizedError,
    count: 1,
  };
}
