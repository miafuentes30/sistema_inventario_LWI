const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
require("./scripts/sprint5-target.cjs").configureSprint5();
process.env.NODE_ENV = "test";
const { prisma } = require("./src/lib/prisma");
const { app } = require("./src/app");
const bcrypt = require("bcryptjs");

test("Sprint 5 HTTP persistence, permissions and integration on isolated database only", { timeout: 120000 }, async t => {
  const [db] = await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.equal(db.name, "sistema_inventario_sprint5_test");
  const tag = "s5api_" + randomUUID().slice(0, 8);
  const password = "S5Fixture!Password2026";
  const sourceFingerprint = () => prisma.$queryRawUnsafe(`SELECT md5(coalesce(string_agg(row_to_json(u)::text,E'\\n' ORDER BY id),'')) AS digest FROM usuarios u WHERE correo NOT LIKE '${tag}%'`);
  const original = await sourceFingerprint();
  const roles = await prisma.rol.findMany();
  const fixtureUsers = [];
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokens = {};
  async function request(route, method = "GET", body, role = "Administrador", status = 200) {
    const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(tokens[role] && { Authorization: "Bearer " + tokens[role] }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${route}: ${JSON.stringify(result)}`);
    return result.data ?? result;
  }
  const supplierBody = (type = "person") => ({ type, ...(type === "person" ? { firstName: tag + " Ana", lastName: "S5TEST apellido" } : type === "sole" ? { businessName: tag + " Beta" } : { tradeName: tag + " Zulu" }), active: true });
  let supplier, sole, company, brand, product, cat, otherCat, sub, unit, inventoryType;
  try {
    const hash = await bcrypt.hash(password, 10);
    for (const name of ["Administrador", "Compras", "Finanzas", "Solicitante"]) {
      const role = roles.find(r => r.nombre === name); assert.ok(role);
      const user = await prisma.usuario.create({ data: { nombre: tag + " " + name, correo: `${tag}_${fixtureUsers.length}@water.cc`, passwordHash: hash, rolId: role.id } });
      fixtureUsers.push(user.id);
      const login = await request("/auth/login", "POST", { correo: user.correo, contrasena: password });
      tokens[name] = login.token;
      assert.ok(tokens[name]); assert.equal(login.usuario.passwordHash, undefined);
    }
    await t.test("Unauthenticated products and suppliers are private", async () => {
      await request("/productos", "GET", undefined, "none", 401);
      await request("/proveedores", "GET", undefined, "none", 401);
    });
    await t.test("Catalogs return actual empty lists without inserting defaults", async () => {
      for (const name of ["categorias", "subcategorias", "marcas", "unidades-medida", "tipos-inventario", "bodegas"]) assert.ok(Array.isArray(await request(`/catalogos/${name}`)));
      await request("/catalogos/unknown", "GET", undefined, "Administrador", 404);
      await request("/catalogos/constructor", "GET", undefined, "Administrador", 404);
      const response = await fetch(base + "/health", { headers: { Origin: "http://localhost:5174" } });
      assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5174");
    });
    await t.test("Non administrators cannot mutate suppliers, brands or products", async () => {
      for (const role of ["Compras", "Finanzas", "Solicitante"]) {
        await request("/proveedores", "POST", supplierBody(), role, 403);
        await request("/marcas", "POST", { name: tag }, role, 403);
        await request("/productos", "POST", {}, role, 403);
      }
    });
    await t.test("Supplier persists person names and optional institutional/banking fields", async () => {
      supplier = await request("/proveedores", "POST", { ...supplierBody(), nit: tag + "-01", address: "S5TEST direccion", municipality: "S5TEST municipio", country: "S5TEST pais",
        email: "s5test@example.invalid", contactName: "S5TEST contacto", phone: "000-S5TEST", postalCode: "00001", paymentMethod: "TRANSFERENCIA", creditDays: 15,
        bankAccount: { bank: "S5TEST banco", name: "S5TEST titular", number: "000-S5TEST-SECRET" } }, "Administrador", 201);
      assert.equal(supplier.bankAccount.number, "000-S5TEST-SECRET"); assert.equal(supplier.postalCode, "00001");
      const reloaded = await request(`/proveedores/${supplier.id}`);
      assert.equal(reloaded.firstName, supplier.firstName); assert.equal(reloaded.lastName, "S5TEST apellido");
      assert.equal(reloaded.bankAccount.number, "000-S5TEST-SECRET");
    });
    await t.test("All general lists omit banking values, even for administrators", async () => {
      for (const role of ["Administrador", "Compras", "Finanzas", "Solicitante"]) {
        const result = await request(`/proveedores?buscar=${tag}`, "GET", undefined, role);
        assert.equal(result.items.length, 1); assert.equal("bankAccount" in result.items[0], false);
        assert.equal(JSON.stringify(result).includes("000-S5TEST-SECRET"), false);
      }
    });
    await t.test("Only administrator can read banking detail", async () => {
      for (const role of ["Compras", "Finanzas", "Solicitante"]) {
        const detail = await request(`/proveedores/${supplier.id}`, "GET", undefined, role);
        assert.equal("bankAccount" in detail, false); assert.equal("chequeBeneficiary" in detail, false);
      }
    });
    await t.test("Individual company and corporation accept main name alone", async () => {
      sole = await request("/proveedores", "POST", supplierBody("sole"), "Administrador", 201);
      company = await request("/proveedores", "POST", supplierBody("company"), "Administrador", 201);
      assert.equal(sole.socialName, ""); assert.equal(company.legalName, "");
      const entity = await prisma.tercero.findUnique({ where: { id: BigInt(sole.id) }, include: { empresa: true } });
      assert.equal(entity.empresa.propietarioPersonaId, null);
    });
    await t.test("Supplier edit persists separate secondary name without S.A. suffix", async () => {
      company = await request(`/proveedores/${company.id}`, "PATCH", { ...supplierBody("company"), legalName: tag + " Razon propia" });
      assert.equal(company.legalName, tag + " Razon propia");
      assert.equal((await request(`/proveedores/${company.id}`)).legalName, company.legalName);
    });
    await t.test("Supplier type cannot silently replace the underlying identity", async () => {
      const error = await request(`/proveedores/${supplier.id}`, "PATCH", supplierBody("company"), "Administrador", 409);
      assert.equal(error.code, "SUPPLIER_TYPE_IMMUTABLE");
    });
    await t.test("Supplier search covers secondary names and sorts both directions", async () => {
      assert.equal((await request(`/proveedores?buscar=${encodeURIComponent(tag + " Razon propia")}`)).items[0].id, company.id);
      const asc = await request(`/proveedores?buscar=${tag}&orden=asc`);
      assert.deepEqual(asc.items.map(s => s.id), [supplier.id, sole.id, company.id]);
      const desc = await request(`/proveedores?buscar=${tag}&orden=desc&limite=1&pagina=2`);
      assert.equal(desc.total, 3); assert.equal(desc.items[0].id, sole.id);
      assert.equal((await request(`/proveedores?buscar=${tag}&tipo=sole`)).items[0].id, sole.id);
    });
    await t.test("Supplier state changes preserve donor role and bank history", async () => {
      await prisma.terceroRol.create({ data: { terceroId: BigInt(supplier.id), rol: "DONANTE" } });
      await request(`/proveedores/${supplier.id}/estado`, "PATCH", { active: false });
      assert.equal((await request(`/proveedores?buscar=${tag}&activo=false`)).items[0].id, supplier.id);
      const donor = await prisma.terceroRol.findUnique({ where: { terceroId_rol: { terceroId: BigInt(supplier.id), rol: "DONANTE" } } });
      assert.equal(donor.activo, true);
      await request(`/proveedores/${supplier.id}/estado`, "PATCH", { active: true });
      assert.equal((await request(`/proveedores/${supplier.id}`)).bankAccount.number, "000-S5TEST-SECRET");
    });
    await t.test("Supplier validation handles names, types, email, credit and applicable payment fields", async () => {
      for (const body of [{ type: "person", firstName: "Ana" }, { type: "company", tradeName: " " }, { ...supplierBody(), email: "invalid" },
        { ...supplierBody(), creditDays: -1 }, { ...supplierBody(), chequeBeneficiary: "S5TEST" },
        { ...supplierBody(), paymentMethod: "CHEQUE", bankAccount: { bank: "S5TEST", name: "S5TEST", number: "S5TEST" } }, { ...supplierBody(), tradeName: "S5TEST hidden" }]) {
        assert.equal((await request("/proveedores", "POST", body, "Administrador", 400)).code, "INVALID_INPUT");
      }
    });
    await t.test("Supplier duplicate NIT returns supplier conflict and rolls back partial identities", async () => {
      const before = await prisma.persona.count();
      const duplicate = await request("/proveedores", "POST", { ...supplierBody(), nit: tag + "01" }, "Administrador", 409);
      assert.equal(duplicate.code, "DUPLICATE_SUPPLIER"); assert.equal(await prisma.persona.count(), before);
    });
    await t.test("SQL-like search values are parameterized", async () => {
      assert.equal((await request("/proveedores?buscar=" + encodeURIComponent("%' OR true --"))).items.length, 0);
    });
    await t.test("Brand creation persists and duplicate error identifies brand", async () => {
      brand = await request("/marcas", "POST", { name: tag + " Brand" }, "Administrador", 201);
      const duplicate = await request("/marcas", "POST", { name: " " + brand.name.toLowerCase() + " " }, "Administrador", 409);
      assert.equal(duplicate.code, "DUPLICATE_BRAND"); assert.equal(duplicate.message.includes("correo"), false);
      assert.equal((await request(`/marcas?buscar=${tag}`)).items[0].id, brand.id);
      await request(`/marcas/${brand.id}`, "PATCH", { name: tag + " Renamed", active: true });
    });
    await t.test("Brands sort alphabetically without case-sensitive ordering", async () => {
      await request("/marcas", "POST", { name: tag + " alpha" }, "Administrador", 201);
      await request("/marcas", "POST", { name: tag + " Zeta" }, "Administrador", 201);
      assert.equal((await request(`/marcas?buscar=${tag}&orden=asc`)).items[0].name, tag + " alpha");
      assert.equal((await request(`/marcas?buscar=${tag}&orden=desc`)).items[0].name, tag + " Zeta");
    });
    await t.test("Create identifiable test catalogs without institutional default records", async () => {
      cat = await prisma.categoria.create({ data: { nombre: tag + " Cat" } });
      otherCat = await prisma.categoria.create({ data: { nombre: tag + " Other" } });
      sub = await prisma.subcategoria.create({ data: { nombre: tag + " Sub", categoriaId: cat.id } });
      unit = await prisma.unidadMedida.create({ data: { codigo: tag, nombre: tag + " Unit" } });
      inventoryType = await prisma.tipoInventario.create({ data: { codigo: tag, nombre: tag + " Type" } });
      await prisma.bodega.create({ data: { codigo: tag, nombre: tag + " Warehouse" } });
      assert.equal((await request(`/catalogos/subcategorias?categoriaId=${cat.id}`)).some(r => r.id === String(sub.id)), true);
    });
    const productBody = () => ({ code: tag + "_P", name: tag + " Product", description: "S5TEST description", categoryId: String(cat.id), subcategoryId: String(sub.id),
      unitId: String(unit.id), brandId: brand.id, inventoryTypeId: String(inventoryType.id), minimum: "1.125", active: true });
    await t.test("Brands remain available during parallel catalog refreshes", async () => {
      const results = await Promise.all([
        ...["categorias", "subcategorias", "marcas", "unidades-medida", "tipos-inventario", "bodegas"].map(name => request(`/catalogos/${name}`)),
        ...Array.from({ length: 8 }, () => request(`/marcas?buscar=${tag}`))
      ]);
      for (const result of results.slice(6)) {
        assert.equal(result.total, 3);
        assert.equal(result.items.length, 3);
      }
    });
    await t.test("Product persists optional brand, all relations and exact minimum without invented stock", async () => {
      product = await request("/productos", "POST", productBody(), "Administrador", 201);
      const detail = await request(`/productos/${product.id}`);
      assert.equal(detail.brandId, brand.id); assert.equal(detail.minimum, "1.125"); assert.equal(detail.stock, null); assert.equal(detail.cost, null);
    });
    await t.test("Product search, filters and pagination are served by PostgreSQL", async () => {
      for (const filter of [`buscar=${tag}`, `buscar=${tag}&categoriaId=${cat.id}`, `buscar=${tag}&marcaId=${brand.id}`, `buscar=${tag}&tipoInventarioId=${inventoryType.id}`]) {
        assert.equal((await request(`/productos?${filter}`)).items[0].id, product.id);
      }
      const page = await request(`/productos?buscar=${tag}&limite=1&pagina=2`); assert.equal(page.total, 1); assert.equal(page.items.length, 0);
    });
    await t.test("Products reject editable stock/cost, bad precision and invalid category relations", async () => {
      for (const extra of [{ stock: 3 }, { cost: 10 }, { minimum: "-1" }, { minimum: "NaN" }, { minimum: "1.1234" }, { categoryId: String(otherCat.id) }, { brandId: "9223372036854775806" }]) {
        await request("/productos", "POST", { ...productBody(), ...extra, code: tag + "_BAD" }, "Administrador", 400);
      }
    });
    await t.test("Product duplicate code returns correct entity conflict", async () => {
      assert.equal((await request("/productos", "POST", { ...productBody(), code: product.code.toLowerCase() }, "Administrador", 409)).code, "DUPLICATE_PRODUCT_CODE");
    });
    await t.test("Product editing and state changes persist", async () => {
      await request(`/productos/${product.id}`, "PATCH", { ...productBody(), name: tag + " Updated" });
      assert.equal((await request(`/productos/${product.id}`)).name, tag + " Updated");
      await request(`/productos/${product.id}/estado`, "PATCH", { active: false });
      assert.equal((await request(`/productos?buscar=${tag}&activo=false`)).items[0].active, false);
      const { active, ...withoutState } = productBody();
      assert.equal((await request(`/productos/${product.id}`, "PATCH", withoutState)).active, false);
      await request(`/productos/${product.id}/estado`, "PATCH", { active: true });
    });
    await t.test("Inactive brands cannot be newly assigned but existing association can be retained", async () => {
      await request(`/marcas/${brand.id}/estado`, "PATCH", { active: false });
      assert.equal((await request(`/marcas/${brand.id}`, "PATCH", { name: tag + " Renamed" })).active, false);
      await request("/productos", "POST", { ...productBody(), code: tag + "_INACTIVE" }, "Administrador", 400);
      await request(`/productos/${product.id}`, "PATCH", productBody());
      await request(`/marcas/${brand.id}/estado`, "PATCH", { active: true });
    });
    await t.test("Product accepts no brand", async () => {
      const item = await request("/productos", "POST", { ...productBody(), code: tag + "_NOBRAND", brandId: null }, "Administrador", 201);
      assert.equal(item.brandId, null);
    });
    await t.test("Identifiers, query values and not-found are validated", async () => {
      await request("/productos/invalid", "GET", undefined, "Administrador", 400);
      await request("/proveedores/0", "GET", undefined, "Administrador", 400);
      await request("/productos?pagina=-1", "GET", undefined, "Administrador", 400);
      await request("/productos/9223372036854775806", "GET", undefined, "Administrador", 404);
    });
    await t.test("Existing users and profile modules remain compatible with integrated Prisma", async () => {
      const profile = await request("/perfil"); assert.equal(profile.rol.nombre, "Administrador"); assert.equal(profile.passwordHash, undefined);
      await request("/perfil", "PATCH", { nombre: tag + " Perfil" });
      const users = await request(`/usuarios?buscar=${tag}`); assert.equal(users.total, 4);
      const duplicate = await request("/usuarios", "POST", { nombre: tag, correo: `${tag}_0@water.cc`, rolId: String(roles[0].id), activo: true, contrasena: password, confirmacion: password }, "Administrador", 409);
      assert.equal(duplicate.code, "DUPLICATE_EMAIL");
    });
  } finally {
    if (process.env.LWI_KEEP_TEST_DATA !== "1") {
      const thirds = await prisma.tercero.findMany({ where: { OR: [{ persona: { nombres: { startsWith: tag } } }, { empresa: { nombreComercial: { startsWith: tag } } }] }, select: { id: true } });
      const ids = thirds.map(t => t.id);
      await prisma.cuentaBancariaTercero.deleteMany({ where: { terceroId: { in: ids } } });
      await prisma.terceroRol.deleteMany({ where: { terceroId: { in: ids } } });
      await prisma.tercero.deleteMany({ where: { id: { in: ids } } });
      await prisma.empresa.deleteMany({ where: { nombreComercial: { startsWith: tag } } });
      await prisma.persona.deleteMany({ where: { nombres: { startsWith: tag } } });
      await prisma.producto.deleteMany({ where: { codigo: { startsWith: tag } } });
      for (const model of ["subcategoria", "categoria", "marca", "unidadMedida", "tipoInventario", "bodega"]) await prisma[model].deleteMany({ where: { nombre: { startsWith: tag } } });
      await prisma.usuario.deleteMany({ where: { id: { in: fixtureUsers } } });
    } else console.log(`Datos de prueba conservados: ${tag}`);
    assert.deepEqual(await sourceFingerprint(), original);
    await new Promise(r => server.close(r)); await prisma.$disconnect();
  }
});
