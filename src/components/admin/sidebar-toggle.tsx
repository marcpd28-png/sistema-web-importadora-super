"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("admin-sidebar-collapsed");
    if (saved === "true") {
      setCollapsed(true);
      document.body.classList.add("admin-sidebar-collapsed");
    }
  }, []);

  const toggle = () => {
    const val = !collapsed;
    setCollapsed(val);
    localStorage.setItem("admin-sidebar-collapsed", String(val));
    if (val) {
      document.body.classList.add("admin-sidebar-collapsed");
    } else {
      document.body.classList.remove("admin-sidebar-collapsed");
    }
  };

  if (!mounted) return <div style={{ height: "40px", marginTop: "auto" }} />;

  return (
    <button 
      onClick={toggle}
      className="button button-ghost"
      style={{ 
        width: "100%", 
        justifyContent: collapsed ? "center" : "flex-start", 
        marginTop: "auto", 
        color: "var(--muted)",
        gap: "10px",
        padding: collapsed ? "0" : "0 1rem"
      }}
      title={collapsed ? "Expandir menú" : "Colapsar menú"}
    >
      {collapsed ? <ChevronRight size={20} /> : <><ChevronLeft size={18} /> <span>Colapsar menú</span></>}
    </button>
  );
}
