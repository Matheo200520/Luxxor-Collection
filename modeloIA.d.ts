export type Intencion = 'precio' | 'nombre' | 'descripcion';
export const ejemplos: {texto: string; intencion: Intencion}[];
export function clasificar(pregunta: string): {intencion: Intencion | null; puntuacion: number};
