import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { DashboardWelcomeLogo } from "./dashboard-welcome-logo";

test("never overlays the fallback icon on the company logo", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: "http://localhost",
  });
  const win = dom.window;
  (globalThis as unknown as { window: Window }).window = win as unknown as Window;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.Element = win.Element;
  globalThis.Event = win.Event;
  Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<DashboardWelcomeLogo logoUrl="https://invalid.example/logo.png" />);
  });

  const image = document.querySelector("img");
  assert.ok(image);
  assert.match(image.className, /object-contain/);
  assert.doesNotMatch(image.className, /opacity-0/);
  assert.equal(document.querySelector('[data-testid="platform-logo-fallback"]'), null);

  await act(async () => {
    image.dispatchEvent(new win.Event("load"));
  });

  const readyLogo = document.querySelector("[data-logo-state]");
  assert.equal(readyLogo?.getAttribute("data-logo-state"), "ready");
  assert.equal(document.querySelector('[data-testid="platform-logo-fallback"]'), null);

  await act(async () => {
    image.dispatchEvent(new win.Event("error"));
  });

  const logo = document.querySelector("[data-logo-state]");
  assert.equal(logo?.getAttribute("data-logo-state"), "fallback");
  assert.ok(document.querySelector('[data-testid="platform-logo-fallback"]'));

  act(() => root.unmount());
  dom.window.close();
});
