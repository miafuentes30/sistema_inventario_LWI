// Browser-only fixtures. No backend server or database connection is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile, readFile, mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.LWI_PLAYWRIGHT_PATH || "playwright");
const user = { id: "1", nombre: "Usuario de prueba visual", correo: "visual@example.invalid", activo: true, rol: { id: "1", nombre: "Administrador" } };
const catalog = [{ id: "1", name: "Catálogo de prueba visual", active: true, categoryId: "1" }];
const product = { id: "1", code: "VISUAL-ONLY", name: "Producto de prueba visual con descripción extensa", description: "Contenido exclusivo del navegador de pruebas", category: catalog[0].name, brand: "Marca de prueba", unit: "Unidad", minimum: "10", stock: null, active: true };
test("Responsive browser matrix, keyboard navigation and dialogs without database", { timeout: 240000 }, async () => {
  const vite = await createServer({ server: { host: "127.0.0.1", port: 0 }, configFile: new URL("./vite.config.js", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") });
  let browser, ownedProcess;
  const results = [];
  const output = new URL("./.responsive-artifacts/", import.meta.url);
  await mkdir(output, { recursive: true });
  try {
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    // CDP with ignored stdio avoids Edge helpers retaining Playwright's debug
    // pipes on Windows. Own a separate profile; never attach to the user's Edge.
    const profile = await mkdtemp(path.join(fileURLToPath(output), "edge-profile-"));
    ownedProcess = spawn(process.env.LWI_EDGE_PATH || path.join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
      ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"],
      { stdio: "ignore", windowsHide: true });
    let launchError;
    ownedProcess.on("error", error => { launchError = error; });
    let debugPort;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      try { debugPort = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(debugPort, "Edge did not expose its isolated debugging port");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const context = await browser.newContext();
    let failureMode = false;
    await context.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let data = user;
      if (path.startsWith("/api/catalogos/")) data = catalog;
      else if (path === "/api/productos/1") data = product;
      else if (path === "/api/productos") data = { items: [product], total: 1, indicadores: { registeredProducts: 1, warehouses: 0 } };
      else if (path === "/api/marcas") data = { items: catalog, total: 1 };
      else if (path === "/api/proveedores") data = { items: [{ id: "1", type: "person", firstName: "Persona de prueba", lastName: "Visual", active: true }], total: 1, indicadores: {} };
      else if (path === "/api/usuarios/roles") data = [user.rol];
      else if (path === "/api/usuarios") data = { usuarios: [user], total: 1, pagina: 1, limite: 10, indicadores: { total: 1, activos: 1, inactivos: 0, administradores: 1 } };
      else if (path === "/api/configuracion") data = { nombre: "Sistema de Inventario", organizacion: "Living Water Guatemala", dominio: "@water.cc", zonaHoraria: "America/Guatemala" };
      const fail = failureMode && path === "/api/productos";
      await route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify(fail ? { success: false, code: "REQUEST_FAILED", message: "Error de prueba" } : { success: true, data }) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.x`;
    await page.addInitScript(({ user, token }) => {
      if (!location.pathname.includes("login") && !location.pathname.includes("recuperar")) sessionStorage.setItem("lwi_session", JSON.stringify({ token, usuario: user }));
      else { sessionStorage.removeItem("lwi_session"); localStorage.removeItem("lwi_session"); }
    }, { user, token });
    async function fits(label) {
      const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      assert.ok(size.document <= size.viewport + 1, `${label}: page overflow ${JSON.stringify(size)}`);
      const dialog = page.locator("dialog[open]");
      if (await dialog.count()) {
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= size.viewport + 1, `${label}: dialog outside viewport`);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= (await page.evaluate(() => innerHeight)) + 1, `${label}: dialog too tall`);
      }
      results.push(label);
    }
    for (const language of (process.env.LWI_RESPONSIVE_LANGUAGES || "es,en,fr").split(",")) {
      await page.goto(origin + "/login");
      await page.evaluate(value => localStorage.setItem("lwi_language", value), language);
      for (const width of (process.env.LWI_RESPONSIVE_WIDTHS || "320,375,430,768,1024,1366,1920,2560").split(",").map(Number)) {
        console.log(`Checking ${language}: ${width}px`);
        await page.setViewportSize({ width, height: 900 });
        for (const path of ["/login", "/recuperar-contrasena", "/", "/inventario", "/inventario/1", "/proveedores", "/usuarios", "/configuracion", "/perfil"]) {
          await page.goto(origin + path);
          await page.locator("h1").first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          await fits(`${language} ${width} ${path}`);
          if (language === "fr" && [375,1366].includes(width)) await page.screenshot({ path: new URL(`${path.replaceAll("/", "_") || "home"}-fr-${width}.png`, output).pathname.replace(/^\/(\w:)/, "$1") });
        }
        await page.goto(origin + "/proveedores");
        await page.locator(".catalog-heading-actions .account-primary").click();
        await page.locator("dialog").waitFor();
        for (const type of ["person", "sole", "company"]) {
          await page.locator(".catalog-fields select").first().selectOption(type);
          await fits(`${language} ${width} supplier ${type}`);
        }
        await page.locator(".catalog-fields select").nth(1).selectOption("TRANSFERENCIA");
        await page.locator(".catalog-checkbox input").check();
        await fits(`${language} ${width} bank fields`);
        await page.locator("dialog .account-actions button").last().click();
        await page.getByRole("alert").waitFor();
        await fits(`${language} ${width} validation`);
        await page.locator("dialog .account-actions button").first().scrollIntoViewIfNeeded();
        if ([320,768,1366].includes(width) && language === "fr") await page.screenshot({ path: new URL(`supplier-fr-${width}.png`, output).pathname.replace(/^\/(\w:)/, "$1"), fullPage: true });
        await page.keyboard.press("Escape");
        await page.goto(origin + "/inventario");
        await page.locator(".catalog-heading-actions .account-secondary").first().click();
        await page.locator("dialog").waitFor();
        await fits(`${language} ${width} brands`);
        await page.locator("dialog > .account-primary").click();
        await fits(`${language} ${width} brand form`);
        await page.keyboard.press("Escape");
        await page.locator(".catalog-heading-actions .account-primary").click();
        await fits(`${language} ${width} product form`);
        await page.keyboard.press("Escape");
        if (width <= 768) {
          await page.locator(".lw-menu-btn").click();
          assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
          assert.equal(await page.locator(".lw-main").getAttribute("inert"), "");
          await page.locator(".lw-nav-item").last().focus();
          await page.keyboard.press("Tab");
          assert.equal(await page.locator(".lw-close-menu").evaluate(e => e === document.activeElement), true);
          await page.keyboard.press("Escape");
          assert.equal(await page.locator(".lw-menu-btn").evaluate(e => e === document.activeElement), true);
          await page.locator(".lw-menu-btn").click();
          await page.locator(".lw-nav-item").first().click();
          await page.waitForFunction(() => !document.querySelector(".lw-sidebar-open"));
          assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
        }
      }
    }
    // Laptop viewports exclude browser chrome and account for display scaling.
    // A page without horizontal overflow can still have an oversized login.
    for (const language of ["es", "en", "fr"]) {
      for (const [width, height] of [[1366,600],[1525,695],[1920,875],[1024,600]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(value => localStorage.setItem("lwi_language", value), language);
        for (const route of ["/login", "/recuperar-contrasena", "/", "/inventario", "/proveedores", "/usuarios", "/configuracion", "/perfil"]) {
          await page.goto(origin + route);
          await page.locator("h1").first().waitFor();
          await fits(`${language} ${width}x${height} ${route}`);
          if (route === "/login") {
            const metrics = await page.evaluate(() => ({ height: innerHeight, content: document.documentElement.scrollHeight, footer: document.querySelector(".login-footer").getBoundingClientRect().bottom }));
            assert.ok(metrics.content <= height + 1 && metrics.footer <= height, `Login must fit ${language} ${width}x${height}: ${JSON.stringify(metrics)}`);
            if (language === "es") await page.screenshot({ path: path.join(fileURLToPath(output), `login-height-${width}x${height}.png`) });
          }
        }
      }
    }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(origin + "/inventario");
    await page.locator(".lw-user-btn").click();
    const profileBounds = await page.locator(".lw-profile-menu").boundingBox();
    assert.ok(profileBounds.x >= 0 && profileBounds.x + profileBounds.width <= 320);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".lw-user-btn").evaluate(e => e === document.activeElement), true);
    await page.locator(".catalog-heading-actions .account-primary").click();
    await fits("320x568 short dialog");
    await page.locator("dialog .account-actions button").first().scrollIntoViewIfNeeded();
    const actions = await page.locator("dialog .account-actions").boundingBox();
    assert.ok(actions.y >= 0 && actions.y + actions.height <= 568);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.locator(".lw-menu-btn").click();
    assert.equal(await page.locator(".lw-app").evaluate(e => e.classList.contains("lw-collapsed")), true);
    await fits("1024 collapsed sidebar");
    await page.locator(".lw-menu-btn").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator(".lw-sidebar").evaluate(e => getComputedStyle(e).transitionDuration), "0s");
    failureMode = true;
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(origin + "/inventario");
    await page.getByRole("alert").waitFor();
    await fits("320 error state");
    // 200% zoom equivalent: half the available CSS viewport at desktop/tablet widths.
    for (const width of [683,512]) {
      await page.setViewportSize({ width, height: 450 });
      await page.goto(origin + "/configuracion");
      await page.locator("h1").waitFor();
      await fits(`200 percent reflow ${width}`);
    }
    assert.deepEqual(errors, []);
    console.log(`${results.length} browser layout checks passed; artifacts: .responsive-artifacts/`);
  } catch (error) {
    console.error(error.message);
    throw error;
  } finally {
    console.log("Closing browser and Vite");
    await writeFile(new URL(process.env.LWI_RESPONSIVE_WIDTHS ? "report-controls.json" : "report.json", output), JSON.stringify({ checked: results, count: results.length }, null, 2));
    await browser?.close();
    if (ownedProcess?.exitCode === null) ownedProcess.kill();
    ownedProcess?.unref();
    console.log("Owned browser closed");
    vite.httpServer?.closeAllConnections(); await vite.close();
  }
});
