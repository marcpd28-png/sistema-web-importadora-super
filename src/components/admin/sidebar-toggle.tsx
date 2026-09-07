"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
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

  if (!mounted) return <div style={{ width: "36px", height: "36px" }} />;

  return (
    <button 
      onClick={toggle}
      className="icon-button"
      style={{ color: "var(--muted)", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center" }}
      title={collapsed ? "Expandir menú" : "Colapsar menú"}
    >
      {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
    </button>
  );
}
