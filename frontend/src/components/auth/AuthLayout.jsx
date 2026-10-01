import { Globe2, Shield } from "lucide-react";
import AuthVisual from "./AuthVisual";
import { useLanguage } from "../../context/LanguageContext";

export default function AuthLayout({ children, variant = "login" }) {
  const { language, setLanguage, t } = useLanguage();
  const isRecovery = variant === "recovery";
  return (
    <main className={`login-page${isRecovery ? " recovery-page" : ""}`}>
      <AuthVisual variant={variant} />
      <section className={`login-form-panel${isRecovery ? " recovery-panel" : ""}`}>
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
          {!isRecovery && <>
            <div className="login-divider"><span>{t("or")}</span></div>
            <div className="restricted-access"><Shield size={24} aria-hidden="true" /><div><strong>{t("restricted")}</strong><p>{t("restrictedText")}</p></div></div>
          </>}
        </div>
        <footer className={`login-footer${isRecovery ? " recovery-footer" : ""}`}><p>{isRecovery ? t("footerRights") : "Living Water Guatemala"}</p>{!isRecovery && <p>{t("updated")}</p>}</footer>
      </section>
    </main>
  );
}
