import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad | Importaciones Super",
  description: "Política de privacidad y tratamiento de datos personales de Importaciones Super.",
};

export default function PoliticaPrivacidad() {
  return (
    <div className="legal-document">
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>POLÍTICA DE PRIVACIDAD</h1>
      <p style={{ color: "#64748b", marginBottom: "16px", fontSize: "0.95rem" }}>Última actualización: 12 de septiembre de 2026</p>

      <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "32px", fontSize: "0.95rem" }}>
        <p style={{ margin: 0 }}><strong>Contacto de Privacidad:</strong> <a href="mailto:importacionessupersac@gmail.com" style={{ color: "#2320da", textDecoration: "underline" }}>importacionessupersac@gmail.com</a></p>
      </div>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>A. RESPONSABLE DEL TRATAMIENTO</h2>
        <p>
          <strong>Importaciones Sam Sac</strong> es la empresa responsable del tratamiento de los datos personales 
          utilizados para prestar los servicios asociados a la plataforma y tienda online <strong>Importaciones Super</strong> (accesible a través de <a href="https://tiendavirtualsuper.com" target="_blank" rel="noreferrer" style={{ color: "#2320da", textDecoration: "underline" }}>https://tiendavirtualsuper.com</a>). 
          Esta política aplica a los datos recabados en el sitio web, así como a la información tratada a través de nuestros canales de atención por WhatsApp Business y la aplicación integrada de Meta ("importaciones super api").
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>B. QUÉ INFORMACIÓN PUEDE PROCESARSE</h2>
        <p>Dependiendo de su interacción con nuestra tienda y canales de atención, podemos procesar la siguiente información:</p>
        <ul style={{ paddingLeft: "24px", marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li>Nombre y apellidos cuando corresponda.</li>
          <li>Número de teléfono (especialmente al comunicarse por WhatsApp).</li>
          <li>Correo electrónico.</li>
          <li>Documento de identidad (DNI, CE o equivalente) cuando sea necesario para una operación comercial.</li>
          <li>RUC e información necesaria para la emisión de boletas o facturas.</li>
          <li>Dirección de entrega, incluyendo distrito, provincia y departamento cuando corresponda.</li>
          <li>Información relacionada con pedidos, compras y productos consultados.</li>
          <li>Mensajes enviados a través de WhatsApp u otros canales de atención al cliente.</li>
          <li>Información requerida para servicios de delivery, recojo en tienda o envíos por agencia.</li>
          <li>Información técnica necesaria para la seguridad y el funcionamiento del sitio web.</li>
          <li>Identificadores técnicos proporcionados por plataformas integradas cuando sean estrictamente necesarios para prestar el servicio de comunicación o compra.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>C. PARA QUÉ UTILIZAMOS LA INFORMACIÓN</h2>
        <p>Los datos procesados se utilizan para las siguientes finalidades esenciales:</p>
        <ul style={{ paddingLeft: "24px", marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li>Responder consultas comerciales y brindar atención al cliente.</li>
          <li>Identificar y mostrar los productos y precios solicitados o buscados.</li>
          <li>Administrar el carrito de compras y gestionar los pedidos realizados.</li>
          <li>Procesar compras y emitir los comprobantes de pago respectivos (boletas o facturas).</li>
          <li>Coordinar entregas, despachos y servicios logísticos.</li>
          <li>Administrar y dar seguimiento a solicitudes de soporte técnico o comercial.</li>
          <li>Prevenir el fraude o abuso en nuestras plataformas.</li>
          <li>Mantener la seguridad de nuestros servicios y mejorar el funcionamiento general de la tienda.</li>
          <li>Operar las integraciones tecnológicas necesarias con WhatsApp Business y plataformas de Meta.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>D. WHATSAPP Y META</h2>
        <p>
          Importaciones Super puede utilizar servicios proveídos por Meta Platforms, Inc., incluyendo la plataforma de <strong>WhatsApp Business</strong>, para recibir, procesar y enviar mensajes relacionados con atención al cliente, consultas de productos, gestión de compras y soporte post-venta.
        </p>
        <p style={{ marginTop: "12px" }}>
          Al utilizar WhatsApp para comunicarse con nosotros, tenga en cuenta que Meta también puede procesar determinada información técnica de acuerdo con sus propias Políticas de Privacidad y Condiciones del Servicio aplicables.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>E. ATENCIÓN MEDIANTE ASISTENTE VIRTUAL</h2>
        <p>
          Para brindar una respuesta rápida, Importaciones Super puede utilizar herramientas de automatización y un asistente virtual impulsado por inteligencia artificial para interactuar en nuestros canales de chat. Este asistente ayuda a:
        </p>
        <ul style={{ paddingLeft: "24px", marginTop: "12px", marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li>Identificar la intención del cliente y los productos que busca.</li>
          <li>Consultar disponibilidad de catálogo, categorías y marcas.</li>
          <li>Responder preguntas comerciales frecuentes.</li>
          <li>Guiar al usuario durante el proceso de selección y compra.</li>
          <li>Derivar la conversación a un asesor humano cuando la situación lo amerite.</li>
        </ul>
        <p>
          El contenido de los mensajes que usted envíe puede ser procesado temporalmente por nuestra tecnología de inteligencia artificial exclusivamente para entender y responder su consulta en tiempo real, con la única finalidad de prestarle esta atención comercial. En cualquier momento durante el horario comercial, el cliente puede solicitar explícitamente ser derivado o atendido por una persona de nuestro equipo.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>F. PROVEEDORES DE SERVICIO</h2>
        <p>
          Ciertos proveedores tecnológicos pueden procesar o alojar información únicamente cuando sea necesario para permitir la operatividad del servicio. Estos pueden incluir proveedores de:
        </p>
        <ul style={{ paddingLeft: "24px", marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li>Infraestructura de servidores y hosting en la nube.</li>
          <li>Servicios de mensajería (incluyendo Meta y WhatsApp).</li>
          <li>Plataformas de procesamiento de pagos y pasarelas transaccionales.</li>
          <li>Servicios de logística, agencias de transporte o delivery.</li>
          <li>Otras herramientas tecnológicas estrictamente necesarias para operar la tienda online.</li>
        </ul>
        <p style={{ marginTop: "12px" }}>
          Importaciones Sam Sac garantiza que no se dedica a la venta, comercialización ni alquiler de su información personal a terceros.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>G. CONSERVACIÓN</h2>
        <p>
          Su información personal será conservada solamente durante el tiempo necesario y razonable para cumplir con las finalidades descritas. Esto incluye el periodo requerido para prestar el servicio, gestionar devoluciones o garantías, y cumplir con obligaciones legales, tributarias, contables o de prevención de fraude.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>H. SEGURIDAD</h2>
        <p>
          Importaciones Sam Sac aplica y mantiene medidas técnicas y organizativas razonables destinadas a proteger su información personal contra el acceso no autorizado, la pérdida accidental, la alteración o la divulgación indebida. Si bien nos esforzamos por implementar prácticas sólidas de seguridad, debe comprender que ninguna transmisión de datos a través de internet o sistema de almacenamiento electrónico puede garantizar una seguridad absoluta e infalible.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>I. DERECHOS DEL USUARIO</h2>
        <p>
          De acuerdo con la legislación de protección de datos aplicable en Perú, usted tiene el derecho a ejercer un control sobre su información. Cuando corresponda, puede solicitar:
        </p>
        <ul style={{ paddingLeft: "24px", marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li><strong>Acceso:</strong> Para conocer qué datos personales tenemos sobre usted.</li>
          <li><strong>Actualización o Rectificación:</strong> Para corregir o actualizar datos inexactos o desactualizados.</li>
          <li><strong>Oposición:</strong> Para oponerse al tratamiento de sus datos bajo ciertas circunstancias.</li>
          <li><strong>Eliminación (Cancelación):</strong> Para solicitar que suprimamos sus datos de nuestros registros.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px", background: "#fef2f2", padding: "24px", borderRadius: "12px", border: "1px solid #fecaca" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#991b1b", marginTop: 0, marginBottom: "16px" }}>J. ELIMINACIÓN DE DATOS</h2>
        <p style={{ color: "#7f1d1d" }}>
          Si deseas solicitar la eliminación de tus datos personales de nuestros sistemas (incluyendo los vinculados a la tienda web o a los canales de Meta/WhatsApp), por favor consulta nuestra página oficial dedicada a este procedimiento para conocer los pasos exactos:
        </p>
        <div style={{ marginTop: "16px" }}>
          <Link href="/eliminacion-de-datos" style={{ display: "inline-block", background: "#dc2626", color: "#ffffff", padding: "10px 20px", borderRadius: "8px", textDecoration: "none", fontWeight: 600 }}>
            Solicitud de eliminación de datos
          </Link>
        </div>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>K. CAMBIOS EN ESTA POLÍTICA</h2>
        <p>
          Nos reservamos el derecho de actualizar, modificar o enmendar esta Política de Privacidad en cualquier momento para reflejar cambios en nuestras prácticas operativas o exigencias legales. La versión más reciente y vigente siempre estará disponible en esta página, indicando la fecha de la "Última actualización" en la parte superior.
        </p>
      </section>
    </div>
  );
}
