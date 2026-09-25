"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
      const saved = localStorage.getItem("admin-sidebar-collapsed");
      if (saved === "true") {
        setCollapsed(true);
        document.body.classList.add("admin-sidebar-collapsed");
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove("admin-sidebar-collapsed");
    };
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
      aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
      aria-pressed={collapsed}
      onClick={toggle}
      className="icon-button admin-shell-icon-button admin-desktop-sidebar-toggle"
      title={collapsed ? "Expandir menú" : "Colapsar menú"}
      type="button"
    >
      {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
    </button>
  );
}
