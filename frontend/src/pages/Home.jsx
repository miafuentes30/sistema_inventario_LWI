import { LogOut, Package, UserRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/images/living-water-logo.png";

export default function Home() {
  const { usuario, logout } = useAuth();

  return (
    <main className="home-page">
      <aside className="home-sidebar">
        <img src={logo} alt="Living Water International" className="sidebar-logo" />
        <div className="sidebar-brand">
          <strong>Sistema de Inventario</strong>
          <span>Living Water Guatemala</span>
        </div>
      </aside>
      <section className="home-content">
        <header className="home-header">
          <div>
            <span className="eyebrow">Inicio</span>
            <h1>Bienvenido, {usuario?.nombre || "usuario"}</h1>
            <p>La autenticación está conectada correctamente con el backend.</p>
          </div>
          <button className="logout-button" onClick={logout}><LogOut size={18} /> Cerrar sesión</button>
        </header>
        <div className="home-card">
          <Package size={34} />
          <div>
            <h2>Sistema de Inventario</h2>
            <p>El Dashboard completo se incorporará en el siguiente bloque del desarrollo.</p>
          </div>
        </div>
        <div className="user-card">
          <UserRound size={22} />
          <div>
            <strong>{usuario?.nombre}</strong>
            <span>{usuario?.correo} · {usuario?.rol?.nombre}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
