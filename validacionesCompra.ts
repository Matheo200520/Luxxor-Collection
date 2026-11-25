/*
 * Funciones puras para limpiar, formatear y validar campos del checkout.
 * No leen estado de React ni acceden a almacenamiento o red: Checkout les
 * entrega texto y recibe un resultado, lo que permite reutilizarlas y probarlas
 * sin montar componentes visuales.
 */

/**
 * Marcas que el formulario puede reconocer por el prefijo del número.
 * `Desconocida` cubre entradas incompletas o prefijos no contemplados.
 */
export type MarcaTarjeta = 'Visa' | 'Mastercard' | 'Amex' | 'Desconocida';

/**
 * Quita espacios, guiones y cualquier otro carácter que no sea un dígito.
 * Las validaciones llaman esta función para aceptar texto visualmente
 * formateado sin cambiar las reglas que verifican la longitud o el valor.
 */
export const soloDigitos = (s: string): string => s.replace(/\D/g, '');

/**
 * Comprueba una estructura básica de correo: texto antes de `@`, dominio y
 * terminación de al menos dos caracteres. No intenta verificar que la cuenta
 * exista; su propósito es impedir avanzar con un formato evidentemente inválido.
 */
export const emailValido = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

/**
 * Acepta números de teléfono colombianos de diez dígitos.
 * Antes de contar, descarta separadores para que `300 123 4567` y `3001234567`
 * se evalúen igual. No verifica la asignación del número a una persona.
 */
export const telefonoValido = (tel: string): boolean => /^\d{10}$/.test(soloDigitos(tel));

/**
 * Identifica la marca mediante prefijos reconocidos por el formulario.
 * La detección se usa para limitar el largo al escribir y para validar el CVV;
 * un resultado distinto de `Desconocida` no garantiza que la tarjeta sea real.
 */
export function marcaTarjeta(numero: string): MarcaTarjeta {
  const d = soloDigitos(numero);
  // Se revisa el prefijo de cada red y se deja el resto como entrada aún no clasificada.
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'Amex';
  return 'Desconocida';
}

/**
 * Da formato legible al número sin alterar su valor numérico.
 * Amex usa grupos 4-6-5 y un máximo de 15 dígitos; las demás marcas usan
 * grupos de cuatro y se limitan a 16. Un número aún incompleto también se
 * formatea para que el usuario vea el patrón que debe escribir.
 */
export function formatearTarjeta(entrada: string): string {
  const marca = marcaTarjeta(entrada);
  const d = soloDigitos(entrada).slice(0, marca === 'Amex' ? 15 : 16);
  // El formato Amex tiene una agrupación central más larga que las otras marcas.
  if (marca === 'Amex') return [d.slice(0, 4), d.slice(4, 10), d.slice(10)].filter(Boolean).join(' ');
  return d.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Aplica el checksum de Luhn para detectar errores comunes de digitación.
 * Recorre los dígitos de derecha a izquierda, duplica uno de cada dos y resta
 * nueve a los productos de dos cifras. La suma final debe ser múltiplo de diez.
 * Este cálculo valida consistencia matemática, no autoriza ni cobra la tarjeta.
 */
export function luhnValido(numero: string): boolean {
  const d = soloDigitos(numero);
  // Rechaza de inmediato entradas demasiado cortas para ser una tarjeta aceptable.
  if (d.length < 12) return false;
  let suma = 0;
  let doble = false;
  // `doble` alterna entre posiciones; el primer dígito se procesa desde la derecha.
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (doble) {
      n *= 2;
      // Restar nueve equivale a sumar los dígitos de un producto de dos cifras.
      if (n > 9) n -= 9;
    }
    suma += n;
    doble = !doble;
  }
  return suma % 10 === 0;
}

/**
 * Combina las reglas de longitud por marca con el checksum de Luhn.
 * Checkout la consulta antes de ejecutar su confirmación simulada; no existe
 * aquí comunicación con una red bancaria.
 */
export function tarjetaValida(numero: string): boolean {
  const d = soloDigitos(numero);
  const largoEsperado = marcaTarjeta(d) === 'Amex' ? 15 : 16;
  // Ambas condiciones son necesarias: longitud compatible con la marca y checksum válido.
  return d.length === largoEsperado && luhnValido(d);
}

/**
 * Normaliza el vencimiento mientras se escribe.
 * Conserva como máximo cuatro dígitos e inserta la barra cuando ya existe un
 * valor para el año. La validez cronológica se comprueba por separado.
 */
export function formatearVence(entrada: string): string {
  const d = soloDigitos(entrada).slice(0, 4);
  // La barra aparece solo al empezar a escribir el año; mes incompleto se deja intacto.
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/**
 * Valida formato y vigencia de `MM/AA`.
 * Separa mes y año, rechaza meses fuera de 1–12, compara con el mes actual y
 * limita el futuro a veinte años. `hoy` se puede inyectar para pruebas
 * deterministas en lugar de depender siempre de la fecha del equipo.
 */
export function vencimientoValido(valor: string, hoy: Date = new Date()): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(valor);
  // Sin dos dígitos para mes y año no se puede continuar con las demás reglas.
  if (!m) return false;
  const mes = Number(m[1]);
  const anio = 2000 + Number(m[2]);
  // Evita fechas inexistentes antes de compararlas con el calendario actual.
  if (mes < 1 || mes > 12) return false;
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;
  // Una fecha del año actual solo está vencida si su mes ya quedó atrás.
  if (anio < anioActual || (anio === anioActual && mes < mesActual)) return false;
  // Se rechazan fechas demasiado lejanas que suelen indicar un año mal digitado.
  return anio <= anioActual + 20;
}

/**
 * Exige tres dígitos para Visa/Mastercard y cuatro para Amex.
 * Elimina primero los separadores para que la regla dependa solo de los números.
 */
export function cvvValido(cvv: string, marca: MarcaTarjeta): boolean {
  const d = soloDigitos(cvv);
  return d.length === (marca === 'Amex' ? 4 : 3);
}

/**
 * Devuelve únicamente el sufijo que puede mostrarse en el resumen del pedido.
 * Se limpian los separadores y nunca se devuelve el número completo de tarjeta.
 */
export const ultimos4 = (numero: string): string => soloDigitos(numero).slice(-4);
