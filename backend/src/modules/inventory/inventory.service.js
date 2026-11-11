const { prisma, Prisma } = require("../../lib/prisma");
const { AppError } = require("../../middleware/app-error");
const { canWrite } = require("./inventory.access");
const notFound = () => new AppError(404, "Registro no encontrado.", "NOT_FOUND");
const catalogMap = { categorias: "categoria", subcategorias: "subcategoria", marcas: "marca", "unidades-medida": "unidadMedida",
  "tipos-inventario": "tipoInventario", bodegas: "bodega", "clases-contables": "claseCoa" };
const catalogDto = row => ({ id: String(row.id), name: row.nombre, code: row.codigo ?? null, active: row.activo,
  ...(row.categoriaId !== undefined && { categoryId: String(row.categoriaId) }),
  ...(row.permiteFracciones !== undefined && { allowsFractions: row.permiteFracciones }) });
async function catalogs(name, q) {
  const model = Object.hasOwn(catalogMap, name) ? catalogMap[name] : null; if (!model) throw notFound();
  return (await prisma[model].findMany({ where: { ...(q.activo && { activo: q.activo === "true" }),
    ...(q.buscar && { nombre: { contains: q.buscar, mode: "insensitive" } }),
    ...(model === "subcategoria" && q.categoriaId && { categoriaId: BigInt(q.categoriaId) }) }, orderBy: [{ nombre: q.orden }, { id: "asc" }] })).map(catalogDto);
}
async function brands(q) {
  return prisma.$transaction(async tx => {
    const clauses = [Prisma.sql`true`];
    if (q.buscar) clauses.push(Prisma.sql`nombre ILIKE ${`%${q.buscar.replace(/[\\%_]/g, "\\$&")}%`}`);
    if (q.activo) clauses.push(Prisma.sql`activo=${q.activo === "true"}`);
    const where = Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}`;
    const rows = await tx.$queryRaw(Prisma.sql`SELECT id,nombre,activo FROM marcas ${where} ORDER BY lower(btrim(nombre)) ${Prisma.raw(q.orden === "desc" ? "DESC" : "ASC")},id ASC LIMIT ${q.limite} OFFSET ${(q.pagina - 1) * q.limite}`);
    const [count] = await tx.$queryRaw(Prisma.sql`SELECT count(*)::int AS total FROM marcas ${where}`);
    return { items: rows.map(catalogDto), total: count.total, pagina: q.pagina, limite: q.limite };
  }, { isolationLevel: "RepeatableRead" });
}
async function saveBrand(id, input) {
  if (id && !(await prisma.marca.findUnique({ where: { id: BigInt(id) } }))) throw notFound();
  return catalogDto(await prisma.marca[id ? "update" : "create"]({ ...(id && { where: { id: BigInt(id) } }),
    data: { ...(input.name !== undefined && { nombre: input.name }), ...(input.active !== undefined && { activo: input.active }) } }));
}
const productInclude = { categoria: true, subcategoria: true, marca: true, unidadMedida: true, tipoInventario: true, claseCoa: true };
function productDto(p) {
  return { id: String(p.id), code: p.codigo, name: p.nombre, description: p.descripcion ?? "", categoryId: String(p.categoriaId),
    category: p.categoria.nombre, subcategoryId: p.subcategoriaId === null ? null : String(p.subcategoriaId),
    subcategory: p.subcategoria?.nombre ?? null, unitId: p.unidadMedidaId === null ? null : String(p.unidadMedidaId), unit: p.unidadMedida?.nombre ?? null,
    brandId: p.marcaId === null ? null : String(p.marcaId), brand: p.marca?.nombre ?? null,
    inventoryTypeId: p.tipoInventarioId === null ? null : String(p.tipoInventarioId), inventoryType: p.tipoInventario?.nombre ?? null,
    minimum: p.stockMinimo?.toString() ?? null, active: p.activo, stock: null, cost: null, location: null,
    stockAvailable: false, pendingReview: p.pendienteRevision, createdAt: p.createdAt, updatedAt: p.updatedAt };
}
async function products(q) {
  const where = { ...(q.buscar && { OR: [{ codigo: { contains: q.buscar, mode: "insensitive" } }, { nombre: { contains: q.buscar, mode: "insensitive" } }] }),
    ...(q.activo && { activo: q.activo === "true" }), ...(q.categoriaId && { categoriaId: BigInt(q.categoriaId) }),
    ...(q.marcaId && { marcaId: BigInt(q.marcaId) }), ...(q.tipoInventarioId && { tipoInventarioId: BigInt(q.tipoInventarioId) }) };
  const [rows, total, registered, warehouses] = await prisma.$transaction([
    prisma.producto.findMany({ where, include: productInclude, orderBy: [{ codigo: q.orden }, { id: "asc" }], skip: (q.pagina - 1) * q.limite, take: q.limite }),
    prisma.producto.count({ where }), prisma.producto.count(), prisma.bodega.count({ where: { activo: true } })]);
  return { items: rows.map(productDto), total, pagina: q.pagina, limite: q.limite, indicadores: { registeredProducts: registered, warehouses, totalValue: null, lowStock: null, outOfStock: null } };
}
async function product(id) {
  const p = await prisma.producto.findUnique({ where: { id: BigInt(id) }, include: productInclude });
  if (!p) throw notFound(); return productDto(p);
}
async function reference(tx, model, id, previous) {
  if (!id) return;
  const row = await tx[model].findUnique({ where: { id: BigInt(id) } });
  if (!row || !row.activo && String(previous ?? "") !== id) throw new AppError(400, "Selecciona un registro activo del catálogo.", "INVALID_CATALOG_REFERENCE");
  return row;
}
async function saveProduct(id, input) {
  return prisma.$transaction(async tx => {
    let current;
    if (id) { current = await tx.producto.findUnique({ where: { id: BigInt(id) } }); if (!current) throw notFound(); }
    if (input.code === undefined) return productDto(await tx.producto.update({ where: { id: BigInt(id) }, data: { activo: input.active }, include: productInclude }));
    await reference(tx, "categoria", input.categoryId, current?.categoriaId);
    const sub = await reference(tx, "subcategoria", input.subcategoryId, current?.subcategoriaId);
    if (sub && String(sub.categoriaId) !== input.categoryId) throw new AppError(400, "La subcategoría no pertenece a la categoría.", "INVALID_SUBCATEGORY");
    await reference(tx, "marca", input.brandId, current?.marcaId);
    await reference(tx, "unidadMedida", input.unitId, current?.unidadMedidaId);
    await reference(tx, "tipoInventario", input.inventoryTypeId, current?.tipoInventarioId);
    const data = { codigo: input.code, nombre: input.name, descripcion: input.description, categoriaId: BigInt(input.categoryId),
      subcategoriaId: input.subcategoryId ? BigInt(input.subcategoryId) : null, marcaId: input.brandId ? BigInt(input.brandId) : null,
      unidadMedidaId: input.unitId ? BigInt(input.unitId) : null, tipoInventarioId: input.inventoryTypeId ? BigInt(input.inventoryTypeId) : null,
      stockMinimo: input.minimum, activo: input.active };
    return productDto(await tx.producto[id ? "update" : "create"]({ ...(id && { where: { id: BigInt(id) } }), data, include: productInclude }));
  });
}

const identitySelect = { id: true, nombres: true, apellidos: true, nit: true, telefono: true, correo: true, direccion: true, municipio: true, pais: true, nombreContacto: true, codigoPostal: true, activo: true };
const companySelect = { id: true, nombreComercial: true, razonSocial: true, tipoEmpresa: true, nit: true, telefono: true, correo: true, direccion: true, municipio: true, pais: true, nombreContacto: true, codigoPostal: true, activo: true };
const supplierSelect = banking => ({ id: true, activo: true, createdAt: true, updatedAt: true,
  persona: { select: identitySelect }, empresa: { select: companySelect }, roles: { where: { rol: "PROVEEDOR" },
    select: { activo: true, metodoPago: true, diasCredito: true, ...(banking && { beneficiarioCheque: true, cuentaBancaria: { select: { banco: true, nombreCuenta: true, numeroCuenta: true, activo: true } } }) } } });
function supplierType(t) { return t.persona ? "person" : t.empresa.tipoEmpresa === "INDIVIDUAL" ? "sole" : "company"; }
function supplierDto(t, banking = false) {
  const person = t.persona; const company = t.empresa; const row = person || company; const role = t.roles[0]; const type = supplierType(t);
  return { id: String(t.id), type, firstName: person?.nombres ?? "", lastName: person?.apellidos ?? "",
    businessName: type === "sole" ? company.nombreComercial : "", socialName: type === "sole" ? company.razonSocial ?? "" : "",
    tradeName: type === "company" ? company.nombreComercial : "", legalName: type === "company" ? company.razonSocial ?? "" : "",
    address: row.direccion ?? "", municipality: row.municipio ?? "", country: row.pais ?? "", email: row.correo ?? "", nit: row.nit ?? "",
    contactName: row.nombreContacto ?? "", phone: row.telefono ?? "", postalCode: row.codigoPostal ?? "",
    paymentMethod: role.metodoPago, creditDays: role.diasCredito, active: t.activo && row.activo && role.activo,
    createdAt: t.createdAt, updatedAt: t.updatedAt,
    ...(banking && { chequeBeneficiary: role.beneficiarioCheque ?? "", bankAccount: role.cuentaBancaria?.activo ? {
      bank: role.cuentaBancaria.banco, name: role.cuentaBancaria.nombreCuenta, number: role.cuentaBancaria.numeroCuenta } : null }) };
}
async function getSupplier(tx, id, banking) {
  const row = await tx.tercero.findFirst({ where: { id: BigInt(id), roles: { some: { rol: "PROVEEDOR" } } }, select: supplierSelect(banking) });
  if (!row) throw notFound(); return row;
}
async function supplier(id, actor) { return supplierDto(await getSupplier(prisma, id, canWrite(actor)), canWrite(actor)); }
async function suppliers(q, actor) {
  return prisma.$transaction(async tx => {
    const effective = Prisma.sql`(t.activo AND r.activo AND coalesce(p.activo,e.activo))`;
    const type = Prisma.sql`CASE WHEN p.id IS NOT NULL THEN 'person' WHEN e.tipo_empresa='INDIVIDUAL' THEN 'sole' ELSE 'company' END`;
    const filters = [Prisma.sql`r.rol='PROVEEDOR'`];
    if (q.activo) filters.push(Prisma.sql`${effective} = ${q.activo === "true"}`);
    if (q.tipo) filters.push(Prisma.sql`${type} = ${q.tipo}`);
    if (q.buscar) {
      const search = `%${q.buscar.replace(/[\\%_]/g, "\\$&")}%`;
      filters.push(Prisma.sql`(p.nombres ILIKE ${search} OR p.apellidos ILIKE ${search} OR e.nombre_comercial ILIKE ${search} OR e.razon_social ILIKE ${search})`);
    }
    const from = Prisma.sql`FROM terceros t JOIN tercero_roles r ON r.tercero_id=t.id LEFT JOIN personas p ON p.id=t.persona_id LEFT JOIN empresas e ON e.id=t.empresa_id`;
    const where = Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`;
    const ids = await tx.$queryRaw(Prisma.sql`SELECT t.id ${from} ${where} ORDER BY lower(coalesce(p.nombres,e.nombre_comercial)) ${Prisma.raw(q.orden === "desc" ? "DESC" : "ASC")},t.id ASC LIMIT ${q.limite} OFFSET ${(q.pagina - 1) * q.limite}`);
    const [count] = await tx.$queryRaw(Prisma.sql`SELECT count(*)::int AS total ${from} ${where}`);
    const [stats] = await tx.$queryRaw(Prisma.sql`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE ${effective} AND p.id IS NOT NULL)::int AS person,
      count(*) FILTER(WHERE ${effective} AND e.tipo_empresa='INDIVIDUAL')::int AS sole,
      count(*) FILTER(WHERE ${effective} AND e.tipo_empresa='JURIDICA')::int AS company ${from} WHERE r.rol='PROVEEDOR'`);
    const rows = await tx.tercero.findMany({ where: { id: { in: ids.map(i => i.id) } }, select: supplierSelect(false) });
    const byId = new Map(rows.map(row => [String(row.id), row]));
    return { items: ids.map(i => supplierDto(byId.get(String(i.id)))), total: count.total, pagina: q.pagina, limite: q.limite, indicadores: stats,
      permissions: { write: canWrite(actor), banking: canWrite(actor) } };
  }, { isolationLevel: "RepeatableRead" });
}
function identityData(input) {
  return { direccion: input.address, municipio: input.municipality, pais: input.country, correo: input.email, nit: input.nit,
    nombreContacto: input.contactName, telefono: input.phone, codigoPostal: input.postalCode };
}
async function saveSupplier(id, input, actor) {
  return prisma.$transaction(async tx => {
    let third;
    if (id) {
      await tx.$queryRaw`SELECT id FROM terceros WHERE id=${BigInt(id)} FOR UPDATE`;
      third = await getSupplier(tx, id, true);
      if (input.type && supplierType(third) !== input.type) throw new AppError(409, "El tipo de identidad no puede cambiarse al editar.", "SUPPLIER_TYPE_IMMUTABLE");
      if (input.active && (!third.activo || !(third.persona || third.empresa).activo)) throw new AppError(409, "La identidad del tercero está inactiva.", "INACTIVE_IDENTITY");
    }
    if (input.type) {
      const data = identityData(input);
      if (input.type === "person") {
        const person = await tx.persona[id ? "update" : "create"]({ ...(id && { where: { id: third.persona.id } }), data: { ...data, nombres: input.firstName, apellidos: input.lastName } });
        if (!id) third = await tx.tercero.create({ data: { personaId: person.id } });
      } else {
        const company = await tx.empresa[id ? "update" : "create"]({ ...(id && { where: { id: third.empresa.id } }), data: { ...data,
          nombreComercial: input.type === "sole" ? input.businessName : input.tradeName,
          razonSocial: input.type === "sole" ? input.socialName : input.legalName, tipoEmpresa: input.type === "sole" ? "INDIVIDUAL" : "JURIDICA" } });
        if (!id) third = await tx.tercero.create({ data: { empresaId: company.id } });
      }
    }
    const roleData = { activo: input.active, ...(input.type && { metodoPago: input.paymentMethod, diasCredito: input.creditDays, beneficiarioCheque: input.chequeBeneficiary }) };
    await tx.terceroRol[id ? "update" : "create"]({ ...(id ? { where: { terceroId_rol: { terceroId: third.id, rol: "PROVEEDOR" } } } : {}),
      data: { ...roleData, ...(!id && { terceroId: third.id, rol: "PROVEEDOR" }) } });
    if (input.bankAccount) {
      const bankData = { banco: input.bankAccount.bank, nombreCuenta: input.bankAccount.name, numeroCuenta: input.bankAccount.number, activo: true };
      await tx.cuentaBancariaTercero.upsert({ where: { terceroId_rol: { terceroId: third.id, rol: "PROVEEDOR" } },
        create: { terceroId: third.id, ...bankData }, update: bankData });
    }
    return supplierDto(await getSupplier(tx, String(third.id), canWrite(actor)), canWrite(actor));
  });
}
module.exports = { catalogs, brands, saveBrand, products, product, saveProduct, suppliers, supplier, saveSupplier };
