const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const schema = require("./src/modules/movements/movements.schema");
const { inspectFile } = require("./src/modules/movements/files");
const valid = { typeId:"1",date:"2026-11-19",warehouseId:"1",responsibleId:"1",idempotencyKey:"d801d801-d801-4801-8801-d801d801d801",lines:[{productId:"1",unitId:"1",quantity:"1.125",unitCost:"0.000001"}] };
test("Positive quantities and exact monetary input contracts",()=>{
  assert.ok(schema.movement.safeParse(valid).success);
  for(const quantity of ["0","-1","NaN","Infinity","abc","1.1234"]) assert.equal(schema.movement.safeParse({...valid,lines:[{...valid.lines[0],quantity}]}).success,false);
  assert.equal(schema.movement.safeParse({...valid,lines:[valid.lines[0],valid.lines[0]]}).success,false);
});
test("Dates, idempotency and immutable server fields are validated",()=>{
  for(const date of ["2026-02-30","2026-13-01","yesterday"]) assert.equal(schema.movement.safeParse({...valid,date}).success,false);
  assert.equal(schema.movement.safeParse({...valid,createdBy:"1"}).success,false);
  assert.equal(schema.movement.safeParse({...valid,idempotencyKey:"same"}).success,false);
  assert.equal(schema.confirmation.safeParse({confirmed:false,version:1,idempotencyKey:valid.idempotencyKey}).success,false);
  assert.equal(schema.query.safeParse({desde:"2026-11-20",hasta:"2026-11-19"}).success,false);
});
test("File signatures and bounds; no file is stored",()=>{
  assert.equal(inspectFile(Buffer.from("%PDF-1.7\n")),"application/pdf");
  assert.equal(inspectFile(Buffer.from([137,80,78,71,13,10,26,10])),"image/png");
  assert.equal(inspectFile(Buffer.from([255,216,255,224])),"image/jpeg");
  assert.throws(()=>inspectFile(Buffer.from("fake.pdf")));
  assert.throws(()=>inspectFile(Buffer.alloc(0)));
  assert.throws(()=>inspectFile(Buffer.from("%PDF-1.7"),3));
});
test("Proposal has only additive tables; no seeds, resets or openings",()=>{
  const sql=fs.readFileSync(require.resolve("./prisma/proposals/sprint6/migrations/002_movimientos/migration.sql"),"utf8");
  assert.equal((sql.match(/CREATE TABLE /g)||[]).length,8);
  assert.doesNotMatch(sql,/\b(DROP|TRUNCATE)\b/i);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/cantidad_disponible>=d.cantidad/);
  assert.match(sql,/OPENING_NOT_AUTHORIZED/);
  assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);
});
test("HTTP contracts fail closed without migrations; no database IO",async()=>{
  require("./scripts/sprint5-target.cjs").configureSprint5();
  const {prisma}=require("./src/lib/prisma"), {app}=require("./src/app");
  const originalRaw=prisma.$queryRaw, originalUser=prisma.usuario.findUnique;
  let role="Administrador", writes=0;
  const originalTransaction=prisma.$transaction;
  prisma.$transaction=async()=>{writes++;throw new Error("Unexpected database write");};
  prisma.$queryRaw=async sql=>String(sql).includes("current_database")?[{name:"sistema_inventario_sprint5_test"}]:[{ready:false}];
  prisma.usuario.findUnique=async()=>({id:1n,activo:true,passwordHash:"test-only",rol:{activo:true,nombre:role}});
  const token=require("jsonwebtoken").sign({sub:"1",cv:require("./src/middleware/auth.middleware").credentialVersion("test-only")},require("./src/config/env").env.JWT_SECRET,{expiresIn:"1m"});
  const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
  const request=(route,method="GET",body,authenticated=true)=>fetch(`http://127.0.0.1:${server.address().port}/api${route}`,{method,headers:{"Content-Type":"application/json",...(authenticated&&{Authorization:`Bearer ${token}`})},...(body&&{body:JSON.stringify(body)})});
  try{
    assert.equal((await request("/inventario-movimientos/capacidades","GET",undefined,false)).status,401);
    const caps=await (await request("/inventario-movimientos/capacidades")).json();assert.equal(caps.data.enabled,false);assert.equal(caps.data.needsMigration,true);
    for(const route of ["/entradas","/salidas","/entradas/1","/salidas/1","/productos/1/existencias","/productos/1/movimientos"]) assert.equal((await request(route)).status,503);
    assert.equal((await request("/entradas","POST",valid)).status,503);
    role="Compras";assert.equal((await request("/salidas","POST",valid)).status,403);
    assert.equal(writes,0);
  }finally{prisma.$queryRaw=originalRaw;prisma.usuario.findUnique=originalUser;prisma.$transaction=originalTransaction;await new Promise(r=>server.close(r));await prisma.$disconnect();}
});
