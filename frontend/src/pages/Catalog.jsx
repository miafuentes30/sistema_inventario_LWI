import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus, Eye, Pencil, Power, Home, Download, ChevronDown, Package, Database, TriangleAlert, CircleX, MapPin, Search, Filter, Users, UserRound, Building, Building2, Tags } from "lucide-react";
import { Modal } from "../components/AccountUI";
import { CatalogFeedback, ProductFields, SupplierFields } from "../components/CatalogForms";
import BrandsPanel from "../components/BrandsPanel";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { catalogService } from "../services/catalogService";
import { emptyProduct, emptySupplier, supplierFields, supplierNames, validProduct, validSupplier } from "../services/catalogModel";
import "../styles/catalog.css";

const initialFilters = { search: "", category: "", type: "", brand: "", status: "", order: "asc" };
const emptyData = { items: [], total: 0, indicadores: {} };
export default function Catalog({ suppliers = false }) {
  const { t } = useLanguage();
  const { token, usuario } = useAuth();
  const canWrite = usuario?.rol?.nombre === "Administrador";
  const location = useLocation();
  const [data, setData] = useState(emptyData), [catalogs, setCatalogs] = useState({});
  const [filters, setFilters] = useState(initialFilters), [query, setQuery] = useState(initialFilters);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null), [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null), [modalLoading, setModalLoading] = useState(false), [formError, setFormError] = useState(null);
  const [form, setForm] = useState(suppliers ? emptySupplier : emptyProduct), [busy, setBusy] = useState(false);
  const [provideBank, setProvideBank] = useState(false), [brandsOpen, setBrandsOpen] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    const params = { buscar: query.search, activo: query.status, orden: query.order, pagina: page, limite: pageSize,
      ...(suppliers ? { tipo: query.type } : { categoriaId: query.category, marcaId: query.brand, tipoInventarioId: query.type }) };
    Promise.all([suppliers ? catalogService.listSuppliers(token, params) : catalogService.listProducts(token, params),
      suppliers ? Promise.resolve({}) : catalogService.catalogs(token)]).then(([result, lists]) => {
      if (active) {
        setData(result); setCatalogs(lists);
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > lastPage) setPage(lastPage);
      }
    }).catch(e => { if (active) { setError(e); setData(emptyData); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [suppliers, token, query, page, pageSize, revision]);
  useEffect(() => { if (!suppliers && location.hash === "#nuevo" && canWrite) open("create"); }, [location.hash, suppliers, canWrite]);
  async function open(mode, record) {
    setFormError(null); setNotice(""); setProvideBank(false); setForm(suppliers ? emptySupplier : emptyProduct); setModal({ mode, record });
    if (!record || mode === "state") return;
    setModalLoading(true);
    try {
      const detail = suppliers ? await catalogService.getSupplier(record.id, token) : await catalogService.getProduct(record.id, token);
      setForm({ ...(suppliers ? emptySupplier : emptyProduct), ...detail });
      setProvideBank(Boolean(detail.bankAccount));
    } catch (e) { setFormError(e); } finally { setModalLoading(false); }
  }
  function close() { if (!busy) { setModal(null); setFormError(null); setForm(suppliers ? emptySupplier : emptyProduct); } }
  function refresh() { setRevision(v => v + 1); }
  async function submit(e) {
    e.preventDefault(); setFormError(null);
    if (!(suppliers ? validSupplier(form) : validProduct(form))) { setFormError({ code: "INVALID_INPUT" }); return; }
    setBusy(true);
    try {
      let body;
      if (suppliers) {
        body = Object.fromEntries(Object.keys(emptySupplier).filter(key => key !== "bankAccount").map(key => [key, form[key] ?? ""]));
        body.paymentMethod = form.paymentMethod || null;
        body.creditDays = form.creditDays === "" || form.creditDays === null ? null : Number(form.creditDays);
        body.chequeBeneficiary = form.paymentMethod === "CHEQUE" ? form.chequeBeneficiary : null;
        if (provideBank && form.paymentMethod === "TRANSFERENCIA") body.bankAccount = form.bankAccount || { bank: "", name: "", number: "" };
        await catalogService.saveSupplier(modal.record?.id, body, token);
      } else {
        body = Object.fromEntries(Object.keys(emptyProduct).map(key => [key, form[key]]));
        for (const key of ["subcategoryId", "unitId", "brandId", "inventoryTypeId", "minimum"]) if (body[key] === "") body[key] = null;
        await catalogService.saveProduct(modal.record?.id, body, token);
      }
      setModal(null); setForm(suppliers ? emptySupplier : emptyProduct); setNotice("saved"); refresh();
    } catch (e) { setFormError(e); } finally { setBusy(false); }
  }
  async function changeState() {
    setBusy(true); setFormError(null);
    try { await catalogService.setState(suppliers, modal.record.id, !modal.record.active, token); setModal(null); setNotice("stateSaved"); refresh(); }
    catch (e) { setFormError(e); } finally { setBusy(false); }
  }
  function applyFilters(e) { e.preventDefault(); setQuery({ ...filters }); setPage(1); }
  const updateFilter = key => e => setFilters({ ...filters, [key]: e.target.value });
  const title = suppliers ? "suppliers" : "inventory";
  const hasFilters = Object.entries(query).some(([key, value]) => key !== "order" && value !== "");
  const columns = suppliers ? ["principal", "secondary", "type", "status", "actions"] : ["code", "product", "category", "brand", "unit", "stock", "minimum", "status", "actions"];
  const status = active => <span className={`account-badge ${active ? "active" : "inactive"}`}>{t(active ? "active" : "inactive")}</span>;
  const listSelect = (key, label, items) => <label>{t(label)}<select value={filters[key]} onChange={updateFilter(key)}><option value="">{t("all")}</option>{items.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>;
  return <main className={`lw-content account-page catalog-page ${suppliers ? "suppliers-page" : "inventory-page"}`}>
    <div className="account-crumb catalog-crumb"><Link to="/"><Home size={16}/>{t("home")}</Link><span>›</span>{t(title)}</div>
    <div className="account-heading">{suppliers && <span className="supplier-hero-icon"><Users size={34}/></span>}
      <div><h1>{t(title)}</h1><p>{t(suppliers ? "suppliersDescription" : "inventoryDescription")}</p></div>
      <div className="catalog-heading-actions">{!suppliers && <><button className="account-secondary" onClick={() => setBrandsOpen(true)}><Tags size={17}/>{t("brands")}</button><button className="account-secondary" disabled title={t("exportPending")}><Download size={16}/>{t("export")}<ChevronDown size={14}/></button></>}
        <button className="account-primary" disabled={!canWrite} onClick={() => open("create")}><Plus size={18}/>{t(suppliers ? "newSupplier" : "newProduct")}</button></div>
    </div>
    {!suppliers && <section className="catalog-stats">{[["registeredProducts", Package, "blue"], ["totalValue", Database, "green"], ["lowStock", TriangleAlert, "yellow"], ["outOfStock", CircleX, "red"], ["warehouses", MapPin, "blue"]].map(([key, Icon, tone]) => <article className="lw-panel" key={key}><span className={`catalog-stat-icon ${tone}`}><Icon size={25}/></span><div><strong>{loading ? "—" : data.indicadores?.[key] ?? "—"}</strong><span>{t(key)}</span></div></article>)}</section>}
    {suppliers && <section className="supplier-stats">{[["supplierTotal", "total", Users, "blue"], ["supplierPeople", "person", UserRound, "green"], ["supplierSole", "sole", Building, "purple"], ["supplierCompanies", "company", Building2, "amber"]].map(([key, value, Icon, tone]) => <article className="lw-panel" key={key}><span className={`supplier-stat-icon ${tone}`}><Icon size={32}/></span><div><h2>{t(key)}</h2><strong>{loading ? "—" : data.indicadores?.[value] ?? "—"}</strong><p>{t(key === "supplierTotal" ? "supplierRegistered" : "supplierActive")}</p></div></article>)}</section>}
    {!suppliers && <p className="lw-data-note">{t("stockPending")}</p>}
    <form className="lw-panel catalog-filters" onSubmit={applyFilters}>
      <label>{t(suppliers ? "supplierSearchLabel" : "searchProduct")}<div className="account-search"><Search size={17}/><input type="search" maxLength={180} value={filters.search} placeholder={suppliers ? t("searchSupplier") : undefined} onChange={updateFilter("search")}/></div></label>
      {!suppliers && listSelect("category", "category", catalogs.categorias || [])}
      {suppliers ? <label>{t("type")}<select value={filters.type} onChange={updateFilter("type")}><option value="">{t("all")}</option>{Object.keys(supplierFields).map(key => <option key={key} value={key}>{t(key)}</option>)}</select></label> : <>{listSelect("type", "inventoryType", catalogs["tipos-inventario"] || [])}{listSelect("brand", "brand", catalogs.marcas || [])}</>}
      <label>{t("status")}<select value={filters.status} onChange={updateFilter("status")}><option value="">{t("all")}</option><option value="true">{t("active")}</option><option value="false">{t("inactive")}</option></select></label>
      <label>{t("order")}<select value={filters.order} onChange={updateFilter("order")}><option value="asc">A–Z</option><option value="desc">Z–A</option></select></label>
      <button type="button" className="account-secondary" onClick={() => { setFilters(initialFilters); setQuery(initialFilters); setPage(1); }}>{t("clear")}</button>
      <button className="account-primary"><Filter size={16}/>{t(suppliers ? "applyFilters" : "filter")}</button>
    </form>
    <CatalogFeedback error={error} notice={notice}/>
    {error && <button className="account-secondary" onClick={refresh}>{t("retry")}</button>}
    <section className="lw-panel"><div className="lw-table-wrap"><table className="account-table"><thead><tr>{columns.map(key => <th key={key}>{t(key)}</th>)}</tr></thead><tbody>
      {loading ? <tr><td colSpan={columns.length} className="lw-empty" role="status">{t("loading")}</td></tr> : error ? <tr><td colSpan={columns.length} className="lw-empty">{t("loadFailed")}</td></tr> : !data.items.length ? <tr><td className="lw-empty" colSpan={columns.length}>{suppliers ? <div className="supplier-empty"><span className="supplier-empty-icon"><Users size={38}/></span><h2>{t(hasFilters ? "noResults" : "supplierEmpty")}</h2><p>{t(hasFilters ? "supplierTryFilters" : "supplierEmptyHint")}</p>{canWrite && !hasFilters && <button className="account-primary" onClick={() => open("create")}><Plus size={18}/>{t("newSupplier")}</button>}</div> : t(hasFilters ? "noResults" : "empty")}</td></tr> : data.items.map(item => <tr key={item.id}>
        {suppliers ? <><td>{supplierNames(item)[0]}</td><td>{supplierNames(item)[1] || "—"}</td><td>{t(item.type)}</td></> : <><td>{item.code}</td><td>{item.name}</td><td>{item.category}</td><td>{item.brand || "—"}</td><td>{item.unit || "—"}</td><td>{item.stock ?? "—"}</td><td>{item.minimum ?? "—"}</td></>}
        <td>{status(item.active)}</td><td><div className="account-row-actions">{suppliers ? <button className="account-icon" aria-label={t("view")} onClick={() => open("view", item)}><Eye size={17}/></button> : <Link className="account-icon" aria-label={t("view")} to={`/inventario/${item.id}`}><Eye size={17}/></Link>}
          <button className="account-icon" disabled={!canWrite} aria-label={t("edit")} onClick={() => open("edit", item)}><Pencil size={17}/></button><button className="account-icon" disabled={!canWrite} aria-label={t(item.active ? "deactivate" : "activate")} onClick={() => open("state", item)}><Power size={17}/></button></div></td>
      </tr>)}
    </tbody></table></div>
      <div className="account-pagination"><span>{data.total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, data.total)} / {data.total} {t(suppliers ? "suppliers" : "results")}</span><div>
        <label className="supplier-page-size">{t("rowsPerPage")}<select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[10,25,50].map(size => <option key={size}>{size}</option>)}</select></label>
        <button className="account-secondary" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>{t("previous")}</button><span className="account-page-number">{page}</span><button className="account-secondary" disabled={loading || page * pageSize >= data.total} onClick={() => setPage(page + 1)}>{t("next")}</button>
      </div></div>
    </section>
    {modal && <Modal title={t(modal.mode === "create" ? suppliers ? "newSupplier" : "newProduct" : modal.mode === "state" ? "confirmState" : modal.mode)} onClose={close} busy={busy || modalLoading}>
      <CatalogFeedback error={formError}/>
      {modalLoading ? <p role="status">{t("loading")}</p> : modal.mode === "state" ? <><p>{t("confirmState")}</p><div className="account-actions"><button className="account-secondary" disabled={busy} onClick={close}>{t("cancel")}</button><button className="account-primary" disabled={busy} onClick={changeState}>{t(busy ? "saving" : "confirm")}</button></div></> : <form noValidate className="account-form" onSubmit={submit}>
        <fieldset disabled={modal.mode === "view" || busy} className="catalog-fields">{suppliers ? <SupplierFields form={form} setForm={setForm} mode={modal.mode} banking={canWrite} provideBank={provideBank} setProvideBank={setProvideBank} error={formError}/> : <ProductFields form={form} setForm={setForm} mode={modal.mode} catalogs={catalogs} error={formError}/>}</fieldset>
        <div className="account-actions"><button type="button" className="account-secondary" disabled={busy} onClick={close}>{t("close")}</button>{modal.mode !== "view" && <button className="account-primary" disabled={busy}>{t(busy ? "saving" : "save")}</button>}</div>
      </form>}
    </Modal>}
    {brandsOpen && <BrandsPanel token={token} canWrite={canWrite} onClose={() => setBrandsOpen(false)} onChanged={refresh}/>}
  </main>;
}
