import { Globe2, Shield } from "lucide-react";
import AuthVisual from "./AuthVisual";
import { useLanguage } from "../../context/LanguageContext";

export default function AuthLayout({ children, variant = "login" }) {
  const { language, setLanguage, t } = useLanguage();
  return (
    <main className="login-page">
      <AuthVisual variant={variant} />
      <section className="login-form-panel">
        <div className="language-selector">
          <Globe2 className="language-icon" size={20} aria-hidden="true" />
          <span className="language-label">{t("language")}</span>
          <div className="language-options" role="group" aria-label={t("language")}>
            <button type="button" className={language === "es" ? "language-option is-active" : "language-option"} onClick={() => setLanguage("es")} aria-label={t("spanish")} aria-pressed={language === "es"}>
              <span className="language-code" aria-hidden="true">ES</span>{t("spanish")}
            </button>
            <button type="button" className={language === "en" ? "language-option is-active" : "language-option"} onClick={() => setLanguage("en")} aria-label={t("english")} aria-pressed={language === "en"}>
              <span className="language-code" aria-hidden="true">EN</span>{t("english")}
            </button>
          </div>
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
