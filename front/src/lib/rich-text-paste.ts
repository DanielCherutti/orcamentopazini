import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";

const INVISIBLE_WHITESPACE = /[\s\u00a0\u200b-\u200d\ufeff]/g;

function isEmptyParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== "paragraph") return false;
  if (node.textContent.replace(INVISIBLE_WHITESPACE, "").length > 0) return false;

  let containsMeaningfulInlineNode = false;
  node.descendants((child) => {
    if (!child.isText && child.type.name !== "hardBreak") {
      containsMeaningfulInlineNode = true;
      return false;
    }
    return !containsMeaningfulInlineNode;
  });

  return !containsMeaningfulInlineNode;
}

/**
 * Browsers and office applications often wrap copied text with empty paragraphs.
 * Remove only those boundary paragraphs, keeping intentional spacing inside the
 * pasted content intact.
 */
export function trimEmptyBoundaryParagraphsFromPastedSlice(slice: Slice): Slice {
  const nodes: ProseMirrorNode[] = [];
  slice.content.forEach((node) => nodes.push(node));

  let start = 0;
  let end = nodes.length;
  while (start < end && isEmptyParagraph(nodes[start])) start += 1;
  while (end > start && isEmptyParagraph(nodes[end - 1])) end -= 1;

  if (start === 0 && end === nodes.length) return slice;
  if (start === end) return Slice.empty;

  const content = Fragment.fromArray(nodes.slice(start, end));
  const maxOpen = Slice.maxOpen(content);
  return new Slice(
    content,
    Math.min(slice.openStart, maxOpen.openStart),
    Math.min(slice.openEnd, maxOpen.openEnd),
  );
}
