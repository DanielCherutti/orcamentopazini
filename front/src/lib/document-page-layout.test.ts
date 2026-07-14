import test from "node:test";
import assert from "node:assert/strict";
import {
  ABNT_DOCUMENT_MARGINS_CM,
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  centeredContainBox,
  cmToPt,
  documentUsableAreaPt,
  normalizeDocumentMargins,
} from "@/lib/document-page-layout";

test("normalizes ABNT margins and calculates the usable A4 area", () => {
  const margins = normalizeDocumentMargins(ABNT_DOCUMENT_MARGINS_CM);
  const area = documentUsableAreaPt({ margins, headerPt: 40, footerPt: 20 });
  assert.equal(margins.left, 3);
  assert.equal(margins.right, 2);
  assert.ok(Math.abs(area.width - (A4_WIDTH_PT - cmToPt(5))) < 0.01);
  assert.ok(Math.abs(area.height - (A4_HEIGHT_PT - cmToPt(5) - 60)) < 0.01);
});

test("clamps invalid margins without eliminating the content area", () => {
  const margins = normalizeDocumentMargins({ top: -2, left: 20, right: 20, bottom: 99 });
  const area = documentUsableAreaPt({ margins });
  assert.equal(margins.top, 0);
  assert.ok(area.width > 0);
  assert.ok(area.height > 0);
});

test("centers horizontal, vertical and square images inside the usable area", () => {
  const area = { top: 100, left: 50, width: 400, height: 500 };
  for (const aspect of [3, 1, 0.4]) {
    const box = centeredContainBox({ area, widthPercent: 80, aspect });
    assert.ok(box.left >= area.left);
    assert.ok(box.top >= area.top);
    assert.ok(box.left + box.width <= area.left + area.width + 0.001);
    assert.ok(box.top + box.height <= area.top + area.height + 0.001);
    assert.ok(Math.abs((box.left - area.left) - (area.width - box.width) / 2) < 0.001);
    assert.ok(Math.abs((box.top - area.top) - (area.height - box.height) / 2) < 0.001);
  }
});
