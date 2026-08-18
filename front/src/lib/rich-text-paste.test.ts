import test from "node:test";
import assert from "node:assert/strict";
import { Fragment, Schema, Slice } from "@tiptap/pm/model";
import { trimEmptyBoundaryParagraphsFromPastedSlice } from "@/lib/rich-text-paste";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline", selectable: false },
    image: { inline: true, group: "inline", atom: true },
  },
});

const paragraph = (text?: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined);

test("removes empty paragraphs added around pasted text", () => {
  const slice = new Slice(
    Fragment.fromArray([
      paragraph(),
      schema.nodes.paragraph.create(null, schema.nodes.hardBreak.create()),
      paragraph("Texto copiado"),
      paragraph("\u00a0\u200b"),
    ]),
    0,
    0,
  );

  const result = trimEmptyBoundaryParagraphsFromPastedSlice(slice);

  assert.equal(result.content.childCount, 1);
  assert.equal(result.content.firstChild?.textContent, "Texto copiado");
});

test("preserves intentional empty paragraphs within pasted content", () => {
  const slice = new Slice(
    Fragment.fromArray([paragraph("Primeiro"), paragraph(), paragraph("Segundo")]),
    0,
    0,
  );

  const result = trimEmptyBoundaryParagraphsFromPastedSlice(slice);

  assert.equal(result.content.childCount, 3);
  assert.equal(result.content.child(1).type.name, "paragraph");
  assert.equal(result.content.child(1).content.size, 0);
});

test("does not remove meaningful inline content or alter a clean slice", () => {
  const imageParagraph = schema.nodes.paragraph.create(null, schema.nodes.image.create());
  const slice = new Slice(Fragment.fromArray([imageParagraph, paragraph("Legenda")]), 0, 0);

  const result = trimEmptyBoundaryParagraphsFromPastedSlice(slice);

  assert.equal(result, slice);
});
