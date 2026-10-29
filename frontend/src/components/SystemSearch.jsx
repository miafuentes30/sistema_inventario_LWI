import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";

const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export default function SystemSearch({
  items,
  language,
  value,
  onChange,
  onNavigate,
}) {
  const es = language !== "en";
  const input = useRef(null);
  const wrapper = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const label = (item) => language === "fr" && item.fr ? item.fr : (es ? item.es : item.en);
  const results = items.filter((item) =>
    normalize(label(item)).includes(normalize(value)),
  );
  useEffect(() => {
    const outside = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    const shortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", shortcut);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", shortcut);
    };
  }, []);
  const choose = (item) => {
    setOpen(false);
    onNavigate(item.key);
    input.current?.blur();
  };
  const expanded = open;
  return (
    <div
      className="system-search"
      ref={wrapper}
      role="search"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className={`system-search-field ${expanded ? "is-open" : ""}`}>
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-label={es ? "Buscar en el sistema" : "Search system"}
          aria-expanded={expanded}
          aria-controls="system-search-options"
          aria-autocomplete="list"
          aria-activedescendant={
            expanded && results[active]
              ? `system-option-${results[active].key}`
              : undefined
          }
          placeholder={es ? "Buscar una sección…" : "Search a section…"}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                results.length
                  ? (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      results.length) %
                    results.length
                  : 0,
              );
            }
            if (event.key === "Enter" && expanded && results[active]) {
              event.preventDefault();
              choose(results[active]);
            }
            if (event.key === "Tab") setOpen(false);
          }}
        />
        {value ? (
          <button
            type="button"
            className="system-search-clear"
            aria-label={es ? "Limpiar búsqueda" : "Clear search"}
            onClick={() => {
              onChange("");
              setActive(0);
              input.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        ) : (
          <kbd aria-hidden="true">Ctrl K</kbd>
        )}
      </div>
      {expanded && (
        <div className="system-search-popover">
          <div className="system-search-caption">
            {value
              ? es
                ? "Resultados"
                : "Results"
              : es
                ? "Ir a una sección"
                : "Go to a section"}
            <span>{results.length}</span>
          </div>
          <div
            id="system-search-options"
            role="listbox"
            aria-label={es ? "Secciones del sistema" : "System sections"}
          >
            {results.length ? (
              results.map((item, index) => (
                <button
                  id={`system-option-${item.key}`}
                  role="option"
                  aria-selected={index === active}
                  tabIndex={-1}
                  key={item.key}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  <span className="system-search-result-icon">
                    <item.icon size={18} />
                  </span>
                  <span>{label(item)}</span>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <div className="system-search-empty" role="status">
                <Search size={23} />
                <strong>
                  {es ? "No encontramos esa sección" : "No matching sections"}
                </strong>
                <span>
                  {es ? "Prueba con otro nombre." : "Try another name."}
                </span>
              </div>
            )}
          </div>
          <div className="system-search-help">
            {es
              ? "↑ ↓ para explorar · Enter para abrir · Esc para cerrar"
              : "↑ ↓ to browse · Enter to open · Esc to close"}
          </div>
        </div>
      )}
    </div>
  );
}
