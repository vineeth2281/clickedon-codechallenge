import { extractJson } from "./extract-json";
import { mockStream, type MockBehavior, type MockState } from "./anthropic-mock";

export interface GenerateInput {
  /** Drives the mock streaming client (see anthropic-mock.ts). */
  behavior: MockBehavior;
  /** Hands the finished draft to the next pipeline stage. May reject. */
  advanceToNextStage: () => Promise<void>;
  /** Returns true once the draft passes review. Scripted by callers/tests. */
  reviewPasses: (attempt: number) => boolean;
}

export interface GenerateResult {
  status: "ok" | "error";
  attempts: number;
}

const MAX_REVISIONS = 3;

/**
 * Runs one content-generation pass: stream a draft, extract it, revise until it
 * passes review, then hand off to the next stage.
 *
 * This is a faithful (stripped-down) reproduction of the real pipeline — and it
 * ships with three real bugs from that pipeline. Your job is to fix them so the
 * test suite passes. See the README for the symptoms. (Do not edit the tests.)
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = { calls: 0 };

  let attempt = 0;
  let passedReview = false;

  while (attempt < MAX_REVISIONS) {
    try {
      const text = await mockStream(input.behavior, state);
      extractJson(text);

      if (input.reviewPasses(attempt)) {
        passedReview = true;
        break;
      }
      attempt++;
    } catch (error) {
      // transient failures such as Rate limit or JSON parse errors
      attempt++;
    }
  }

  if (!passedReview) {
    return { status: "error", attempts: attempt };
  }

  // Kick off the next stage and return.
  try {
    await input.advanceToNextStage();
  } catch (error) {
    return { status: "error", attempts: attempt };
  }

  return { status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };
