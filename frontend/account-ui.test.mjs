import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// Integración DOM con peticiones HTTP reales. No sustituye una revisión visual en navegador.
test("Login, rutas, usuarios, perfil, idioma y logout en DOM", async () => {
  const backendRequire = createRequire(
    new URL("../backend/package.json", import.meta.url),
  );
  backendRequire("dotenv").config({
    path: new URL("../backend/.env", import.meta.url).pathname.replace(
      /^\/([A-Za-z]:)/,
      "$1",
    ),
  });
  const { app } = backendRequire("./src/app");
  const { prisma } = backendRequire("./src/lib/prisma");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:5173/usuarios",
  });
  for (const name of [
    "window",
    "document",
    "localStorage",
    "sessionStorage",
    "HTMLElement",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
  ])
    globalThis[name] = dom.window[name];
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, options) => {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    calls.push({ path, method: options?.method || "GET" });
    return originalFetch(
      `http://127.0.0.1:${server.address().port}${path}`,
      options,
    );
  };
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    ssr: {
      noExternal: ["react-router-dom", "react-router"],
      resolve: { conditions: ["module-sync", "import", "development"] },
    },
  });
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const { Simulate } = await import("react-dom/test-utils");
  const { BrowserRouter } = await vite.ssrLoadModule("react-router-dom");
  const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
  const { AuthProvider } = await vite.ssrLoadModule(
    "/src/context/AuthContext.jsx",
  );
  const { LanguageProvider } = await vite.ssrLoadModule(
    "/src/context/LanguageContext.jsx",
  );
  let root = createRoot(document.getElementById("root"));
  let createdId;
  const email = `ui-${randomUUID()}@water.cc`;
  const password = `Aa9!${randomUUID()}`;
  const click = async (el) => {
    assert.ok(el, "Control no encontrado");
    await act(async () => Simulate.click(el));
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (el) => el.textContent.trim() === text,
    );
  const label = (text) =>
    [
      ...(document.querySelector("dialog") || document).querySelectorAll(
        "label",
      ),
    ]
      .find((el) => el.childNodes[0]?.textContent.trim() === text)
      ?.querySelector("input,select");
  const change = async (el, value) => {
    assert.ok(el, "Campo no encontrado");
    await act(async () => {
      el.value = value;
      Simulate.change(el, { target: el });
    });
  };
  const wait = async (predicate) => {
    for (let i = 0; i < 240; i++) {
      if (predicate()) return;
      await act(async () => new Promise((r) => setTimeout(r, 25)));
    }
    assert.ok(
      predicate(),
      "La interfaz no alcanzó el estado esperado: " +
        document.body.textContent +
        "; requests: " +
        JSON.stringify(calls),
    );
  };
  try {
    await act(async () => {
      const appElement = React.createElement(App);
      const languageElement = React.createElement(
        LanguageProvider,
        null,
        appElement,
      );
      const authElement = React.createElement(
        AuthProvider,
        null,
        languageElement,
      );
      root.render(React.createElement(BrowserRouter, null, authElement));
    });
    await wait(() => locationPath() === "/login");
    await change(
      document.querySelector('[name="correo"]'),
      process.env.SEED_ADMIN_EMAIL,
    );
    await change(
      document.querySelector('[name="contrasena"]'),
      process.env.SEED_ADMIN_PASSWORD,
    );
    await act(async () =>
      Simulate.submit(document.querySelector(".login-form")),
    );
    await wait(
      () =>
        document.querySelector(".account-table") &&
        button("Nuevo usuario") &&
        !button("Nuevo usuario").disabled,
    );
    assert.equal(locationPath(), "/usuarios");
    assert.ok(localStorage.getItem("lwi_session"));
    assert.equal(sessionStorage.getItem("lwi_session"), null);
    await click(button("Nuevo usuario"));
    await wait(() => document.querySelector("dialog[open]"));
    await change(label("Nombre completo"), "Usuario de interfaz");
    await change(label("Correo institucional"), email);
    const roleSelect = label("Rol");
    const nonAdmin = [...roleSelect.options].find(
      (x) => x.text !== "Administrador",
    );
    await change(roleSelect, nonAdmin.value);
    await change(label("Contraseña inicial"), password);
    await change(label("Confirmar contraseña"), password);
    await act(async () =>
      Simulate.submit(document.querySelector("dialog form")),
    );
    await wait(() => !document.querySelector("dialog"));
    await wait(() =>
      document.querySelector(".account-table")?.textContent.includes(email),
    );
    const fixture = await prisma.usuario.findUnique({
      where: { correo: email },
    });
    assert.ok(fixture);
    createdId = fixture.id;
    await click(document.querySelector(".lw-user-btn"));
    assert.ok(document.getElementById("profile-menu"));
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    assert.equal(document.getElementById("profile-menu"), null);
    await click(document.querySelector(".lw-user-btn"));
    await act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    assert.equal(document.getElementById("profile-menu"), null);
    await click(document.querySelector(".lw-user-btn"));
    await click(button("Mi perfil"));
    await wait(() => document.querySelector(".account-profile-summary"));
    assert.equal(locationPath(), "/perfil");
    assert.ok(
      document
        .querySelector(".account-profile-summary")
        .textContent.includes(process.env.SEED_ADMIN_EMAIL),
    );
    await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})));
    const searchInput=document.querySelector('[role="combobox"]');
    assert.equal(document.activeElement,searchInput);
    await change(searchInput,'seccion-inexistente');
    assert.ok(document.querySelector('.system-search-empty'));
    await click(document.querySelector('.system-search-clear'));
    await change(searchInput,'configuracion');
    assert.equal(document.querySelectorAll('[role="option"]').length,1);
    await act(async()=>Simulate.keyDown(searchInput,{key:'Enter'}));
    assert.equal(dom.window.location.pathname,'/configuracion');
    assert.equal(document.querySelector('.system-search-popover'),null);
    await wait(() => label("Idioma"));
    await change(label("Idioma"), "en");
    await wait(
      () => document.querySelector("h1")?.textContent === "System settings",
    );
    assert.equal(localStorage.getItem("lwi_language"), "en");
    assert.equal(document.documentElement.lang, "en");
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root"));
    await act(async () =>
      root.render(
        React.createElement(
          BrowserRouter,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(
              LanguageProvider,
              null,
              React.createElement(App),
            ),
          ),
        ),
      ),
    );
    await wait(
      () => document.querySelector("h1")?.textContent === "System settings",
    );
    assert.equal(document.documentElement.lang, "en");
    await click(document.querySelector(".lw-user-btn"));
    await click(button("Sign out"));
    await wait(() => locationPath() === "/login");
    assert.equal(localStorage.getItem("lwi_session"), null);
    assert.equal(sessionStorage.getItem("lwi_session"), null);
    await change(document.querySelector('[name="correo"]'), email);
    await change(document.querySelector('[name="contrasena"]'), password);
    await act(async () => {
      const checkbox = document.querySelector(".remember-option input");
      checkbox.checked = false;
      Simulate.change(checkbox, { target: checkbox });
    });
    await act(async () =>
      Simulate.submit(document.querySelector(".login-form")),
    );
    await wait(
      () => document.querySelector("h1")?.textContent === "Access denied",
    );
    assert.equal(localStorage.getItem("lwi_session"), null);
    assert.ok(sessionStorage.getItem("lwi_session"));
    assert.ok(
      ![...document.querySelectorAll(".lw-nav-item")].some(
        (el) => el.textContent === "Users",
      ),
    );
    await click(document.querySelector(".lw-user-btn"));
    await click(button("Change password"));
    await wait(() => document.querySelector(".account-profile-summary"));
    assert.equal(dom.window.location.hash, "#contrasena");
    assert.equal(document.activeElement, label("Current password"));
    await change(label("Current password"), password);
    const nextPassword = `Bb8!${randomUUID()}`;
    await change(label("New password"), nextPassword);
    await change(label("Confirm new password"), nextPassword);
    const passwordForm = label("Current password").closest("form");
    await act(async () => Simulate.submit(passwordForm));
    await wait(() => locationPath() === "/login");
    assert.equal(sessionStorage.getItem("lwi_session"), null);
    assert.ok(document.body.textContent.includes("Password updated."));
    assert.ok(
      calls.some((c) => c.path === "/api/auth/login" && c.method === "POST"),
    );
    assert.ok(
      calls.some((c) => c.path === "/api/usuarios" && c.method === "POST"),
    );
    console.log(
      "DOM: ruta protegida, login real, retorno a Usuarios, creación, perfil, Escape, clic fuera, idioma persistente y logout correctos.",
    );
  } finally {
    await act(async () => root.unmount());
    await vite.close();
    globalThis.fetch = originalFetch;
    if (!createdId) {
      createdId = (
        await prisma.usuario.findUnique({ where: { correo: email } })
      )?.id;
    }
    if (createdId)
      await prisma.usuario.deleteMany({
        where: { id: createdId, correo: email },
      });
    await new Promise((r) => server.close(r));
    await prisma.$disconnect();
    dom.window.close();
  }
  function locationPath() {
    return dom.window.location.pathname;
  }
});
