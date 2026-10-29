import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus, Eye, Pencil, Power, Home, Download, ChevronDown, Package, Database, TriangleAlert, CircleX, MapPin, Search, Filter, ChevronLeft, ChevronRight, Users, UserRound, Building, Building2, ArrowUpDown } from "lucide-react";
import { Modal } from "../components/AccountUI";
import { useLanguage } from "../context/LanguageContext";
import { catalogService } from "../services/catalogService";
import { emptyProduct, emptySupplier, supplierFields, supplierNames, validProduct, validSupplier, filterRecords } from "../services/catalogModel";
import "../styles/catalog.css";
const initialFilters = { search: "", category: "", type: "", status: "", location: "" };
export default function Catalog({ suppliers = false }) {
  const { t, language } = useLanguage();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(suppliers ? emptySupplier : emptyProduct);
  const [message, setMessage] = useState("");
  useEffect(() => { let active = true; setItems([]); (suppliers ? catalogService.listSuppliers() : catalogService.listProducts()).then(result => { if (active) setItems(result.items); }); return () => { active = false; }; }, [suppliers]);
  useEffect(() => { setFilters(initialFilters); setAppliedFilters(initialFilters); setPage(1); setModal(null); }, [suppliers]);
  useEffect(() => { if (!suppliers && location.hash === "#nuevo") open("create"); }, [location.hash, suppliers]);
  function open(mode, record) { setForm({ ...(record || (suppliers ? emptySupplier : emptyProduct)) }); setMessage(""); setModal(mode); }
  function updateFilter(key, value) { setFilters(old => ({ ...old, [key]: value })); setPage(1); }
  const field = key => ({ value: form[key], onChange: e => { setMessage(""); setForm({ ...form, [key]: e.target.value }); } });
  const rows = filterRecords(items, suppliers ? appliedFilters : filters, suppliers, language);
  const title = suppliers ? "suppliers" : "inventory";
  const columns = suppliers ? ["principal", "secondary", "type", "status", "actions"] : ["code", "description", "category", "unit", "stock", "minimum", "value", "location", "status", "actions"];
  const options = key => [...new Set(items.map(item => item[key]))].filter(Boolean);
  const status = value => <span className={`account-badge ${value ? "active" : "inactive"}`}>{t(value ? "active" : "inactive")}</span>;
  return <main className={`lw-content account-page catalog-page ${suppliers ? "suppliers-page" : "inventory-page"}`}>
    <div className="account-crumb catalog-crumb"><Link to="/"><Home size={16}/>{t("home")}</Link><span>›</span>{t(title)}</div>
    <div className="account-heading">{suppliers && <span className="supplier-hero-icon"><Users size={34}/></span>}<div><h1>{t(title)}</h1><p>{t(suppliers ? "suppliersDescription" : "inventoryDescription")}</p></div><div className="catalog-heading-actions">{!suppliers && <button className="account-secondary" disabled title={t("pending")}><Download size={16}/>{t("export")}<ChevronDown size={14}/></button>}<button className="account-primary" onClick={() => open("create")}><Plus size={18}/>{t(suppliers ? "newSupplier" : "newProduct")}</button></div></div>
    {!suppliers && <section className="catalog-stats">{[["registeredProducts", Package, "blue"], ["totalValue", Database, "green"], ["lowStock", TriangleAlert, "yellow"], ["outOfStock", CircleX, "red"], ["warehouses", MapPin, "blue"]].map(([key, Icon, tone]) => <article className="lw-panel" key={key}><span className={`catalog-stat-icon ${tone}`}><Icon size={25}/></span><div><strong>—</strong><span>{t(key)}</span></div></article>)}</section>}
    {suppliers && <section className="supplier-stats">{[["supplierTotal", Users, "blue"], ["supplierPeople", UserRound, "green"], ["supplierSole", Building, "purple"], ["supplierCompanies", Building2, "amber"]].map(([key, Icon, tone]) => <article className="lw-panel" key={key}><span className={`supplier-stat-icon ${tone}`}><Icon size={32}/></span><div><h2>{t(key)}</h2><strong>{"\u2014"}</strong><p>{t(key === "supplierTotal" ? "supplierRegistered" : "supplierActive")}</p></div></article>)}</section>}
    <p className="lw-data-note">{t("pending")}</p>
    <section className="lw-panel catalog-filters">
      <label>{t(suppliers ? "supplierSearchLabel" : "searchProduct")}<div className="account-search"><Search size={17}/><input type="search" placeholder={suppliers ? t("searchSupplier") : undefined} maxLength={180} value={filters.search} onChange={e => updateFilter("search", e.target.value)}/></div></label>
      {!suppliers && <label>{t("category")}<select value={filters.category} onChange={e => updateFilter("category", e.target.value)}><option value="">{t("all")}</option>{options("category").map(x => <option key={x}>{x}</option>)}</select></label>}
      <label>{t(suppliers ? "type" : "inventoryType")}<select value={filters.type} onChange={e => updateFilter("type", e.target.value)}><option value="">{t("all")}</option>{(suppliers ? Object.keys(supplierFields) : options("inventoryType")).map(x => <option key={x} value={x}>{suppliers ? t(x) : x}</option>)}</select></label>
      {!suppliers && <label>{t("location")}<select value={filters.location} onChange={e => updateFilter("location", e.target.value)}><option value="">{t("all")}</option>{options("location").map(x => <option key={x}>{x}</option>)}</select></label>}
      <label>{t("status")}<select value={filters.status} onChange={e => updateFilter("status", e.target.value)}><option value="">{t("all")}</option><option value="true">{t("active")}</option><option value="false">{t("inactive")}</option></select></label>
      <button className="account-secondary" onClick={() => { setFilters(initialFilters); setAppliedFilters(initialFilters); setPage(1); }}>{t("clear")}</button><button className="account-primary" onClick={() => { setAppliedFilters(filters); setPage(1); }}><Filter size={16}/>{t(suppliers ? "applyFilters" : "filter")}</button>
    </section>
    <section className="lw-panel"><div className="lw-table-wrap"><table className="account-table"><thead><tr>{columns.map(key => <th key={key}>{t(!suppliers && key === "description" ? "product" : key)}{suppliers && key !== "actions" && <ArrowUpDown size={14} aria-hidden="true"/>}</th>)}</tr></thead><tbody>
      {rows.slice((page - 1) * pageSize, page * pageSize).map(item => <tr key={item.id}>{suppliers ? <><td>{supplierNames(item)[0]}</td><td>{supplierNames(item)[1] || "—"}</td><td>{t(item.type)}</td></> : <><td>{item.code}</td><td>{item.description}</td><td>{item.category}</td><td>{item.unit}</td><td>{item.stock ?? "—"}</td><td>{item.minimum ?? "—"}</td><td>{Number.isFinite(item.stock) && Number.isFinite(item.cost) ? new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.stock * item.cost) : "—"}</td><td>{item.location ?? "—"}</td></>}<td>{status(item.active)}</td><td><div className="account-row-actions">{suppliers ? <button className="account-icon" aria-label={t("view")} onClick={() => open("view", item)}><Eye size={17}/></button> : <Link className="account-icon" aria-label={t("view")} to={`/inventario/${encodeURIComponent(item.id)}`}><Eye size={17}/></Link>}<button className="account-icon" aria-label={t("edit")} onClick={() => open("edit", item)}><Pencil size={17}/></button><button className="account-icon" aria-label={t("deactivate")} disabled={!item.active} onClick={() => open("deactivate", item)}><Power size={17}/></button></div></td></tr>)}
      {!rows.length && <tr><td className="lw-empty" colSpan={columns.length}>{suppliers ? <div className="supplier-empty"><span className="supplier-empty-icon"><Users size={38}/></span><h2>{t(items.length ? "noResults" : "supplierEmpty")}</h2><p>{t(items.length ? "supplierTryFilters" : "supplierEmptyHint")}</p>{!items.length && <button className="account-primary" onClick={() => open("create")}><Plus size={18}/>{t("newSupplier")}</button>}</div> : t(items.length ? "noResults" : "empty")}</td></tr>}
    </tbody></table></div>{<div className="account-pagination"><span>{rows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, rows.length)} / {rows.length} {t(suppliers ? "suppliers" : "results")}</span><div>{suppliers && <label className="supplier-page-size">{t("rowsPerPage")}<select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[10,25,50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>}<button className="account-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("previous")}</button><span className="account-page-number">{page}</span><button className="account-secondary" disabled={page * pageSize >= rows.length} onClick={() => setPage(page + 1)}>{t("next")}</button></div></div>}</section>
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
