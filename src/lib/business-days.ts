// Feriados nacionales oficiales del Perú (MM-DD)
const FIXED_HOLIDAYS = new Set([
  "01-01", // Año Nuevo
  "05-01", // Día del Trabajo
  "06-29", // San Pedro y San Pablo
  "07-23", // Día de la Fuerza Aérea del Perú
  "07-28", // Fiestas Patrias (Independencia)
  "07-29", // Fiestas Patrias
  "08-06", // Batalla de Junín
  "08-30", // Santa Rosa de Lima
  "10-08", // Combate de Angamos
  "11-01", // Todos los Santos
  "12-08", // Inmaculada Concepción
  "12-09", // Batalla de Ayacucho
  "12-25", // Navidad
]);

// Feriados variables (Semana Santa, etc.) por año en formato YYYY-MM-DD
const VARIABLE_HOLIDAYS = new Set([
  // 2026
  "2026-04-02", // Jueves Santo
  "2026-04-03", // Viernes Santo
  // 2027
  "2027-03-25", // Jueves Santo
  "2027-03-26", // Viernes Santo
  // 2028
  "2028-04-13", // Jueves Santo
  "2028-04-14", // Viernes Santo
]);

export function isPeruvianBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    // Domingo = 0, Sábado = 6
    return false;
  }

  // Obtener MM-DD rellenado con ceros
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  const monthDay = `${month}-${dayOfMonth}`;

  if (FIXED_HOLIDAYS.has(monthDay)) {
    return false;
  }

  // Obtener YYYY-MM-DD
  const year = date.getFullYear();
  const fullDateStr = `${year}-${month}-${dayOfMonth}`;

  if (VARIABLE_HOLIDAYS.has(fullDateStr)) {
    return false;
  }

  return true;
}

/**
 * Añade una cantidad de días hábiles a una fecha de inicio
 * @param startDate Fecha de inicio del cálculo
 * @param businessDays Cantidad de días hábiles a sumar (por defecto 15)
 */
export function calculateExpiryDate(startDate: Date, businessDays = 15): Date {
  const result = new Date(startDate.getTime());
  let addedDays = 0;

  while (addedDays < businessDays) {
    // Sumar un día natural
    result.setDate(result.getDate() + 1);
    if (isPeruvianBusinessDay(result)) {
      addedDays += 1;
    }
  }

  return result;
}
