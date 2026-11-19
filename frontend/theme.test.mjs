import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("Theme toggle persists, restores, synchronizes tabs and translates in three languages", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const previous = {};
  for (const key of ["window", "document", "localStorage", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]) {
    previous[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key], configurable: true, writable: true });
  }
  const vite = await createServer({ root: fileURLToPath(new URL(".", import.meta.url)), server: { middlewareMode: true, hmr: false }, appType: "custom", ssr: { resolve: { conditions: ["module-sync", "import", "development"] } } });
  let root;
  try {
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { ThemeProvider } = await vite.ssrLoadModule("/src/context/ThemeContext.jsx");
    const { LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx");
    const { default: Toggle } = await vite.ssrLoadModule("/src/components/ThemeToggle.jsx");
    const { act, createElement: h } = React;
    const render = async () => {
      root = createRoot(document.getElementById("root"));
      await act(async () => root.render(h(LanguageProvider, null, h(ThemeProvider, null, h(Toggle)))));
    };
    for (const [language, darkLabel, lightLabel] of [["es", "Activar modo oscuro", "Activar modo claro"], ["en", "Switch to dark mode", "Switch to light mode"], ["fr", "Activer le mode sombre", "Activer le mode clair"]]) {
      localStorage.setItem("lwi_language", language);
      localStorage.removeItem("lwi_theme");
      await render();
      const button = document.querySelector("button");
      assert.equal(button.getAttribute("aria-label"), darkLabel);
      await act(async () => button.click());
      assert.equal(document.documentElement.dataset.theme, "dark");
      assert.equal(localStorage.getItem("lwi_theme"), "dark");
      assert.equal(button.getAttribute("aria-label"), lightLabel);
      assert.equal(button.getAttribute("aria-pressed"), "true");
      await act(async () => root.unmount());
      await render();
      assert.equal(document.documentElement.dataset.theme, "dark");
      await act(async () => window.dispatchEvent(new window.StorageEvent("storage", { key: "lwi_theme", newValue: "light" })));
      assert.equal(document.documentElement.dataset.theme, "light");
      await act(async () => root.unmount());
      root = null;
    }
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Storage unavailable"); } });
    await render();
    await act(async () => document.querySelector("button").click());
    assert.equal(document.documentElement.dataset.theme, "dark");
    await act(async () => root.unmount());
    root = null;
  } finally {
    if (root) await (await import("react")).act(async () => root.unmount());
    await vite.close();
    dom.window.close();
    for (const key of Object.keys(previous)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  }
});
