import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardHomePanel } from "@/components/dashboard/dashboard-home-panel";

test("dashboard indicators use light semantic icon surfaces", () => {
  const html = renderToStaticMarkup(
    <DashboardHomePanel
      data={{
        counts: { products: 146, productGroups: 17, budgets: 47, clients: 20 },
        recentBudgets: [],
      }}
    />,
  );

  assert.equal((html.match(/tenant-stat-card/g) ?? []).length, 4);
  assert.equal((html.match(/tenant-stat-icon/g) ?? []).length, 4);
  assert.equal((html.match(/tenant-shortcut-icon/g) ?? []).length, 4);
  assert.doesNotMatch(html, /linear-gradient\(135deg, var\(--brand-secondary\)/);
  assert.doesNotMatch(html, /text-white/);
});
