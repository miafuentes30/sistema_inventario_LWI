import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus, Eye, Pencil, Power } from "lucide-react";
import { Modal } from "../components/AccountUI";
import { useLanguage } from "../context/LanguageContext";
import { catalogService } from "../services/catalogService";
import { emptyProduct, emptySupplier, supplierFields, supplierNames, validProduct, validSupplier, filterRecords } from "../services/catalogModel";
import "../styles/catalog.css";
const initialFilters = { search: "", category: "", type: "", status: "" };
export default function Catalog({ suppliers = false }) {
  const { t, language, setLanguage } = useLanguage();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(suppliers ? emptySupplier : emptyProduct);
  const [message, setMessage] = useState("");
  useEffect(() => { let active = true; setItems([]); (suppliers ? catalogService.listSuppliers() : catalogService.listProducts()).then(result => { if (active) setItems(result.items); }); return () => { active = false; }; }, [suppliers]);
  useEffect(() => { setFilters(initialFilters); setPage(1); setModal(null); }, [suppliers]);
  useEffect(() => { if (!suppliers && location.hash === "#nuevo") open("create"); }, [location.hash, suppliers]);
  function open(mode, record) { setForm({ ...(record || (suppliers ? emptySupplier : emptyProduct)) }); setMessage(""); setModal(mode); }
  function updateFilter(key, value) { setFilters(old => ({ ...old, [key]: value })); setPage(1); }
  const field = key => ({ value: form[key], onChange: e => { setMessage(""); setForm({ ...form, [key]: e.target.value }); } });
  const rows = filterRecords(items, filters, suppliers, language);
  const title = suppliers ? "suppliers" : "inventory";
  const columns = suppliers ? ["principal", "secondary", "type", "status", "actions"] : ["code", "description", "category", "inventoryType", "stock", "status", "actions"];
  const options = key => [...new Set(items.map(item => item[key]))].filter(Boolean);
  const status = value => <span className={`account-badge ${value ? "active" : "inactive"}`}>{t(value ? "active" : "inactive")}</span>;
  return <main className="lw-content account-page catalog-page">
    <div className="account-heading"><div><h1>{t(title)}</h1><p>{t(suppliers ? "suppliersDescription" : "inventoryDescription")}</p></div><button className="account-primary" onClick={() => open("create")}><Plus size={18}/>{t(suppliers ? "newSupplier" : "newProduct")}</button></div>
    <label className="catalog-language">{t("language")}<select value={language} onChange={e => setLanguage(e.target.value)}><option value="es">Español</option><option value="en">English</option><option value="fr">Français</option></select></label>
    <p className="lw-data-note">{t("pending")}</p>
    <section className="lw-panel catalog-filters">
      <label>{t(suppliers ? "searchSupplier" : "searchProduct")}<input type="search" maxLength={180} value={filters.search} onChange={e => updateFilter("search", e.target.value)}/></label>
      {!suppliers && <label>{t("category")}<select value={filters.category} onChange={e => updateFilter("category", e.target.value)}><option value="">{t("all")}</option>{options("category").map(x => <option key={x}>{x}</option>)}</select></label>}
      <label>{t(suppliers ? "type" : "inventoryType")}<select value={filters.type} onChange={e => updateFilter("type", e.target.value)}><option value="">{t("all")}</option>{(suppliers ? Object.keys(supplierFields) : options("inventoryType")).map(x => <option key={x} value={x}>{suppliers ? t(x) : x}</option>)}</select></label>
      <label>{t("status")}<select value={filters.status} onChange={e => updateFilter("status", e.target.value)}><option value="">{t("all")}</option><option value="true">{t("active")}</option><option value="false">{t("inactive")}</option></select></label>
      <button className="account-secondary" onClick={() => { setFilters(initialFilters); setPage(1); }}>{t("clear")}</button>
    </section>
    <section className="lw-panel"><div className="lw-table-wrap"><table className="account-table"><thead><tr>{columns.map(key => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>
      {rows.slice((page - 1) * 10, page * 10).map(item => <tr key={item.id}>{suppliers ? <><td>{supplierNames(item)[0]}</td><td>{supplierNames(item)[1] || "—"}</td><td>{t(item.type)}</td></> : <><td>{item.code}</td><td>{item.description}</td><td>{item.category}</td><td>{item.inventoryType}</td><td>{item.stock ?? "—"}</td></>}<td>{status(item.active)}</td><td><div className="account-row-actions">{suppliers ? <button className="account-icon" aria-label={t("view")} onClick={() => open("view", item)}><Eye size={17}/></button> : <Link className="account-icon" aria-label={t("view")} to={`/inventario/${encodeURIComponent(item.id)}`}><Eye size={17}/></Link>}<button className="account-icon" aria-label={t("edit")} onClick={() => open("edit", item)}><Pencil size={17}/></button><button className="account-icon" aria-label={t("deactivate")} disabled={!item.active} onClick={() => open("deactivate", item)}><Power size={17}/></button></div></td></tr>)}
      {!rows.length && <tr><td className="lw-empty" colSpan={columns.length}>{t(items.length ? "noResults" : "empty")}</td></tr>}
    </tbody></table></div>{rows.length > 10 && <div className="account-pagination"><button className="account-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("previous")}</button><span>{page} / {Math.ceil(rows.length / 10)}</span><button className="account-secondary" disabled={page * 10 >= rows.length} onClick={() => setPage(page + 1)}>{t("next")}</button></div>}</section>
    {modal && <Modal title={t(modal === "create" ? suppliers ? "newSupplier" : "newProduct" : modal)} onClose={() => setModal(null)}>
      <p>{t("pending")}</p>{message && <div role={message === "invalid" ? "alert" : "status"} className={`account-message ${message === "invalid" ? "error" : "success"}`}>{t(message)}</div>}
      {modal === "deactivate" ? <><p>{t("confirmDeactivate")}</p><button className="account-secondary" onClick={() => setModal(null)}>{t("cancel")}</button><button className="account-primary" disabled>{t("deactivate")}</button></> : <form noValidate className="account-form" onSubmit={e => { e.preventDefault(); setMessage((suppliers ? validSupplier(form) : validProduct(form)) ? "valid" : "invalid"); }}>
        <fieldset disabled={modal === "view"} className="catalog-fields">
          {suppliers ? <><label>{t("type")} *<select required value={form.type} onChange={e => { setForm({ ...emptySupplier, type: e.target.value }); setMessage(""); }}><option value="">{t("select")}</option>{Object.keys(supplierFields).map(x => <option key={x} value={x}>{t(x)}</option>)}</select></label>{(supplierFields[form.type] || []).map((key, index) => <label key={key}>{t(key)} {index === 0 || form.type === "person" ? "*" : `(${t("optional")})`}<input required={index === 0 || form.type === "person"} maxLength={180} {...field(key)}/></label>)}</> : <><p className="account-hint">{t("catalogs")}</p>{Object.keys(emptyProduct).filter(key => key !== "active").map(key => <label key={key}>{t(key)} *<input required maxLength={key === "code" ? 60 : 180} type={["minimum", "cost"].includes(key) ? "number" : "text"} min={["minimum", "cost"].includes(key) ? "0" : undefined} step="any" {...field(key)}/></label>)}</>}
          <label>{t("status")}<select value={String(form.active)} onChange={e => setForm({ ...form, active: e.target.value === "true" })}><option value="true">{t("active")}</option><option value="false">{t("inactive")}</option></select></label>
        </fieldset><div className="account-actions"><button type="button" className="account-secondary" onClick={() => setModal(null)}>{t("close")}</button>{modal !== "view" && <button className="account-primary">{t("validate")}</button>}</div>
      </form>}
    </Modal>}
  </main>;
}
