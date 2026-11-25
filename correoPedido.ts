/*
 * Envío del correo de confirmación mediante la API REST de EmailJS.
 * Las variables EXPO_PUBLIC_* quedan incluidas en el bundle del cliente; no deben contener secretos
 * que necesiten permanecer privados. El flujo de compra llama a enviarCorreoPedido desde Checkout.
 */

/** Línea de producto formateada para el cuerpo del mensaje del pedido. */
export type LineaPedido = { nombre: string; detalle: string; precio: string };

/** Datos de cliente, productos y totales compartidos por Checkout y las plantillas EmailJS. */
export type DatosCorreo = {
  codigoPedido: string;
  fecha: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  metodoEnvio: string;
  metodoPago: string;
  lineas: LineaPedido[];
  subtotal: string;
  descuento: string;
  envio: string;
  total: string;
  cupon?: string;
};

/** Configuración requerida por la API; sus valores se cargan desde variables de entorno. */
export type ConfigCorreo = {
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
  correoTienda: string;
};

/** Resultado que Checkout usa para mostrar éxito, falta de configuración o error. */
export type ResultadoCorreo = {
  tipo: 'enviado' | 'no_configurado' | 'error';
  mensaje: string;
};

// Expo reemplaza estas expresiones al compilar (solo variables que empiezan por EXPO_PUBLIC_).
// @ts-ignore
const ENV_SERVICE_ID: string | undefined = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
// @ts-ignore
const ENV_TEMPLATE_ID: string | undefined = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
// @ts-ignore
const ENV_PUBLIC_KEY: string | undefined = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;
// @ts-ignore
const ENV_PRIVATE_KEY: string | undefined = process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY;
// @ts-ignore
const ENV_CORREO_TIENDA: string | undefined = process.env.EXPO_PUBLIC_CORREO_TIENDA;

/** Configuración leída del entorno; se recortan espacios para evitar errores de plantilla. */
export const CONFIG_CORREO: ConfigCorreo = {
  serviceId: (ENV_SERVICE_ID ?? '').trim(),
  templateId: (ENV_TEMPLATE_ID ?? '').trim(),
  publicKey: (ENV_PUBLIC_KEY ?? '').trim(),
  privateKey: (ENV_PRIVATE_KEY ?? '').trim(),
  correoTienda: (ENV_CORREO_TIENDA ?? '').trim(),
};

/**
 * Comprueba el mínimo necesario para intentar una llamada a EmailJS.
 * La clave privada es opcional en esta comprobación porque algunos servicios
 * no la requieren; el destinatario de tienda también puede omitirse.
 */
export const correoConfigurado = (c: ConfigCorreo = CONFIG_CORREO): boolean =>
  !!(c.serviceId && c.templateId && c.publicKey);

/** Endpoint REST que recibe los parámetros de las plantillas EmailJS. */
const URL_EMAILJS = 'https://api.emailjs.com/api/v1.0/email/send';

/** Escapa texto antes de insertarlo dentro de celdas HTML del correo. */
const esc = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Construye la versión de texto plano del pedido para plantillas y correos alternativos.
 * El recorrido conserva el orden del carrito y añade talla o presentación solo cuando existe.
 * Después agrega el resumen de costos; la línea de descuento se omite si no hubo descuento.
 */
export function textoPedido(d: DatosCorreo): string {
  const L: string[] = [];
  // El índice hace que cada artículo quede numerado en el mensaje enviado al cliente.
  d.lineas.forEach((l, i) => L.push(`${i + 1}. ${l.nombre}${l.detalle ? ` (${l.detalle})` : ''} — ${l.precio}`));
  L.push('');
  L.push(`Subtotal: ${d.subtotal}`);
  // El cupón se incluye en la etiqueta solo si se aplicó uno al cálculo del pedido.
  if (d.descuento) L.push(`Descuento${d.cupon ? ` (${d.cupon})` : ''}: -${d.descuento}`);
  L.push(`Envío: ${d.envio}`);
  L.push(`TOTAL: ${d.total}`);
  return L.join('\n');
}

/**
 * Genera las filas de artículos que se insertan en la tabla HTML de la plantilla.
 * Cada producto se convierte en una fila con nombre, detalle opcional y precio;
 * `esc` protege los textos dinámicos para que sus caracteres no se interpreten como HTML.
 */
export function htmlPedido(d: DatosCorreo): string {
  // `map` transforma cada línea del carrito y `join` reúne las filas sin separadores extra.
  return d.lineas
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e6e0d0">${esc(l.nombre)}` +
        (l.detalle ? `<br><span style="color:#8a8470;font-size:12px">${esc(l.detalle)}</span>` : '') +
        `</td><td style="padding:8px 0;border-bottom:1px solid #e6e0d0;text-align:right;white-space:nowrap">${esc(l.precio)}</td></tr>`,
    )
    .join('');
}

/**
 * Adapta los datos del pedido a los nombres de variables configurados en EmailJS.
 * El mismo constructor sirve para el correo del comprador y para la copia de tienda:
 * `paraTienda` cambia asunto, saludo y nombre del destinatario, pero conserva el pedido.
 */
function parametros(d: DatosCorreo, destino: string, paraTienda: boolean): Record<string, string> {
  /*
   * EmailJS sustituye estas claves en la plantilla elegida. Los campos se preparan
   * en un único objeto para que cliente y tienda reciban la misma información del
   * pedido, con asunto y saludo ajustados por `paraTienda`.
   */
  return {
    subject: paraTienda
      ? `Nueva venta ${d.codigoPedido} · ${d.nombre}`
      : `Luxor Collection · Confirmación de tu pedido ${d.codigoPedido}`,
    intro: paraTienda
      ? `Tienes una nueva venta de ${d.nombre}.`
      : `Hola ${d.nombre}, hemos recibido tu pedido. Estos son los detalles:`,
    to_email: destino,
    to_name: paraTienda ? 'Luxor Collection' : d.nombre,
    reply_to: d.email,
    order_id: d.codigoPedido,
    order_date: d.fecha,
    customer_name: d.nombre,
    customer_email: d.email,
    customer_phone: d.telefono,
    shipping_address: d.direccion,
    shipping_method: d.metodoEnvio,
    payment_method: d.metodoPago,
    items_text: textoPedido(d),
    items_html: htmlPedido(d),
    subtotal: d.subtotal,
    discount: d.descuento ? `-${d.descuento}${d.cupon ? ` (${d.cupon})` : ''}` : '—',
    shipping_cost: d.envio,
    total: d.total,
    store_name: 'Luxor Collection',
  };
}

/**
 * Traduce respuestas HTTP conocidas de EmailJS a instrucciones que Checkout puede mostrar.
 * Los casos específicos orientan sobre credenciales, plantilla o límites de envío;
 * cualquier otro estado conserva su código para que el fallo no parezca un éxito.
 */
export function mensajeDeError(status: number, detalle: string): string {
  // Se limita el detalle remoto para que una respuesta larga no inunde el aviso de Checkout.
  const extra = detalle ? ` (${detalle.slice(0, 120)})` : '';
  // Cada estado común apunta a una causa de configuración distinta.
  if (status === 400) return `EmailJS rechazó los datos: revisa Service ID, Template ID y Public Key${extra}.`;
  if (status === 401 || status === 403)
    return `EmailJS bloqueó la petición: activa "Allow EmailJS API for non-browser applications" y usa la Private Key${extra}.`;
  if (status === 412) return `El servicio de correo conectado en EmailJS necesita reautorizarse${extra}.`;
  if (status === 422) return `La plantilla de EmailJS no coincide con los datos enviados${extra}.`;
  if (status === 429) return 'Se alcanzó el límite de envíos de EmailJS. Intenta más tarde.';
  return `Error del servidor de correo (${status})${extra}.`;
}

/**
 * Envía una plantilla individual y devuelve un resultado que la interfaz pueda presentar.
 *
 * El temporizador aborta la petición si la red no responde dentro del plazo. Una
 * respuesta HTTP no exitosa se traduce con `mensajeDeError`; los errores de red y
 * timeout se distinguen en el catch. El finally siempre limpia el temporizador,
 * tanto si fetch responde como si falla.
 */
async function enviarUno(
  params: Record<string, string>,
  config: ConfigCorreo,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: boolean; mensaje: string }> {
  // AbortController puede no existir en runtimes antiguos; en ese caso se mantiene
  // la petición sin señal de cancelación, pero el resultado sigue siendo manejado.
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const temporizador = setTimeout(() => ctrl?.abort(), timeoutMs);
  try {
    // Los identificadores y las variables de plantilla deben coincidir con EmailJS.
    const cuerpo: Record<string, unknown> = {
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      template_params: params,
    };
    if (config.privateKey) cuerpo.accessToken = config.privateKey;
    const res = await fetchFn(URL_EMAILJS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: ctrl?.signal,
    });
    // La API confirma el envío con cualquier respuesta HTTP exitosa.
    if (res.ok) return { ok: true, mensaje: 'OK' };
    let detalle = '';
    // El texto del servidor se usa como contexto limitado para diagnosticar el rechazo.
    try { detalle = await res.text(); } catch { /* sin detalle */ }
    return { ok: false, mensaje: mensajeDeError(res.status, detalle) };
  } catch (e) {
    // AbortError significa que venció el límite de tiempo; otros fallos suelen ser de red.
    const nombre = (e as { name?: string })?.name;
    return {
      ok: false,
      mensaje: nombre === 'AbortError'
        ? 'Se agotó el tiempo de espera. Revisa tu conexión a internet.'
        : 'No hay conexión con el servidor de correo. Revisa tu internet.',
    };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Envía primero la confirmación del comprador y opcionalmente notifica a la tienda.
 *
 * Si falta configuración, se informa antes de iniciar la red. Cuando hay destinatario
 * de tienda distinto del correo del cliente, ambas peticiones se ejecutan en paralelo;
 * el éxito principal depende de que reciba el mensaje el cliente y el resultado también
 * comunica si la copia de tienda falló.
 */
export async function enviarCorreoPedido(
  datos: DatosCorreo,
  opciones: { config?: ConfigCorreo; fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<ResultadoCorreo> {
  const config = opciones.config ?? CONFIG_CORREO;
  const fetchFn = opciones.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : (undefined as unknown as typeof fetch));
  const timeoutMs = opciones.timeoutMs ?? 15000;

  /*
   * Las opciones permiten inyectar configuración, fetch y timeout en pruebas.
   * En la app normalmente se usan valores del entorno, la API global y 15 segundos.
   */
  // No se intenta llamar a EmailJS con IDs o clave pública vacíos.
  if (!correoConfigurado(config)) {
    return { tipo: 'no_configurado', mensaje: 'El envío automático de correos no está configurado (faltan las claves de EmailJS).' };
  }
  // La guarda permite informar la falta de fetch sin iniciar la construcción de la petición.
  if (!fetchFn) return { tipo: 'error', mensaje: 'Este dispositivo no permite conexiones de red.' };

  const tienda = config.correoTienda;
  // Evita enviar una segunda copia al mismo buzón cuando cliente y tienda coinciden.
  const copiaTienda = !!tienda && tienda.toLowerCase() !== datos.email.trim().toLowerCase();

  // La copia es opcional, por eso se representa con null cuando no se requiere.
  const [cliente, dueno] = await Promise.all([
    enviarUno(parametros(datos, datos.email.trim(), false), config, fetchFn, timeoutMs),
    copiaTienda ? enviarUno(parametros(datos, tienda, true), config, fetchFn, timeoutMs) : Promise.resolve(null),
  ]);

  // El correo al cliente determina el estado principal; se añade el resultado de tienda.
  if (cliente.ok) {
    const nota = dueno ? (dueno.ok ? ' Se envió una copia a la tienda.' : ' (La copia para la tienda falló.)') : '';
    return { tipo: 'enviado', mensaje: `Confirmación enviada a ${datos.email.trim()}.${nota}` };
  }
  const aviso = dueno?.ok ? ' La tienda sí recibió el aviso de la venta.' : '';
  return { tipo: 'error', mensaje: `${cliente.mensaje}${aviso}` };
}

/**
 * Genera un enlace mailto como alternativa manual si EmailJS no está configurado o falla.
 * Todos los valores dinámicos se codifican para que espacios y saltos de línea no rompan
 * la URL; el cuerpo se limita para evitar crear un enlace excesivamente largo.
 */
export function construirMailto(datos: DatosCorreo, config: ConfigCorreo = CONFIG_CORREO): string {
  /*
   * Este enlace es una alternativa de usuario, no un segundo envío automático.
   * Los valores se codifican por separado y el texto se acota para mantener el
   * enlace dentro de un tamaño razonable en distintas aplicaciones de correo.
   */
  const asunto = `Luxor Collection · Pedido ${datos.codigoPedido}`;
  const cuerpo =
    `Hola ${datos.nombre},\n\nGracias por tu compra en Luxor Collection.\n` +
    `Pedido: ${datos.codigoPedido}\nFecha: ${datos.fecha}\n\n${textoPedido(datos)}\n\n` +
    `Envío a: ${datos.direccion}\nTeléfono: ${datos.telefono}\nMétodo de pago: ${datos.metodoPago}\n`;
  const cc = config.correoTienda ? `&cc=${encodeURIComponent(config.correoTienda)}` : '';
  return `mailto:${encodeURIComponent(datos.email.trim())}?subject=${encodeURIComponent(asunto)}${cc}&body=${encodeURIComponent(cuerpo.slice(0, 1800))}`;
}
