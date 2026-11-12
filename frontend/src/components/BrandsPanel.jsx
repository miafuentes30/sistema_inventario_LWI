import { useEffect, useState } from "react";
import { Plus, Pencil, Power } from "lucide-react";
import { Modal } from "./AccountUI";
import { CatalogFeedback } from "./CatalogForms";
import { catalogService } from "../services/catalogService";
import { useLanguage } from "../context/LanguageContext";
export default function BrandsPanel({ token, canWrite, onClose, onChanged }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState({ buscar: "", activo: "", orden: "asc", pagina: 1 });
  const [data, setData] = useState({ items: [], total: 0 });
  const [form, setForm] = useState(null), [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    catalogService.listBrands(token, query).then(result => { if (active) {
      setData(result);
      const lastPage = Math.max(1, Math.ceil(result.total / 10));
      if (query.pagina > lastPage) setQuery(old => ({ ...old, pagina: lastPage }));
    } }).catch(e => { if (active) { setError(e); setData({ items: [], total: 0 }); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, query, revision]);
  async function save(e) {
    e?.preventDefault(); if (busy) return; setBusy(true); setError(null); setNotice("");
    try {
      if (confirm) await catalogService.setBrandState(confirm.id, !confirm.active, token);
      else await catalogService.saveBrand(form.id, { name: form.name, active: form.active }, token);
      setForm(null); setConfirm(null); setRevision(v => v + 1); setNotice("saved"); onChanged();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <Modal title={t("brands")} onClose={onClose} busy={busy}>
    <CatalogFeedback error={error} notice={notice}/>
    {error && !form && !confirm && <button className="account-secondary" onClick={() => setRevision(v => v + 1)}>{t("retry")}</button>}
    {confirm ? <><p>{t("confirmState")}: {confirm.name}</p><div className="account-actions"><button className="account-secondary" disabled={busy} onClick={() => setConfirm(null)}>{t("cancel")}</button><button className="account-primary" disabled={busy} onClick={() => save()}>{t("confirm")}</button></div></> : <>
      <div className="catalog-brand-filters"><label>{t("searchBrand")}<input type="search" maxLength={160} value={query.buscar} onChange={e => setQuery({ ...query, buscar: e.target.value, pagina: 1 })}/></label>
        <label>{t("status")}<select value={query.activo} onChange={e => setQuery({ ...query, activo: e.target.value, pagina: 1 })}><option value="">{t("all")}</option><option value="true">{t("active")}</option><option value="false">{t("inactive")}</option></select></label>
        <label>{t("order")}<select value={query.orden} onChange={e => setQuery({ ...query, orden: e.target.value, pagina: 1 })}><option value="asc">A–Z</option><option value="desc">Z–A</option></select></label>
      </div>
      {canWrite && !form && <button className="account-primary" onClick={() => { setForm({ name: "", active: true }); setError(null); }}><Plus size={18}/>{t("newBrand")}</button>}
      {form && <form className="account-form catalog-brand-form" onSubmit={save}><label>{t("brandName")} *<input required maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><div className="account-actions"><button type="button" className="account-secondary" disabled={busy} onClick={() => setForm(null)}>{t("cancel")}</button><button className="account-primary" disabled={busy}>{t(busy ? "saving" : "save")}</button></div></form>}
      <div className="lw-table-wrap" tabIndex={0} role="region" aria-label={t("brands")}><table className="account-table"><thead><tr><th>{t("brand")}</th><th>{t("status")}</th><th>{t("actions")}</th></tr></thead><tbody>
        {loading || !data.items.length ? <tr><td colSpan={3}>{t(loading ? "loading" : "empty")}</td></tr> : data.items.map(row => <tr key={row.id}><td>{row.name}</td><td>{t(row.active ? "active" : "inactive")}</td><td>{canWrite && <div className="account-row-actions"><button disabled={busy} className="account-icon" aria-label={t("edit")} onClick={() => { setForm(row); setError(null); }}><Pencil size={17}/></button><button disabled={busy} className="account-icon" aria-label={t(row.active ? "deactivate" : "activate")} onClick={() => setConfirm(row)}><Power size={17}/></button></div>}</td></tr>)}
      </tbody></table></div>
      <div className="account-pagination"><button className="account-secondary" disabled={loading || query.pagina === 1} onClick={() => setQuery({ ...query, pagina: query.pagina - 1 })}>{t("previous")}</button><span>{data.total}</span><button className="account-secondary" disabled={loading || query.pagina * 10 >= data.total} onClick={() => setQuery({ ...query, pagina: query.pagina + 1 })}>{t("next")}</button></div>
    </>}
  </Modal>;
}
