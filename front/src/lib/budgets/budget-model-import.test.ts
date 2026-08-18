import assert from "node:assert/strict";
import test from "node:test";
import {
  BUDGET_MODEL_REPLACED_BLOCK_TYPES,
  isBudgetModelReplacedBlockType,
} from "@/lib/budgets/budget-model-import";

test("complete model import replaces every authored block, including project detail", () => {
  assert.ok(BUDGET_MODEL_REPLACED_BLOCK_TYPES.includes("scope"));

  const currentTypes = [
    "cover",
    "header_footer",
    "figures",
    "toc",
    "session",
    "scope",
    "location",
    "section",
    "text",
    "terms",
    "quote",
  ];

  assert.deepEqual(
    currentTypes.filter((type) => !isBudgetModelReplacedBlockType(type)),
    ["cover", "header_footer", "figures", "toc", "quote"],
  );
});
