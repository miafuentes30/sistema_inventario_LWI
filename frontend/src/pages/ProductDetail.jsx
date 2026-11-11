import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { CatalogFeedback } from "../components/CatalogForms";
import { catalogService } from "../services/catalogService";
import "../styles/catalog.css";
export default function ProductDetail() {
  const { id } = useParams(), { token } = useAuth(), { t } = useLanguage();
  const [product, setProduct] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setProduct(null); setError(null); setLoading(true);
    catalogService.getProduct(id, token).then(result => { if (active) setProduct(result); }).catch(e => { if (active) setError(e); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token, revision]);
  return <main className="lw-content account-page catalog-page inventory-page product-detail-page">
    <Link className="account-secondary" to="/inventario">{t("backInventory")}</Link>
    <div className="account-heading"><div><div className="account-crumb">{t("home")} / {t("inventory")} / {t("detail")}</div><h1>{t("detail")}</h1><p>{product?.name || t("inventoryDescription")}</p></div></div>
    <CatalogFeedback error={error}/>{error && <button className="account-secondary" onClick={() => setRevision(v => v + 1)}>{t("retry")}</button>}
    {loading && <p role="status">{t("loading")}</p>}
    <section className="lw-panel"><dl className="catalog-details">{["code", "name", "description", "category", "subcategory", "brand", "inventoryType", "unit", "stock", "minimum", "status"].map(key => <div key={key}><dt>{t(key === "name" ? "productName" : key)}</dt><dd>{key === "status" ? product ? t(product.active ? "active" : "inactive") : "—" : product?.[key] ?? "—"}</dd></div>)}</dl></section>
    <section className="lw-panel"><h2>{t("movements")}</h2><p>{t("stockPending")}</p></section>
  </main>;
}
