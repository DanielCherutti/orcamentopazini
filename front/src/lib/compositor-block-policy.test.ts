import assert from "node:assert/strict";
import test from "node:test";
import { canDeleteBudgetCompositorBlock } from "@/lib/compositor-block-policy";

test("allows project detail deletion while protecting fixed document blocks", () => {
  assert.equal(canDeleteBudgetCompositorBlock("scope"), true);
  assert.equal(canDeleteBudgetCompositorBlock("session"), true);

  for (const type of ["cover", "header_footer", "figures", "toc", "quote"]) {
    assert.equal(canDeleteBudgetCompositorBlock(type), false, `${type} must stay protected`);
  }
});
