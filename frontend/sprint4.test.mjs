import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { emptySupplier, emptyProduct, validProduct, validSupplier, filterRecords, supplierNames } from "./src/services/catalogModel.js";
import { sprintTranslations as translations } from "./src/context/sprintTranslations.js";
import { frenchCopy, frenchAuth } from "./src/context/frenchTranslations.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

test("All static bilingual UI copy has a French translation", () => {
  const strings = new Set();
  function collect(node) {
    if (!node) return;
    if (node.type === "StringLiteral") strings.add(node.value);
    if (node.type === "ArrayExpression") node.elements.forEach(collect);
    if (node.type === "ConditionalExpression") { collect(node.consequent); collect(node.alternate); }
  }
  for (const file of ["pages/Home.jsx", "pages/Users.jsx", "pages/Profile.jsx", "pages/Settings.jsx", "components/AccountUI.jsx", "components/SystemSearch.jsx"]) {
    const ast = parse(readFileSync(new URL(`./src/${file}`, import.meta.url), "utf8"), { sourceType: "module", plugins: ["jsx"] });
    traverse(ast, {
      CallExpression({ node }) { if (node.callee.name === "c") collect(node.arguments[1]); },
      ObjectProperty({ node }) { if (["en", "linkEn"].includes(node.key.name)) collect(node.value); }
    });
  }
  for (const value of strings) assert.ok(frenchCopy[value], `Missing French translation: ${value}`);
  const auth = parse(readFileSync(new URL("./src/context/LanguageContext.jsx", import.meta.url), "utf8"), { sourceType: "module", plugins: ["jsx"] });
  traverse(auth, { ObjectProperty({ node }) {
    if (node.key.name === "en" && node.value.type === "ObjectExpression") {
      for (const property of node.value.properties) assert.ok(frenchAuth[property.key.name], `Missing French auth key: ${property.key.name}`);
    }
  } });
});
test("Validation, separate supplier names, search, sorting and translations", () => {
  assert.equal(validSupplier({ ...emptySupplier, type: "person", firstName: "Ana" }), false);
  assert.equal(validSupplier({ ...emptySupplier, type: "person", firstName: "Ana", lastName: "Perez" }), true);
  for (const [type, key] of [["sole", "businessName"], ["company", "tradeName"]]) assert.equal(validSupplier({ ...emptySupplier, type, [key]: "Water" }), true);
  const items = [{ type: "company", tradeName: "Zulu", legalName: "Agua", active: true }, { type: "person", firstName: "Ana", lastName: "Perez", active: false }, { type: "sole", businessName: "Beta", socialName: "Servicios", active: true }];
  assert.deepEqual(supplierNames(items[1]), ["Ana", "Perez"]);
  for (const lang of ["es", "en", "fr"]) {
    assert.deepEqual(filterRecords(items, {}, true, lang).map(x => supplierNames(x)[0]), ["Ana", "Beta", "Zulu"]);
    for (const search of ["AGUA", "perez", "servicios"]) assert.equal(filterRecords(items, { search }, true, lang).length, 1);
    assert.deepEqual(Object.keys(translations[lang]), Object.keys(translations.es));
  }
  const product = { ...emptyProduct, code: "P1", description: "Pump", category: "Tools", inventoryType: "Equipment", unit: "Unit", minimum: "0", cost: "12.50" };
  assert.equal(validProduct(product), true);
  for (const cost of ["", " ", "-1", "Infinity", "abc"]) assert.equal(validProduct({ ...product, cost }), false);
  assert.equal("stock" in emptyProduct, false);
  assert.equal(filterRecords([product], { search: "pump", category: "Tools", type: "Equipment", status: "true" }, false, "en").length, 1);
});
test("DOM navigation, dynamic forms, languages, detail and existing screens; no database", { timeout: 60000 }, async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:5173/inventario" });
  for (const key of ["window", "document", "localStorage", "sessionStorage", "HTMLElement", "Event", "KeyboardEvent", "MouseEvent"]) globalThis[key] = dom.window[key];
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const user = { id: "test-only", nombre: "Test", correo: "test@water.cc", rol: { nombre: "Administrador" } };
  const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.x`;
  sessionStorage.setItem("lwi_session", JSON.stringify({ token, usuario: user }));
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { if (!String(url).includes("/api/")) return originalFetch(url, options); calls.push(options?.method || "GET"); return { ok: true, json: async () => ({ success: true, data: String(url).includes("/usuarios/roles") ? [] : String(url).includes("/usuarios") ? { usuarios: [], total: 0, pagina: 1, limite: 10, indicadores: {} } : user }) }; };
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", ssr: { noExternal: ["react-router-dom", "react-router"], resolve: { conditions: ["module-sync", "import", "development"] } } });
  const React = await import("react"); const { act } = React;
  const { createRoot } = await import("react-dom/client"); const { Simulate } = await import("react-dom/test-utils");
  const { BrowserRouter } = await vite.ssrLoadModule("react-router-dom");
  const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
  const { AuthProvider } = await vite.ssrLoadModule("/src/context/AuthContext.jsx");
  const { LanguageProvider } = await vite.ssrLoadModule("/src/context/LanguageContext.jsx");
  const root = createRoot(document.getElementById("root"));
  const button = text => [...document.querySelectorAll("button")].find(el => el.textContent.trim() === text);
  const click = async el => { assert.ok(el); await act(async () => Simulate.click(el)); };
  const change = async (el, value) => { assert.ok(el); await act(async () => Simulate.change(el, { target: { value } })); };
  const field = text => [...document.querySelectorAll("dialog label")].find(el => el.firstChild.textContent.trim() === text)?.querySelector("input,select");
  const route = async path => { await act(async () => { window.history.pushState({}, "", path); window.dispatchEvent(new dom.window.PopStateEvent("popstate")); }); };
  try {
    await act(async () => root.render(React.createElement(BrowserRouter, null, React.createElement(AuthProvider, null, React.createElement(LanguageProvider, null, React.createElement(App))))));
    assert.equal(document.querySelector("main h1").textContent, translations.es.inventory);
    assert.equal(document.querySelectorAll(".catalog-stats article").length, 5);
    assert.equal(document.querySelectorAll("thead th").length, 10);
    assert.equal(document.querySelector(".catalog-language"), null);
    await click(button(translations.es.newProduct)); assert.equal(document.querySelectorAll("dialog input").length, 7);
    await act(async () => Simulate.submit(document.querySelector("dialog form")));
    assert.ok(document.querySelector('[role="alert"]'));
    await click(document.querySelector("dialog .account-modal-head button"));
    await click(button(translations.es.suppliers)); assert.equal(window.location.pathname, "/proveedores");
    for (const lang of ["es", "en", "fr"]) {
      await route("/configuracion");
      await change(document.querySelector(".settings-preferences select"), lang);
      await route("/proveedores");
      const t = translations[lang];
      assert.equal(document.documentElement.lang, lang);
      assert.equal(document.querySelector("main h1").textContent, t.suppliers);
      await click(button(t.newSupplier)); await change(field(t.type), "person"); assert.ok(field(t.firstName)); assert.ok(field(t.lastName));
      await change(field(t.firstName), "Ana");
      await change(field(t.type), "sole"); assert.ok(field(t.businessName)); assert.ok(field(t.socialName)); assert.equal(field(t.firstName), undefined);
      await change(field(t.type), "company"); assert.ok(field(t.tradeName)); assert.equal(field(t.legalName).required, false);
      await change(field(t.tradeName), "Water");
      await act(async () => Simulate.submit(document.querySelector("dialog form")));
      assert.equal(document.querySelector('dialog [role="status"]').textContent, t.valid);
      await click(document.querySelector("dialog .account-modal-head button"));
      await route("/inventario/test-unconnected");
      assert.equal(document.querySelector("main h1").textContent, t.detail);
      assert.equal(document.querySelectorAll("dd").length, 9);
      assert.ok([...document.querySelectorAll("dd")].every(el => el.textContent === "\u2014"));
      await route("/proveedores");
    }
    await route("/");
    assert.ok(document.querySelector(".lw-dashboard"));
    assert.ok(button("Paramètres"));
    assert.ok(button("Utilisateurs"));
    assert.ok(document.querySelector("main").textContent.includes("Merci de faire partie"));
    assert.equal(document.querySelector('[role="combobox"]').placeholder, "Rechercher une section…");
    await change(document.querySelector('[role="combobox"]'), "Paramètres");
    assert.ok(document.querySelector('[role="option"]').textContent.includes("Paramètres"));
    await route("/usuarios");
    assert.equal(document.querySelector("main h1").textContent, "Gestion des utilisateurs");
    assert.ok(document.querySelector("main").textContent.includes("Aucun utilisateur trouvé."));
    await route("/perfil");
    assert.equal(document.querySelector("main h1").textContent, "Mon profil");
    assert.ok(document.querySelector("main").textContent.includes("Changer le mot de passe"));
    await route("/configuracion");
    assert.equal(document.querySelector("main h1").textContent, "Paramètres du système");
    assert.ok(document.querySelector("main").textContent.includes("Préférences du système"));
    await click(button("Sécurité"));
    assert.ok(document.querySelector("main").textContent.includes("Sécurité du compte"));
    await route("/proveedores");
    assert.equal(document.querySelectorAll(".supplier-stats article").length, 4);
    assert.equal(document.querySelector(".supplier-empty h2").textContent, translations.fr.supplierEmpty);
    await change(document.querySelector(".supplier-page-size select"), "25");
    assert.equal(document.querySelector(".supplier-page-size select").value, "25");
    await click(button(translations.fr.applyFilters));
    await click(document.querySelector(".lw-user-btn"));
    assert.ok(button("Mon profil"));
    await click(button("Se déconnecter"));
    assert.equal(document.querySelector(".login-header h1").textContent, "Bienvenue");
    assert.equal(document.querySelector('[aria-pressed="true"] .language-code').textContent, "FR");
    await act(async () => Simulate.submit(document.querySelector(".login-form")));
    assert.equal(document.querySelector('[role="alert"]').textContent, frenchAuth.institutionalEmail);
    await route("/recuperar-contrasena");
    assert.equal(document.querySelector("h1").textContent, "Mot de passe oublié ?");
    await act(async () => Simulate.submit(document.querySelector(".login-form")));
    assert.equal(document.querySelector('[role="alert"]').textContent, frenchAuth.invalidEmail);
    assert.ok(calls.every(method => method === "GET"));
  } finally { await act(async () => root.unmount()); await vite.close(); globalThis.fetch = originalFetch; dom.window.close(); }
});
