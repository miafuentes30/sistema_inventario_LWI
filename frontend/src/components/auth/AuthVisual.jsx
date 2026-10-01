import loginImage from "../../assets/images/login-living-water.png";
import recoveryImage from "../../assets/images/Olvidastetucontraseña.png";
import logo from "../../assets/images/living-water-logo.png";
import { useLanguage } from "../../context/LanguageContext";
import { Droplet, Users, HeartHandshake } from "lucide-react";

export default function AuthVisual({ variant = "login" }) {
  const { t } = useLanguage();
  const image = variant === "recovery" ? recoveryImage : loginImage;
  return (
    <aside
      className={`auth-visual auth-visual-background${variant === "recovery" ? " auth-visual-recovery" : ""}`}
      style={{ backgroundImage: `url("${image}")` }}
      aria-label="Living Water Guatemala"
    >
      <div className="auth-visual-overlay" aria-hidden="true" />
      {variant === "recovery" ? <div className="recovery-visual-content">
        <div className="recovery-visual-brand"><img src={logo} alt="" /><div><strong>LIVING WATER</strong><span>Guatemala</span></div></div>
        <div className="recovery-quote">
          <div className="mission-line" aria-hidden="true" />
          <h2>{t("recoveryMissionLines").map(line => <span key={line}>{line}</span>)}</h2>
        </div>
        <div className="recovery-values">
          <div><Droplet aria-hidden="true" /><span>{t("service")}</span></div>
          <div><Users aria-hidden="true" /><span>{t("integrity")}</span></div>
          <div><HeartHandshake aria-hidden="true" /><span>{t("impact")}</span></div>
        </div>
      </div> : <div className="auth-visual-content">
        <div className="auth-brand"><img src={logo} alt="Living Water International" /><strong>Guatemala</strong></div>
        <div className="auth-mission">
          <h2>{t("missionLines").map(line => <span key={line}>{line}</span>)}</h2>
          <div className="mission-line" aria-hidden="true" />
          <p>{t("institutionLines").map(line => <span key={line}>{line}</span>)}</p>
        </div>
      </div>}
    </aside>
  );
}
