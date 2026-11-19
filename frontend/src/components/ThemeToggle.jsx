import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const label = t(theme === "dark" ? "themeUseLight" : "themeUseDark");
  return <button type="button" className="theme-toggle" title={label} aria-label={label}
    aria-pressed={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
    {theme === "dark" ? <Sun size={21} aria-hidden="true" /> : <Moon size={21} aria-hidden="true" />}
  </button>;
}
