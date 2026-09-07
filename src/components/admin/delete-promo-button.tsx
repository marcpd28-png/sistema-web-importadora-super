"use client";

import { Trash2 } from "lucide-react";

export function DeletePromoButton({ action }: { action: any }) {
  return (
    <form action={action}>
      <button 
        className="icon-button danger" 
        type="submit" 
        onClick={(e) => {
          if(!confirm("¿Seguro de eliminar este cupón?")) {
            e.preventDefault();
          }
        }}
      >
        <Trash2 size={16} />
      </button>
    </form>
  );
}
