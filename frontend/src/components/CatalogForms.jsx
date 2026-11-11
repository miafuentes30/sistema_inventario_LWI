import { supplierFields } from "../services/catalogModel";
import { useLanguage } from "../context/LanguageContext";

export function CatalogFeedback({ error, notice }) {
  const { t } = useLanguage();
  const key = error ? `api_${error.code || "REQUEST_FAILED"}` : notice;
  const message = key && t(key);
  return key ? <div className={`account-message ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>
    {message === key ? t("requestFailed") : message}
    {error?.errors && <ul>{Object.keys(error.errors).map(field => {
      const label = ({ bankAccount: "bankDetails", categoryId: "category", subcategoryId: "subcategory", brandId: "brand", unitId: "unit", inventoryTypeId: "inventoryType", active: "status" })[field] || field;
      return <li key={field}>{t(label) === label ? t("invalid") : `${t(label)}: ${t("checkField")}`}</li>;
    })}</ul>}
  </div> : null;
}
export function ProductFields({ form, setForm, catalogs, mode, error }) {
  const { t } = useLanguage();
  const change = key => e => setForm(old => ({ ...old, [key]: e.target.value, ...(key === "categoryId" && { subcategoryId: "" }) }));
  const select = (key, catalog, label, required = false) => <label>{t(label)} {required ? "*" : `(${t("optional")})`}
    <select required={required} value={form[key] || ""} onChange={change(key)} aria-invalid={!!error?.errors?.[key]}>
      <option value="">{t(catalog.length ? "select" : "emptyCatalog")}</option>
      {catalog.filter(row => row.active || row.id === form[key]).map(row => <option key={row.id} value={row.id}>{row.name}{!row.active ? ` (${t("inactive")})` : ""}</option>)}
    </select></label>;
  return <>
    {!catalogs.categorias?.length && <p className="account-hint">{t("categoryRequiredBeforeSave")}</p>}
    <label>{t("code")} *<input required maxLength={80} value={form.code} onChange={change("code")} aria-invalid={!!error?.errors?.code}/></label>
    <label>{t("productName")} *<input required maxLength={255} value={form.name} onChange={change("name")} aria-invalid={!!error?.errors?.name}/></label>
    <label>{t("description")} ({t("optional")})<textarea rows={3} maxLength={5000} value={form.description || ""} onChange={change("description")}/></label>
    {select("categoryId", catalogs.categorias || [], "category", true)}
    {select("subcategoryId", (catalogs.subcategorias || []).filter(row => row.categoryId === form.categoryId), "subcategory")}
    {select("brandId", catalogs.marcas || [], "brand")}
    {select("inventoryTypeId", catalogs["tipos-inventario"] || [], "inventoryType")}
    {select("unitId", catalogs["unidades-medida"] || [], "unit")}
    <label>{t("minimum")} ({t("optional")})<input type="number" min="0" step="0.001" value={form.minimum ?? ""} onChange={change("minimum")} aria-invalid={!!error?.errors?.minimum}/></label>
    <label>{t("status")}<select value={String(form.active)} disabled={mode === "edit"} onChange={e => setForm({ ...form, active: e.target.value === "true" })}>
      <option value="true">{t("active")}</option><option value="false">{t("inactive")}</option>
    </select></label>
  </>;
}
export function SupplierFields({ form, setForm, mode, banking, provideBank, setProvideBank, error }) {
  const { t } = useLanguage();
  const field = (key, max, required = false, type = "text") => <label key={key}>{t(key)} {required ? "*" : `(${t("optional")})`}
    <input type={type} required={required} maxLength={max} value={form[key] ?? ""} onChange={e => setForm({ ...form, [key]: e.target.value })} aria-invalid={!!error?.errors?.[key]}/></label>;
  return <>
    <label>{t("type")} *<select required value={form.type} disabled={mode !== "create"} onChange={e => setForm({ ...form, type: e.target.value, firstName: "", lastName: "", businessName: "", socialName: "", tradeName: "", legalName: "" })}>
      <option value="">{t("select")}</option>{Object.keys(supplierFields).map(key => <option key={key} value={key}>{t(key)}</option>)}
    </select></label>
    {(supplierFields[form.type] || []).map((key, index) => field(key, key === "firstName" || key === "lastName" ? 120 : index === 0 ? 200 : 250, index === 0 || form.type === "person"))}
    <h3 className="catalog-form-section">{t("contactDetails")}</h3>
    {[["address", 2000], ["municipality", 160], ["country", 100], ["email", 180, false, "email"], ["nit", 25], ["contactName", 200], ["phone", 40], ["postalCode", 20]].map(args => field(...args))}
    <h3 className="catalog-form-section">{t("paymentDetails")}</h3>
    <label>{t("paymentMethod")} ({t("optional")})<select value={form.paymentMethod || ""} onChange={e => setForm({ ...form, paymentMethod: e.target.value, chequeBeneficiary: "" })}>
      <option value="">{t("notSpecified")}</option><option value="TRANSFERENCIA">{t("transfer")}</option><option value="CHEQUE">{t("cheque")}</option>
    </select></label>
    <label>{t("creditDays")} ({t("optional")})<select value={form.creditDays ?? ""} onChange={e => setForm({ ...form, creditDays: e.target.value })}>
      <option value="">{t("notSpecified")}</option><option value="0">{t("onDelivery")}</option>{[15,30,60].map(days => <option value={days} key={days}>{days} {t("days")}</option>)}
    </select></label>
    {banking && form.paymentMethod === "CHEQUE" && field("chequeBeneficiary", 250)}
    {banking && form.paymentMethod === "TRANSFERENCIA" && <>
      <h3 className="catalog-form-section">{t("bankDetails")}</h3>
      <label className="catalog-checkbox"><input type="checkbox" checked={provideBank} onChange={e => setProvideBank(e.target.checked)}/>{t("provideBank")}</label>
      {provideBank && [["bank", "bankName", 160], ["name", "accountName", 250], ["number", "accountNumber", 80]].map(([key, label, max]) => <label key={key}>{t(label)} *<input required maxLength={max} autoComplete="off" value={form.bankAccount?.[key] || ""} onChange={e => setForm({ ...form, bankAccount: { ...form.bankAccount, [key]: e.target.value } })}/></label>)}
    </>}
    <label>{t("status")}<select value={String(form.active)} disabled={mode === "edit"} onChange={e => setForm({ ...form, active: e.target.value === "true" })}>
      <option value="true">{t("active")}</option><option value="false">{t("inactive")}</option>
    </select></label>
  </>;
}
