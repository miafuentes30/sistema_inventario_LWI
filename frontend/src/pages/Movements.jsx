import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Home, Plus, Search, Trash2, Upload } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { CatalogFeedback } from "../components/CatalogForms";
import { catalogService } from "../services/catalogService";
import { movementService } from "../services/movementService";
import { proposedEntryTypes, totals, formatDecimal } from "../services/movementModel";
import { supplierNames } from "../services/catalogModel";
import "../styles/movements.css";

export default function Movements() {
  const { t, language } = useLanguage(), { token, usuario } = useAuth();
  const location = useLocation(), { movementId } = useParams();
  const outgoing = location.pathname.startsWith("/salidas"), kind = outgoing ? "salidas" : "entradas";
  const creating = location.pathname.endsWith("/nueva"), admin = usuario?.rol?.nombre === "Administrador";
  const [capabilities,setCapabilities] = useState(null), [catalogs,setCatalogs] = useState({}), [suppliers,setSuppliers] = useState([]);
  const [error,setError] = useState(null), [loading,setLoading] = useState(true), [revision,setRevision] = useState(0), [detail,setDetail] = useState(null);
  const [data,setData] = useState({ items:[],total:0 }), [page,setPage] = useState(1);
  const [filters,setFilters] = useState({ buscar:"",desde:"",hasta:"",tipoId:"",proveedorId:"",solicitante:"",bodegaId:"",estado:"" });
  const [query,setQuery] = useState({}), [search,setSearch] = useState(""), [products,setProducts] = useState([]), [lines,setLines] = useState([]);
  const [supplierSearch,setSupplierSearch] = useState("");
  const [form,setForm] = useState({ type:"", date:"", warehouseId:"", supplierId:"", documentNumber:"", documentType:"", documentReference:"", issuedAt:"", requesterName:"", position:"", declaredClass:"", project:"", purpose:"", receivedBy:"", notes:"" });
  useEffect(() => {
    let active=true; setLoading(true); setError(null);
    Promise.all([movementService.capabilities(token), catalogService.catalogs(token)]).then(async ([caps, lists]) => {
      if(!active)return; setCapabilities(caps);setCatalogs(lists);
      if(!caps.enabled)return;
      const result = movementId ? await movementService.detail(kind,movementId,token) : await movementService.list(kind,token,{...query,pagina:page,limite:10});
      if(active){if(movementId)setDetail(result);else setData(result);}
    }).catch(e=>{if(active)setError(e)}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[token,kind,movementId,query,page,revision]);
  useEffect(()=>{
    if(outgoing)return;let active=true;
    const timer=setTimeout(()=>catalogService.listSuppliers(token,{buscar:supplierSearch,activo:"true",limite:30}).then(r=>{if(active)setSuppliers(r.items)}).catch(e=>{if(active)setError(e)}),250);
    return()=>{active=false;clearTimeout(timer)};
  },[token,outgoing,supplierSearch]);
  useEffect(()=>{
    if(!creating)return;let active=true;
    const timer=setTimeout(()=>catalogService.listProducts(token,{buscar:search,activo:"true",limite:20}).then(r=>{if(active)setProducts(r.items)}).catch(e=>{if(active)setError(e)}),250);
    return()=>{active=false;clearTimeout(timer)};
  },[search,token,creating]);
  const change = key => e => setForm(old=>({...old,[key]:e.target.value}));
  const field = (key,label,required=false,type="text") => <label>{t(label)}{required && " *"}<input type={type} required={required} maxLength={key==="notes"?4000:200} value={form[key]} onChange={change(key)}/></label>;
  const warehouse = (filter=false) => <label>{t(filter?"s6Warehouse":outgoing?"s6SourceWarehouse":"s6DestinationWarehouse")}{!filter&&" *"}<select required={!filter} value={filter?filters.bodegaId:form.warehouseId} onChange={filter?e=>setFilters({...filters,bodegaId:e.target.value}):change("warehouseId")}><option value="">{t("select")}</option>{(catalogs.bodegas||[]).filter(b=>b.active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>;
  const summary = totals(lines,outgoing), money = val => val===null?t("s6UnknownValue"):`Q ${formatDecimal(val,language,2)}`;
  function add(product){if(!lines.some(l=>l.productId===product.id))setLines(old=>[...old,{productId:product.id,code:product.code,name:product.name,unitId:product.unitId,unit:product.unit,quantity:"",requestedQuantity:"",unitCost:""}]);}
  const blocked = !capabilities?.enabled;
  return <main className="lw-content account-page movements-page">
    <nav className="s6-crumb"><Link to="/"><Home size={17}/>{t("home")}</Link><span>›</span><Link to={`/${kind}`}>{t(outgoing?"s6Exits":"s6Entries")}</Link>{(creating||movementId)&&<><span>›</span><span>{t(creating?outgoing?"s6NewExit":"s6NewEntry":"s6MovementDetail")}</span></>}</nav>
    <div className="account-heading"><div><h1>{t(creating?outgoing?"s6NewExit":"s6NewEntry":movementId?"s6MovementDetail":outgoing?"s6Exits":"s6Entries")}</h1><p>{t(outgoing?"s6ExitDescription":"s6EntryDescription")}</p></div>{!creating&&!movementId&&admin&&<Link className="account-primary" to={`/${kind}/nueva`}><Plus size={18}/>{t(outgoing?"s6NewExit":"s6NewEntry")}</Link>}{(creating||movementId)&&<Link className="account-secondary" to={`/${kind}`}><ArrowLeft size={17}/>{t("s6Back")}</Link>}</div>
    <CatalogFeedback error={error}/>{error&&<button className="account-secondary" onClick={()=>setRevision(r=>r+1)}>{t("retry")}</button>}
    {loading&&<p role="status">{t("loading")}</p>}
    {!loading&&capabilities&&blocked&&<div className="s6-notice" role="status"><FileText size={23}/><div><strong>{t("s6Preparation")}</strong><p>{t("s6MigrationPending")}</p><p>{t("s6PolicyPending")}</p></div></div>}
    {creating?<form onSubmit={e=>e.preventDefault()} className="s6-form">
      <div className="s6-general-grid"><section className="lw-panel"><h2>{t("generalInformation")}</h2><div className="s6-fields">
        {!outgoing&&<label>{t("s6EntryType")} *<select value={form.type} onChange={change("type")} required><option value="">{t("select")}</option>{proposedEntryTypes.map(type=><option key={type} value={type}>{t(`s6_${type}`)} · {t("s6Proposed")}</option>)}</select></label>}
        {field("date","s6Date",true,"date")}{outgoing?<label>{t("s6Number")}<input readOnly value="" placeholder={t("s6AutomaticNumber")}/></label>:field("documentNumber","s6DocumentNumber")}
        {!outgoing&&<label>{t("productSupplier")}<input type="search" aria-label={t("searchSupplier")} placeholder={t("searchSupplier")} value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)}/><select value={form.supplierId} onChange={change("supplierId")}><option value="">{t("select")}</option>{suppliers.map(s=><option key={s.id} value={s.id}>{supplierNames(s).filter(Boolean).join(" ")}</option>)}</select></label>}
        <label>{t(outgoing?"s6DeliveredBy":"s6Responsible")}<input readOnly value={usuario?.nombre||""}/></label>{warehouse()}
        {outgoing&&<>{field("requesterName","s6Requester",true)}{field("position","s6Position")}{field("declaredClass","s6DeclaredClass")}{field("project","s6Project")}{field("receivedBy","s6ReceivedBy",true)}{field("purpose","s6Purpose",true)}</>}
        <label className="s6-wide">{t("s6Notes")}<textarea rows={3} maxLength={4000} value={form.notes} onChange={change("notes")}/></label>
      </div></section><section className="lw-panel"><h2>{t("s6SupportingDocument")}</h2><p className="s6-info">{t("s6DocumentPolicy")}</p><div className="s6-fields"><label>{t("s6DocumentType")}<select value={form.documentType} onChange={change("documentType")}><option value="">{t("select")}</option>{["INVOICE","RECEIPT","DONATION_DOCUMENT","IMPORT_DOCUMENT","OTHER"].map(type=><option key={type} value={type}>{t(`s6_${type}`)}</option>)}</select></label>{field("documentReference","s6Reference")}{field("issuedAt","s6IssuedAt",false,"date")}<label>{t("s6Attachment")}<span className="s6-upload"><Upload size={25}/><button type="button" className="account-secondary" disabled>{t("s6Attachment")}</button><span>{t("s6StoragePending")}</span></span></label></div></section></div>
      <section className="lw-panel"><div className="s6-products-heading"><h2>{t("products")}</h2><label className="account-search"><Search size={18}/><input type="search" aria-label={t("searchProduct")} placeholder={t("searchProduct")} value={search} onChange={e=>setSearch(e.target.value)}/></label></div><details className="s6-product-picker"><summary className="account-secondary">{t("s6AddProducts")}</summary><div>{products.map(p=><button type="button" className="account-secondary" key={p.id} disabled={lines.some(l=>l.productId===p.id)} onClick={()=>add(p)}><Plus size={15}/>{p.code} · {p.name}</button>)}{!products.length&&<p>{t("noResults")}</p>}</div></details>
        <div className="lw-table-wrap" tabIndex={0} role="region" aria-label={t("products")}><table className="account-table s6-lines"><thead><tr>{["code","product","unit","stock",...(outgoing?["s6RequestedQuantity"]:[]),(outgoing?"s6IssueQuantity":"s6ReceiveQuantity"),...(!outgoing?["cost","s6Subtotal"]:[]),"actions"].map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>{!lines.length?<tr><td colSpan={outgoing?7:8}>{t("s6AddProducts")}</td></tr>:lines.map((line,index)=><tr key={line.productId}><td>{line.code}</td><td>{line.name}</td><td>{line.unit||"—"}</td><td><span title={t("s6MigrationPending")}>—</span></td>{(outgoing?["requestedQuantity","quantity"]:["quantity","unitCost"]).map(key=><td key={key}><input type="text" inputMode="decimal" aria-label={`${t(key==="unitCost"?"cost":key==="quantity"?(outgoing?"s6IssueQuantity":"s6ReceiveQuantity"):"s6RequestedQuantity")} · ${line.code}`} value={line[key]} onChange={e=>setLines(old=>old.map((l,i)=>i===index?{...l,[key]:e.target.value}:l))}/></td>)}{!outgoing&&<td>{money(summary.subtotals[index])}</td>}<td><button type="button" className="account-icon" aria-label={`${t("s6Remove")} ${line.code}`} onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))}><Trash2 size={17}/></button></td></tr>)}</tbody></table></div>
      </section><div className="s6-bottom"><section className="lw-panel"><h2>{t("s6Summary")}</h2><p>{t("s6ProductCount")}: {new Set(lines.map(l=>l.productId)).size}</p>{Object.entries(summary.quantities).map(([unit,qty])=><p key={unit}>{unit}: {formatDecimal(qty,language)}</p>)}{!outgoing&&<div className="s6-total">{t("s6Total")}: <strong>{money(summary.total)}</strong></div>}</section><section className="lw-panel"><h2>{t("actions")}</h2><p>{t("s6NoPersistence")}</p><div className="account-actions"><Link className="account-secondary" to={`/${kind}`}>{t("cancel")}</Link><button type="submit" className="account-secondary" disabled title={t("s6MigrationPending")}>{t("s6SaveDraft")}</button><button type="button" className="account-primary" disabled title={t("s6PolicyPending")}>{t("s6Confirm")}</button></div></section></div>
    </form>:movementId?<section className="lw-panel"><h2>{t("s6MovementDetail")}</h2>{detail?<div><dl className="s6-fields">{[["s6Number",detail.number],["status",t(`s6_${detail.state}`)],["s6Date",detail.date],["s6Responsible",detail.responsibleName],["s6Warehouse",detail.warehouseName],["s6DocumentNumber",detail.documentNumber],["s6Notes",detail.notes]].map(([key,value])=><div key={key}><dt>{t(key)}</dt><dd>{value||"—"}</dd></div>)}</dl><h2>{t("products")}</h2><div className="lw-table-wrap" tabIndex={0}><table className="account-table"><thead><tr><th>{t("code")}</th><th>{t("product")}</th><th>{t("s6Quantity")}</th><th>{t("unit")}</th></tr></thead><tbody>{(detail.lines||[]).map(line=><tr key={line.id}><td>{line.code}</td><td>{line.name}</td><td>{line.quantity}</td><td>{line.unit}</td></tr>)}</tbody></table></div><h2>{t("s6Audit")}</h2><ol>{(detail.events||[]).map(event=><li key={event.id}>{t(`s6_${event.action}`)} · {event.actorName} · {event.date}</li>)}</ol></div>:<p>{t("s6DetailUnavailable")}</p>}</section>:<>
      <form className="lw-panel s6-filters" onSubmit={e=>{e.preventDefault();setPage(1);setQuery({...filters})}}>{[["buscar","s6Search","search"],["desde","s6From","date"],["hasta","s6To","date"],...(outgoing?[["solicitante","s6Requester","text"]]:[])].map(([key,label,type])=><label key={key}>{t(label)}<input type={type} value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}/></label>)}{warehouse(true)}<label>{t("status")}<select value={filters.estado} onChange={e=>setFilters({...filters,estado:e.target.value})}><option value="">{t("all")}</option>{["BORRADOR","PENDIENTE","CONFIRMADO","CANCELADO"].map(s=><option key={s} value={s}>{t(`s6_${s}`)}</option>)}</select></label>{!outgoing&&<><label>{t("s6EntryType")}<select disabled><option>{t("s6TypesPending")}</option></select></label><label>{t("productSupplier")}<select value={filters.proveedorId} onChange={e=>setFilters({...filters,proveedorId:e.target.value})}><option value="">{t("all")}</option>{suppliers.map(s=><option value={s.id} key={s.id}>{supplierNames(s).filter(Boolean).join(" ")}</option>)}</select></label></>}<button className="account-primary">{t("filter")}</button><button type="button" className="account-secondary" onClick={()=>{setFilters({buscar:"",desde:"",hasta:"",tipoId:"",proveedorId:"",solicitante:"",bodegaId:"",estado:""});setQuery({});setPage(1)}}>{t("clear")}</button></form>
      <section className="lw-panel"><div className="lw-table-wrap" tabIndex={0} role="region" aria-label={t(outgoing?"s6Exits":"s6Entries")}><table className="account-table"><thead><tr>{["s6Number","s6Date",outgoing?"s6Requester":"productSupplier","s6Warehouse","status","actions"].map(k=><th key={k}>{t(k)}</th>)}</tr></thead><tbody>{!data.items.length?<tr><td colSpan={6}>{t(loading?"loading":error?"loadFailed":blocked?"s6ListUnavailable":"empty")}</td></tr>:data.items.map(row=><tr key={row.id}><td>{row.number}</td><td>{row.date}</td><td>{outgoing?row.requesterName:row.supplierName}</td><td>{row.warehouseName}</td><td>{t(`s6_${row.state}`)}</td><td><Link to={`/${kind}/${row.id}`}>{t("view")}</Link></td></tr>)}</tbody></table></div><div className="account-pagination"><span>{blocked?"—":data.total}</span><div><button className="account-secondary" disabled={blocked||page===1} onClick={()=>setPage(p=>p-1)}>{t("previous")}</button><span>{page}</span><button className="account-secondary" disabled={blocked||page*10>=data.total} onClick={()=>setPage(p=>p+1)}>{t("next")}</button></div></div></section>
    </>}
  </main>;
}
