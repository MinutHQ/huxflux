import { describe, expect, it } from "vitest"
import { isNotReviewCommentError } from "./prComments.js"

// isNotReviewCommentError decides whether replyToReviewComment falls back to a
// plain conversation comment (404/422 = the id is not a review-thread root) or
// rethrows (auth/rate-limit/network = a real failure the caller must surface).

describe("isNotReviewCommentError", () => {
  it("treats 404 as 'not a review comment' (fall back)", () => {
    expect(isNotReviewCommentError({ status: 404 })).toBe(true)
  })

  it("treats 422 as 'not a review comment' (fall back)", () => {
    expect(isNotReviewCommentError({ status: 422 })).toBe(true)
  })

  it("does not swallow 401 (auth failure must surface)", () => {
    expect(isNotReviewCommentError({ status: 401 })).toBe(false)
  })

  it("does not swallow 403 (rate limit / permission must surface)", () => {
    expect(isNotReviewCommentError({ status: 403 })).toBe(false)
  })

  it("does not swallow 500", () => {
    expect(isNotReviewCommentError({ status: 500 })).toBe(false)
  })

  it("returns false for a plain Error with no status", () => {
    expect(isNotReviewCommentError(new Error("network down"))).toBe(false)
  })

  it("returns false for null / undefined", () => {
    expect(isNotReviewCommentError(null)).toBe(false)
    expect(isNotReviewCommentError(undefined)).toBe(false)
  })
})
