import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { Search, MessageCircle, User } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContactosPage() {
  const contacts = await prisma.chatContact.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "24px" }}>Contactos</h1>
        <p style={{ margin: 0, color: "var(--text-muted)" }}>Listado de clientes que han interactuado por chat.</p>
      </div>

      <div style={{ background: "var(--surface-bg)", border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden" }}>
        <div style={{ padding: "16px", borderBottom: "1px solid var(--border-color)" }}>
          <div style={{ position: "relative", maxWidth: "300px" }}>
            <Search size={16} style={{ position: "absolute", left: "12px", top: "10px", color: "var(--text-muted)" }} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o número..." 
              style={{ width: "100%", padding: "8px 12px 8px 36px", border: "1px solid var(--border-color)", borderRadius: "6px", background: "var(--bg)", color: "var(--text)" }}
            />
          </div>
        </div>
        
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
            <thead style={{ background: "var(--bg-alt)", borderBottom: "1px solid var(--border-color)" }}>
              <tr>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Contacto</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Canal</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Última Interacción</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Etiquetas</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                      {c.name ? c.name.charAt(0).toUpperCase() : <User size={16} />}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: "var(--text)" }}>{c.name}</div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{c.phone || "Sin número"}</div>
                    </div>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <span style={{ padding: "4px 8px", background: "rgba(34, 197, 94, 0.1)", color: "#15803d", borderRadius: "999px", fontSize: "12px", fontWeight: 500 }}>
                      {c.channel || "WhatsApp"}
                    </span>
                  </td>
                  <td style={{ padding: "16px", color: "var(--text-muted)", fontSize: "14px" }}>
                    {format(c.updatedAt, "dd MMM yyyy, h:mm aaaa", { locale: es })}
                  </td>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {c.tags.length === 0 ? <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>Sin etiquetas</span> : 
                        c.tags.map(t => (
                          <span key={t} style={{ padding: "2px 6px", background: "var(--bg-alt)", border: "1px solid var(--border-color)", borderRadius: "4px", fontSize: "12px", color: "var(--text)" }}>{t}</span>
                        ))
                      }
                    </div>
                  </td>
                  <td style={{ padding: "16px", textAlign: "right" }}>
                    <Link href={`/admin/mensajes`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--primary)", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>
                      <MessageCircle size={16} /> Ver chat
                    </Link>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                    Aún no hay contactos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
