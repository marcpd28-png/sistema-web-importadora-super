"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("admin-theme");
    if (saved === "dark") {
      setIsDark(true);
      document.body.setAttribute("data-admin-theme", "dark");
    }
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

  if (!mounted) return <div style={{ width: "36px", height: "36px" }} />;

  return (
    <button 
      onClick={toggle}
      className="icon-button"
      style={{ color: "var(--muted)", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", borderRadius: "6px" }}
      title={isDark ? "Modo Claro" : "Modo Nocturno"}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
