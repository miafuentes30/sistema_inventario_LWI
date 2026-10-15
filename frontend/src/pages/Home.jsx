import { useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpFromLine, BarChart3, Bell, Box, ChevronDown, CircleOff, FileBarChart2, Home as HomeIcon, LogOut, Menu, Package, Plus, RotateCcw, Search, Settings, TriangleAlert, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import logo from '../assets/images/living-water-logo.png';
import banner from '../assets/images/dashboard-landscape.svg';

const items = [
  {key:'home',es:'Inicio',en:'Home',icon:HomeIcon},
  {key:'inventory',es:'Inventario',en:'Inventory',icon:Package},
  {key:'entries',es:'Entradas',en:'Entries',icon:Plus},
  {key:'exits',es:'Salidas',en:'Exits',icon:ArrowUpFromLine},
  {key:'returns',es:'Devoluciones',en:'Returns',icon:RotateCcw},
  {key:'movements',es:'Movimientos',en:'Movements',icon:Activity},
  {key:'reports',es:'Reportes',en:'Reports',icon:FileBarChart2},
  {key:'users',es:'Usuarios',en:'Users',icon:Users},
  {key:'settings',es:'Configuración',en:'Settings',icon:Settings},
];
const quick = [
  {key:'inventory',es:'Nuevo producto',en:'New product',icon:Box,tone:'blue'},
  {key:'entries',es:'Registrar entrada',en:'Register entry',icon:Plus,tone:'green'},
  {key:'exits',es:'Registrar salida',en:'Register exit',icon:LogOut,tone:'red'},
  {key:'returns',es:'Registrar devolución',en:'Register return',icon:RotateCcw,tone:'yellow'},
  {key:'movements',es:'Ver movimientos',en:'View movements',icon:Activity,tone:'purple'},
  {key:'reports',es:'Generar reporte',en:'Generate report',icon:BarChart3,tone:'slate'},
];
export default function Home() {
  const {usuario, logout} = useAuth();
  const {language} = useLanguage();
  const es = language !== 'en';
  const [selected,setSelected] = useState('home');
  const [mobileOpen,setMobileOpen] = useState(false);
  const [collapsed,setCollapsed] = useState(false);
  const [profileOpen,setProfileOpen] = useState(false);
  const [search,setSearch] = useState('');
  const t = (obj) => es ? obj.es : obj.en;
  const selectedItem = items.find(i=>i.key===selected) || items[0];
  const displayName = usuario?.nombre?.trim() || (es?'Usuario':'User');
  const firstName = displayName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = es ? (hour < 12 ? '¡Buenos días' : hour < 19 ? '¡Buenas tardes' : '¡Buenas noches') : (hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening');
  const navigate = (key) => {setSelected(key);setMobileOpen(false);setSearch('');};
  const filteredItems = useMemo(()=>items.filter(i=>t(i).toLowerCase().includes(search.trim().toLowerCase())),[search,es]);
  const cards = [
    {es:'Productos totales',en:'Total products',icon:Box,tone:'blue',key:'inventory',linkEs:'Ver inventario',linkEn:'View inventory'},
    {es:'Productos en stock',en:'Products in stock',icon:Package,tone:'green',key:'inventory',linkEs:'Ver stock',linkEn:'View stock'},
    {es:'Productos con stock bajo',en:'Low-stock products',icon:TriangleAlert,tone:'yellow',key:'inventory',linkEs:'Ver detalles',linkEn:'View details'},
    {es:'Productos agotados',en:'Out-of-stock products',icon:CircleOff,tone:'red',key:'inventory',linkEs:'Ver detalles',linkEn:'View details'},
  ];
  return <div className={`lw-app ${collapsed?'lw-collapsed':''}`}>
    {mobileOpen && <button className="lw-overlay" aria-label="Cerrar menú" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`lw-sidebar ${mobileOpen?'lw-sidebar-open':''}`}>
      <div className="lw-brand"><img src={logo} alt="Living Water International"/><div><strong>LIVING WATER</strong><span>Guatemala</span></div><button className="lw-close-menu" aria-label="Cerrar menú" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div>
      <nav className="lw-nav" aria-label={es?'Menú principal':'Main menu'}>{items.map(i=><button key={i.key} type="button" className={`lw-nav-item ${selected===i.key?'active':''}`} onClick={()=>navigate(i.key)} title={t(i)}><i.icon size={21} strokeWidth={2.4}/><span>{t(i)}</span></button>)}</nav>
      <div className="lw-sidebar-end"><div className="lw-quote">“{es?'Agua,\npara la vida,\nen el nombre\nde Jesús.':'Water,\nfor life,\nin Jesus’ name.'}”<span/></div><p>Living Water Guatemala<br/><small>{es?'Dirección de Informática':'IT Department'}</small></p></div>
    </aside>
    <div className="lw-main">
      <header className="lw-topbar"><div className="lw-top-left"><button className="lw-menu-btn" aria-label={es?'Abrir menú':'Open menu'} onClick={()=>{if(window.innerWidth<=820)setMobileOpen(true);else setCollapsed(v=>!v)}}><Menu size={25}/></button><div className="lw-search"><Search size={22}/><input aria-label={es?'Buscar en el sistema':'Search system'} value={search} onChange={e=>setSearch(e.target.value)} placeholder={es?'Buscar en el sistema...':'Search the system...'}/>{search && <div className="lw-search-results">{filteredItems.length?filteredItems.map(i=><button key={i.key} onClick={()=>navigate(i.key)}>{t(i)} <ArrowRight size={14}/></button>):<span>{es?'Sin resultados':'No results'}</span>}</div>}</div></div><div className="lw-top-actions"><button className="lw-bell" title={es?'Notificaciones: pendientes de integración':'Notifications: pending integration'} aria-label={es?'Notificaciones':'Notifications'}><Bell size={24}/><span/></button><div className="lw-profile-wrap"><button className="lw-user-btn" onClick={()=>setProfileOpen(v=>!v)} aria-expanded={profileOpen}><span className="lw-avatar">{displayName.charAt(0).toUpperCase()}</span><strong>{displayName}</strong><ChevronDown size={18}/></button>{profileOpen && <div className="lw-profile-menu"><b>{displayName}</b><small>{usuario?.rol?.nombre}</small><small>{usuario?.correo}</small><button onClick={logout}><LogOut size={16}/>{es?'Cerrar sesión':'Sign out'}</button></div>}</div></div></header>
      {selected==='home'? <main className="lw-content">
        <section className="lw-hero" style={{backgroundImage:`linear-gradient(90deg,#f8fbff 0%,rgba(248,251,255,.91) 39%,rgba(248,251,255,.10) 100%),url(${banner})`}}><div><h1>{greeting}, {firstName}!</h1><p>{es?'Gracias por ser parte de Living Water Guatemala.':'Thank you for being part of Living Water Guatemala.'}</p></div><blockquote>“{es?'Llevando agua segura\ny esperanza a más comunidades.':'Bringing safe water\nand hope to more communities.'}”<span/></blockquote></section>
        <div className="lw-data-note">{es?'Vista de diseño: los indicadores y tablas se mostrarán cuando se conecten los módulos de inventario. No se utilizan datos ficticios.':'Design preview: metrics and tables will populate when inventory modules are connected. No fictitious data is shown.'}</div>
        <section className="lw-stats" aria-label={es?'Indicadores':'Metrics'}>{cards.map(c=><article className="lw-stat" key={c.es}><div className={`lw-stat-icon ${c.tone}`}><c.icon size={35}/></div><div><strong className="lw-stat-value">—</strong><p>{t(c)}</p><button onClick={()=>navigate(c.key)}>{es?c.linkEs:c.linkEn} <ArrowRight size={15}/></button></div></article>)}</section>
        <div className="lw-grid"><section className="lw-panel"><div className="lw-panel-header"><h2>{es?'Movimientos recientes':'Recent movements'}</h2><button onClick={()=>navigate('movements')}>{es?'Ver todos':'View all'} <ArrowRight size={17}/></button></div><div className="lw-table-wrap"><table><thead><tr>{(es?['Fecha','Tipo','Documento','Producto','Cantidad']:['Date','Type','Document','Product','Quantity']).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody><tr><td colSpan="5" className="lw-empty">{es?'Los movimientos aparecerán cuando se conecte el módulo.':'Movements will appear when the module is connected.'}</td></tr></tbody></table></div></section>
        <section className="lw-panel"><div className="lw-panel-header"><h2>{es?'Stock por categoría':'Stock by category'}</h2><button onClick={()=>navigate('inventory')}>{es?'Ver todas':'View all'} <ArrowRight size={17}/></button></div><div className="lw-category"><div className="lw-donut-placeholder"><span>—<small>{es?'Productos':'Products'}</small></span></div><div className="lw-category-list">{(es?['Higiene y salud','Construcción','Herramientas','Oficina','Otros']:['Health & hygiene','Construction','Tools','Office','Other']).map((x,i)=><div key={x}><i className={`lw-dot dot-${i}`}/><span>{x}</span><b>—</b></div>)}</div></div></section>
        <section className="lw-panel"><div className="lw-panel-header"><h2>{es?'Productos con stock bajo':'Low-stock products'}</h2><button onClick={()=>navigate('inventory')}>{es?'Ver todos':'View all'} <ArrowRight size={17}/></button></div><div className="lw-table-wrap"><table><thead><tr>{(es?['Código','Descripción','Stock actual','Stock mínimo']:['Code','Description','Current stock','Minimum stock']).map(x=><th key={x}>{x}</th>)}</tr></thead><tbody><tr><td colSpan="4" className="lw-empty">{es?'Sin datos de inventario conectados.':'No inventory data connected.'}</td></tr></tbody></table></div></section>
        <section className="lw-panel"><div className="lw-panel-header"><h2>{es?'Accesos rápidos':'Quick access'}</h2></div><div className="lw-quick">{quick.map(q=><button key={q.es} className={`lw-quick-btn ${q.tone}`} onClick={()=>navigate(q.key)}><q.icon size={30} strokeWidth={2.4}/><span>{t(q)}</span></button>)}</div></section></div>
      </main>:<main className="lw-content lw-placeholder-page"><h1>{t(selectedItem)}</h1><div className="lw-panel lw-coming"><selectedItem.icon size={42}/><h2>{es?'Módulo en desarrollo':'Module in development'}</h2><p>{es?'Esta sección se integrará en una próxima fase. El acceso y la sesión siguen funcionando.':'This section will be integrated in a later phase. Authentication remains functional.'}</p><button onClick={()=>navigate('home')}>{es?'Volver al inicio':'Back to home'}</button></div></main>}
      <footer className="lw-footer"><span>© 2026 Living Water Guatemala. {es?'Todos los derechos reservados.':'All rights reserved.'}</span><div>{es?'Términos de uso':'Terms of use'} <i/> {es?'Privacidad':'Privacy'} <i/> {es?'Soporte':'Support'}</div></footer>
    </div>
  </div>;
}
