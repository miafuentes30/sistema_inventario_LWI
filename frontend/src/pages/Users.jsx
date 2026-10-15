import { useEffect, useState } from "react";
import {
  Eye,
  Pencil,
  Power,
  Plus,
  Search,
  Users as UsersIcon,
  UserCheck,
  UserX,
  ShieldCheck,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { api } from "../services/api";
import {
  useCopy,
  Notice,
  Modal,
  date,
  strongPassword,
  Status,
} from "../components/AccountUI";
const empty = {
  nombre: "",
  correo: "",
  rolId: "",
  activo: true,
  contrasena: "",
  confirmacion: "",
};
export default function Users() {
  const { token, usuario, updateUser } = useAuth();
  const { language } = useLanguage();
  const c = useCopy();
  const [filters, setFilters] = useState({ buscar: "", rolId: "", activo: "" });
  const [query, setQuery] = useState({ pagina: 1 });
  const [data, setData] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== ""),
    );
    Promise.all([
      api(`/usuarios?${params}`, token),
      api("/usuarios/roles", token),
    ])
      .then(([result, items]) => {
        if (active) {
          setData(result);
          setRoles(items);
        }
      })
      .catch((err) => {
        if (active) setError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, query, revision]);
  function open(mode, user) {
    setFormError(null);
    setForm(
      user
        ? {
            nombre: user.nombre,
            correo: user.correo,
            rolId: user.rol.id,
            activo: user.activo,
            contrasena: "",
            confirmacion: "",
          }
        : { ...empty, rolId: roles[0]?.id || "" },
    );
    setModal({ mode, user });
  }
  async function submit(e) {
    e.preventDefault();
    setFormError(null);
    if (
      modal.mode === "create" &&
      (!strongPassword(form.contrasena) ||
        form.contrasena !== form.confirmacion)
    ) {
      setFormError(
        new Error(
          c(
            "Usa 12 a 72 bytes, mayúsculas, minúsculas, números y símbolos. Confirma ambas contraseñas.",
            "Use 12–72 bytes, uppercase, lowercase, numbers and symbols. Both passwords must match.",
          ),
        ),
      );
      return;
    }
    if (!/^[^\s@]+@water\.cc$/i.test(form.correo.trim())) {
      setFormError(
        new Error(c("Utiliza un correo @water.cc.", "Use an @water.cc email.")),
      );
      return;
    }
    if (modal.mode === "edit" && modal.user.activo && !form.activo) {
      setModal({ ...modal, mode: "confirmEdit" });
      return;
    }
    await save();
  }
  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        nombre: form.nombre.trim(),
        correo: form.correo.trim(),
        rolId: form.rolId,
        activo: form.activo,
        ...(modal.mode === "create"
          ? { contrasena: form.contrasena, confirmacion: form.confirmacion }
          : {}),
      };
      const saved = await api(
        modal.mode === "create" ? "/usuarios" : `/usuarios/${modal.user.id}`,
        token,
        { method: modal.mode === "create" ? "POST" : "PATCH", body },
      );
      if (saved.id === usuario.id) updateUser(saved);
      setModal(null);
      setForm(empty);
      setSuccess(
        c("Usuario guardado correctamente.", "User saved successfully."),
      );
      setRevision((v) => v + 1);
    } catch (err) {
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }
  async function toggle() {
    setSaving(true);
    setFormError(null);
    try {
      await api(`/usuarios/${modal.user.id}/estado`, token, {
        method: "PATCH",
        body: { activo: !modal.user.activo },
      });
      setModal(null);
      setSuccess(c("Estado actualizado.", "Status updated."));
      setRevision((v) => v + 1);
    } catch (err) {
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }
  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });
  return (
    <main className="lw-content account-page">
      <div className="account-heading">
        <div>
          <div className="account-crumb">
            {c("Inicio / Usuarios", "Home / Users")}
          </div>
          <h1>{c("Gestión de usuarios", "User management")}</h1>
          <p>
            {c(
              "Administra las cuentas y permisos de acceso al Sistema de Inventario.",
              "Manage accounts and access permissions for the Inventory System.",
            )}
          </p>
        </div>
        <button
          className="account-primary"
          onClick={() => open("create")}
          disabled={!roles.length}
        >
          <Plus size={19} />
          {c("Nuevo usuario", "New user")}
        </button>
      </div>
      <section className="account-stats">
        {[
          [
            c("Usuarios registrados", "Registered users"),
            "registrados",
            UsersIcon,
          ],
          [c("Usuarios activos", "Active users"), "activos", UserCheck],
          [c("Usuarios inactivos", "Inactive users"), "inactivos", UserX],
          [
            c("Administradores", "Administrators"),
            "administradores",
            ShieldCheck,
          ],
        ].map(([label, key, Icon]) => (
          <article className="lw-panel" key={key}>
            <Icon size={25} />
            <div>
              <strong>{loading ? "?" : (data?.indicadores[key] ?? "?")}</strong>
              <span>{label}</span>
            </div>
          </article>
        ))}
      </section>
      <form
        className="lw-panel account-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ ...filters, pagina: 1 });
        }}
      >
        <h2>{c("Filtros de búsqueda", "Search filters")}</h2>
        <div className="account-filter-grid">
          <label>
            {c("Nombre o correo", "Name or email")}
            <div className="account-search">
              <Search size={18} />
              <input
                value={filters.buscar}
                maxLength={180}
                onChange={(e) =>
                  setFilters({ ...filters, buscar: e.target.value })
                }
                placeholder={c(
                  "Buscar por nombre o correo…",
                  "Search name or email…",
                )}
              />
            </div>
          </label>
          <label>
            {c("Rol", "Role")}
            <select
              value={filters.rolId}
              onChange={(e) =>
                setFilters({ ...filters, rolId: e.target.value })
              }
            >
              <option value="">{c("Todos", "All")}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            {c("Estado", "Status")}
            <select
              value={filters.activo}
              onChange={(e) =>
                setFilters({ ...filters, activo: e.target.value })
              }
            >
              <option value="">{c("Todos", "All")}</option>
              <option value="true">{c("Activo", "Active")}</option>
              <option value="false">{c("Inactivo", "Inactive")}</option>
            </select>
          </label>
        </div>
        <div className="account-actions">
          <button
            type="button"
            className="account-secondary"
            onClick={() => {
              setFilters({ buscar: "", rolId: "", activo: "" });
              setQuery({ pagina: 1 });
            }}
          >
            {c("Limpiar filtros", "Clear filters")}
          </button>
          <button className="account-primary">
            <Filter size={17} />
            {c("Filtrar", "Filter")}
          </button>
        </div>
      </form>
      <Notice error={error} success={success} />
      {error && (
        <button
          className="account-secondary"
          onClick={() => setRevision((v) => v + 1)}
        >
          {c("Reintentar", "Retry")}
        </button>
      )}
      <section className="lw-panel">
        <div className="account-section-heading">
          <h2>{c("Usuarios registrados", "Registered users")}</h2>
          <span>
            {c("Total de usuarios: ", "Total users: ")}
            {loading ? "?" : (data?.total ?? "?")}
          </span>
        </div>
        <div className="lw-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                {[
                  c("Usuario", "User"),
                  c("Correo electrónico", "Email"),
                  c("Rol", "Role"),
                  c("Estado", "Status"),
                  c("Último acceso", "Last sign-in"),
                  c("Fecha de registro", "Registered"),
                  c("Acciones", "Actions"),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="lw-empty" role="status">
                    {c("Cargando usuarios…", "Loading users…")}
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="lw-empty">
                    {c(
                      "No se pudieron cargar los usuarios.",
                      "Unable to load users.",
                    )}
                  </td>
                </tr>
              ) : !data?.usuarios.length ? (
                <tr>
                  <td colSpan={7} className="lw-empty">
                    {c("No se encontraron usuarios.", "No users found.")}
                  </td>
                </tr>
              ) : (
                data.usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.nombre}</b>
                    </td>
                    <td>{u.correo}</td>
                    <td>
                      <span className="account-badge role">{u.rol.nombre}</span>
                    </td>
                    <td>
                      <Status active={u.activo} />
                    </td>
                    <td>{date(u.ultimoAcceso, language)}</td>
                    <td>{date(u.createdAt, language)}</td>
                    <td>
                      <div className="account-row-actions">
                        <button
                          className="account-icon"
                          title={c("Ver usuario", "View user")}
                          onClick={() => open("view", u)}
                        >
                          <Eye size={17} />
                        </button>
                        <button
                          className="account-icon"
                          title={c("Editar usuario", "Edit user")}
                          onClick={() => open("edit", u)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="account-icon"
                          disabled={u.id === usuario.id}
                          title={
                            u.activo
                              ? c("Desactivar", "Deactivate")
                              : c("Activar", "Activate")
                          }
                          onClick={() => {
                            setFormError(null);
                            setModal({ mode: "toggle", user: u });
                          }}
                        >
                          <Power size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="account-pagination">
          <span>
            {!loading && data
              ? c(
                  `Mostrando ${data.total ? (data.pagina - 1) * data.limite + 1 : 0} a ${Math.min(data.pagina * data.limite, data.total)} de ${data.total} usuarios`,
                  `Showing ${data.total ? (data.pagina - 1) * data.limite + 1 : 0} to ${Math.min(data.pagina * data.limite, data.total)} of ${data.total} users`,
                )
              : "?"}
          </span>
          <div>
            <button
              className="account-icon"
              aria-label={c("Anterior", "Previous")}
              disabled={loading || query.pagina <= 1}
              onClick={() => setQuery({ ...query, pagina: query.pagina - 1 })}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="account-page-number">{query.pagina}</span>
            <button
              className="account-icon"
              aria-label={c("Siguiente", "Next")}
              disabled={
                loading || !data || query.pagina * data.limite >= data.total
              }
              onClick={() => setQuery({ ...query, pagina: query.pagina + 1 })}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      {modal && (
        <Modal
          busy={saving}
          onClose={() => {
            setModal(null);
            setForm(empty);
          }}
          title={
            modal.mode === "create"
              ? c("Nuevo usuario", "New user")
              : modal.mode === "view"
                ? c("Información del usuario", "User details")
                : modal.mode === "edit"
                  ? c("Editar usuario", "Edit user")
                  : c("Confirmar cambio", "Confirm change")
          }
        >
          <Notice error={formError} />
          {modal.mode === "toggle" || modal.mode === "confirmEdit" ? (
            <>
              <p>
                {c(
                  "¿Confirmas el cambio de estado de esta cuenta? Una cuenta inactiva perder? el acceso al sistema.",
                  "Confirm this account status change? An inactive account will lose access to the system.",
                )}
              </p>
              <div className="account-actions">
                <button
                  className="account-secondary"
                  disabled={saving}
                  onClick={() => setModal(null)}
                >
                  {c("Cancelar", "Cancel")}
                </button>
                <button
                  className="account-primary"
                  disabled={saving}
                  onClick={modal.mode === "toggle" ? toggle : save}
                >
                  {c("Confirmar", "Confirm")}
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="account-form">
              <label>
                {c("Nombre completo", "Full name")}
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  {...field("nombre")}
                  disabled={modal.mode === "view"}
                />
              </label>
              <label>
                {c("Correo institucional", "Institutional email")}
                <input
                  required
                  type="email"
                  maxLength={180}
                  {...field("correo")}
                  disabled={modal.mode === "view"}
                />
              </label>
              <label>
                {c("Rol", "Role")}
                <select
                  required
                  {...field("rolId")}
                  disabled={
                    modal.mode === "view" || modal.user?.id === usuario.id
                  }
                >
                  {roles.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                  {modal.user &&
                    !roles.some((r) => r.id === modal.user.rol.id) && (
                      <option value={modal.user.rol.id}>
                        {modal.user.rol.nombre}
                      </option>
                    )}
                </select>
              </label>
              <label>
                {c("Estado", "Status")}
                <select
                  value={String(form.activo)}
                  onChange={(e) =>
                    setForm({ ...form, activo: e.target.value === "true" })
                  }
                  disabled={
                    modal.mode === "view" || modal.user?.id === usuario.id
                  }
                >
                  <option value="true">{c("Activo", "Active")}</option>
                  <option value="false">{c("Inactivo", "Inactive")}</option>
                </select>
              </label>
              {modal.mode === "create" && (
                <>
                  <p className="account-hint">
                    {c(
                      "12 a 72 bytes; incluye mayúsculas, minúsculas, números y símbolos.",
                      "12–72 bytes; include uppercase, lowercase, numbers and symbols.",
                    )}
                  </p>
                  <label>
                    {c("Contraseña inicial", "Initial password")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      {...field("contrasena")}
                    />
                  </label>
                  <label>
                    {c("Confirmar contraseña", "Confirm password")}
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      {...field("confirmacion")}
                    />
                  </label>
                </>
              )}
              {modal.mode === "view" ? (
                <>
                  <p>
                    {c("Último acceso: ", "Last sign-in: ")}
                    {date(modal.user.ultimoAcceso, language)}
                  </p>
                  <p>
                    {c("Fecha de registro: ", "Registered: ")}
                    {date(modal.user.createdAt, language)}
                  </p>
                </>
              ) : (
                <div className="account-actions">
                  <button
                    type="button"
                    className="account-secondary"
                    disabled={saving}
                    onClick={() => setModal(null)}
                  >
                    {c("Cancelar", "Cancel")}
                  </button>
                  <button className="account-primary" disabled={saving}>
                    {saving
                      ? c("Guardando…", "Saving…")
                      : c("Guardar usuario", "Save user")}
                  </button>
                </div>
              )}
            </form>
          )}
        </Modal>
      )}
    </main>
  );
}
