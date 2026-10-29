import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Package,
  Bell,
  ShieldCheck,
  Palette,
  Database,
  Share2,
  Building2,
  Languages,
  Check,
  Boxes,
  Warehouse,
  Globe2,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import { useCopy, Notice, Status } from "../components/AccountUI";
import logo from "../assets/images/living-water-logo.png";
export default function Settings() {
  const { language, setLanguage } = useLanguage();
  const { token } = useAuth();
  const c = useCopy();
  const [tab, setTab] = useState("general");
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([api("/configuracion", token), api("/perfil", token)])
      .then(([settings, profile]) => {
        if (active) {
          setData(settings);
          setUser(profile);
        }
      })
      .catch((err) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, [token, revision]);
  const tabs = [
    ["general", c("General", "General"), SettingsIcon],
    ["inventory", c("Inventario", "Inventory"), Package],
    ["notifications", c("Notificaciones", "Notifications"), Bell],
    ["security", c("Seguridad", "Security"), ShieldCheck],
    ["appearance", c("Apariencia", "Appearance"), Palette],
    ["backups", c("Respaldos", "Backups"), Database],
    ["integrations", c("Integraciones", "Integrations"), Share2],
  ];
  return (
    <main className="lw-content account-page settings-page">
      <div className="account-heading">
        <div>
          <div className="account-crumb">
            {c("Inicio / Configuración", "Home / Settings")}
          </div>
          <h1>{c("Configuración del sistema", "System settings")}</h1>
          <p>
            {c(
              "Personaliza las preferencias y opciones del Sistema de Inventario.",
              "Customize preferences and options for the Inventory System.",
            )}
          </p>
        </div>
        <span className="settings-admin-label">
          <ShieldCheck size={16} />
          {c("Administración", "Administration")}
        </span>
      </div>
      <div
        className="account-tabs"
        role="tablist"
        aria-label={c("Secciones de configuración", "Settings sections")}
      >
        {tabs.map(([key, label, Icon]) => (
          <button
            role="tab"
            id={`tab-${key}`}
            aria-controls="settings-panel"
            aria-selected={tab === key}
            key={key}
            className={tab === key ? "selected" : ""}
            onClick={() => setTab(key)}
          >
            <Icon size={22} />
            {label}
          </button>
        ))}
      </div>
      <Notice error={error} />
      {error && (
        <button
          className="account-secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          {c("Reintentar", "Retry")}
        </button>
      )}
      {!data && !error ? (
        <div className="lw-panel" role="status">
          {c("Cargando configuración…", "Loading settings…")}
        </div>
      ) : (
        data && (
          <div
            role="tabpanel"
            id="settings-panel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "general" ? (
              <div className="account-two-col">
                <section className="lw-panel settings-institution-card">
                  <div className="settings-card-title">
                    <span className="settings-icon-tile">
                      <Building2 size={22} />
                    </span>
                    <div>
                      <span className="settings-eyebrow">
                        LIVING WATER GUATEMALA
                      </span>
                      <h2>
                        {c(
                          "Información de la institución",
                          "Institution information",
                        )}
                      </h2>
                    </div>
                  </div>
                  <p>
                    {c(
                      "Datos generales de la institución.",
                      "General institution information.",
                    )}
                  </p>
                  <div className="account-institution">
                    <div className="settings-logo-frame">
                      <img src={logo} alt="Living Water Guatemala" />
                      <span>
                        {c("Identidad institucional", "Institutional identity")}
                      </span>
                    </div>
                    <dl>
                      <dt>{c("Nombre", "Name")}</dt>
                      <dd>{c(data.nombre, data.nombre)}</dd>
                      <dt>{c("Organización", "Organization")}</dt>
                      <dd>{data.organizacion}</dd>
                      <dt>
                        {c("Correo institucional", "Institutional email")}
                      </dt>
                      <dd>{data.dominio}</dd>
                    </dl>
                  </div>
                  <div className="settings-card-foot">
                    <ShieldCheck size={16} />
                    {c(
                      "Acceso exclusivo con correo @water.cc",
                      "Exclusive access with an @water.cc email",
                    )}
                  </div>
                </section>
                <section className="lw-panel account-form settings-preferences">
                  <div className="settings-card-title">
                    <span className="settings-icon-tile">
                      <Languages size={22} />
                    </span>
                    <div>
                      <span className="settings-eyebrow">
                        {c("TU EXPERIENCIA", "YOUR EXPERIENCE")}
                      </span>
                      <h2>
                        {c("Preferencias del sistema", "System preferences")}
                      </h2>
                    </div>
                  </div>
                  <p>
                    {c(
                      "El idioma se aplica inmediatamente y se conserva en este navegador.",
                      "Language applies immediately and is remembered in this browser.",
                    )}
                  </p>
                  <label>
                    {c("Idioma", "Language")}
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="fr">Français</option>
                    </select>
                  </label>
                  <label>
                    {c("Zona horaria", "Time zone")}
                    <div className="settings-timezone">
                      <Globe2 size={18} />
                      <input value={data.zonaHoraria} readOnly />
                      <span>GMT−6</span>
                    </div>
                  </label>
                  <div className="settings-saved">
                    <Check size={16} />
                    {c(
                      "El idioma se guarda automáticamente",
                      "Language is saved automatically",
                    )}
                  </div>
                </section>
                <section className="lw-panel settings-future-card">
                  <span className="settings-icon-tile">
                    <Boxes size={23} />
                  </span>
                  <h2>
                    {c(
                      "Categorías y unidades de medida",
                      "Categories and units of measure",
                    )}
                  </h2>
                  <p>{c("Disponible próximamente", "Coming soon")}</p>
                  <span className="settings-coming-badge">
                    {c("Próximamente", "Coming soon")}
                  </span>
                </section>
                <section className="lw-panel settings-future-card">
                  <span className="settings-icon-tile amber">
                    <Warehouse size={23} />
                  </span>
                  <h2>
                    {c(
                      "Bodegas y alertas de inventario",
                      "Warehouses and inventory alerts",
                    )}
                  </h2>
                  <p>{c("Disponible próximamente", "Coming soon")}</p>
                  <span className="settings-coming-badge">
                    {c("Próximamente", "Coming soon")}
                  </span>
                </section>
              </div>
            ) : tab === "security" ? (
              <section className="lw-panel">
                <h2>{c("Seguridad de la cuenta", "Account security")}</h2>
                <dl className="account-security">
                  <dt>{c("Autenticación", "Authentication")}</dt>
                  <dd>
                    {c(
                      "Correo institucional @water.cc",
                      "Institutional email @water.cc",
                    )}
                  </dd>
                  <dt>{c("Sesiones", "Sessions")}</dt>
                  <dd>
                    {c(
                      "JWT con verificación de cuenta y rol en el servidor",
                      "JWT with server-side account and role verification",
                    )}
                  </dd>
                  <dt>{c("Rol actual", "Current role")}</dt>
                  <dd>{c(user?.rol.nombre, user?.rol.nombre)}</dd>
                  <dt>{c("Estado", "Status")}</dt>
                  <dd>
                    <Status active={user?.activo} />
                  </dd>
                </dl>
              </section>
            ) : (
              <section className="lw-panel account-coming">
                <Package size={35} />
                <h2>{tabs.find((t) => t[0] === tab)[1]}</h2>
                <p>{c("Disponible próximamente", "Coming soon")}</p>
                {tab === "inventory" && (
                  <p>
                    {c(
                      "Stock mínimo, alertas de inventario, notificaciones de existencias bajas, unidades de medida y bodegas.",
                      "Minimum stock, inventory alerts, low-stock notifications, units of measure and warehouses.",
                    )}
                  </p>
                )}
              </section>
            )}
          </div>
        )
      )}
    </main>
  );
}
