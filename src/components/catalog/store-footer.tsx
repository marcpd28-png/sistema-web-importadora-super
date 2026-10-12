"use client";

import Link from "next/link";
import { BookOpenText, Clock3, Mail, MapPin } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

const MESSENGER_URL = "https://m.me/importacionessuperoficial";

export function StoreFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="store-footer-v3">
      <style dangerouslySetInnerHTML={{ __html: `
        .store-footer-v3 {
          background-color: #2320da;
          color: #cbd5e1;
          padding: 32px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-family: 'Inter', sans-serif;
        }
        .store-footer-main {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          flex-wrap: wrap;
          padding-bottom: 20px;
        }
        .store-footer-brand-socials {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        /* Make Brand Logo white to fit dark blue background */
        .store-footer-brand-socials img,
        .store-footer-brand-socials svg {
          filter: brightness(0) invert(1) !important;
        }
        .store-footer-socials {
          display: flex;
          gap: 8px;
        }
        .store-footer-social-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          transition: all 0.2s;
          text-decoration: none;
        }
        .store-footer-social-btn:hover {
          background: #fbbf24;
          border-color: #fbbf24;
          color: #1e293b;
          transform: translateY(-2px);
        }
        .store-footer-social-btn svg {
          transition: transform 0.2s;
        }
        .store-footer-social-btn:hover svg {
          transform: scale(1.1);
        }
        .store-footer-info-row {
          display: flex;
          gap: 32px;
          align-items: center;
          flex-wrap: wrap;
        }
        .store-footer-info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #f1f5f9;
        }
        .store-footer-info-item a {
          color: #ffffff;
          text-decoration: none;
          font-weight: 600;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.3);
          transition: all 0.2s;
        }
        .store-footer-info-item a:hover {
          color: #fbbf24;
          border-color: #fbbf24;
        }
        .store-footer-icon {
          color: #fbbf24;
          flex-shrink: 0;
        }
        .store-footer-actions {
          display: flex;
          gap: 14px;
          align-items: center;
        }
        .store-footer-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          font-weight: 700;
          padding: 8px 18px;
          border-radius: 20px;
          text-decoration: none;
          transition: all 0.2s;
          height: 36px;
          box-sizing: border-box;
        }
        .store-footer-btn-messenger {
          background: #168aff;
          color: #ffffff;
          box-shadow: 0 4px 10px rgba(22, 138, 255, 0.2);
        }
        .store-footer-btn-messenger:hover {
          background: #0b74df;
          transform: translateY(-1.5px);
        }
        .store-footer-btn-complaints {
          border: 1.5px solid #fbbf24;
          background: rgba(251, 191, 36, 0.05);
          color: #fbbf24;
        }
        .store-footer-btn-complaints:hover {
          background: #fbbf24;
          color: #1e293b;
          transform: translateY(-1.5px);
        }
        .store-footer-bottom {
          max-width: 1200px;
          margin: 0 auto;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
          color: #94a3b8;
          flex-wrap: wrap;
          gap: 8px;
        }
        @media (max-width: 1024px) {
          .store-footer-main {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
          }
          .store-footer-info-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          .store-footer-actions {
            width: 100%;
            justify-content: flex-start;
          }
        }
        @media (max-width: 640px) {
          .store-footer-bottom {
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 8px;
          }
        }
      ` }} />

      {/* Fila Principal del Footer */}
      <div className="store-footer-main">
        {/* Izquierda: Logotipo e Iconos de Redes Sociales (Blanco/Hover Amarillo) */}
        <div className="store-footer-brand-socials">
          <BrandLogo href="/" size="sm" />
          <div className="store-footer-socials">
            <a href="https://www.facebook.com/importacionessuperoficial/?locale=es_LA" target="_blank" rel="noopener noreferrer" className="store-footer-social-btn" title="Facebook">
              <svg fill="currentColor" width="14" height="14" viewBox="0 0 24 24">
                <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
              </svg>
            </a>
            <a href="https://www.instagram.com/importsupersac/" target="_blank" rel="noopener noreferrer" className="store-footer-social-btn" title="Instagram">
              <svg fill="currentColor" width="14" height="14" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
            <a href="https://www.tiktok.com/@super_importaciones" target="_blank" rel="noopener noreferrer" className="store-footer-social-btn" title="TikTok">
              <svg fill="currentColor" width="14" height="14" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.94-1.72-.01 2.92.01 5.84-.02 8.75-.18 2.52-1.72 4.88-4.14 5.6-2.52.81-5.46.22-7.4-1.57-2.12-1.95-2.73-5.22-1.44-7.85 1.2-2.4 3.93-3.83 6.61-3.4v4.08c-1.5-.4-3.15.22-3.85 1.6-.74 1.4-.23 3.28 1.12 4.14 1.34.85 3.23.63 4.32-.5.55-.56.84-1.34.83-2.13-.02-4.38-.01-8.77-.02-13.16z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Centro: Datos Informativos Sintetizados con Iconos Amarillos */}
        <div className="store-footer-info-row">
          <div className="store-footer-info-item" title="Dirección de la Tienda">
            <MapPin size={14} className="store-footer-icon" />
            <span>Avenida Abancay 752, Centro de Lima</span>
          </div>
          <div className="store-footer-info-item" title="Horario de Atención">
            <Clock3 size={14} className="store-footer-icon" />
            <span>Lun-Sáb: 8am - 8pm | Dom: 9am - 8pm</span>
          </div>
          <div className="store-footer-info-item" title="Correo de Soporte">
            <Mail size={14} className="store-footer-icon" />
            <a href="mailto:importacionessupersac@gmail.com">importacionessupersac@gmail.com</a>
          </div>
        </div>

        {/* Legal Section */}
        <div className="store-footer-legal" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Legal</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <Link href="/politica-de-privacidad" style={{ color: "#ffffff", textDecoration: "none", fontSize: "12.5px", fontWeight: 500, transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#fbbf24"} onMouseOut={(e) => e.currentTarget.style.color = "#ffffff"}>Política de privacidad</Link>
            <Link href="/terminos-y-condiciones" style={{ color: "#ffffff", textDecoration: "none", fontSize: "12.5px", fontWeight: 500, transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#fbbf24"} onMouseOut={(e) => e.currentTarget.style.color = "#ffffff"}>Términos y condiciones</Link>
            <Link href="/eliminacion-de-datos" style={{ color: "#ffffff", textDecoration: "none", fontSize: "12.5px", fontWeight: 500, transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "#fbbf24"} onMouseOut={(e) => e.currentTarget.style.color = "#ffffff"}>Eliminación de datos</Link>
          </div>
        </div>

        {/* Derecha: Botones de Acción */}
        <div className="store-footer-actions">
          <a
            href={MESSENGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="store-footer-btn store-footer-btn-messenger"
            aria-label="Comprar por Messenger"
          >
            <svg aria-hidden="true" focusable="false" height="12" viewBox="0 0 24 24" width="12" fill="currentColor">
              <path d="M12 1.5C5.93 1.5 1 5.86 1 11.24c0 3.05 1.58 5.8 4.06 7.57V23l4.1-2.26c.9.25 1.85.38 2.84.38 6.07 0 11-4.36 11-9.88S18.07 1.5 12 1.5Zm1.08 13.27-2.8-2.98-5.46 2.98 6.01-6.39 2.86 2.98 5.38-2.98-5.99 6.39Z" />
            </svg>
            Comprar por Messenger
          </a>

          <a href="/libro-reclamaciones" className="store-footer-btn store-footer-btn-complaints">
            <BookOpenText size={12} />
            Libro Reclamaciones
          </a>
        </div>
      </div>

      {/* Barra Inferior del Footer (Sub-footer) */}
      <div className="store-footer-bottom">
        <p className="store-footer-copy">
          © {currentYear} ORIGINAL J J S.A.C. RUC 20605346392. Todos los derechos reservados.
        </p>
        <p style={{ margin: 0 }}>
          Conforme al Código de Protección y Defensa del Consumidor del Perú.
        </p>
      </div>
    </footer>
  );
}
