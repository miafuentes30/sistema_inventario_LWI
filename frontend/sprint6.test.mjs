import {test} from "node:test";
import assert from "node:assert/strict";
import {scaled,totals,formatDecimal} from "./src/services/movementModel.js";
import {sprint6Translations} from "./src/context/sprint6Translations.js";
test("Exact quantity and cost arithmetic without floating point",()=>{
  const result=totals([{quantity:"0.1",unitCost:"0.2",unit:"Unidad"},{quantity:"0.2",unitCost:"0.1",unit:"Caja"}]);
  assert.equal(result.total,"0.040000000");assert.equal(result.quantities.Unidad,"0.100");assert.equal(result.quantities.Caja,"0.200");
  assert.equal(totals([{quantity:"0.001",unitCost:"0.000001",unit:"Unidad"}]).total,"0.000000001");
  assert.equal(totals([{quantity:"1",unitCost:"",unit:"Unidad"}]).total,null);
  assert.equal(totals([{quantity:"1",unitCost:"10",unit:"Unidad"}],true).total,null);
  assert.equal(formatDecimal("12345678901234567890.125","en"),"12,345,678,901,234,567,890.125");
  assert.throws(()=>scaled("-1",3));assert.throws(()=>scaled("1.0001",3));
});
test("Every Sprint 6 message is available in Spanish, English and French",()=>{
  for(const lang of ["es","en","fr"]){assert.deepEqual(Object.keys(sprint6Translations[lang]),Object.keys(sprint6Translations.es));for(const text of Object.values(sprint6Translations[lang]))assert.ok(text.length);}
});
test("Capabilities distinguish an outdated server from pending migration and a network failure",async()=>{
  const {createServer}=await import("vite");
  const {fileURLToPath}=await import("node:url");
  const vite=await createServer({root:fileURLToPath(new URL(".",import.meta.url)),server:{middlewareMode:true,hmr:false},appType:"custom"});
  const originalFetch=globalThis.fetch;
  try{
    const {movementService}=await vite.ssrLoadModule("/src/services/movementService.js");
    globalThis.fetch=async()=>({ok:false,status:404,json:async()=>({success:false,message:"Not found"})});
    await assert.rejects(()=>movementService.capabilities("test"),e=>e.code==="MOVEMENT_BACKEND_OUTDATED"&&e.status===404);
    globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({success:false,code:"MOVEMENT_MIGRATION_REQUIRED"})});
    await assert.rejects(()=>movementService.capabilities("test"),e=>e.code==="MOVEMENT_MIGRATION_REQUIRED");
    globalThis.fetch=async()=>{throw new TypeError("Network unavailable")};
    await assert.rejects(()=>movementService.capabilities("test"),e=>e instanceof TypeError&&e.code!=="MOVEMENT_BACKEND_OUTDATED");
  }finally{globalThis.fetch=originalFetch;await vite.close();}
});
