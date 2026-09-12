import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones | Importaciones Super",
  description: "Términos y condiciones de uso y compra en Importaciones Super.",
};

export default function TerminosCondiciones() {
  return (
    <div className="legal-document">
      <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", marginBottom: "8px" }}>TÉRMINOS Y CONDICIONES</h1>
      <p style={{ color: "#64748b", marginBottom: "32px", fontSize: "0.95rem" }}>Última actualización: 12 de septiembre de 2026</p>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>1. Información del Responsable del Sitio</h2>
        <p>
          Los presentes Términos y Condiciones regulan el uso de la tienda online <strong>Importaciones Super</strong> (<a href="https://tiendavirtualsuper.com" target="_blank" rel="noreferrer" style={{ color: "#2320da", textDecoration: "underline" }}>https://tiendavirtualsuper.com</a>) y los servicios asociados de atención comercial, administrados y operados por la empresa <strong>Importaciones Sam Sac</strong>, debidamente constituida en Perú.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>2. Objeto y Alcance del Servicio</h2>
        <p>
          Nuestra plataforma tiene como objetivo la exhibición, cotización y comercialización de productos, operando como un catálogo mayorista y minorista con panel interactivo. El acceso y uso del sitio web, la creación de pedidos y el uso de nuestros canales de atención asociados implican la aceptación plena y sin reservas de los presentes términos.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>3. Uso de la Tienda Online y Catálogo</h2>
        <p>
          El catálogo virtual presenta nuestra oferta comercial actual. El usuario se compromete a hacer un uso lícito y adecuado del sitio, absteniéndose de realizar solicitudes falsas, fraudulentas o de utilizar herramientas tecnológicas para extraer información de forma masiva (scraping) sin autorización.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>4. Productos, Precios y Disponibilidad</h2>
        <ul style={{ paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li><strong>Productos:</strong> Las descripciones y fotografías de los productos tienen carácter orientativo. Nos esforzamos por presentar especificaciones precisas, pero pueden ocurrir variaciones de diseño, empaque o características técnicas implementadas por el fabricante.</li>
          <li><strong>Precios:</strong> Todos los precios se muestran en Soles Peruanos (S/) o en la moneda indicada, incluyendo los impuestos de ley vigentes, salvo que se especifique lo contrario. Importaciones Sam Sac se reserva el derecho de modificar los precios en cualquier momento sin previo aviso, sin que esto afecte pedidos ya confirmados y pagados.</li>
          <li><strong>Disponibilidad:</strong> La exhibición de un producto en la web no garantiza su stock inmediato. Todo pedido está sujeto a validación final de inventario. En caso de quiebre de stock posterior al pedido, nos comunicaremos con el cliente para ofrecerle un cambio o la cancelación correspondiente.</li>
          <li><strong>Promociones:</strong> Las ofertas, cupones y promociones tienen validez durante el plazo publicado o hasta agotar el stock destinado a la campaña.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>5. Pedidos y Métodos de Pago</h2>
        <p>
          La generación de un pedido a través de nuestro sitio web constituye una solicitud de compra. Las formas de pago disponibles y activas serán aquellas presentadas durante el proceso final de validación o "checkout" en la plataforma, las cuales pueden incluir transferencias bancarias directas, depósitos y/o pasarelas de pago integradas (según disponibilidad). La preparación del pedido iniciará únicamente tras la validación exitosa del abono correspondiente.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>6. Entregas, Delivery y Recojo</h2>
        <p>Ponemos a disposición diversas modalidades logísticas que el cliente puede seleccionar al comprar:</p>
        <ul style={{ paddingLeft: "24px", marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li><strong>Recojo en Tienda:</strong> El cliente puede optar por acercarse presencialmente. El recojo solo podrá efectuarse luego de que un asesor le confirme que el paquete se encuentra preparado y listo.</li>
          <li><strong>Delivery Local:</strong> El despacho directo (delivery) está sujeto a las zonas de cobertura habilitadas. Los costos logísticos aplicables y los tiempos de entrega se determinarán de forma general dependiendo del destino y se informarán durante el proceso de compra o mediante coordinación directa.</li>
          <li><strong>Envíos por Agencia:</strong> Para despachos a nivel nacional que requieran transporte terrestre (agencias de encomiendas), el cliente asume los costos de flete según las tarifas de la agencia seleccionada. Importaciones Sam Sac cumplirá con despachar y entregar el producto en buen estado a la agencia elegida, momento en el cual se le enviará el comprobante de recepción para su seguimiento.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>7. Comprobantes de Pago</h2>
        <p>
          Toda compra emitirá el comprobante electrónico correspondiente (Boleta de Venta o Factura), en cumplimiento de las exigencias tributarias vigentes. Es estricta responsabilidad del cliente ingresar correctamente el número de RUC y la Razón Social al momento del pedido si requiere una Factura; una vez emitido el comprobante, no siempre se podrán realizar anulaciones o modificaciones por errores de digitación del usuario.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>8. Atención mediante Automatización e Inteligencia Artificial</h2>
        <p>
          Para agilizar nuestros servicios, nuestros canales digitales (como el chat web y WhatsApp) pueden estar administrados parcialmente por <strong>asistentes virtuales y automatizaciones basadas en Inteligencia Artificial</strong>. Estas herramientas tienen el objetivo de asistir comercialmente, guiar en la navegación del catálogo y proporcionar presupuestos de manera automática.
        </p>
        <p style={{ marginTop: "12px" }}>
          Las respuestas generadas por los asistentes virtuales están diseñadas para ser lo más precisas posibles, sin embargo, están sujetas a verificación final humana en caso de disputas. Todo cliente puede solicitar en cualquier momento dentro de nuestros horarios comerciales la intervención y <strong>Atención Humana</strong> directa por parte de nuestros asesores para resolver cualquier duda que exceda la capacidad de nuestro asistente.
        </p>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>9. Errores, Disponibilidad y Propiedad Intelectual</h2>
        <ul style={{ paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <li><strong>Errores y Omisiones:</strong> En el caso excepcional en que un producto figure listado con un precio incorrecto por error tipográfico o de sistema, la empresa se reserva el derecho de rechazar o cancelar dichos pedidos, procediendo con el reembolso íntegro si el pago ya se hubiera efectuado.</li>
          <li><strong>Disponibilidad del Servicio:</strong> No garantizamos que el funcionamiento del sitio web o canales de WhatsApp sea continuo e ininterrumpido. Podemos realizar pausas por mantenimiento.</li>
          <li><strong>Propiedad Intelectual:</strong> Todos los textos, imágenes, logotipos y diseños de la tienda son propiedad de Importaciones Sam Sac o de sus respectivos fabricantes y proveedores. Queda prohibida su reproducción no autorizada con fines comerciales ajenos a la empresa.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b", marginTop: "32px", marginBottom: "16px" }}>10. Modificaciones y Contacto</h2>
        <p>
          Importaciones Sam Sac podrá modificar estos Términos y Condiciones cuando lo considere pertinente. Las versiones actualizadas se publicarán en esta misma sección.
        </p>
        <p style={{ marginTop: "12px" }}>
          Para dudas comerciales, asistencia en pedidos o reportes relacionados con estos Términos, comunícate a nuestro correo: <a href="mailto:importacionessupersac@gmail.com" style={{ color: "#2320da", textDecoration: "underline" }}>importacionessupersac@gmail.com</a>.
        </p>
      </section>
    </div>
  );
}
