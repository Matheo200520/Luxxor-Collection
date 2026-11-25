/*
 * Clasificador didáctico local que consume AsistenteIA mediante `clasificar`.
 * No genera texto: compara la pregunta con frases de ejemplo y decide si la
 * persona quiere consultar el precio, nombre o descripción de un producto.
 * La declaración de tipos correspondiente está en modeloIA.d.ts.
 */
export const ejemplos = [
  { texto: 'cuanto cuesta cual es el precio valor costo', intencion: 'precio' },
  { texto: 'quiero saber el importe que debo pagar', intencion: 'precio' },
  { texto: 'como se llama nombre del producto articulo', intencion: 'nombre' },
  { texto: 'dime el nombre o titulo del producto', intencion: 'nombre' },
  { texto: 'descripcion caracteristicas detalles del producto', intencion: 'descripcion' },
  { texto: 'explica para que sirve informacion del articulo', intencion: 'descripcion' },
];
/*
 * Palabras muy frecuentes que aportan poca información para distinguir una
 * intención. Quitarlas permite que la comparación se centre en términos como
 * "precio", "llama" o "detalles", no en artículos y preposiciones.
 */
const vacias = new Set(['el','la','los','las','de','del','un','una','que','es','en','y','o','me','lo','al','por','se','su']);
/**
 * Convierte una frase en una lista comparable de términos.
 *
 * Primero normaliza a minúsculas y separa las marcas Unicode de los acentos;
 * después elimina esas marcas, reemplaza la puntuación por espacios y divide
 * por palabras. Finalmente excluye entradas vacías y palabras funcionales.
 * El mismo proceso se aplica a la pregunta y a cada frase de `ejemplos`.
 */
function tokens(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t && !vacias.has(t));
}
/**
 * Calcula una similitud de coseno simplificada entre dos grupos de términos.
 *
 * Los Set evitan contar varias veces una palabra repetida. Si una frase no
 * aporta palabras comparables, la similitud es cero; de lo contrario, se
 * divide la cantidad de términos compartidos por la media geométrica de los
 * tamaños de ambos conjuntos. El resultado es una puntuación, no una certeza.
 */
function similitud(a, b) {
  const aa = new Set(a), bb = new Set(b);
  // Sin términos en cualquiera de las frases no existe evidencia de similitud.
  if (!aa.size || !bb.size) return 0;
  let comunes = 0;
  // Cuenta cada término una sola vez porque `aa` es un conjunto.
  for (const t of aa) if (bb.has(t)) comunes++;
  return comunes / Math.sqrt(aa.size * bb.size);
}
/**
 * Clasifica una pregunta y devuelve tanto la decisión como sus puntajes.
 *
 * Para cada ejemplo calcula la similitud y conserva el mejor puntaje de su
 * intención. Después ordena esos máximos para construir el ranking visible en
 * el asistente. Solo acepta una intención cuando su puntaje mínimo y su
 * diferencia frente a la segunda opción superan los umbrales didácticos.
 */
export function clasificar(pregunta) {
  // La consulta se normaliza una sola vez y se reutiliza en todas las comparaciones.
  const entrada = tokens(pregunta);
  const mejores = new Map();
  // Varios ejemplos pueden describir la misma intención; se conserva el más cercano.
  for (const e of ejemplos) {
    const valor = similitud(entrada, tokens(e.texto));
    mejores.set(e.intencion, Math.max(mejores.get(e.intencion) || 0, valor));
  }
  // El orden descendente permite mostrar primero la alternativa con más coincidencias.
  const ranking = [...mejores].sort((a,b) => b[1] - a[1]);
  const [etiqueta, puntuacion] = ranking[0] || [null, 0];
  const diferencia = puntuacion - (ranking[1]?.[1] || 0);
  /*
   * Los dos umbrales evitan responder ante una pregunta demasiado distinta de
   * los ejemplos o cuando las dos intenciones principales quedan casi empatadas.
   * `ranking` conserva todos los puntajes para la interfaz, aunque la decisión
   * sea ambigua. Ninguno de estos valores representa una probabilidad calibrada.
   */
  return { intencion: puntuacion >= 0.2 && diferencia >= 0.08 ? etiqueta : null, puntuacion, ranking };
}