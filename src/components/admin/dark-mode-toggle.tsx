"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = localStorage.getItem("admin-theme");
      if (saved === "dark") {
        setIsDark(true);
        document.body.setAttribute("data-admin-theme", "dark");
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggle = () => {
    const val = !isDark;
    setIsDark(val);
    if (val) {
      document.body.setAttribute("data-admin-theme", "dark");
      localStorage.setItem("admin-theme", "dark");
    } else {
      document.body.removeAttribute("data-admin-theme");
      localStorage.setItem("admin-theme", "light");
    }
  };

  return (
    <button 
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      aria-pressed={isDark}
      onClick={toggle}
      className="icon-button admin-shell-icon-button"
      title={isDark ? "Modo Claro" : "Modo Nocturno"}
      type="button"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
