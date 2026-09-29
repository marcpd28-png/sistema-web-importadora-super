"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = localStorage.getItem("admin-sidebar-collapsed");
      if (saved === "true") {
        setCollapsed(true);
        document.body.classList.add("admin-sidebar-collapsed");
      }
    });

    return () => window.cancelAnimationFrame(frame);
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

  return (
    <button 
      aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
      aria-pressed={collapsed}
      onClick={toggle}
      className="icon-button admin-shell-icon-button"
      title={collapsed ? "Expandir menú" : "Colapsar menú"}
      type="button"
    >
      {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
    </button>
  );
}
