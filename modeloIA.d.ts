/**
 * Intenciones que el clasificador local puede reconocer en una pregunta.
 * Cada intención coincide con una propiedad del producto que el asistente
 * puede mostrar; no representa una acción ni una consulta a un servidor.
 */
export type Intencion = 'precio' | 'nombre' | 'descripcion';
/**
 * Frases de referencia que modeloIA.js compara con la pregunta del usuario.
 * Son datos locales de ejemplo, no un conjunto de entrenamiento remoto.
 */
export const ejemplos: {texto: string; intencion: Intencion}[];
/**
 * Estructura que `clasificar` devuelve y AsistenteIA utiliza en dos partes:
 * `intencion` determina qué dato mostrar; `puntuacion` y `ranking` alimentan
 * la explicación visual de similitudes.
 */
export type ResultadoClasificacion = {
  intencion: Intencion | null;
  puntuacion: number;
  ranking: [Intencion, number][];
};
/**
 * Declara a TypeScript la función JavaScript de modeloIA.js.
 * Esta firma mantiene alineados los tipos entre el clasificador y el componente
 * que lo consume, sin duplicar la implementación del algoritmo.
 */
export function clasificar(pregunta: string): ResultadoClasificacion;
