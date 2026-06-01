#!/usr/bin/env tsx

import fs from "node:fs";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ProposalDocument } from "../src/components/pdf/proposal-document";
import { buildTree } from "../src/types/budget-compositor-types";

const file = process.argv[2];
const mode = process.argv[3] || "full";
const limitMatch = mode.match(/^limit:(\d+)$/);
if (!file) {
  console.error("Uso: npx tsx scripts/debug-render-budget-export.ts <json> [full|no-compositor|no-scope|no-header-footer|no-images|fake-images|limit:N]");
  process.exit(1);
}

async function main() {
const exported = JSON.parse(fs.readFileSync(file, "utf8"));
const budget = { ...exported.budget[0] };
const settings = { ...exported.proposal_settings[0] };

const sectionsByLocation = new Map<string, any[]>();
for (const section of exported.budget_section || []) {
  const key = String(section.location_id || "");
  if (!sectionsByLocation.has(key)) sectionsByLocation.set(key, []);
  sectionsByLocation.get(key)!.push({ ...section, items: [], images: [] });
}

const sectionById = new Map<string, any>();
for (const sections of sectionsByLocation.values()) {
  for (const section of sections) sectionById.set(String(section.id), section);
}

for (const item of exported.section_items || []) {
  const section = sectionById.get(String(item.section_id || ""));
  if (section) section.items.push(item);
}

const imagesById = new Map<string, any>();
if (mode !== "no-images") {
  for (const img of exported.budget_image || []) {
    imagesById.set(String(img.id), {
      ...img,
      ...(mode === "fake-images"
        ? {
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            composed_url: "",
          }
        : {}),
      annotations: [],
    });
  }
  for (const ann of exported.image_annotation || []) {
    const img = imagesById.get(String(ann.image_id || ""));
    if (img) img.annotations.push(ann);
  }
  for (const img of imagesById.values()) {
    if (img.section_id) {
      const section = sectionById.get(String(img.section_id));
      if (section) section.images.push(img);
    }
  }
}

budget.locations = (exported.budget_location || []).map((loc: any) => ({
  ...loc,
  images: Array.from(imagesById.values()).filter((img) => String(img.location_id || "") === String(loc.id)),
  sections: sectionsByLocation.get(String(loc.id)) || [],
}));
if (limitMatch) {
  budget.locations = budget.locations.slice(0, Number(limitMatch[1]));
}

let compositorPdf: any = undefined;
if (mode !== "no-compositor") {
  let blocks = exported.budget_block || [];
  if (mode === "no-header-footer") {
    blocks = blocks.filter((b: any) => b.type !== "header_footer");
  }
  const tree = buildTree(blocks, {});
  compositorPdf = {
    roots: tree.blocks,
    items: tree.items,
    imagesByBlock: {},
    scopeFigures: [],
  };
}

if (mode === "no-scope") {
  budget.locations = [];
}

console.log("render mode:", mode);
console.log("locations:", budget.locations.length);
console.log("sections:", budget.locations.reduce((sum: number, loc: any) => sum + loc.sections.length, 0));
console.log("items:", budget.locations.reduce((sum: number, loc: any) => sum + loc.sections.reduce((s: number, sec: any) => s + sec.items.length, 0), 0));
console.log("images:", budget.locations.reduce((sum: number, loc: any) => sum + loc.images.length + loc.sections.reduce((s: number, sec: any) => s + sec.images.length, 0), 0));

await renderToBuffer(React.createElement(ProposalDocument, {
  budget,
  settings,
  compositorPdf,
  omitDocumentWatermark: true,
}) as any);

console.log("render OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
