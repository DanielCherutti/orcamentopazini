import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost",
  });
  const win = dom.window;
  (globalThis as unknown as { window: Window }).window = win as unknown as Window;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.HTMLButtonElement = win.HTMLButtonElement;
  globalThis.Node = win.Node;
  globalThis.Element = win.Element;
  globalThis.DocumentFragment = win.DocumentFragment;
  globalThis.MutationObserver = win.MutationObserver;
  globalThis.CustomEvent = win.CustomEvent;
  globalThis.Event = win.Event;
  globalThis.MouseEvent = win.MouseEvent;
  globalThis.KeyboardEvent = win.KeyboardEvent;
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  Object.defineProperty(globalThis, "navigator", {
    value: win.navigator,
    configurable: true,
  });
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

function findButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  );
  assert.ok(button, `Botão "${text}" deveria existir`);
  return button as HTMLButtonElement;
}

test("BudgetModelImportConfirmationDialog blocks import when user cancels", async () => {
  const dom = installDom();
  const { BudgetModelImportConfirmationDialog } = await import(
    "@/components/budgets/budget-model-import-dialog"
  );
  const container = document.getElementById("root");
  assert.ok(container);

  let root: Root | null = null;
  let open = true;
  let confirmed = 0;
  let cancelled = 0;

  const render = async () => {
    act(() => {
      if (!root) root = createRoot(container);
      root.render(
        <BudgetModelImportConfirmationDialog
          open={open}
          onOpenChange={(next) => {
            open = next;
            void render();
          }}
          onConfirm={() => {
            confirmed += 1;
          }}
          onCancel={() => {
            cancelled += 1;
          }}
        />,
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  await render();

  await act(async () => {
    findButtonByText("Cancelar").dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true }),
    );
  });

  assert.equal(confirmed, 0);
  assert.equal(cancelled, 1);

  act(() => {
    root?.unmount();
  });
  dom.window.close();
});
