import { useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, FileText, Home, Info, Link2, MapPin, Package, Pencil, RotateCcw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { Status } from "../components/AccountUI";
import { CatalogFeedback } from "../components/CatalogForms";
import { catalogService } from "../services/catalogService";
import "../styles/catalog.css";
import "../styles/product-detail.css";
const tabs = [["generalInformation", Info], ["movements", RotateCcw], ["stockLocations", MapPin], ["productDocuments", FileText], ["relatedProducts", Link2]];
const dash = "—";
export default function ProductDetail() {
  const { id } = useParams(), { token, usuario } = useAuth(), { t, language } = useLanguage();
  const prefix = useId();
  const [product, setProduct] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("generalInformation");
  const sectionTitle = key => t(({ movements: "productMovements", stockLocations: "productLocations" })[key] || key);
  useEffect(() => {
    let active = true; setProduct(null); setError(null); setLoading(true); setTab("generalInformation");
    catalogService.getProduct(id, token).then(result => { if (active) setProduct(result); }).catch(e => { if (active) setError(e); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token, revision]);
  const value = key => product?.[key] === null || product?.[key] === undefined || product?.[key] === "" ? dash : product[key];
  const timestamp = key => {
    const date = new Date(product?.[key]);
    return product?.[key] && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short", timeZone: "America/Guatemala" }).format(date) : dash;
  };
  function table(rows, label) {
    return <div className="pd-table-wrap"><table className="pd-info-table"><caption className="sr-only">{t(label)}</caption><tbody>{rows.map(([key, content]) => <tr key={key}><th scope="row">{t(key)}</th><td>{content}</td></tr>)}</tbody></table></div>;
  }
  const locationPanel = <section className="lw-panel pd-card"><div className="pd-card-title"><h2>{t("stockLocations")}</h2>{tab === "generalInformation" && <button type="button" onClick={() => { setTab("stockLocations"); document.getElementById(`${prefix}-stockLocations`)?.focus(); }}>{t("viewAllLocations")}<ArrowRight size={17}/></button>}</div><div className="lw-table-wrap" tabIndex={0} role="region" aria-label={t("stockLocations")}><table className="pd-locations-table"><thead><tr><th scope="col">{t("location")}</th><th scope="col">{t("stock")}</th><th scope="col">{t("minimum")}</th></tr></thead><tbody><tr><td colSpan={3} className="pd-empty"><MapPin size={26} aria-hidden="true"/><p>{t("locationsPending")}</p></td></tr></tbody></table></div></section>;
  function tabKeys(event, index) {
    const keys = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (keys[event.key] === undefined) return;
    event.preventDefault(); const key = tabs[keys[event.key]][0]; setTab(key); document.getElementById(`${prefix}-${key}`)?.focus();
  }
  return <main className="lw-content account-page catalog-page product-detail-page">
    <nav className="pd-breadcrumb" aria-label={t("productBreadcrumb")}><Link to="/"><Home size={18}/>{t("home")}</Link><span aria-hidden="true">›</span><Link to="/inventario">{t("products")}</Link><span aria-hidden="true">›</span><span aria-current="page">{t("detail")}</span></nav>
    <header className="account-heading pd-heading"><div><h1>{t("detail")}</h1><p>{t("productDetailDescription")}</p></div><div className="pd-heading-actions"><Link className="account-secondary" to="/inventario"><ArrowLeft size={18}/>{t("backProducts")}</Link>{product && usuario?.rol?.nombre === "Administrador" && <Link className="account-primary" to="/inventario" state={{ editProductId: product.id }}><Pencil size={17}/>{t("editProduct")}</Link>}</div></header>
    <CatalogFeedback error={error}/>{error && <button className="account-secondary" onClick={() => setRevision(v => v + 1)}>{t("retry")}</button>}
    {loading && <p role="status">{t("loading")}</p>}
    {!loading && product && <>
      <div className="pd-overview">
        <section className="lw-panel pd-summary" aria-label={t("productInformation")}>
          <div className="pd-image-placeholder"><Package size={68} strokeWidth={1.2} aria-hidden="true"/><span>{t("productImageUnavailable")}</span></div>
          <div className="pd-summary-body"><div className="pd-name"><h2>{product.name}</h2><Status active={product.active}/></div><p className="pd-code">{t("code")}: <strong>{value("code")}</strong></p><dl className="pd-summary-fields"><div><dt>{t("category")}</dt><dd>{value("category")}</dd></div><div><dt>{t("description")}</dt><dd>{value("description")}</dd></div></dl></div>
        </section>
        <section className="lw-panel pd-stock" aria-label={t("productStockSummary")}>
          <div className="pd-stock-values"><div><span>{t("stock")}</span><strong>{value("stock")}</strong><small>{value("unit")}</small></div><div><span>{t("minimum")}</span><strong>{value("minimum")}</strong><small>{value("unit")}</small></div></div>
          <div className="pd-value-cards"><div><span>{t("cost")}</span><strong>{dash}</strong></div><div><span>{t("totalValue")}</span><strong>{dash}</strong></div></div><p className="pd-pending-note">{t("stockPending")}</p>
        </section>
      </div>
      <div className="pd-tabs" role="tablist" aria-label={t("productSections")}>{tabs.map(([key, Icon], index) => <button key={key} type="button" role="tab" id={`${prefix}-${key}`} aria-selected={tab === key} aria-controls={`${prefix}-panel`} tabIndex={tab === key ? 0 : -1} onKeyDown={event => tabKeys(event, index)} onClick={() => setTab(key)}><Icon size={20}/>{sectionTitle(key)}</button>)}</div>
      <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-${tab}`} tabIndex={0} className="pd-tab-panel">
        {tab === "generalInformation" ? <div className="pd-information-grid">
          <section className="lw-panel pd-card"><h2>{t("productInformation")}</h2>{table([["code", value("code")], ["productName", value("name")], ["description", value("description")], ["category", value("category")], ["subcategory", value("subcategory")], ["inventoryType", value("inventoryType")], ["unit", value("unit")], ["cost", dash], ["referencePrice", dash], ["stock", value("stock")], ["minimum", value("minimum")], ["mainLocation", dash], ["status", <Status active={product.active}/>], ["createdDate", timestamp("createdAt")], ["updatedDate", timestamp("updatedAt")]], "productInformation")}</section>
          <div className="pd-side-panels">{locationPanel}<section className="lw-panel pd-card"><h2>{t("additionalInformation")}</h2>{table([["brand", value("brand")], ["productSupplier", dash], ["supplierSku", dash], ["productNotes", dash]], "additionalInformation")}<p className="pd-pending-note">{t("productAdditionalPending")}</p></section></div>
        </div> : tab === "stockLocations" ? locationPanel : <section className="lw-panel pd-card pd-placeholder"><span className="pd-placeholder-icon">{tab === "movements" ? <RotateCcw size={30}/> : tab === "productDocuments" ? <FileText size={30}/> : <Link2 size={30}/>}</span><h2>{sectionTitle(tab)}</h2><p>{t(tab === "movements" ? "stockPending" : tab === "productDocuments" ? "documentsPending" : "relatedProductsPending")}</p></section>}
      </div>
    </>}
  </main>;
}
