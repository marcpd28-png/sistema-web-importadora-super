const fs = require('fs');
let code = fs.readFileSync('src/components/admin/promo-form.tsx', 'utf8');

// We need to add a searchable combobox. First, import useRef, useEffect if needed
if(!code.includes('useRef')) {
  code = code.replace(/import { useState } from "react";/, 'import { useState, useRef, useEffect } from "react";');
}

const targetRegex = /<select name="creatorId"[\s\S]*?<\/select>/m;

const replacement = `<PromotorCombobox promoters={promoters} defaultValue={promo?.creatorId || ""} />`;

if (targetRegex.test(code)) {
  code = code.replace(targetRegex, replacement);
  
  // Add PromotorCombobox component at the end of the file
  if (!code.includes('PromotorCombobox')) {
    const comboboxComponent = `
function PromotorCombobox({ promoters, defaultValue }: { promoters: any[], defaultValue: string }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedPromotor = promoters.find(p => p.id === selectedId);
  const filteredPromoters = promoters.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <input type="hidden" name="creatorId" value={selectedId} />
      
      <div 
        onClick={() => setOpen(!open)}
        style={{
          padding: "8px 12px",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <span style={{ color: selectedId ? "inherit" : "#9ca3af" }}>
          {selectedId ? \`\${selectedPromotor?.name} (\${selectedPromotor?.email})\` : "-- Buscar y seleccionar promotor --"}
        </span>
        <span style={{ fontSize: "12px" }}>▼</span>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#fff", border: "1px solid var(--border)",
          borderRadius: "8px", marginTop: "4px", zIndex: 50,
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          maxHeight: "250px", display: "flex", flexDirection: "column"
        }}>
          <div style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
            <input
              type="text"
              placeholder="Buscar por nombre o correo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", padding: "6px 10px", fontSize: "14px" }}
            />
          </div>
          <div style={{ overflowY: "auto", padding: "4px" }}>
            <div 
              onClick={() => { setSelectedId(""); setOpen(false); setSearch(""); }}
              style={{
                padding: "8px 12px", cursor: "pointer", borderRadius: "4px",
                background: selectedId === "" ? "#f3f4f6" : "transparent"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
              onMouseLeave={(e) => (e.currentTarget.style.background = selectedId === "" ? "#f3f4f6" : "transparent")}
            >
              -- Sin asignar --
            </div>
            {filteredPromoters.length === 0 ? (
              <div style={{ padding: "8px 12px", color: "#6b7280", textAlign: "center" }}>No se encontraron usuarios</div>
            ) : (
              filteredPromoters.map((p) => (
                <div
                  key={p.id}
                  onClick={() => { setSelectedId(p.id); setOpen(false); setSearch(""); }}
                  style={{
                    padding: "8px 12px", cursor: "pointer", borderRadius: "4px",
                    background: selectedId === p.id ? "#f3f4f6" : "transparent"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = selectedId === p.id ? "#f3f4f6" : "transparent")}
                >
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>{p.email}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
`;
    code = code + '\n' + comboboxComponent;
  }
  fs.writeFileSync('src/components/admin/promo-form.tsx', code);
  console.log('Combobox injected successfully');
} else {
  console.log('Target regex not found in promo-form.tsx');
}
