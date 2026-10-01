import { Shield } from "lucide-react";
import AuthVisual from "./AuthVisual";
import { useLanguage } from "../../context/LanguageContext";

export default function AuthLayout({ children, variant = "login" }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <main className="login-page">
      <AuthVisual variant={variant} />
      <section className="login-form-panel">
        <div className="language-selector">
          <label htmlFor="auth-language" className="sr-only">{t("language")}</label>
          <select id="auth-language" value={language} onChange={event => setLanguage(event.target.value)}>
            <option value="es">{t("spanish")}</option>
            <option value="en">{t("english")}</option>
          </select>
        </div>
        <div className="login-form-container">
          {children}
          <div className="login-divider"><span>{t("or")}</span></div>
          <div className="restricted-access"><Shield size={24} aria-hidden="true" /><div><strong>{t("restricted")}</strong><p>{t("restrictedText")}</p></div></div>
        </div>
        <footer className="login-footer"><p>Living Water Guatemala</p><p>{t("updated")}</p></footer>
      </section>
    </main>
  );
}