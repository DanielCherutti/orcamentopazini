import assert from "node:assert/strict";
import test from "node:test";
import { splitCoverHtmlFragmentToSegments } from "./cover-pdf-blocks";

test("preserves bullet and numbered list markers for PDF rendering", () => {
    const html = [
        "<ul>",
        "<li><p>Introdução</p>",
        '<ol start="1">',
        "<li><p>Primeiro item</p></li>",
        "<li><p>Segundo item</p></li>",
        "</ol>",
        "</li>",
        "</ul>",
    ].join("");

    const segments = splitCoverHtmlFragmentToSegments(html);
    assert.deepEqual(
        segments.map((segment) => ({
            text: segment.text,
            marker: segment.kind === "paragraph" ? segment.listMarker : undefined,
            depth: segment.kind === "paragraph" ? segment.listDepth : undefined,
        })),
        [
            { text: "Introdução", marker: "•", depth: 1 },
            { text: "Primeiro item", marker: "1.", depth: 2 },
            { text: "Segundo item", marker: "2.", depth: 2 },
        ],
    );
});

test("does not add list markers to ordinary paragraphs", () => {
    const segments = splitCoverHtmlFragmentToSegments("<p>Texto normal</p>");
    assert.equal(segments[0]?.kind, "paragraph");
    if (segments[0]?.kind === "paragraph") assert.equal(segments[0].listMarker, undefined);
});
