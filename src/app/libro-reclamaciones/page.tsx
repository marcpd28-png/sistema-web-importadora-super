"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  FileText,
  HelpCircle,
  UploadCloud,
  X,
  AlertTriangle,
  Info,
  ShieldCheck,
  Download,
  Printer,
  Home,
  Check,
  CalendarClock,
  Search,
  Scale,
  Mail,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

const DEPARTMENTS = [
  "Lima", "Arequipa", "La Libertad", "Piura", "Cajamarca", "Cusco", "Junín",
  "Lambayeque", "Puno", "Ancash", "Loreto", "Ica", "Callao", "San Martín",
  "Huánuco", "Ayacucho", "Ucayali", "Apurímac", "Amazonas", "Tacna", "Pasco",
  "Huancavelica", "Madre de Dios", "Moquegua", "Tumbes"
];

const REASONS = [
  "Producto defectuoso o dañado",
  "Demora en la entrega del producto",
  "Cobro o monto de facturación incorrecto",
  "Mala calidad del servicio post-venta",
  "Atención al cliente deficiente",
  "Publicidad engañosa o información incompleta",
  "Problemas con la garantía",
  "Otro motivo específico"
];

export default function LibroReclamacionesPage() {
  const [step, setStep] = useState(0); // 0: Acceso, 1: Consumidor, 2: Compra, 3: Reclamo/Queja, 4: Adjuntos, 5: Declaraciones, 6: Confirmación
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Estado del Formulario
  const [formData, setFormData] = useState({
    type: "RECLAMO" as "RECLAMO" | "QUEJA",
    documentType: "DNI",
    documentNumber: "",
    names: "",
    lastNames: "",
    email: "",
    phone: "",
    address: "",
    department: "Lima",
    province: "Lima",
    district: "",
    isMinor: false,
    repNames: "",
    repDocumentType: "DNI",
    repDocumentNumber: "",
    isPurchaseRelated: false,
    orderNumber: "",
    invoiceNumber: "",
    purchaseDate: "",
    productName: "",
    productBrand: "",
    productModel: "",
    productSku: "",
    productSerial: "",
    purchaseAmount: "",
    purchaseChannel: "Página web",
    paymentMethod: "Transferencia bancaria",
    reason: REASONS[0],
    subReason: "",
    facts: "",
    request: "",
    attachments: [] as string[],
    acceptDeclaration: false,
    acceptNotifications: false,
    acceptPrivacy: false,
  });

  // Estado de Archivos Cargados
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: number; url: string }>>([]);
  const [uploading, setUploading] = useState(false);

  // Registro de éxito
  const [successData, setSuccessData] = useState<{
    sheetNumber: string;
    createdAt: string;
    expiryDate: string;
  } | null>(null);

  // Estado para modales de información legal
  const [activeLegalModal, setActiveLegalModal] = useState<number | null>(null);

  // Estado para alertas personalizadas
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedList = [...uploadedFiles];
    const newAttachments = [...formData.attachments];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        setAlertMessage(`El archivo ${file.name} supera el límite de 10MB.`);
        continue;
      }

      const body = new FormData();
      body.append("file", file);

      try {
        const res = await fetch("/api/complaints/uploads", {
          method: "POST",
          body,
        });
        const data = await res.json();
        if (data.ok) {
          uploadedList.push({ name: file.name, size: file.size, url: data.url });
          newAttachments.push(data.url);
        } else {
          setAlertMessage(`Error al subir ${file.name}: ${data.message}`);
        }
      } catch (err) {
        console.error(err);
        setAlertMessage(`Error al conectar para subir ${file.name}`);
      }
    }

    setUploadedFiles(uploadedList);
    setFormData((prev) => ({ ...prev, attachments: newAttachments }));
    setUploading(false);
  };

  const removeUploadedFile = (index: number) => {
    const file = uploadedFiles[index];
    const uploadedList = uploadedFiles.filter((_, i) => i !== index);
    const newAttachments = formData.attachments.filter((url) => url !== file.url);
    setUploadedFiles(uploadedList);
    setFormData((prev) => ({ ...prev, attachments: newAttachments }));
  };

  const validateStep = () => {
    if (step === 1) {
      if (!formData.names || !formData.lastNames || !formData.documentNumber || !formData.email || !formData.phone || !formData.address || !formData.district) {
        setAlertMessage("Por favor completa todos los campos personales obligatorios.");
        return false;
      }
      if (formData.isMinor && (!formData.repNames || !formData.repDocumentNumber)) {
        setAlertMessage("Por favor completa los datos del representante legal.");
        return false;
      }
    }
    if (step === 2 && formData.isPurchaseRelated) {
      if (!formData.productName) {
        setAlertMessage("Por favor indica el nombre del producto o servicio contratado.");
        return false;
      }
    }
    if (step === 3) {
      if (!formData.facts || formData.facts.length < 10) {
        setAlertMessage("Por favor describe el detalle de los hechos (mínimo 10 caracteres).");
        return false;
      }
      if (!formData.request || formData.request.length < 5) {
        setAlertMessage("Por favor indica el pedido concreto del consumidor (mínimo 5 caracteres).");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    if (!formData.acceptDeclaration || !formData.acceptNotifications || !formData.acceptPrivacy) {
      setAlertMessage("Debes aceptar todas las declaraciones de ley para enviar el reclamo.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (response.ok && result.ok) {
        setSuccessData({
          sheetNumber: result.sheetNumber,
          createdAt: result.createdAt,
          expiryDate: result.expiryDate,
        });
        setStep(6); // Ir a confirmación
      } else {
        setSubmitError(result.message || "Ocurrió un error al registrar el reclamo.");
      }
    } catch (err) {
      console.error(err);
      setSubmitError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="complaints-layout-shell">
      {/* Estilos Propios de la Página - Encapsulados */}
      <style dangerouslySetInnerHTML={{ __html: `
        .complaints-layout-shell {
          background-color: #f7f9fc;
          min-height: 100vh;
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          display: flex;
          flex-direction: column;
        }
        .complaints-topbar-wrapper {
          background: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          padding: 12px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .complaints-container {
          max-width: 960px;
          margin: 40px auto;
          width: 100%;
          padding: 0 20px;
          flex-grow: 1;
        }
        .complaints-stepper {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          background: #ffffff;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
          overflow-x: auto;
          gap: 12px;
        }
        .complaints-stepper-step {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #94a3b8;
          white-space: nowrap;
        }
        .complaints-stepper-step.is-active {
          color: #2320da;
        }
        .complaints-stepper-step.is-completed {
          color: #10b981;
        }
        .complaints-stepper-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          border: 2px solid #e2e8f0;
          color: #64748b;
        }
        .complaints-stepper-step.is-active .complaints-stepper-circle {
          background: #2320da;
          color: #ffffff;
          border-color: #2320da;
        }
        .complaints-stepper-step.is-completed .complaints-stepper-circle {
          background: #10b981;
          color: #ffffff;
          border-color: #10b981;
        }
        .complaints-card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.04);
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }
        .complaints-card-header {
          padding: 24px 32px;
          background: #fafbfc;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .complaints-card-header h2 {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .complaints-card-body {
          padding: 32px;
        }
        .complaints-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .complaints-grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-group label {
          font-size: 13px;
          font-weight: 600;
          color: #475569;
        }
        .field-group input, .field-group select, .field-group textarea {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          background: #ffffff;
          transition: border-color 0.2s;
        }
        .field-group input:focus, .field-group select:focus, .field-group textarea:focus {
          border-color: #2320da;
        }
        .field-checkbox {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: #faf5ff;
          border: 1px solid #f3e8ff;
          padding: 16px;
          border-radius: 12px;
          margin-top: 10px;
        }
        .field-checkbox input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #2320da;
          margin-top: 2px;
        }
        .field-checkbox-label {
          display: flex;
          flex-direction: column;
        }
        .field-checkbox-label strong {
          font-size: 14px;
          color: #0f172a;
        }
        .field-checkbox-label p {
          font-size: 12px;
          color: #64748b;
          margin: 4px 0 0 0;
        }
        .complaints-type-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        .complaints-type-card {
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }
        .complaints-type-card.is-selected {
          border-color: #2320da;
          background-color: #f5f4ff;
        }
        .complaints-type-card input[type="radio"] {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 18px;
          height: 18px;
          accent-color: #2320da;
        }
        .complaints-type-card strong {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          display: block;
          margin-bottom: 8px;
        }
        .complaints-type-card p {
          font-size: 13px;
          color: #64748b;
          margin: 0;
          line-height: 1.5;
        }
        .complaints-drag-drop {
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          background: #f8fafc;
          cursor: pointer;
          transition: background 0.2s;
          position: relative;
        }
        .complaints-drag-drop:hover {
          background: #f1f5f9;
        }
        .complaints-drag-drop input[type="file"] {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }
        .uploaded-files-list {
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .uploaded-file-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f1f5f9;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 13px;
        }
        .legal-declaration-box {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: #fafbfc;
          border: 1px solid #cbd5e1;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          position: relative;
          padding-right: 48px;
        }
        .legal-declaration-lupita {
          position: absolute;
          top: 14px;
          right: 14px;
          background: transparent;
          border: none;
          color: #2320da;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .legal-declaration-lupita:hover {
          background: #e0e7ff;
          color: #1d4ed8;
          transform: scale(1.1);
        }
        .legal-declaration-box input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #2320da;
          margin-top: 3px;
        }
        .legal-declaration-box p {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: #334155;
        }
        .complaints-footer {
          margin-top: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .complaints-footer .right-actions {
          display: flex;
          gap: 12px;
        }
        .button {
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          border: none;
        }
        .button-primary {
          background: #2320da;
          color: #ffffff;
        }
        .button-primary:hover {
          background: #1d1ab8;
        }
        .button-secondary {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #cbd5e1;
        }
        .button-secondary:hover {
          background: #f8fafc;
        }
        .complaints-welcome-banner {
          background: linear-gradient(135deg, #2320da 0%, #1d1ab8 100%);
          color: #ffffff;
          border-radius: 16px;
          padding: 48px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(35,32,218,0.15);
        }
        .complaints-welcome-banner h1 {
          font-size: 32px;
          font-weight: 800;
          margin-bottom: 16px;
        }
        .complaints-welcome-banner p {
          font-size: 16px;
          opacity: 0.9;
          max-width: 600px;
          margin: 0 auto 30px auto;
          line-height: 1.6;
        }
        .welcome-legal-badges {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-top: 40px;
          flex-wrap: wrap;
        }
        .welcome-legal-badge {
          background: rgba(255, 255, 255, 0.15);
          padding: 12px 20px;
          border-radius: 30px;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          backdrop-filter: blur(4px);
        }
        .success-page-card {
          text-align: center;
          padding: 40px;
        }
        .success-check-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #ecfdf5;
          color: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px auto;
        }
        .success-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          max-width: 600px;
          margin: 24px auto;
          text-align: left;
        }
        @media (max-width: 640px) {
          .success-info-grid {
            grid-template-columns: 1fr;
          }
        }
        .success-info-box {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .success-info-box span {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          margin-bottom: 8px;
          display: block;
          letter-spacing: 0.05em;
        }
        .success-info-box strong {
          font-size: 20px;
          font-weight: 800;
          color: #0f172a;
        }
        .success-info-box-sub {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          padding: 8px 0;
        }
        .success-info-box-sub:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .success-info-box-sub:first-child {
          padding-top: 0;
        }
        .success-info-box-sub span {
          margin-bottom: 0;
          font-weight: 600;
        }
        .success-info-box-sub strong {
          font-size: 14px;
          font-weight: 700;
        }
        .success-email-notice {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          border-radius: 8px;
          padding: 12px 16px;
          max-width: 600px;
          margin: 0 auto 30px auto;
          text-align: left;
          font-size: 13px;
          font-weight: 500;
        }
        
        .print-only-section {
          display: none;
        }
        
        /* Estilos de Impresión de Hoja Oficial INDECOPI */
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only-section {
            display: block !important;
          }
          /* Reset parent flex and centering layouts */
          .complaints-layout-shell,
          .complaints-container {
            display: block !important;
            position: static !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
            height: auto !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
          }
          #print-area {
            display: block !important;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 20px !important;
            font-size: 11px !important;
            width: 100% !important;
            max-width: 100% !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
          }
          #print-area table {
            width: 100% !important;
            border-collapse: collapse !important;
            margin-bottom: 12px !important;
          }
          #print-area td, #print-area th {
            border: 1px solid #000000 !important;
            padding: 6px 8px !important;
            text-align: left !important;
            vertical-align: middle !important;
            font-size: 10px !important;
          }
          #print-area h4 {
            font-size: 11px !important;
            margin: 10px 0 5px 0 !important;
            background: #f1f5f9 !important;
            padding: 5px 8px !important;
            border: 1px solid #000000 !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
          }
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }

        /* Estilos del Modal Legal */
        .legal-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
        }
        .legal-modal-content {
          background: #ffffff;
          border-radius: 16px;
          width: 100%;
          max-width: 550px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: modalAppear 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modalAppear {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .legal-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          background: #f1f5f9;
          border: none;
          color: #475569;
          cursor: pointer;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .legal-modal-close:hover {
          background: #e2e8f0;
          color: #0f172a;
          transform: rotate(90deg);
        }
        .legal-modal-header {
          padding: 24px 24px 16px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        .legal-modal-header h2 {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .legal-modal-body {
          padding: 24px;
          max-height: 60vh;
          overflow-y: auto;
          font-size: 13.5px;
          line-height: 1.6;
          color: #334155;
        }
        .legal-modal-body hr {
          border: 0;
          border-top: 1px solid #f1f5f9;
          margin: 16px 0;
        }
        .legal-modal-body ul {
          margin: 16px 0 0 0;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .legal-modal-body li {
          font-size: 13px;
          color: #475569;
        }
        .legal-modal-footer {
          padding: 16px 24px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          display: flex;
          justify-content: flex-end;
        }
      ` }} />

      {/* Barra de Navegación Superior */}
      <header className="complaints-topbar-wrapper no-print">
        <BrandLogo href="/" size="sm" />
        <Link className="button button-secondary" href="/">
          <ArrowLeft size={16} />
          Volver a la tienda
        </Link>
      </header>

      <div className="complaints-container">
        {/* Paso 0: Bienvenida / Entrada */}
        {step === 0 && (
          <div className="complaints-welcome-banner no-print">
            <BookOpenText size={48} style={{ margin: "0 auto 20px auto" }} />
            <h1>Libro de Reclamaciones Virtual</h1>
            <p>
              Conforme a lo establecido en el Código de Protección y Defensa del Consumidor,
              ponemos a tu disposición esta plataforma virtual para registrar quejas o reclamos
              relacionados con nuestros productos y servicios.
            </p>
            <button className="button button-primary" onClick={() => setStep(1)} style={{ backgroundColor: "#fbbf24", color: "#1e293b", fontSize: "16px", padding: "12px 28px" }}>
              Ingresar al Libro de Reclamaciones
              <ArrowRight size={18} />
            </button>

            <div className="welcome-legal-badges">
              <span className="welcome-legal-badge">
                <Info size={16} />
                Fácil y rápido
              </span>
              <span className="welcome-legal-badge">
                <ShieldCheck size={16} />
                100% Seguro
              </span>
              <span className="welcome-legal-badge">
                <CalendarClock size={16} />
                Respuesta en 15 días hábiles
              </span>
            </div>
          </div>
        )}

        {/* Pasos de Formulario (1 al 5) */}
        {step > 0 && step < 6 && (
          <>
            {/* Stepper Visual */}
            <div className="complaints-stepper no-print">
              <div className={`complaints-stepper-step ${step === 1 ? "is-active" : ""} ${step > 1 ? "is-completed" : ""}`}>
                <span className="complaints-stepper-circle">{step > 1 ? <Check size={12} /> : "1"}</span>
                Consumidor
              </div>
              <div className={`complaints-stepper-step ${step === 2 ? "is-active" : ""} ${step > 2 ? "is-completed" : ""}`}>
                <span className="complaints-stepper-circle">{step > 2 ? <Check size={12} /> : "2"}</span>
                Compra
              </div>
              <div className={`complaints-stepper-step ${step === 3 ? "is-active" : ""} ${step > 3 ? "is-completed" : ""}`}>
                <span className="complaints-stepper-circle">{step > 3 ? <Check size={12} /> : "3"}</span>
                Reclamo / Queja
              </div>
              <div className={`complaints-stepper-step ${step === 4 ? "is-active" : ""} ${step > 4 ? "is-completed" : ""}`}>
                <span className="complaints-stepper-circle">{step > 4 ? <Check size={12} /> : "4"}</span>
                Adjuntos
              </div>
              <div className={`complaints-stepper-step ${step === 5 ? "is-active" : ""} ${step > 5 ? "is-completed" : ""}`}>
                <span className="complaints-stepper-circle">{step > 5 ? <Check size={12} /> : "5"}</span>
                Declaraciones
              </div>
            </div>

            {/* Tarjeta de Formulario Principal */}
            <div className="complaints-card no-print">
              <div className="complaints-card-header">
                <h2>
                  {step === 1 && "Datos Personales del Consumidor"}
                  {step === 2 && "Información del Bien Contratado (Compra)"}
                  {step === 3 && "Detalle del Reclamo o Queja"}
                  {step === 4 && "Documentos Adjuntos de Sustento"}
                  {step === 5 && "Declaraciones de Conformidad y Ley"}
                </h2>
                <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Paso {step} de 5</span>
              </div>

              <div className="complaints-card-body">
                {/* Paso 1: Datos Consumidor */}
                {step === 1 && (
                  <div className="stack-md">
                    <div className="complaints-grid-2">
                      <div className="field-group">
                        <label>Tipo de documento *</label>
                        <select name="documentType" value={formData.documentType} onChange={handleInputChange}>
                          <option value="DNI">DNI (Persona Natural)</option>
                          <option value="CE">Carnet de Extranjería</option>
                          <option value="RUC">RUC (Empresa/Persona Jurídica)</option>
                          <option value="PASAPORTE">Pasaporte</option>
                        </select>
                      </div>
                      <div className="field-group">
                        <label>Número de documento *</label>
                        <input name="documentNumber" type="text" placeholder="Ej: 12345678" value={formData.documentNumber} onChange={handleInputChange} required />
                      </div>
                    </div>

                    <div className="complaints-grid-2">
                      <div className="field-group">
                        <label>Nombres *</label>
                        <input name="names" type="text" placeholder="Ej: Juan Carlos" value={formData.names} onChange={handleInputChange} required />
                      </div>
                      <div className="field-group">
                        <label>Apellidos *</label>
                        <input name="lastNames" type="text" placeholder="Ej: Pérez García" value={formData.lastNames} onChange={handleInputChange} required />
                      </div>
                    </div>

                    <div className="complaints-grid-2">
                      <div className="field-group">
                        <label>Correo electrónico *</label>
                        <input name="email" type="email" placeholder="Ej: juanperez@gmail.com" value={formData.email} onChange={handleInputChange} required />
                      </div>
                      <div className="field-group">
                        <label>Teléfono o Celular *</label>
                        <input name="phone" type="tel" placeholder="Ej: 987 654 321" value={formData.phone} onChange={handleInputChange} required />
                      </div>
                    </div>

                    <div className="field-group" style={{ marginBottom: "20px" }}>
                      <label>Domicilio (Dirección Completa) *</label>
                      <input name="address" type="text" placeholder="Ej: Av. Los Próceres 1234, Dpto 101" value={formData.address} onChange={handleInputChange} required />
                    </div>

                    <div className="complaints-grid-3">
                      <div className="field-group">
                        <label>Departamento *</label>
                        <select name="department" value={formData.department} onChange={handleInputChange}>
                          {DEPARTMENTS.map((dept) => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field-group">
                        <label>Provincia *</label>
                        <input name="province" type="text" value={formData.province} onChange={handleInputChange} required />
                      </div>
                      <div className="field-group">
                        <label>Distrito *</label>
                        <input name="district" type="text" placeholder="Ej: San Isidro" value={formData.district} onChange={handleInputChange} required />
                      </div>
                    </div>

                    {/* Checkbox Menor de Edad */}
                    <div className="field-checkbox">
                      <input name="isMinor" type="checkbox" checked={formData.isMinor} onChange={handleInputChange} id="isMinor" />
                      <div className="field-checkbox-label">
                        <label htmlFor="isMinor"><strong>¿El consumidor es menor de edad?</strong></label>
                        <p>Si eres menor de edad, de acuerdo a INDECOPI, requerimos completar los datos de tu padre, madre o representante legal.</p>
                      </div>
                    </div>

                    {/* Datos del Representante */}
                    {formData.isMinor && (
                      <div className="stack-md" style={{ marginTop: "20px", padding: "20px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#1e293b", fontWeight: 700 }}>Datos del Representante Legal</h4>
                        <div className="field-group" style={{ marginBottom: "16px" }}>
                          <label>Nombres y Apellidos del Representante *</label>
                          <input name="repNames" type="text" placeholder="Ej: Carlos Pérez Martínez" value={formData.repNames} onChange={handleInputChange} required />
                        </div>
                        <div className="complaints-grid-2">
                          <div className="field-group">
                            <label>Tipo de Documento *</label>
                            <select name="repDocumentType" value={formData.repDocumentType} onChange={handleInputChange}>
                              <option value="DNI">DNI</option>
                              <option value="CE">Carnet de Extranjería</option>
                              <option value="PASAPORTE">Pasaporte</option>
                            </select>
                          </div>
                          <div className="field-group">
                            <label>Número de Documento del Representante *</label>
                            <input name="repDocumentNumber" type="text" placeholder="Ej: 08765432" value={formData.repDocumentNumber} onChange={handleInputChange} required />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Paso 2: Datos Compra */}
                {step === 2 && (
                  <div className="stack-md">
                    <div className="field-checkbox" style={{ marginBottom: "24px" }}>
                      <input name="isPurchaseRelated" type="checkbox" checked={formData.isPurchaseRelated} onChange={handleInputChange} id="isPurchaseRelated" />
                      <div className="field-checkbox-label">
                        <label htmlFor="isPurchaseRelated"><strong>¿La reclamación está relacionada con una compra o pedido?</strong></label>
                        <p>Habilita esta opción si tienes datos de boleta/factura o el código de tu pedido para facilitar el seguimiento.</p>
                      </div>
                    </div>

                    {formData.isPurchaseRelated && (
                      <div className="stack-md">
                        <div className="complaints-grid-3">
                          <div className="field-group">
                            <label>Número de pedido</label>
                            <input name="orderNumber" type="text" placeholder="Ej: TVS-00012345" value={formData.orderNumber} onChange={handleInputChange} />
                          </div>
                          <div className="field-group">
                            <label>Boleta / Factura</label>
                            <input name="invoiceNumber" type="text" placeholder="Ej: B001-00012345" value={formData.invoiceNumber} onChange={handleInputChange} />
                          </div>
                          <div className="field-group">
                            <label>Fecha de compra</label>
                            <input name="purchaseDate" type="date" value={formData.purchaseDate} onChange={handleInputChange} />
                          </div>
                        </div>

                        <div className="complaints-grid-3">
                          <div className="field-group">
                            <label>Producto o Servicio *</label>
                            <input name="productName" type="text" placeholder="Ej: Xiaomi TV Stick 4K" value={formData.productName} onChange={handleInputChange} required />
                          </div>
                          <div className="field-group">
                            <label>Marca</label>
                            <input name="productBrand" type="text" placeholder="Ej: Xiaomi" value={formData.productBrand} onChange={handleInputChange} />
                          </div>
                          <div className="field-group">
                            <label>Modelo</label>
                            <input name="productModel" type="text" placeholder="Ej: MDZ-27-AA" value={formData.productModel} onChange={handleInputChange} />
                          </div>
                        </div>

                        <div className="complaints-grid-3">
                          <div className="field-group">
                            <label>Código / SKU</label>
                            <input name="productSku" type="text" placeholder="Ej: SKU-O570" value={formData.productSku} onChange={handleInputChange} />
                          </div>
                          <div className="field-group">
                            <label>N° de Serie / IMEI</label>
                            <input name="productSerial" type="text" placeholder="Ej: SN123456789" value={formData.productSerial} onChange={handleInputChange} />
                          </div>
                          <div className="field-group">
                            <label>Monto de compra (S/)</label>
                            <input name="purchaseAmount" type="number" step="0.01" placeholder="Ej: 239.00" value={formData.purchaseAmount} onChange={handleInputChange} />
                          </div>
                        </div>

                        <div className="complaints-grid-2">
                          <div className="field-group">
                            <label>Medio de compra</label>
                            <select name="purchaseChannel" value={formData.purchaseChannel} onChange={handleInputChange}>
                              <option value="Página web">Página web de la tienda</option>
                              <option value="WhatsApp">WhatsApp</option>
                              <option value="Tienda física">Tienda física / Local</option>
                              <option value="Otro">Otro medio</option>
                            </select>
                          </div>
                          <div className="field-group">
                            <label>Medio de pago</label>
                            <select name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange}>
                              <option value="Transferencia bancaria">Transferencia bancaria</option>
                              <option value="Pago contra entrega">Pago contra entrega / Efectivo</option>
                              <option value="Tarjeta de crédito/débito">Tarjeta de crédito/débito</option>
                              <option value="Yape / Plin">Yape / Plin</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Paso 3: Reclamo o Queja */}
                {step === 3 && (
                  <div className="stack-md">
                    <label style={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "8px", display: "block" }}>Tipo de Manifestación *</label>
                    <div className="complaints-type-cards">
                      <div className={`complaints-type-card ${formData.type === "RECLAMO" ? "is-selected" : ""}`} onClick={() => setFormData(prev => ({ ...prev, type: "RECLAMO" }))}>
                        <input type="radio" name="type" checked={formData.type === "RECLAMO"} readOnly />
                        <strong>RECLAMO</strong>
                        <p>Disconformidad relacionada directamente con los productos adquiridos o servicios prestados en la tienda virtual.</p>
                      </div>
                      <div className={`complaints-type-card ${formData.type === "QUEJA" ? "is-selected" : ""}`} onClick={() => setFormData(prev => ({ ...prev, type: "QUEJA" }))}>
                        <input type="radio" name="type" checked={formData.type === "QUEJA"} readOnly />
                        <strong>QUEJA</strong>
                        <p>Disconformidad o malestar no relacionada directamente con los productos, sino con la atención recibida o el trato del personal.</p>
                      </div>
                    </div>

                    <div className="field-group" style={{ marginBottom: "20px" }}>
                      <label>Motivo principal *</label>
                      <select name="reason" value={formData.reason} onChange={handleInputChange}>
                        {REASONS.map((reason) => (
                          <option key={reason} value={reason}>{reason}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field-group" style={{ marginBottom: "20px" }}>
                      <label>Especificar motivo (Detalle corto) *</label>
                      <input name="subReason" type="text" placeholder="Ej: Xiaomi TV Stick no enciende" value={formData.subReason} onChange={handleInputChange} required />
                    </div>

                    <div className="field-group" style={{ marginBottom: "20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <label>DETALLE DE LOS HECHOS *</label>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{formData.facts.length} / 3000</span>
                      </div>
                      <textarea name="facts" rows={5} placeholder="Explica de manera detallada, clara y precisa qué ocurrió con tu producto o servicio..." value={formData.facts} onChange={handleInputChange} maxLength={3000} required />
                    </div>

                    <div className="field-group">
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <label>PEDIDO CONCRETO DEL CONSUMIDOR *</label>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{formData.request.length} / 2000</span>
                      </div>
                      <textarea name="request" rows={3} placeholder="Especifica qué solución o solución solicitas (reintegro, cambio del producto, reparación, etc.)..." value={formData.request} onChange={handleInputChange} maxLength={2000} required />
                    </div>
                  </div>
                )}

                {/* Paso 4: Adjuntos */}
                {step === 4 && (
                  <div className="stack-md">
                    <p style={{ fontSize: "14px", color: "#475569", marginBottom: "16px" }}>
                      Adjunta cualquier documento que sirva como sustento para tu reclamo (capturas de transferencias, fotos del producto fallido, boletas de compra, etc.).
                    </p>

                    <div className="complaints-drag-drop">
                      <UploadCloud size={32} style={{ color: "#64748b", margin: "0 auto 12px auto" }} />
                      <strong>Haga clic para adjuntar archivos o arrástrelos aquí</strong>
                      <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>Formatos permitidos: PDF, JPG, JPEG, PNG. Tamaño máximo por archivo: 10MB.</p>
                      <input type="file" multiple accept=".pdf, .png, .jpg, .jpeg" onChange={handleFileUpload} disabled={uploading} />
                    </div>

                    {uploading && <p style={{ fontSize: "13px", color: "#2320da", fontWeight: 500, textAlign: "center" }}>Cargando archivos...</p>}

                    <div className="uploaded-files-list">
                      {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="uploaded-file-item">
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <FileText size={16} style={{ color: "#64748b" }} />
                            <span><strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)</span>
                          </div>
                          <button className="icon-button" onClick={() => removeUploadedFile(idx)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}>
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paso 5: Declaraciones */}
                {step === 5 && (
                  <div className="stack-md">
                    <div className="legal-declaration-box">
                      <input name="acceptDeclaration" type="checkbox" checked={formData.acceptDeclaration} onChange={handleInputChange} id="acceptDeclaration" />
                      <div>
                        <label htmlFor="acceptDeclaration" style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", cursor: "pointer" }}>DECLARACIÓN DEL CONSUMIDOR *</label>
                        <p>Declaro que la información proporcionada en la presente Hoja de Reclamación es verdadera y corresponde a los hechos que motivan mi queja o reclamo. Asimismo, declaro haber leído y aceptado las condiciones correspondientes al registro de la presente queja o reclamo.</p>
                      </div>
                      <button 
                        type="button" 
                        className="legal-declaration-lupita" 
                        onClick={() => setActiveLegalModal(1)}
                        title="Ver base legal"
                      >
                        <Search size={16} />
                      </button>
                    </div>

                    <div className="legal-declaration-box">
                      <input name="acceptNotifications" type="checkbox" checked={formData.acceptNotifications} onChange={handleInputChange} id="acceptNotifications" />
                      <div>
                        <label htmlFor="acceptNotifications" style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", cursor: "pointer" }}>AUTORIZACIÓN PARA NOTIFICACIONES *</label>
                        <p>Autorizo a ORIGINAL J J S.A.C. a utilizar el correo electrónico y/o número telefónico proporcionado en esta Hoja de Reclamación para realizar las comunicaciones relacionadas con la atención de mi queja o reclamo.</p>
                      </div>
                      <button 
                        type="button" 
                        className="legal-declaration-lupita" 
                        onClick={() => setActiveLegalModal(2)}
                        title="Ver base legal"
                      >
                        <Search size={16} />
                      </button>
                    </div>

                    <div className="legal-declaration-box">
                      <input name="acceptPrivacy" type="checkbox" checked={formData.acceptPrivacy} onChange={handleInputChange} id="acceptPrivacy" />
                      <div>
                        <label htmlFor="acceptPrivacy" style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", cursor: "pointer" }}>TRATAMIENTO DE DATOS PERSONALES *</label>
                        <p>He leído y acepto la Política de Privacidad de ORIGINAL J J S.A.C. y autorizo el tratamiento de mis datos personales conforme a la Ley N° 29733 (Ley de Protección de Datos Personales del Perú).</p>
                      </div>
                      <button 
                        type="button" 
                        className="legal-declaration-lupita" 
                        onClick={() => setActiveLegalModal(3)}
                        title="Ver base legal"
                      >
                        <Search size={16} />
                      </button>
                    </div>

                    {submitError && (
                      <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fee2e2", padding: "16px", borderRadius: "8px", color: "#ef4444", fontSize: "13px", display: "flex", gap: 8, alignItems: "center" }}>
                        <AlertTriangle size={16} />
                        <span>{submitError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botones de Navegación del Formulario */}
              <div className="complaints-card-body" style={{ background: "#fafbfc", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between" }}>
                <button className="button button-secondary" onClick={handleBack}>
                  <ArrowLeft size={16} />
                  Anterior
                </button>

                {step < 5 ? (
                  <button className="button button-primary" onClick={handleNext}>
                    Siguiente
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button className="button button-primary" onClick={handleSubmit} disabled={isSubmitting} style={{ backgroundColor: "#10b981" }}>
                    <ShieldCheck size={16} />
                    {isSubmitting ? "Enviando..." : "Enviar Reclamo / Queja"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Paso 6: Éxito / Confirmación */}
        {step === 6 && successData && (
          <div className="complaints-card success-page-card no-print">
            <div className="success-check-circle" style={{ backgroundColor: "#ecfdf5", color: "#10b981" }}>
              <CheckCircle2 size={44} />
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>
              ¡Tu {formData.type.toLowerCase()} ha sido registrado con éxito!
            </h1>
            <p style={{ color: "#64748b", fontSize: "15px", marginBottom: "28px" }}>
              Hemos recibido correctamente tu Hoja de Reclamación.
            </p>

            <div className="success-info-grid">
              <div className="success-info-box">
                <span>NÚMERO DE HOJA</span>
                <strong style={{ color: "#2320da", fontSize: "22px" }}>{successData.sheetNumber}</strong>
              </div>

              <div className="success-info-box">
                <div className="success-info-box-sub">
                  <span>FECHA</span>
                  <strong>
                    {new Date(successData.createdAt).toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </strong>
                </div>
                <div className="success-info-box-sub" style={{ marginTop: "8px" }}>
                  <span>HORA</span>
                  <strong>
                    {new Date(successData.createdAt).toLocaleTimeString("es-PE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </strong>
                </div>
              </div>
            </div>

            <div className="success-email-notice">
              <div style={{ backgroundColor: "#10b981", color: "#ffffff", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", flexShrink: 0, fontSize: "11px", fontWeight: "bold", justifyContent: "center" }}>
                ✓
              </div>
              <p style={{ margin: 0 }}>
                Hemos enviado una copia de tu Hoja de Reclamación a tu correo electrónico.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap" }}>
              <button
                className="button button-primary"
                onClick={() => window.print()}
                style={{ backgroundColor: "#2320da", color: "#ffffff" }}
              >
                <Download size={16} />
                Descargar Hoja (PDF)
              </button>
              <button className="button button-secondary" onClick={() => window.print()}>
                <Printer size={16} />
                Imprimir
              </button>
              <Link className="button button-secondary" href="/">
                <ArrowLeft size={16} />
                Volver a la tienda
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ÁREA DE IMPRESIÓN OFICIAL INDECOPI (Oculta en la web, visible en print) */}
      {successData && (
        <div id="print-area" className="print-only-section">
          {/* Cabecera Oficial */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #000", padding: "12px", marginBottom: "10px", background: "#f8fafc" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "14px", fontWeight: "bold" }}>LIBRO DE RECLAMACIONES</h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "9px" }}>Conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571)</p>
              <strong style={{ fontSize: "10px", display: "block", marginTop: "4px" }}>ORIGINAL J J S.A.C. · RUC 20605346392</strong>
            </div>
            <div style={{ textAlign: "right", borderLeft: "1px solid #000", paddingLeft: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "13px", color: "#2320da", fontWeight: "bold" }}>HOJA DE RECLAMACIÓN</h3>
              <strong style={{ fontSize: "14px", display: "block" }}>{successData.sheetNumber}</strong>
              <small style={{ fontSize: "9px", color: "#475569" }}>
                Fecha: {new Date(successData.createdAt).toLocaleDateString("es-PE")} - {new Date(successData.createdAt).toLocaleTimeString("es-PE")}
              </small>
            </div>
          </div>

          {/* Sección 1: Consumidor */}
          <h4>1. Identificación del Consumidor Reclamante</h4>
          <table>
            <tbody>
              <tr>
                <td style={{ width: "20%", fontWeight: "bold" }}>Nombres y Apellidos</td>
                <td style={{ width: "45%" }}>{formData.names} {formData.lastNames}</td>
                <td style={{ width: "15%", fontWeight: "bold" }}>Documento</td>
                <td style={{ width: "20%" }}>{formData.documentType}: {formData.documentNumber}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }}>Teléfono</td>
                <td>{formData.phone}</td>
                <td style={{ fontWeight: "bold" }}>Correo</td>
                <td>{formData.email}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }}>Dirección</td>
                <td colSpan={3}>
                  {formData.address}, {formData.district}, {formData.province}, {formData.department}
                </td>
              </tr>
              {formData.isMinor && (
                <tr style={{ background: "#f8fafc" }}>
                  <td style={{ fontWeight: "bold" }}>Representante Legal</td>
                  <td colSpan={3}>
                    {formData.repNames} ({formData.repDocumentType}: {formData.repDocumentNumber})
                    <span style={{ fontSize: "8px", color: "#64748b", marginLeft: "8px" }}>*(Padre, madre o tutor legal de menor de edad)</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Sección 2: Detalle de Bien Contratado */}
          <h4>2. Identificación del Bien Contratado</h4>
          <table>
            <tbody>
              <tr>
                <td style={{ width: "20%", fontWeight: "bold" }}>Tipo de Bien</td>
                <td style={{ width: "30%" }}>
                  <span style={{ marginRight: "12px" }}>
                    [ {formData.isPurchaseRelated ? "X" : " " } ] Producto
                  </span>
                  <span>
                    [ {!formData.isPurchaseRelated ? "X" : " " } ] Servicio
                  </span>
                </td>
                <td style={{ width: "20%", fontWeight: "bold" }}>Monto Reclamado</td>
                <td style={{ width: "30%" }}>
                  {formData.isPurchaseRelated && formData.purchaseAmount ? `S/ ${formData.purchaseAmount}` : "N/A"}
                </td>
              </tr>
              {formData.isPurchaseRelated && (
                <>
                  <tr>
                    <td style={{ fontWeight: "bold" }}>Descripción del Producto</td>
                    <td>{formData.productName}</td>
                    <td style={{ fontWeight: "bold" }}>Código / SKU</td>
                    <td>{formData.productSku || "N/A"}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: "bold" }}>N° Pedido / Boleta</td>
                    <td>{formData.orderNumber || "N/A"} / {formData.invoiceNumber || "N/A"}</td>
                    <td style={{ fontWeight: "bold" }}>Canal / Medio Pago</td>
                    <td>{formData.purchaseChannel} / {formData.paymentMethod}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          {/* Sección 3: Reclamación */}
          <h4>3. Detalle de la Reclamación y Pedido del Consumidor</h4>
          <table>
            <tbody>
              <tr>
                <td style={{ width: "20%", fontWeight: "bold" }}>Tipo de Solicitud</td>
                <td style={{ width: "30%" }}>
                  <span style={{ marginRight: "12px" }}>
                    [ {formData.type === "RECLAMO" ? "X" : " " } ] Reclamo¹
                  </span>
                  <span>
                    [ {formData.type === "QUEJA" ? "X" : " " } ] Queja²
                  </span>
                </td>
                <td style={{ width: "20%", fontWeight: "bold" }}>Motivo Principal</td>
                <td style={{ width: "30%" }}>{formData.reason}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }}>Detalle del Motivo</td>
                <td colSpan={3}>{formData.subReason}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }} colSpan={4}>
                  DETALLE DE LOS HECHOS:
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={{ height: "80px", verticalAlign: "top", whiteSpace: "pre-wrap" }}>
                  {formData.facts}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: "bold" }} colSpan={4}>
                  PEDIDO CONCRETO DEL CONSUMIDOR:
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={{ height: "50px", verticalAlign: "top", whiteSpace: "pre-wrap" }}>
                  {formData.request}
                </td>
              </tr>
            </tbody>
          </table>



          {/* Notas Legales al Pie */}
          <div style={{ fontSize: "7.5px", color: "#475569", lineHeight: "1.4", border: "1px solid #000", padding: "10px", background: "#f8fafc" }}>
            <strong>Notas explicativas de ley:</strong><br />
            ¹ <strong>Reclamo:</strong> Disconformidad relacionada a los productos expendidos o servicios prestados; o disconformidad sobre la calidad del servicio posventa.<br />
            ² <strong>Queja:</strong> Disconformidad que no se encuentra relacionada a los productos o servicios defectuosos; sino al malestar o descontento respecto a la atención al cliente.<br />
            * Plazo de atención del reclamo: De acuerdo con la Ley N° 31435, el plazo máximo de atención de quejas y reclamos es de <strong>15 días hábiles no prorrogables</strong>, contados a partir del día siguiente del registro.
          </div>
        </div>
      )}
      {/* Modal de Información Legal (INDECOPI/Perú) */}
      {activeLegalModal !== null && (
        <div className="legal-modal-overlay no-print" onClick={() => setActiveLegalModal(null)}>
          <div className="legal-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="legal-modal-close" onClick={() => setActiveLegalModal(null)} type="button">
              <X size={18} />
            </button>
            
            {activeLegalModal === 1 && (
              <div>
                <div className="legal-modal-header">
                  <Scale size={20} style={{ color: "#2320da" }} />
                  <h2>DECLARACIÓN DEL CONSUMIDOR</h2>
                </div>
                <div className="legal-modal-body">
                  <p><strong>Base Legal:</strong> Ley N° 29571 (Código de Protección y Defensa del Consumidor) y Ley N° 27444 (Ley del Procedimiento Administrativo General).</p>
                  <hr />
                  <p>Al marcar esta casilla y firmar de manera electrónica, usted declara bajo juramento que toda la información consignada en su reclamo o queja es completamente verídica y corresponde fielmente a los hechos acontecidos.</p>
                  <ul>
                    <li><strong>Responsabilidad Legal:</strong> La falsedad o inexactitud de lo declarado en esta hoja constituye una falta al principio de presunción de veracidad y puede acarrear responsabilidades administrativas o civiles.</li>
                    <li><strong>Plazo Improrrogable (Ley N° 31435):</strong> Conforme a la legislación vigente de protección al consumidor en el Perú, el proveedor está obligado a responder este reclamo en un plazo máximo de <strong>15 días hábiles</strong> no prorrogables.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeLegalModal === 2 && (
              <div>
                <div className="legal-modal-header">
                  <Mail size={20} style={{ color: "#2320da" }} />
                  <h2>AUTORIZACIÓN PARA NOTIFICACIONES</h2>
                </div>
                <div className="legal-modal-body">
                  <p><strong>Base Legal:</strong> Artículo 20.4 del Texto Único Ordenado de la Ley N° 27444 y Directivas del INDECOPI.</p>
                  <hr />
                  <p>Al marcar esta casilla, autoriza voluntariamente a ORIGINAL J J S.A.C. a remitir la respuesta formal a su reclamo o queja directamente a la dirección de correo electrónico o número de teléfono (WhatsApp) indicados en esta hoja.</p>
                  <ul>
                    <li><strong>Validez y Plazos:</strong> La notificación digital se considera válida y surte plenos efectos legales el mismo día en que el proveedor envía el correo.</li>
                    <li><strong>Seguridad:</strong> Garantiza que la respuesta sea entregada en el menor tiempo posible y que quede constancia digital de su envío y recepción conforme.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeLegalModal === 3 && (
              <div>
                <div className="legal-modal-header">
                  <ShieldCheck size={20} style={{ color: "#2320da" }} />
                  <h2>TRATAMIENTO DE DATOS PERSONALES</h2>
                </div>
                <div className="legal-modal-body">
                  <p><strong>Base Legal:</strong> Ley N° 29733 (Ley de Protección de Datos Personales del Perú) y su Reglamento (D.S. 003-2013-JUS).</p>
                  <hr />
                  <p>El tratamiento de los datos personales ingresados en esta hoja de reclamación cumple de forma estricta con los principios de finalidad y seguridad establecidos por el Ministerio de Justicia del Perú.</p>
                  <ul>
                    <li><strong>Uso Exclusivo:</strong> Sus datos personales serán incorporados temporalmente en nuestro Banco de Datos denominado "Libro de Reclamaciones" y se usarán <strong>única y exclusivamente</strong> para dar trámite, investigar y responder a su reclamo o queja ante INDECOPI.</li>
                    <li><strong>Derechos ARCO:</strong> Como titular de sus datos, usted tiene el derecho legal de ejercer sus derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO) escribiendo de forma gratuita a nuestros canales de atención al cliente.</li>
                  </ul>
                </div>
              </div>
            )}
            
            <div className="legal-modal-footer">
              <button className="button button-primary" onClick={() => setActiveLegalModal(null)} type="button">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerta Personalizada (Centro de la Pantalla con Check para Aceptar) */}
      {alertMessage !== null && (
        <div className="legal-modal-overlay no-print" onClick={() => setAlertMessage(null)}>
          <div className="legal-modal-content" style={{ maxWidth: "420px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <button className="legal-modal-close" onClick={() => setAlertMessage(null)} type="button">
              <X size={18} />
            </button>
            
            <div style={{ padding: "30px 24px 20px 24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ backgroundColor: "#fef3c7", borderRadius: "50%", width: "56px", height: "56px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <AlertTriangle size={28} style={{ color: "#d97706" }} />
              </div>
              <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", margin: "0 0 10px 0", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                Atención
              </h2>
              <p style={{ fontSize: "13.5px", lineHeight: "1.5", color: "#475569", margin: 0 }}>
                {alertMessage}
              </p>
            </div>
            
            <div className="legal-modal-footer" style={{ justifyContent: "center", background: "#f8fafc", padding: "16px 24px" }}>
              <button 
                className="button button-primary" 
                onClick={() => setAlertMessage(null)} 
                type="button"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", backgroundColor: "#2320da", color: "#ffffff", padding: "10px 24px", borderRadius: "20px" }}
              >
                <Check size={16} />
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
