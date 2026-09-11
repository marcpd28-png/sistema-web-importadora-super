"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/admin/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction} style={{ margin: 0 }}>
      <button 
        type="submit"
        className="icon-button"
        style={{ color: "var(--brand-danger, #ef4444)", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", borderRadius: "6px" }}
        title="Cerrar sesión"
      >
        <LogOut size={18} />
      </button>
    </form>
  );
}
