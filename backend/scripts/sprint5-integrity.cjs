const assert = require("node:assert/strict");

async function runIntegrity(client, database, report) {
  assert.match(database, /^sistema_inventario_sprint5_test(?:_[a-z0-9_]+)?$/);
  const [identity] = await client.$queryRawUnsafe("SELECT current_database() AS name");
  assert.equal(identity.name, database);
  assert.notEqual(identity.name, "sistema_inventario");
  const tag = "S5TEST_" + Date.now().toString(36);
  const rollback = new Error("ROLLBACK_IDENTIFIABLE_TEST_FIXTURES");
  let persona, individual, society, tercero, category, otherCategory, subcategory, brand, unit, type, coa, product;
  try {
    await client.$transaction(async tx => {
      async function check(name, fn) {
        await tx.$executeRawUnsafe("SAVEPOINT test_case");
        try {
          await fn();
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT test_case");
          report.tests.push({ name, passed: true });
        } catch (error) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT test_case");
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT test_case");
          report.tests.push({ name, passed: false, error: String(error.message).slice(0, 1500) });
        }
      }
      async function rejected(code, sql, ...values) {
        await tx.$executeRawUnsafe("SAVEPOINT expected_rejection");
        let caught;
        try { await tx.$queryRawUnsafe(sql, ...values); } catch (error) { caught = error; }
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT expected_rejection");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT expected_rejection");
        assert.ok(caught, `Expected PostgreSQL ${code}, operation was accepted.`);
        assert.equal(caught.meta?.code, code, caught.message);
      }

      await check("Prisma creates a person with separate names and institutional contact fields", async () => {
        persona = await tx.persona.create({ data: { nombres: tag + " Ana", apellidos: "S5TEST Apellido", nit: "S5TEST-1001",
          telefono: "S5TEST-0001", correo: "s5test@example.invalid", direccion: "S5TEST direccion", municipio: "S5TEST municipio",
          pais: "S5TEST pais", nombreContacto: "S5TEST contacto", codigoPostal: "00001" } });
        assert.equal(persona.codigoPostal, "00001"); assert.equal(persona.apellidos, "S5TEST Apellido");
      });
      await check("Person rejects empty names", () => rejected("23514", 'INSERT INTO personas(nombres,apellidos) VALUES ($1,$2)', " ", "S5TEST Apellido"));
      await check("Person requires surname", () => rejected("23502", 'INSERT INTO personas(nombres) VALUES ($1)', tag));
      await check("Person NIT rejects normalized duplicates", () => rejected("23505", 'INSERT INTO personas(nombres,apellidos,nit) VALUES ($1,$2,$3)', tag, "S5TEST", "s5test1001"));
      await check("Person NIT rejects separator-only value", () => rejected("23514", 'INSERT INTO personas(nombres,apellidos,nit) VALUES ($1,$2,$3)', tag, "S5TEST", " - "));
      await check("Individual company accepts primary name only and no owner", async () => {
        individual = await tx.empresa.create({ data: { nombreComercial: tag + " individual", tipoEmpresa: "INDIVIDUAL" } });
        assert.equal(individual.razonSocial, null); assert.equal(individual.propietarioPersonaId, null);
      });
      await check("Corporation accepts primary name only without invented suffix", async () => {
        society = await tx.empresa.create({ data: { nombreComercial: tag + " sociedad", tipoEmpresa: "JURIDICA" } });
        assert.equal(society.nombreComercial, tag + " sociedad"); assert.equal(society.razonSocial, null);
      });
      await check("Company accepts distinct secondary name", async () => {
        individual = await tx.empresa.update({ where: { id: individual.id }, data: { razonSocial: tag + " social" } });
        assert.notEqual(individual.razonSocial, individual.nombreComercial);
      });
      await check("Company rejects blank secondary name when provided", () => rejected("23514", 'INSERT INTO empresas(nombre_comercial,razon_social,tipo_empresa) VALUES ($1,$2,$3)', tag, " ", "INDIVIDUAL"));
      await check("Company rejects blank primary name", () => rejected("23514", 'INSERT INTO empresas(nombre_comercial,tipo_empresa) VALUES ($1,$2)', " ", "JURIDICA"));
      await check("Company rejects unsupported type", () => rejected("23514", 'INSERT INTO empresas(nombre_comercial,tipo_empresa) VALUES ($1,$2)', tag, "S5TEST"));
      await check("Individual owner can reference a real person later", async () => {
        const result = await tx.empresa.update({ where: { id: individual.id }, data: { propietarioPersonaId: persona.id }, include: { propietario: true } });
        assert.equal(result.propietario.id, persona.id);
      });
      await check("Owner cannot reference an unknown person", () => rejected("23503", 'INSERT INTO empresas(nombre_comercial,tipo_empresa,propietario_persona_id) VALUES ($1,$2,$3)', tag, "INDIVIDUAL", 9223372036854775806n));
      await check("Corporation rejects the individual-owner field", () => rejected("23514", 'INSERT INTO empresas(nombre_comercial,tipo_empresa,propietario_persona_id) VALUES ($1,$2,$3)', tag, "JURIDICA", persona.id));
      await check("Company NIT rejects normalized duplicates", async () => {
        await tx.empresa.update({ where: { id: society.id }, data: { nit: "S5TEST-2002" } });
        await rejected("23505", 'INSERT INTO empresas(nombre_comercial,tipo_empresa,nit) VALUES ($1,$2,$3)', tag, "JURIDICA", " s5test2002 ");
      });
      await check("Person and individual business may share NIT as explicitly proposed", async () => {
        await tx.empresa.update({ where: { id: individual.id }, data: { nit: persona.nit } });
      });
      await check("Person identity is linked to one third party", async () => {
        tercero = await tx.tercero.create({ data: { personaId: persona.id } }); assert.equal(tercero.personaId, persona.id);
      });
      await check("Both company types can be third parties", async () => {
        for (const company of [individual, society]) await tx.tercero.create({ data: { empresaId: company.id } });
      });
      await check("Third party requires an identity", () => rejected("23514", "INSERT INTO terceros DEFAULT VALUES"));
      await check("Third party cannot reference both identities", () => rejected("23514", 'INSERT INTO terceros(persona_id,empresa_id) VALUES ($1,$2)', persona.id, individual.id));
      await check("Third party rejects unknown identity", () => rejected("23503", 'INSERT INTO terceros(persona_id) VALUES ($1)', 9223372036854775806n));
      await check("Third party cannot duplicate a person's identity", () => rejected("23505", 'INSERT INTO terceros(persona_id) VALUES ($1)', persona.id));
      await check("Third party supports supplier and donor roles together", async () => {
        await tx.terceroRol.create({ data: { terceroId: tercero.id, rol: "PROVEEDOR", metodoPago: "TRANSFERENCIA", diasCredito: 15 } });
        await tx.terceroRol.create({ data: { terceroId: tercero.id, rol: "DONANTE" } });
        assert.equal((await tx.tercero.findUnique({ where: { id: tercero.id }, include: { roles: true } })).roles.length, 2);
      });
      await check("Role cannot be repeated for a third party", () => rejected("23505", 'INSERT INTO tercero_roles(tercero_id,rol) VALUES ($1,$2)', tercero.id, "PROVEEDOR"));
      await check("Role rejects unsupported value", () => rejected("23514", 'INSERT INTO tercero_roles(tercero_id,rol) VALUES ($1,$2)', tercero.id, "S5TEST"));
      await check("Role rejects unknown third party", () => rejected("23503", 'INSERT INTO tercero_roles(tercero_id,rol) VALUES ($1,$2)', 9223372036854775806n, "PROVEEDOR"));
      await check("Payment method rejects unsupported value", () => rejected("23514", 'UPDATE tercero_roles SET metodo_pago=$1 WHERE tercero_id=$2 AND rol=$3 RETURNING tercero_id', "S5TEST", tercero.id, "PROVEEDOR"));
      await check("Credit term rejects negative value", () => rejected("23514", 'UPDATE tercero_roles SET dias_credito=-1 WHERE tercero_id=$1 AND rol=$2 RETURNING tercero_id', tercero.id, "PROVEEDOR"));
      await check("Donor cannot have supplier payment conditions", () => rejected("23514", 'UPDATE tercero_roles SET dias_credito=15 WHERE tercero_id=$1 AND rol=$2 RETURNING tercero_id', tercero.id, "DONANTE"));
      await check("Cheque beneficiary is rejected for transfer", () => rejected("23514", 'UPDATE tercero_roles SET beneficiario_cheque=$1 WHERE tercero_id=$2 AND rol=$3 RETURNING tercero_id', tag, tercero.id, "PROVEEDOR"));
      await check("Bank account links to supplier and preserves leading zeros", async () => {
        const account = await tx.cuentaBancariaTercero.create({ data: { terceroId: tercero.id, banco: "S5TEST banco", nombreCuenta: "S5TEST titular", numeroCuenta: "000-S5TEST-001" } });
        assert.equal(account.numeroCuenta, "000-S5TEST-001");
      });
      await check("Bank account cannot reference donor role", () => rejected("23514", 'INSERT INTO cuentas_bancarias_tercero(tercero_id,rol,banco,nombre_cuenta,numero_cuenta) VALUES ($1,$2,$3,$4,$5)', tercero.id, "DONANTE", tag, tag, "000-S5TEST"));
      await check("Bank account cannot reference missing supplier role", () => rejected("23503", 'INSERT INTO cuentas_bancarias_tercero(tercero_id,banco,nombre_cuenta,numero_cuenta) VALUES ($1,$2,$3,$4)', 9223372036854775806n, tag, tag, "000-S5TEST"));
      await check("Bank rejects blank account number", () => rejected("23514", 'UPDATE cuentas_bancarias_tercero SET numero_cuenta=$1 WHERE tercero_id=$2 RETURNING tercero_id', " ", tercero.id));
      await check("Bank relation enforces at most one account per supplier", () => rejected("23505", 'INSERT INTO cuentas_bancarias_tercero(tercero_id,banco,nombre_cuenta,numero_cuenta) VALUES ($1,$2,$3,$4)', tercero.id, tag, tag, "000-S5TEST-002"));
      await check("Changing to cheque preserves bank history and permits beneficiary", async () => {
        const result = await tx.terceroRol.update({ where: { terceroId_rol: { terceroId: tercero.id, rol: "PROVEEDOR" } }, data: { metodoPago: "CHEQUE", beneficiarioCheque: "S5TEST beneficiario" }, include: { cuentaBancaria: true } });
        assert.ok(result.cuentaBancaria); assert.equal(result.beneficiarioCheque, "S5TEST beneficiario");
      });
      await check("Confirmed credit choices 0, 15, 30, 60 and unknown are supported", async () => {
        for (const diasCredito of [0, 15, 30, 60, null]) await tx.terceroRol.update({ where: { terceroId_rol: { terceroId: tercero.id, rol: "PROVEEDOR" } }, data: { diasCredito } });
      });
      await check("Category and subcategory can be created with a real relation", async () => {
        category = await tx.categoria.create({ data: { codigo: tag + "_C", nombre: tag + " categoria" } });
        otherCategory = await tx.categoria.create({ data: { nombre: tag + " otra categoria" } });
        subcategory = await tx.subcategoria.create({ data: { categoriaId: category.id, nombre: tag + " subcategoria" } });
        assert.equal(subcategory.categoriaId, category.id);
      });
      await check("Subcategory cannot refer to unknown category", () => rejected("23503", 'INSERT INTO subcategorias(categoria_id,nombre) VALUES ($1,$2)', 9223372036854775806n, tag));
      await check("Category names cannot be case/space duplicates", () => rejected("23505", 'INSERT INTO categorias(nombre) VALUES ($1)', " " + category.nombre.toLowerCase() + " "));
      await check("Subcategory names cannot repeat within a category", () => rejected("23505", 'INSERT INTO subcategorias(categoria_id,nombre) VALUES ($1,$2)', category.id, subcategory.nombre.toLowerCase()));
      await check("Same subcategory label can exist in another category", async () => {
        await tx.subcategoria.create({ data: { categoriaId: otherCategory.id, nombre: subcategory.nombre } });
      });
      await check("Brand can be created and read through generated Prisma client", async () => {
        brand = await tx.marca.create({ data: { nombre: tag + " marca" } });
        assert.equal((await tx.marca.findUnique({ where: { id: brand.id } })).nombre, brand.nombre);
      });
      await check("Brand rejects case/space duplicates", () => rejected("23505", 'INSERT INTO marcas(nombre) VALUES ($1)', " " + brand.nombre.toLowerCase() + " "));
      await check("Inactive brand still prevents duplicate identity", async () => {
        await tx.marca.update({ where: { id: brand.id }, data: { activo: false } });
        await rejected("23505", 'INSERT INTO marcas(nombre) VALUES ($1)', brand.nombre.toLowerCase());
        await tx.marca.update({ where: { id: brand.id }, data: { activo: true } });
      });
      await check("Brand rejects empty name", () => rejected("23514", 'INSERT INTO marcas(nombre) VALUES ($1)', " "));
      await check("Unit stores fraction policy and independent inventory type/COA catalogs", async () => {
        unit = await tx.unidadMedida.create({ data: { codigo: tag + "_U", nombre: tag + " unidad", permiteFracciones: true } });
        type = await tx.tipoInventario.create({ data: { codigo: tag + "_T", nombre: tag + " tipo" } });
        coa = await tx.claseCoa.create({ data: { codigo: tag + "_COA", nombre: tag + " contable" } });
        assert.equal(unit.permiteFracciones, true);
      });
      await check("Unit rejects normalized duplicate code", () => rejected("23505", 'INSERT INTO unidades_medida(codigo,nombre) VALUES ($1,$2)', unit.codigo.toLowerCase(), tag + " otra unidad"));
      await check("Inventory type rejects normalized duplicate name", () => rejected("23505", 'INSERT INTO tipos_inventario(codigo,nombre) VALUES ($1,$2)', tag + "_OT", type.nombre.toLowerCase()));
      await check("Warehouse accepts optional responsible user", async () => {
        await tx.bodega.create({ data: { codigo: tag + "_B", nombre: tag + " bodega" } });
        const user = await tx.usuario.findFirst({ select: { id: true } });
        await tx.bodega.create({ data: { codigo: tag + "_B2", nombre: tag + " bodega responsable", responsableUsuarioId: user.id } });
      });
      await check("Warehouse rejects unknown responsible user", () => rejected("23503", 'INSERT INTO bodegas(codigo,nombre,responsable_usuario_id) VALUES ($1,$2,$3)', tag + "_B3", tag, 9223372036854775806n));
      await check("Warehouse rejects normalized duplicate code", () => rejected("23505", 'INSERT INTO bodegas(codigo,nombre) VALUES ($1,$2)', (tag + "_B").toLowerCase(), tag));
      await check("Product links all catalogs and preserves decimal minimum threshold", async () => {
        product = await tx.producto.create({ data: { codigo: tag + "_P", nombre: tag + " producto", categoriaId: category.id,
          subcategoriaId: subcategory.id, marcaId: brand.id, unidadMedidaId: unit.id, tipoInventarioId: type.id, claseCoaId: coa.id, stockMinimo: "1.125" },
          include: { marca: true, categoria: true, subcategoria: true, unidadMedida: true, tipoInventario: true, claseCoa: true } });
        assert.equal(product.marca.id, brand.id); assert.equal(product.stockMinimo.toFixed(3), "1.125");
        assert.equal(product.subcategoria.categoriaId, product.categoria.id);
      });
      await check("Product accepts no brand and incomplete catalogs without fabricated values", async () => {
        const item = await tx.producto.create({ data: { codigo: tag + "_P2", nombre: tag + " sin marca", categoriaId: category.id, stockMinimo: "0" } });
        assert.equal(item.marcaId, null); assert.equal(item.tipoInventarioId, null); assert.equal(item.unidadMedidaId, null);
      });
      await check("Product rejects subcategory from another category", () => rejected("23503", 'INSERT INTO productos(codigo,nombre,categoria_id,subcategoria_id) VALUES ($1,$2,$3,$4)', tag + "_BAD", tag, otherCategory.id, subcategory.id));
      await check("Product rejects unknown category", () => rejected("23503", 'INSERT INTO productos(codigo,nombre,categoria_id) VALUES ($1,$2,$3)', tag + "_BAD", tag, 9223372036854775806n));
      await check("Product rejects unknown brand", () => rejected("23503", 'INSERT INTO productos(codigo,nombre,categoria_id,marca_id) VALUES ($1,$2,$3,$4)', tag + "_BAD", tag, category.id, 9223372036854775806n));
      await check("Product rejects unknown unit", () => rejected("23503", 'INSERT INTO productos(codigo,nombre,categoria_id,unidad_medida_id) VALUES ($1,$2,$3,$4)', tag + "_BAD", tag, category.id, 9223372036854775806n));
      await check("Product rejects unknown inventory type", () => rejected("23503", 'INSERT INTO productos(codigo,nombre,categoria_id,tipo_inventario_id) VALUES ($1,$2,$3,$4)', tag + "_BAD", tag, category.id, 9223372036854775806n));
      await check("Product rejects negative minimum threshold", () => rejected("23514", 'INSERT INTO productos(codigo,nombre,categoria_id,stock_minimo) VALUES ($1,$2,$3,-1)', tag + "_BAD", tag, category.id));
      await check("Product rejects NaN minimum threshold", () => rejected("23514", "INSERT INTO productos(codigo,nombre,categoria_id,stock_minimo) VALUES ($1,$2,$3,'NaN'::numeric)", tag + "_BAD", tag, category.id));
      await check("Product rejects normalized duplicate code", () => rejected("23505", 'INSERT INTO productos(codigo,nombre,categoria_id) VALUES ($1,$2,$3)', product.codigo.toLowerCase(), tag, category.id));
      await check("Referenced brand cannot be deleted", () => rejected("23503", 'DELETE FROM marcas WHERE id=$1 RETURNING id', brand.id));
      await check("Referenced category cannot be deleted", () => rejected("23503", 'DELETE FROM categorias WHERE id=$1 RETURNING id', category.id));
      await check("Bank reference protects supplier role from deletion", () => rejected("23503", 'DELETE FROM tercero_roles WHERE tercero_id=$1 AND rol=$2 RETURNING tercero_id', tercero.id, "PROVEEDOR"));
      await check("Timestamp triggers override spoofed update time on all 13 new tables", async () => {
        for (const table of ["personas", "empresas", "terceros", "tercero_roles", "cuentas_bancarias_tercero", "categorias", "subcategorias", "marcas", "unidades_medida", "tipos_inventario", "clases_coa", "productos", "bodegas"]) {
          const rows = await tx.$queryRawUnsafe(`UPDATE "${table}" SET updated_at='2000-01-01'::timestamptz RETURNING updated_at`);
          assert.ok(rows.length > 0, `Missing fixture for ${table}`);
          assert.ok(rows.every(row => row.updated_at.getUTCFullYear() > 2020), `Trigger failed for ${table}`);
        }
      });
      await check("Failed operation can be rolled back atomically without partial catalog row", async () => {
        await tx.$executeRawUnsafe("SAVEPOINT atomic_probe");
        await tx.marca.create({ data: { nombre: tag + " atomic rollback" } });
        let caught;
        try { await tx.$queryRawUnsafe("INSERT INTO personas(nombres,apellidos) VALUES ('','S5TEST')"); } catch (error) { caught = error; }
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT atomic_probe");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT atomic_probe");
        assert.ok(caught);
        assert.equal(await tx.marca.findUnique({ where: { nombre: tag + " atomic rollback" } }), null);
      });
      // All identifiable fixture rows are rolled back. New-table sequences may advance.
      throw rollback;
    }, { timeout: 120000, maxWait: 10000 });
  } catch (error) { if (error !== rollback && error.message !== rollback.message) throw error; }
  report.fixturePrefix = tag;
  report.fixtureRowsRolledBack = true;
}
module.exports = { runIntegrity };
