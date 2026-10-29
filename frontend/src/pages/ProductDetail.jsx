import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { catalogService } from "../services/catalogService";
import "../styles/catalog.css";
export default function ProductDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const [product, setProduct] = useState(null);
  useEffect(() => { let active = true; setProduct(null); catalogService.getProduct(id).then(result => { if (active) setProduct(result.item); }); return () => { active = false; }; }, [id]);
  return <main className="lw-content account-page catalog-page inventory-page product-detail-page"><Link className="account-secondary" to="/inventario">{t("backInventory")}</Link><div className="account-heading"><div><div className="account-crumb">{t("home")} / {t("inventory")} / {t("detail")}</div><h1>{t("detail")}</h1><p>{t("inventoryDescription")}</p></div></div>{!product && <p role="status" className="lw-data-note">{t("missing")}</p>}<section className="lw-panel"><dl className="catalog-details">{["code", "description", "category", "inventoryType", "unit", "stock", "minimum", "cost", "status"].map(key => <div key={key}><dt>{t(key)}</dt><dd>{key === "status" ? product ? t(product.active ? "active" : "inactive") : "—" : product?.[key] ?? "—"}</dd></div>)}</dl></section><section className="lw-panel"><h2>{t("movements")}</h2><p>{t("movementsPending")}</p></section></main>;
}
