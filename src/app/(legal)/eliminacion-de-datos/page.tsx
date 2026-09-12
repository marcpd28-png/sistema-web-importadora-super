import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Eliminación de Datos | Importaciones Super",
  description: "Procedimiento para solicitar la eliminación de datos personales.",
};

export default function EliminacionDatos() {
  return (
    <div className="legal-document">
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>SOLICITUD DE ELIMINACIÓN DE DATOS</h1>
      <p style={{ color: "#64748b", marginBottom: "32px", fontSize: "0.95rem" }}>Última actualización: 12 de septiembre de 2026</p>

      <section style={{ marginBottom: "32px" }}>
        <p>
          Si has interactuado con <strong>tiendavirtualsuper.com</strong>, has recibido atención mediante nuestro canal de <strong>WhatsApp de Importaciones Super</strong> o has utilizado los servicios asociados con la aplicación "<strong>importaciones super api</strong>", tienes derecho a solicitar la eliminación de los datos personales asociados a tu cuenta y a esos servicios de acuerdo a lo que establece la ley y las políticas de privacidad vigentes.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>¿Cómo presentar una solicitud?</h2>
        <p>
          Para proceder con la eliminación de su información, envíe un correo electrónico directo a nuestro canal de soporte empresarial:
        </p>
        <p style={{ margin: "16px 0", fontSize: "1.1rem", fontWeight: "bold" }}>
          <a href="mailto:importacionessupersac@gmail.com" style={{ color: "#2320da", textDecoration: "underline" }}>importacionessupersac@gmail.com</a>
        </p>
        
        <p style={{ marginTop: "16px", marginBottom: "8px" }}>Por favor, incluye la siguiente información en tu mensaje para que podamos procesar la solicitud exitosamente:</p>
        <ol style={{ paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "12px", background: "#f8fafc", padding: "20px 20px 20px 40px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <li><strong>Nombre completo.</strong></li>
          <li><strong>Número de teléfono</strong> (el número de WhatsApp utilizado para comunicarse con nosotros) o el <strong>correo electrónico</strong> asociado a tu cuenta.</li>
          <li>Una declaración explícita indicando que <strong>solicita la eliminación de sus datos personales.</strong></li>
          <li><em>(Opcional)</em> Si corresponde, indicar exactamente qué información específica o de qué canal desea que se elimine (por ejemplo, "solo mi cuenta de la tienda web" o "eliminar los datos personales y registros de conversaciones almacenados por Importaciones Super y bajo nuestro control").</li>
        </ol>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>Consideraciones Importantes</h2>
        <ul style={{ paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li>Solicitar la eliminación de sus datos <strong>no tiene ningún costo</strong>.</li>
          <li>Por su propia seguridad, <strong>cuando sea necesario, podremos solicitar información adicional razonable para verificar la identidad del solicitante y evitar la eliminación de datos de otra persona.</strong></li>
          <li>Una vez procesada y aprobada la solicitud, los datos serán <strong>eliminados o anonimizados</strong> permanentemente de nuestros sistemas operativos internos.</li>
          <li>Cabe aclarar que determinados datos tratados directamente por las plataformas de Meta o WhatsApp están sujetos de forma independiente a las políticas y sistemas internos de dichas empresas, sobre los cuales no tenemos control de borrado.</li>
          <li>Es importante saber que <strong>cierta información puede conservarse excepcionalmente</strong> incluso si solicita su eliminación, únicamente cuando exista una obligación legal, normativa, tributaria, contable, contractual, de seguridad o vinculada a la prevención de fraude (por ejemplo, registros de una factura de compra por exigencias de SUNAT).</li>
          <li>Cuando legalmente no corresponda eliminar determinada información por las excepciones mencionadas, nos comprometemos a <strong>conservarla únicamente durante el periodo legal necesario</strong> y no utilizarla para fines comerciales.</li>
        </ul>
      </section>

      <section style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid #e2e8f0" }}>
        <Link href="/politica-de-privacidad" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#64748b", textDecoration: "none", fontWeight: 600 }}>
          <span aria-hidden="true">←</span> Regresar a la Política de Privacidad
        </Link>
      </section>
    </div>
  );
}
