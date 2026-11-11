export const supplierFields = {
  person: ["firstName", "lastName"],
  sole: ["businessName", "socialName"],
  company: ["tradeName", "legalName"],
};
export const emptyProduct = { code: "", name: "", description: "", categoryId: "", subcategoryId: "", inventoryTypeId: "", unitId: "", brandId: "", minimum: "", active: true };
export const emptySupplier = { type: "", firstName: "", lastName: "", businessName: "", socialName: "", tradeName: "", legalName: "",
  address: "", municipality: "", country: "", email: "", nit: "", contactName: "", phone: "", postalCode: "",
  paymentMethod: "", creditDays: "", chequeBeneficiary: "", bankAccount: null, active: true };
export const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function validProduct(form) {
  return ["code", "name", "categoryId"].every(key => String(form[key] ?? "").trim()) &&
    (form.minimum === "" || form.minimum === null || /^\d{1,15}(\.\d{1,3})?$/.test(String(form.minimum)));
}
export function validSupplier(form) {
  const fields = supplierFields[form.type];
  return !!fields && !!form[fields[0]]?.trim() && (form.type !== "person" || !!form.lastName?.trim());
}
export function supplierNames(form) { return (supplierFields[form.type] || []).map(key => form[key] || ""); }
export function filterRecords(items, filters, suppliers, language) {
  return items.filter(item => {
    const names = suppliers ? Object.values(supplierFields).flat().map(key => item[key]) : [item.code, item.name, item.description];
    return names.some(value => normalize(value).includes(normalize(filters.search))) &&
      (!filters.status || String(item.active) === filters.status) &&
      (!filters.type || item[suppliers ? "type" : "inventoryType"] === filters.type) &&
      (!filters.category || item.category === filters.category) &&
      (!filters.location || item.location === filters.location);
  }).sort((a, b) => (suppliers ? supplierNames(a)[0] : a.code).localeCompare(suppliers ? supplierNames(b)[0] : b.code, language, { sensitivity: "base", numeric: true }));
}
