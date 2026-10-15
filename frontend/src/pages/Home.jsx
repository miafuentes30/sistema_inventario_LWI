import { useState } from "react";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Bell, ChevronDown, ClipboardList, FileBarChart2, Home as HomeIcon, LayoutDashboard, LogOut, Menu, Package, RotateCcw, Search, Settings, ShieldCheck, Users, Warehouse } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import logo from "../assets/images/living-water-logo.png";

const modules = [
  { key: "home", es: "Inicio", en: "Home", icon: LayoutDashboard, active: true },
  { key: "inventory", es: "Inventario", en: "Inventory", icon: Package },
  { key: "entries", es: "Entradas", en: "Entries", icon: ArrowDownToLine },
  { key: "exits", es: "Salidas", en: "Exits", icon: ArrowUpFromLine },
  { key: "returns", es: "Devoluciones", en: "Returns", icon: RotateCcw },
  { key: "movements", es: "Movimientos", en: "Movements", icon: Activity },
  { key: "reports", es: "Reportes", en: "Reports", icon: FileBarChart2 },
  { key: "users", es: "Usuarios", en: "Users", icon: Users },
  { key: "settings", es: "Configuración", en: "Settings", icon: Settings }
];

export default function Home() {
  const { usuario, logout } = useAuth();
  const { language } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selected, setSelected] = useState("home");
  const es = language === "es";
  const title = (item) => es ? item.es : item.en;
  const selectedModule = modules.find((item) => item.key === selected) || modules[0];
  const welcome = (usuario?.nombre || (es ? "usuario" : "user")).split(" ")[0];
  const tiles = [
    { label: es ? "Productos registrados" : "Registered products", icon: Package, color: "blue" },
    { label: es ? "Entradas de inventario" : "Inventory entries", icon: ArrowDownToLine, color: "green" },
    { label: es ? "Salidas de inventario" : "Inventory exits", icon: ArrowUpFromLine, color: "orange" },
    { label: es ? "Alertas de stock" : "Stock alerts", icon: Bell, color: "purple" }
  ];
  return (
    <div className="dashboard-shell">
      {sidebarOpen && <button className="dashboard-backdrop" aria-label={es ? "Cerrar menú" : "Close menu"} onClick={() => setSidebarOpen(false)} />}
      <aside className={`dashboard-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="dashboard-brand"><img src={logo} alt="Living Water International" /><div><strong>{es ? "Sistema de Inventario" : "Inventory System"}</strong><span>Living Water Guatemala</span></div></div>
        <p className="dashboard-nav-label">{es ? "MENÚ PRINCIPAL" : "MAIN MENU"}</p>
        <nav aria-label={es ? "Navegación principal" : "Main navigation"}>
          {modules.map(item => <button key={item.key} type="button" className={`dashboard-nav-item ${selected === item.key ? "is-active" : ""}`} onClick={() => { setSelected(item.key); setSidebarOpen(false); }}><item.icon size={19} /><span>{title(item)}</span>{!item.active && <span className="dashboard-soon-dot" title={es ? "Próximamente" : "Coming soon"} />}</button>)}
        </nav>
        <div className="dashboard-sidebar-bottom"><div className="dashboard-mission">“{es ? "Agua, para la vida, en el nombre de Jesús." : "Water, for life, in Jesus’ name."}”</div><small>Living Water Guatemala · 2026</small></div>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-topbar"><div className="dashboard-top-left"><button type="button" className="dashboard-icon-btn dashboard-menu-btn" onClick={() => setSidebarOpen(true)} aria-label={es ? "Abrir menú" : "Open menu"}><Menu size={22}/></button><span className="dashboard-breadcrumb"><HomeIcon size={16} /> / {title(selectedModule)}</span></div><div className="dashboard-account"><div className="dashboard-avatar">{(usuario?.nombre || "U").charAt(0).toUpperCase()}</div><div className="dashboard-account-text"><strong>{usuario?.nombre}</strong><span>{usuario?.rol?.nombre || (es ? "Usuario" : "User")}</span></div><ChevronDown size={16} /></div></header>
        <main className="dashboard-body">
          {selected === "home" ? <>
            <div className="dashboard-heading"><div><p className="dashboard-overline">LIVING WATER GUATEMALA</p><h1>{es ? `¡Bienvenido, ${welcome}!` : `Welcome, ${welcome}!`}</h1><p>{es ? "Panel general del Sistema de Inventario" : "Inventory System overview"}</p></div><div className="dashboard-secure"><ShieldCheck size={17}/>{es ? "Sesión iniciada" : "Signed in"}</div></div>
            <div className="dashboard-notice"><Warehouse size={22}/><div><strong>{es ? "Tu espacio de trabajo está listo" : "Your workspace is ready"}</strong><p>{es ? "El inicio de sesión ya utiliza tu cuenta del sistema. Los indicadores mostrarán datos cuando estén disponibles los módulos de inventario y sus API." : "Sign-in uses your system account. Indicators will show data when inventory modules and APIs are available."}</p></div></div>
            <section className="dashboard-stat-grid" aria-label={es ? "Indicadores de inventario" : "Inventory indicators"}>{tiles.map(tile => <article className="dashboard-stat" key={tile.label}><span className={`dashboard-stat-icon ${tile.color}`}><tile.icon size={23}/></span><span className="dashboard-stat-title">{tile.label}</span><strong>—</strong><small>{es ? "Pendiente de integración" : "Pending integration"}</small></article>)}</section>
            <div className="dashboard-lower-grid"><section className="dashboard-panel"><div className="dashboard-panel-heading"><h2>{es ? "Accesos rápidos" : "Quick access"}</h2><span>{es ? "Módulos del sistema" : "System modules"}</span></div><div className="dashboard-quick-grid">{modules.filter(item => ["inventory", "entries", "exits", "returns"].includes(item.key)).map(item => <button key={item.key} type="button" onClick={() => setSelected(item.key)}><item.icon size={22}/><span>{title(item)}</span><small>{es ? "Próximamente" : "Coming soon"}</small></button>)}</div></section><section className="dashboard-panel dashboard-profile"><div className="dashboard-panel-heading"><h2>{es ? "Mi cuenta" : "My account"}</h2></div><div className="dashboard-profile-avatar">{(usuario?.nombre || "U").charAt(0).toUpperCase()}</div><strong>{usuario?.nombre}</strong><span>{usuario?.correo}</span><span className="dashboard-role">{usuario?.rol?.nombre}</span><button className="dashboard-logout" onClick={logout}><LogOut size={17}/>{es ? "Cerrar sesión" : "Sign out"}</button></section></div>
          </> : <><div className="dashboard-heading"><div><p className="dashboard-overline">LIVING WATER GUATEMALA</p><h1>{title(selectedModule)}</h1><p>{es ? "Módulo planificado para una próxima fase" : "Module planned for a future phase"}</p></div></div><div className="dashboard-module-placeholder"><selectedModule.icon size={38}/><h2>{es ? "Próximamente" : "Coming soon"}</h2><p>{es ? "Este módulo aún no tiene una API ni datos conectados. No se muestran registros ficticios." : "This module does not yet have a connected API or data. No sample records are shown."}</p><button onClick={() => setSelected("home")}>{es ? "Volver al inicio" : "Back to home"}</button></div></>}
        </main>
        <footer className="dashboard-footer">© 2026 Living Water Guatemala · {es ? "Sistema de Inventario" : "Inventory System"}</footer>
      </div>
    </div>
  );
}
