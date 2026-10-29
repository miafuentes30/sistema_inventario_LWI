export const supplierFields = {
  person: ["firstName", "lastName"],
  sole: ["businessName", "socialName"],
  company: ["tradeName", "legalName"],
};
export const emptyProduct = { code: "", description: "", category: "", inventoryType: "", unit: "", minimum: "", cost: "", active: true };
export const emptySupplier = { type: "", firstName: "", lastName: "", businessName: "", socialName: "", tradeName: "", legalName: "", active: true };
export const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function validProduct(form) {
  return ["code", "description", "category", "inventoryType", "unit"].every(key => String(form[key] ?? "").trim()) &&
    ["minimum", "cost"].every(key => String(form[key] ?? "").trim() !== "" && Number.isFinite(Number(form[key])) && Number(form[key]) >= 0);
}
export function validSupplier(form) {
  const fields = supplierFields[form.type];
  return !!fields && !!form[fields[0]]?.trim() && (form.type !== "person" || !!form.lastName?.trim());
}
export function supplierNames(form) { return (supplierFields[form.type] || []).map(key => form[key] || ""); }
export function filterRecords(items, filters, suppliers, language) {
  return items.filter(item => {
    const names = suppliers ? Object.values(supplierFields).flat().map(key => item[key]) : [item.code, item.description];
    return names.some(value => normalize(value).includes(normalize(filters.search))) &&
      (!filters.status || String(item.active) === filters.status) &&
      (!filters.type || item[suppliers ? "type" : "inventoryType"] === filters.type) &&
      (!filters.category || item.category === filters.category);
  }).sort((a, b) => (suppliers ? supplierNames(a)[0] : a.code).localeCompare(suppliers ? supplierNames(b)[0] : b.code, language, { sensitivity: "base", numeric: true }));
}
