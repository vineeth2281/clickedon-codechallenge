import { describe, it, expect } from "vitest";
import { generate, MAX_REVISIONS } from "../lib/pipeline";

describe("Bonus — Edge Case Tests", () => {
  it("should fail immediately without retries if advanceToNextStage rejects", async () => {
    // If the content is valid, passes review, but hand-off fails, we shouldn't retry generation.
    // The pipeline should just return an error immediately after trying advanceToNextStage.
    let reviewCalls = 0;
    const res = await generate({
      behavior: "ok",
      advanceToNextStage: async () => {
        throw new Error("next stage unreachable");
      },
      reviewPasses: () => {
        reviewCalls++;
        return true;
      },
    });

    expect(res.status).toBe("error");
    // Since it passed the review immediately on the 1st iteration (attempt 0),
    // it broke out of the generation loop and failed at hand-off.
    // The attempts should just be 0!
    expect(res.attempts).toBe(0);
    expect(reviewCalls).toBe(1);
  });

  it("should handle transient errors correctly but respect MAX_REVISIONS limits", async () => {
    let reviewCalls = 0;
    const res = await generate({
      // We can use the 'transient-429-twice' behavior
      behavior: "transient-429-twice",
      advanceToNextStage: async () => {},
      reviewPasses: () => {
        reviewCalls++;
        // It never passes review, testing the upper bound logic with combined mock failures
        return false;
      },
    });

    expect(res.status).toBe("error");
    // After two 429 errors (which consumed attempts 0 and 1)
    // The third call (attempt 2) successfully generates but fails review.
    // It should exit and return attempt = MAX_REVISIONS
    expect(res.attempts).toBe(MAX_REVISIONS);
    // reviewPasses was only called once, during attempt 2!
    expect(reviewCalls).toBe(1);
  });
});
