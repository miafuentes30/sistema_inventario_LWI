import { useCopy } from "../components/AccountUI";
import Catalog from "./Catalog";
import ProductDetail from "./ProductDetail";
import SystemSearch from "../components/SystemSearch";
import { useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, UserRound } from "lucide-react";
import UsersPage from "./Users";
import Profile from "./Profile";
import SettingsPage from "./Settings";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, ArrowUpFromLine, BarChart3, Bell, Box, ChevronDown, CircleOff, FileBarChart2, Home as HomeIcon, LogOut, Menu, Package, Plus, RotateCcw, Settings, TriangleAlert, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import logo from "../assets/images/living-water-logo.png";
import banner from "../assets/images/dashboard-landscape.svg";
const items = [{
  key: "home",
  es: "Inicio",
  en: "Home",
  icon: HomeIcon
}, {
  key: "inventory",
  es: "Inventario",
  en: "Inventory",
  fr: "Inventaire",
  icon: Package
}, {
  key: "suppliers",
  es: "Proveedores",
  en: "Suppliers",
  fr: "Fournisseurs",
  icon: Users
}, {
  key: "entries",
  es: "Entradas",
  en: "Entries",
  icon: Plus
}, {
  key: "exits",
  es: "Salidas",
  en: "Exits",
  icon: ArrowUpFromLine
}, {
  key: "returns",
  es: "Devoluciones",
  en: "Returns",
  icon: RotateCcw
}, {
  key: "movements",
  es: "Movimientos",
  en: "Movements",
  icon: Activity
}, {
  key: "reports",
  es: "Reportes",
  en: "Reports",
  icon: FileBarChart2
}, {
  key: "users",
  es: "Usuarios",
  en: "Users",
  icon: Users
}, {
  key: "settings",
  es: "Configuración",
  en: "Settings",
  icon: Settings
}];
const quick = [{
  key: "inventory",
  es: "Nuevo producto",
  en: "New product",
  icon: Box,
  tone: "blue"
}, {
  key: "entries",
  es: "Registrar entrada",
  en: "Register entry",
  icon: Plus,
  tone: "green"
}, {
  key: "exits",
  es: "Registrar salida",
  en: "Register exit",
  icon: LogOut,
  tone: "red"
}, {
  key: "returns",
  es: "Registrar devolución",
  en: "Register return",
  icon: RotateCcw,
  tone: "yellow"
}, {
  key: "movements",
  es: "Ver movimientos",
  en: "View movements",
  icon: Activity,
  tone: "purple"
}, {
  key: "reports",
  es: "Generar reporte",
  en: "Generate report",
  icon: BarChart3,
  tone: "slate"
}];
export default function Home() {
  const {
    usuario,
    logout
  } = useAuth();
  const { language } = useLanguage();
  const c = useCopy();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [localSelected, setSelected] = useState("home");
  const pathKeys = {
    "/inventario": "inventory",
    "/proveedores": "suppliers",
    "/usuarios": "users",
    "/configuracion": "settings",
    "/perfil": "profile"
  };
  const selected = location.pathname.startsWith("/inventario/") ? "productDetail" : pathKeys[location.pathname] || localSelected;
  const admin = usuario?.rol?.nombre === "Administrador";
  const visibleItems = items.filter(i => admin || !["users", "settings"].includes(i.key));
  const profileRef = useRef(null);
  const profileButton = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = event => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    const resize = () => {
      if (window.innerWidth > 820) setMobileOpen(false);
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
    };
  }, [mobileOpen]);
  useEffect(() => {
    if (!profileOpen) return;
    const outside = event => {
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false);
    };
    const escape = event => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        profileButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [profileOpen]);
  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);
  const t = obj => c(obj.es, obj.en);
  const selectedItem = items.find(i => i.key === selected) || items[0];
  const displayName = usuario?.nombre?.trim() || c("Usuario", "User");
  const firstName = displayName.split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = c(hour < 12 ? "¡Buenos días" : hour < 19 ? "¡Buenas tardes" : "¡Buenas noches", hour < 12 ? "Good morning" : hour < 19 ? "Good afternoon" : "Good evening");
  const navigate = key => {
    const routes = {
      inventory: "/inventario",
      suppliers: "/proveedores",
      users: "/usuarios",
      settings: "/configuracion",
      profile: "/perfil",
      password: "/perfil#contrasena"
    };
    setSelected(routes[key] ? "home" : key);
    routerNavigate(routes[key] || "/");
    setMobileOpen(false);
    setProfileOpen(false);
    setSearch("");
  };
  const cards = [{
    es: "Productos totales",
    en: "Total products",
    icon: Box,
    tone: "blue",
    key: "inventory",
    linkEs: "Ver inventario",
    linkEn: "View inventory"
  }, {
    es: "Productos en stock",
    en: "Products in stock",
    icon: Package,
    tone: "green",
    key: "inventory",
    linkEs: "Ver stock",
    linkEn: "View stock"
  }, {
    es: "Productos con stock bajo",
    en: "Low-stock products",
    icon: TriangleAlert,
    tone: "yellow",
    key: "inventory",
    linkEs: "Ver detalles",
    linkEn: "View details"
  }, {
    es: "Productos agotados",
    en: "Out-of-stock products",
    icon: CircleOff,
    tone: "red",
    key: "inventory",
    linkEs: "Ver detalles",
    linkEn: "View details"
  }];
  return <div className={`lw-app ${collapsed ? "lw-collapsed" : ""}`}>
      {mobileOpen && <button className="lw-overlay" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
      <aside className={`lw-sidebar ${mobileOpen ? "lw-sidebar-open" : ""}`}>
        <div className="lw-brand">
          <img src={logo} alt="Living Water International" />
          <div>
            <strong>LIVING WATER</strong>
            <span>Guatemala</span>
          </div>
          <button className="lw-close-menu" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}>
            <X size={19} />
          </button>
        </div>
        <nav className="lw-nav" aria-label={c("Menú principal", "Main menu")}>
          {visibleItems.map(i => <button key={i.key} type="button" className={`lw-nav-item ${selected === i.key ? "active" : ""}`} onClick={() => navigate(i.key)} title={t(i)}>
              <i.icon size={21} strokeWidth={2.4} />
              <span>{t(i)}</span>
            </button>)}
        </nav>
        <div className="lw-sidebar-end">
          <div className="lw-quote">
            “
            {c("Agua,\npara la vida,\nen el nombre\nde Jesús.", "Water,\nfor life,\nin Jesus’ name.")}
            ”<span />
          </div>
          <p>
            Living Water Guatemala
            <br />
            <small>{c("Dirección de Informática", "IT Department")}</small>
          </p>
        </div>
      </aside>
      <div className="lw-main">
        <header className="lw-topbar">
          <div className="lw-top-left">
            <button className="lw-menu-btn" aria-label={c("Abrir menú", "Open menu")} onClick={() => {
            if (window.innerWidth <= 820) setMobileOpen(true);else setCollapsed(v => !v);
          }}>
              <Menu size={25} />
            </button>
            <SystemSearch items={visibleItems} language={language} value={search} onChange={setSearch} onNavigate={navigate} />
          </div>
          <div className="lw-top-actions">
            <button className="lw-bell" title={c("Notificaciones: pendientes de integración", "Notifications: pending integration")} aria-label={c("Notificaciones", "Notifications")}>
              <Bell size={24} />
              <span />
            </button>
            <div className="lw-profile-wrap" ref={profileRef}>
              <button ref={profileButton} className="lw-user-btn" aria-controls="profile-menu" aria-label={`${displayName}: ${c("menú de perfil", "profile menu")}`} onClick={() => setProfileOpen(v => !v)} aria-expanded={profileOpen}>
                <span className="lw-avatar">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="lw-user-copy">
                  <strong>{firstName}</strong>
                  <small>{c(usuario?.rol?.nombre, usuario?.rol?.nombre === "Administrador" ? "Administrator" : usuario?.rol?.nombre === "Operador" ? "Operator" : usuario?.rol?.nombre)}</small>
                </span>
                <ChevronDown size={18} />
              </button>
              {profileOpen && <div id="profile-menu" className="lw-profile-menu">
                  <div className="lw-profile-identity">
                    <span className="lw-avatar" aria-hidden="true">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <b>{displayName}</b>
                      <small>{c(usuario?.rol?.nombre, usuario?.rol?.nombre === "Administrador" ? "Administrator" : usuario?.rol?.nombre === "Operador" ? "Operator" : usuario?.rol?.nombre)}</small>
                      <small className="lw-profile-email">
                        {usuario?.correo}
                      </small>
                    </div>
                  </div>
                  <button onClick={() => navigate("profile")}>
                    <UserRound size={16} />
                    {c("Mi perfil", "My profile")}
                  </button>
                  <button onClick={() => navigate("password")}>
                    <LockKeyhole size={17} />
                    {c("Cambiar contraseña", "Change password")}
                  </button>
                  <button onClick={logout}>
                    <LogOut size={16} />
                    {c("Cerrar sesión", "Sign out")}
                  </button>
                </div>}
            </div>
          </div>
        </header>
        {selected === "inventory" ? <Catalog key="inventory" /> : selected === "suppliers" ? <Catalog key="suppliers" suppliers /> : selected === "productDetail" ? <ProductDetail /> : selected === "users" ? admin ? <UsersPage /> : <main className="lw-content account-page">
              <h1>{c("Acceso restringido", "Access denied")}</h1>
            </main> : selected === "settings" ? admin ? <SettingsPage /> : <main className="lw-content account-page">
              <h1>{c("Acceso restringido", "Access denied")}</h1>
            </main> : selected === "profile" ? <Profile /> : selected === "home" ? <main className="lw-content lw-dashboard">
            <section className="lw-hero" style={{
          backgroundImage: `linear-gradient(90deg,#f8fbff 0%,rgba(248,251,255,.91) 39%,rgba(248,251,255,.10) 100%),url(${banner})`
        }}>
              <div>
                <h1>
                  {greeting}, {firstName}!
                </h1>
                <p>
                  {c("Gracias por ser parte de Living Water Guatemala.", "Thank you for being part of Living Water Guatemala.")}
                </p>
              </div>
              <blockquote>
                “
                {c("Llevando agua segura\ny esperanza a más comunidades.", "Bringing safe water\nand hope to more communities.")}
                ”<span />
              </blockquote>
            </section>
            <div className="lw-data-note">
              {c("Vista de diseño: los indicadores y tablas se mostrarán cuando se conecten los módulos de inventario. No se utilizan datos ficticios.", "Design preview: metrics and tables will populate when inventory modules are connected. No fictitious data is shown.")}
            </div>
            <section className="lw-stats" aria-label={c("Indicadores", "Metrics")}>
              {cards.map(card => <article className="lw-stat" key={card.es}>
                  <div className={`lw-stat-icon ${card.tone}`}>
                    <card.icon size={35} />
                  </div>
                  <div>
                    <strong className="lw-stat-value">—</strong>
                    <p>{t(card)}</p>
                    <button onClick={() => navigate(card.key)}>
                      {c(card.linkEs, card.linkEn)} <ArrowRight size={15} />
                    </button>
                  </div>
                </article>)}
            </section>
            <div className="lw-grid">
              <section className="lw-panel">
                <div className="lw-panel-header">
                  <h2>{c("Movimientos recientes", "Recent movements")}</h2>
                  <button onClick={() => navigate("movements")}>
                    {c("Ver todos", "View all")} <ArrowRight size={17} />
                  </button>
                </div>
                <div className="lw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {c(["Fecha", "Tipo", "Documento", "Producto", "Cantidad"], ["Date", "Type", "Document", "Product", "Quantity"]).map(x => <th key={x}>{x}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan="5" className="lw-empty">
                          {c("Los movimientos aparecerán cuando se conecte el módulo.", "Movements will appear when the module is connected.")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="lw-panel">
                <div className="lw-panel-header">
                  <h2>{c("Stock por categoría", "Stock by category")}</h2>
                  <button onClick={() => navigate("inventory")}>
                    {c("Ver todas", "View all")} <ArrowRight size={17} />
                  </button>
                </div>
                <div className="lw-category">
                  <div className="lw-donut-placeholder">
                    <span>
                      —<small>{c("Productos", "Products")}</small>
                    </span>
                  </div>
                  <div className="lw-category-list">
                    {c(["Higiene y salud", "Construcción", "Herramientas", "Oficina", "Otros"], ["Health & hygiene", "Construction", "Tools", "Office", "Other"]).map((x, i) => <div key={x}>
                        <i className={`lw-dot dot-${i}`} />
                        <span>{x}</span>
                        <b>—</b>
                      </div>)}
                  </div>
                </div>
              </section>
              <section className="lw-panel">
                <div className="lw-panel-header">
                  <h2>
                    {c("Productos con stock bajo", "Low-stock products")}
                  </h2>
                  <button onClick={() => navigate("inventory")}>
                    {c("Ver todos", "View all")} <ArrowRight size={17} />
                  </button>
                </div>
                <div className="lw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {c(["Código", "Descripción", "Stock actual", "Stock mínimo"], ["Code", "Description", "Current stock", "Minimum stock"]).map(x => <th key={x}>{x}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan="4" className="lw-empty">
                          {c("Sin datos de inventario conectados.", "No inventory data connected.")}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="lw-panel">
                <div className="lw-panel-header">
                  <h2>{c("Accesos rápidos", "Quick access")}</h2>
                </div>
                <div className="lw-quick">
                  {quick.map(q => <button key={q.es} className={`lw-quick-btn ${q.tone}`} onClick={() => q.key === "inventory" ? routerNavigate("/inventario#nuevo") : navigate(q.key)}>
                      <q.icon size={30} strokeWidth={2.4} />
                      <span>{t(q)}</span>
                    </button>)}
                </div>
              </section>
            </div>
          </main> : <main className="lw-content lw-placeholder-page">
            <h1>{t(selectedItem)}</h1>
            <div className="lw-panel lw-coming">
              <selectedItem.icon size={42} />
              <h2>{c("Módulo en desarrollo", "Module in development")}</h2>
              <p>
                {c("Esta sección se integrará en una próxima fase. El acceso y la sesión siguen funcionando.", "This section will be integrated in a later phase. Authentication remains functional.")}
              </p>
              <button onClick={() => navigate("home")}>
                {c("Volver al inicio", "Back to home")}
              </button>
            </div>
          </main>}
        <footer className="lw-footer">
          <span>
            © 2026 Living Water Guatemala.{" "}
            {c("Todos los derechos reservados.", "All rights reserved.")}
          </span>
          <div>
            {c("Términos de uso", "Terms of use")} <i />{" "}
            {c("Privacidad", "Privacy")} <i /> {c("Soporte", "Support")}
          </div>
        </footer>
      </div>
    </div>;
}
