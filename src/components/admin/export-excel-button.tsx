"use client";

import { Download } from "lucide-react";
import * as XLSX from "xlsx";

type ExportExcelButtonProps = {
  data: any[];
  filename?: string;
  label?: string;
};

export function ExportExcelButton({ data, filename = "Reporte.xlsx", label = "Exportar a Excel" }: ExportExcelButtonProps) {
  const handleExport = () => {
    // Si la data está vacía, no hacemos nada
    if (data.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");

    XLSX.writeFile(workbook, filename);
  };

  return (
    <button className="button button-outline" onClick={handleExport} style={{ height: "36px" }}>
      <Download size={16} />
      <span>{label}</span>
    </button>
  );
}
