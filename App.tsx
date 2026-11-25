import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  Image,
  Alert,
  TextInput,
  useWindowDimensions,
  Platform,
  Modal,
  Animated,
  Easing,
  PanResponder,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import ExploracionCamara, { ProductoConImagen as ProductoConImagenBase } from './ExploracionCamara';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import AsistenteIA from './AsistenteIA';
import { enviarCorreoPedido, construirMailto } from './correoPedido';
import type { DatosCorreo, ResultadoCorreo } from './correoPedido';
import {
  emailValido, telefonoValido, soloDigitos, marcaTarjeta, formatearTarjeta, tarjetaValida,
  formatearVence, vencimientoValido, cvvValido, ultimos4,
} from './validacionesCompra';

/* ===================== TIPOS ===================== */
/** Categorías que usan el catálogo, los filtros y los formularios de producto. */
export type Categoria = 'Anillo' | 'Cadena' | 'Pulsera' | 'Aretes' | 'Reloj' | 'Perfume';

/** Notas aromáticas que describen un perfume por salida, corazón y fondo. */
export type PiramideOlfativa = {
  salida: string[];
  corazon: string[];
  fondo: string[];
};

/** Registro completo compartido entre el catálogo, el editor y la compra. */
export type Producto = {
  id: string;
  nombre: string;
  descripcion: string;
  precio: string;
  categoria: Categoria;
  tallas?: string[];
  material?: string;
  mililitros?: string[];
  piramide?: PiramideOlfativa;
  genero?: 'Femenino' | 'Masculino' | 'Unisex';
  imagenUri?: string;
  modoImagen?: 'completa' | 'ajustada';
};

/** Producto que necesariamente tiene una URI de imagen, por ejemplo al crearlo con la cámara. */
export type ProductoConImagen = Producto & { imagenUri: string };
/** Campos mínimos que se conservan al guardar un favorito. */
export type ProductoFavorito = Pick<Producto, 'id' | 'nombre' | 'precio' | 'categoria'>;

/** Secciones principales que aparecen en la barra inferior de navegación. */
type Pestana = 'Catalogo' | 'Favoritos' | 'Sensores' | 'Carrito';

/** Copia del producto dentro del carrito, con opciones elegidas por el cliente. */
type ItemCarrito = {
  id: string;
  productoId: string;
  nombre: string;
  precio: string;
  categoria: Categoria;
  talla?: string;
  mililitros?: string;
  imagenUri?: string;
};

/** Lectura normalizada del acelerómetro en sus ejes X, Y y Z. */
type Lectura = { x: number; y: number; z: number };
/** Indica si las lecturas vienen del teléfono o de la simulación web. */
type Modo = 'real' | 'simulacion';
/** Datos que se muestran en el historial visual de movimiento detectado. */
type Alerta = { hora: string; magnitud: number };

/** Información final utilizada para confirmar la compra y generar el recibo. */
type Recibo = {
  codigoPedido: string;
  email: string;
  nombre: string;
  telefono: string;
  direccion: string;
  metodoPago: string;
  metodoEnvio: string;
  items: ItemCarrito[];
  subtotal: number;
  descuento: number;
  envio: number;
  cupon?: string;
  total: number;
  fecha: string;
};

/* ===================== STORAGE KEYS ===================== */
/** Clave de almacenamiento del catálogo actual. */
const PRODUCTOS_KEY = '@luxor:productos-v2';
/** Clave de almacenamiento de los favoritos actuales. */
const FAVORITOS_KEY = '@luxor:favoritos-v2';
/** Clave antigua leída para migrar un favorito guardado por versiones previas. */
const LEGACY_FAVORITO_KEY = '@luxor:producto-favorito';
/** Clave antigua de productos con imagen que se incorpora durante la migración. */
const LEGACY_PRODUCTOS_IMG_KEY = '@luxor:productos-con-imagen';
/** Clave que recuerda si el cliente ya desbloqueó el cupón de brillo. */
const CUPON_BRILLO_KEY = '@luxor:cupon-brillo';

/* ===================== REGLAS DE COMPRA ===================== */
/** Tarifas de envío y valor mínimo para obtener envío estándar gratis. */
const ENVIO_ESTANDAR = 15000;
const ENVIO_EXPRESS = 35000;
const ENVIO_GRATIS_DESDE = 500000;
/** Reglas locales de descuento; BRILLO10 requiere completar el reto de Sensores. */
const CUPONES: Record<string, { porcentaje: number; requiereBrillo?: boolean; descripcion: string }> = {
  BRILLO10: { porcentaje: 0.1, requiereBrillo: true, descripcion: '10 % de descuento por pulir una joya en Sensores' },
  BIENVENIDA: { porcentaje: 0.05, descripcion: '5 % de descuento de bienvenida' },
};

/* ===================== CATÁLOGO REAL INICIAL ===================== */
/** Catálogo de respaldo que se presenta cuando el dispositivo aún no tiene datos guardados. */
const CATALOGO_INICIAL: Producto[] = [
  { id: 'real-001', nombre: 'Anillo Solitario Diamante 0.5ct', descripcion: 'Oro blanco 18k con diamante central corte brillante talla VS1.', precio: '$ 4.850.000', categoria: 'Anillo', tallas: ['5', '6', '7', '8', '9'], material: 'Oro blanco 18k' },
  { id: 'real-002', nombre: 'Anillo Compromiso Zafiro Azul', descripcion: 'Zafiro colombiano corte cojín con halo de diamantes.', precio: '$ 6.200.000', categoria: 'Anillo', tallas: ['5', '6', '7', '8'], material: 'Oro blanco 18k' },
  { id: 'real-003', nombre: 'Anillo Sello Oro Macizo 24k', descripcion: 'Anillo robusto para hombre, acabado mate y grabado opcional.', precio: '$ 3.100.000', categoria: 'Anillo', tallas: ['8', '9', '10', '11'], material: 'Oro 24k' },
  { id: 'real-004', nombre: 'Argollas Matrimonio Oro Rosado', descripcion: 'Par de argollas clásicas en oro rosado 18k con brillo espejo.', precio: '$ 2.450.000', categoria: 'Anillo', tallas: ['5', '6', '7', '8', '9', '10'], material: 'Oro rosado 18k' },
  { id: 'real-005', nombre: 'Anillo Eternity Diamantes', descripcion: 'Banda completa con 18 diamantes talla brillante engastados.', precio: '$ 5.700.000', categoria: 'Anillo', tallas: ['5', '6', '7', '8'], material: 'Oro blanco 18k' },
  { id: 'real-010', nombre: 'Cadena Tejido Cubano Oro 18k', descripcion: 'Eslabones gruesos tejido cubano, cierre langosta reforzado.', precio: '$ 3.850.000', categoria: 'Cadena', tallas: ['45 cm', '50 cm', '55 cm', '60 cm'], material: 'Oro amarillo 18k' },
  { id: 'real-011', nombre: 'Cadena Veneciana Oro Italiano', descripcion: 'Diseño veneciano tradicional italiano, ligera y resistente.', precio: '$ 1.950.000', categoria: 'Cadena', tallas: ['40 cm', '45 cm', '50 cm'], material: 'Oro amarillo 18k' },
  { id: 'real-012', nombre: 'Gargantilla Oro Blanco con Zafiro', descripcion: 'Gargantilla elegante con dije de zafiro azul y brillantes.', precio: '$ 2.900.000', categoria: 'Cadena', tallas: ['40 cm', '42 cm', '45 cm'], material: 'Oro blanco 18k' },
  { id: 'real-013', nombre: 'Cadena Barbada Oro 14k', descripcion: 'Cadena barbada clásica de uso diario, cierre de resorte.', precio: '$ 1.250.000', categoria: 'Cadena', tallas: ['45 cm', '50 cm', '55 cm'], material: 'Oro 14k' },
  { id: 'real-020', nombre: 'Pulsera Tejido Cartier Oro', descripcion: 'Diseño clásico en oro amarillo 18k con cierre de seguridad.', precio: '$ 2.100.000', categoria: 'Pulsera', tallas: ['16 cm', '17 cm', '18 cm', '19 cm'], material: 'Oro amarillo 18k' },
  { id: 'real-021', nombre: 'Pulsera Balín Oro 18k', descripcion: 'Pulsera ajustable con balines de oro amarillo pulido.', precio: '$ 1.450.000', categoria: 'Pulsera', tallas: ['17 cm', '18 cm', '19 cm', '20 cm'], material: 'Oro amarillo 18k' },
  { id: 'real-022', nombre: 'Pulsera Charm Plata 925', descripcion: 'Base de plata 925 con charms intercambiables, incluye 2 dijes.', precio: '$ 680.000', categoria: 'Pulsera', tallas: ['16 cm', '17 cm', '18 cm', '19 cm'], material: 'Plata 925' },
  { id: 'real-030', nombre: 'Aretes Topo Diamante 0.5ct', descripcion: 'Diamantes talla brillante montados en oro blanco 18k.', precio: '$ 1.250.000', categoria: 'Aretes', material: 'Oro blanco 18k' },
  { id: 'real-031', nombre: 'Aretes Largos Perlas Cultivadas', descripcion: 'Perlas cultivadas naturales con ganchos de oro 18k.', precio: '$ 590.000', categoria: 'Aretes', material: 'Oro 18k + Perla' },
  { id: 'real-032', nombre: 'Aretes Argolla Oro Italiano', descripcion: 'Argollas italianas texturizadas, ligeras para uso diario.', precio: '$ 780.000', categoria: 'Aretes', material: 'Oro amarillo 18k' },
  { id: 'real-040', nombre: 'Reloj Automático Suizo Bañado Oro', descripcion: 'Mecanismo automático suizo, caja bañada en oro 18k, correa cuero.', precio: '$ 5.200.000', categoria: 'Reloj', material: 'Acero + baño oro 18k' },
  { id: 'real-041', nombre: 'Reloj Damas Acero con Zafiros', descripcion: 'Caja de acero con bisel de zafiros, movimiento cuarzo suizo.', precio: '$ 3.400.000', categoria: 'Reloj', material: 'Acero quirúrgico' },
  {
    id: 'real-050', nombre: 'Luxor Noir Intense', descripcion: 'Fragancia amaderada oriental de alta concentración. Edición insignia.',
    precio: '$ 480.000', categoria: 'Perfume', mililitros: ['50 ml', '100 ml', '150 ml'], genero: 'Masculino',
    piramide: { salida: ['Bergamota', 'Pimienta negra', 'Cardamomo'], corazon: ['Lavanda', 'Cuero', 'Vetiver'], fondo: ['Ámbar', 'Sándalo', 'Haba tonka'] },
  },
  {
    id: 'real-051', nombre: 'Luxor Rose Éternelle', descripcion: 'Rosa damascena con toques frutales, ideal para ocasiones especiales.',
    precio: '$ 420.000', categoria: 'Perfume', mililitros: ['30 ml', '50 ml', '100 ml'], genero: 'Femenino',
    piramide: { salida: ['Lichi', 'Pera', 'Bergamota'], corazon: ['Rosa damascena', 'Peonía', 'Jazmín'], fondo: ['Almizcle blanco', 'Cedro', 'Ámbar'] },
  },
  {
    id: 'real-052', nombre: 'Luxor Oud Royal', descripcion: 'Oud árabe auténtico con azafrán y rosa. Alta concentración.',
    precio: '$ 720.000', categoria: 'Perfume', mililitros: ['50 ml', '100 ml'], genero: 'Unisex',
    piramide: { salida: ['Azafrán', 'Nuez moscada'], corazon: ['Rosa turca', 'Pachulí'], fondo: ['Oud', 'Ámbar gris', 'Sándalo'] },
  },
  {
    id: 'real-053', nombre: 'Luxor Aqua Fresh', descripcion: 'Fragancia acuática fresca para el día a día, unisex.',
    precio: '$ 320.000', categoria: 'Perfume', mililitros: ['50 ml', '100 ml', '150 ml'], genero: 'Unisex',
    piramide: { salida: ['Limón siciliano', 'Menta', 'Notas marinas'], corazon: ['Lavanda', 'Salvia', 'Geranio'], fondo: ['Almizcle', 'Cedro blanco', 'Musgo'] },
  },
  {
    id: 'real-054', nombre: 'Luxor Gold Vanilla', descripcion: 'Vainilla de Madagascar con ámbar y praliné. Cálido y envolvente.',
    precio: '$ 460.000', categoria: 'Perfume', mililitros: ['30 ml', '50 ml', '100 ml'], genero: 'Femenino',
    piramide: { salida: ['Pera', 'Mandarina'], corazon: ['Vainilla de Madagascar', 'Orquídea', 'Praliné'], fondo: ['Ámbar', 'Haba tonka', 'Almizcle'] },
  },
  {
    id: 'real-055', nombre: 'Luxor Oud & Spice', descripcion: 'Explosión de especias orientales con fondo de oud ahumado.',
    precio: '$ 680.000', categoria: 'Perfume', mililitros: ['50 ml', '100 ml'], genero: 'Masculino',
    piramide: { salida: ['Canela', 'Cardamomo', 'Pimienta rosa'], corazon: ['Cuero', 'Incienso', 'Rosa'], fondo: ['Oud', 'Vetiver', 'Ámbar'] },
  },
];

/* ===================== UTILIDADES ===================== */
/** Convierte el precio visible en un entero de pesos para filtros y totales. */
function parsePrecio(precio: string): number {
  return Number(precio.replace(/[^0-9]/g, '')) || 0;
}
/** Formatea un importe entero con separadores colombianos y prefijo de pesos. */
function formatearCOP(valor: number): string {
  return '$ ' + valor.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
/** Sugiere una categoría según palabras clave cuando se importan datos antiguos. */
function inferirCategoria(nombre: string): Categoria {
  const n = nombre.toLowerCase();
  /*
   * Se revisan palabras desde las categorías más específicas a sus sinónimos.
   * La primera coincidencia define la sugerencia; no se usa para reemplazar una
   * categoría válida que ya venga explícita en un producto importado.
   */
  if (n.includes('anillo') || n.includes('argolla')) return 'Anillo';
  if (n.includes('cadena') || n.includes('collar') || n.includes('gargantilla')) return 'Cadena';
  if (n.includes('pulsera') || n.includes('brazalete')) return 'Pulsera';
  if (n.includes('arete') || n.includes('topo') || n.includes('aro')) return 'Aretes';
  if (n.includes('reloj')) return 'Reloj';
  if (n.includes('perfume') || n.includes('fragancia') || n.includes('eau')) return 'Perfume';
  return 'Anillo';
}

/* ===================== MIGRACIÓN + STORAGE ===================== */
/** Identificador y almacén IndexedDB usados por la versión web para conservar imágenes grandes. */
const WEB_STORAGE_DB = 'luxor-collection';
const WEB_STORAGE_STORE = 'data';
const WEB_PRODUCTS_KEY = 'products';

/**
 * Abre la base web del catálogo y prepara su almacén si es la primera ejecución.
 *
 * IndexedDB solo existe en el navegador; si el entorno no la ofrece se devuelve
 * un rechazo para que el llamador active su mecanismo alternativo de persistencia.
 * La versión de la base se incrementa para permitir cambios de esquema futuros.
 */
function abrirAlmacenWeb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('El almacenamiento del navegador no está disponible.'));
  }
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(WEB_STORAGE_DB, 1);
    solicitud.onupgradeneeded = () => {
      // El object store se crea una sola vez; una base existente conserva sus datos.
      if (!solicitud.result.objectStoreNames.contains(WEB_STORAGE_STORE)) {
        solicitud.result.createObjectStore(WEB_STORAGE_STORE);
      }
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error ?? new Error('No se pudo abrir el almacenamiento del navegador.'));
  });
}

/**
 * Lee el catálogo serializado de IndexedDB.
 * La transacción es de solo lectura y devuelve `null` cuando todavía no existe
 * la clave. La conexión se cierra en `finally` tanto si la lectura tiene éxito
 * como si una señal de IndexedDB la rechaza.
 */
async function leerProductosWeb(): Promise<string | null> {
  const db = await abrirAlmacenWeb();
  try {
    return await new Promise((resolve, reject) => {
      const transaccion = db.transaction(WEB_STORAGE_STORE, 'readonly');
      const solicitud = transaccion.objectStore(WEB_STORAGE_STORE).get(WEB_PRODUCTS_KEY);
      solicitud.onsuccess = () => resolve(typeof solicitud.result === 'string' ? solicitud.result : null);
      solicitud.onerror = () => reject(solicitud.error ?? new Error('No se pudo leer el catálogo guardado.'));
      transaccion.onabort = () => reject(transaccion.error ?? new Error('Se canceló la lectura del catálogo.'));
    });
  } finally {
    db.close();
  }
}

/**
 * Escribe el catálogo completo en IndexedDB mediante una transacción de escritura.
 * La promesa solo se resuelve al completarse la transacción; los eventos de error
 * y aborto se propagan para que `guardarProductosStorage` pueda usar su respaldo.
 */
async function guardarProductosWeb(contenido: string): Promise<void> {
  const db = await abrirAlmacenWeb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaccion = db.transaction(WEB_STORAGE_STORE, 'readwrite');
      transaccion.objectStore(WEB_STORAGE_STORE).put(contenido, WEB_PRODUCTS_KEY);
      transaccion.oncomplete = () => resolve();
      transaccion.onerror = () => reject(transaccion.error ?? new Error('No se pudo guardar el catálogo.'));
      transaccion.onabort = () => reject(transaccion.error ?? new Error('Se canceló el guardado del catálogo.'));
    });
  } finally {
    db.close();
  }
}

/**
 * Deduce el tipo MIME a partir de la extensión de una URI.
 * Se quitan primero query strings y fragmentos porque no forman parte del nombre
 * del archivo; los formatos conocidos se conservan y los demás se tratan como JPEG.
 */
function mimeImagenDesdeUri(uri: string): string {
  const extension = uri.split(/[?#]/, 1)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  return 'image/jpeg';
}

/**
 * Convierte un MIME admitido en una extensión de archivo segura.
 * La lista explícita evita escribir una extensión arbitraria derivada del archivo;
 * si el tipo no está soportado, el error impide guardar una imagen con formato falso.
 */
function extensionDesdeMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  throw new Error(`Formato de imagen no compatible: ${mime}`);
}

/**
 * Convierte la imagen de un producto a una URI portable para exportar.
 *
 * Una data URI ya incluye sus bytes y puede reutilizarse. En web se descarga el
 * recurso y FileReader lo codifica; en móvil Expo FileSystem lee la URI local en
 * Base64. Los errores se propagan al exportador para que avise si una foto ya no
 * está disponible, sin perder el resto del catálogo.
 */
async function imagenPortable(uri: string): Promise<string> {
  // No volver a codificar un contenido que ya está incorporado en el JSON.
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(uri)) return uri;

  if (Platform.OS === 'web') {
    // `fetch` permite leer tanto recursos blob del navegador como URLs accesibles.
    const respuesta = await fetch(uri);
    if (!respuesta.ok) throw new Error('No se pudo leer la foto desde el navegador.');
    const blob = await respuesta.blob();
    const mime = blob.type.startsWith('image/') ? blob.type : mimeImagenDesdeUri(uri);
    const imagen = new Blob([blob], { type: mime });
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => typeof lector.result === 'string'
        ? resolve(lector.result)
        : reject(new Error('No se pudo convertir la foto para exportarla.'));
      lector.onerror = () => reject(lector.error ?? new Error('No se pudo leer la foto.'));
      lector.readAsDataURL(imagen);
    });
  }

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mimeImagenDesdeUri(uri)};base64,${base64}`;
}

/**
 * Valida y restaura una imagen transportada dentro de un JSON.
 * En web se conserva la data URI para persistirla en IndexedDB; en móvil se
 * decodifica a un archivo del directorio privado, usando MIME y extensión
 * coincidentes. El nombre se deriva del ID sanitizado para no usar rutas del JSON.
 */
async function guardarImagenImportada(dataUri: string, id: string): Promise<string> {
  const coincidencia = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUri);
  if (!coincidencia) throw new Error('El archivo contiene una foto dañada o en un formato no compatible.');
  if (Platform.OS === 'web') return dataUri;

  const directorio = FileSystem.documentDirectory;
  if (!directorio) throw new Error('No se encontró una carpeta segura para guardar las fotos.');
  const nombreSeguro = id.replace(/[^a-z0-9_-]/gi, '_');
  const ruta = `${directorio}luxor-${nombreSeguro}.${extensionDesdeMime(coincidencia[1].toLowerCase())}`;
  await FileSystem.writeAsStringAsync(ruta, coincidencia[2], { encoding: FileSystem.EncodingType.Base64 });
  return ruta;
}

/**
 * Hace persistente una foto recién tomada o seleccionada en móvil.
 *
 * En web la URI permanece bajo el control del navegador. En móvil una data URI
 * se escribe como archivo y una URI ya ubicada en el directorio privado se reutiliza;
 * las demás se copian desde caché al directorio de documentos. Así, las fotos nuevas
 * no dependen de que Android conserve archivos temporales de cámara/galería.
 */
async function guardarImagenPermanente(uri: string, id: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  if (/^data:image\//i.test(uri)) return guardarImagenImportada(uri, id);

  const directorio = FileSystem.documentDirectory;
  if (!directorio) throw new Error('No se encontró una carpeta segura para guardar las fotos.');
  if (uri.startsWith(directorio)) return uri;

  const nombreSeguro = id.replace(/[^a-z0-9_-]/gi, '_');
  const destino = `${directorio}luxor-${nombreSeguro}-${Date.now()}.${extensionDesdeMime(mimeImagenDesdeUri(uri))}`;
  await FileSystem.copyAsync({ from: uri, to: destino });
  return destino;
}

/**
 * Recupera el catálogo aplicando una cadena ordenada de fuentes.
 *
 * En web se prioriza IndexedDB; después se intenta la clave actual de AsyncStorage.
 * Si no hay datos legibles, se parte del catálogo de respaldo y se agregan registros
 * de una clave antigua cuando existe. Los errores de una fuente no deben impedir
 * intentar la siguiente; los registros recuperados se vuelven a guardar en el formato actual.
 */
async function migrarProductos(): Promise<Producto[]> {
  if (Platform.OS === 'web') {
    try {
      const guardados = await leerProductosWeb();
      // Una cadena vacía equivale a no tener catálogo web e inicia la búsqueda del respaldo.
      if (guardados) return JSON.parse(guardados);
    } catch (error) {
      console.warn('No se pudo leer el catálogo del almacenamiento web:', error);
    }
  }
  try {
    const v2 = await AsyncStorage.getItem(PRODUCTOS_KEY);
    if (v2) {
      if (Platform.OS === 'web') {
        // Migra al almacén de mayor capacidad sin impedir el uso si IndexedDB falla.
        try {
          await guardarProductosWeb(v2);
        } catch (error) {
          console.warn('No se pudo migrar el catálogo al almacenamiento web:', error);
        }
      }
      return JSON.parse(v2);
    }
  } catch {}
  const migrados: Producto[] = [...CATALOGO_INICIAL];
  // Migra datos antiguos de fotos a la forma actual del producto si la clave existe.
  try {
    const legacyImg = await AsyncStorage.getItem(LEGACY_PRODUCTOS_IMG_KEY);
    if (legacyImg) {
      const arr = JSON.parse(legacyImg) as any[];
      const convertidos: Producto[] = arr.map((p) => ({
        id: p.id, nombre: p.nombre, descripcion: p.descripcion, precio: p.precio,
        categoria: inferirCategoria(p.nombre), imagenUri: p.imagenUri,
        modoImagen: p.modoImagen || 'completa',
      }));
      migrados.push(...convertidos);
    }
  } catch {}
  try {
    await guardarProductosStorage(migrados);
  } catch (error) {
    console.warn('No se pudo guardar el catálogo en el almacenamiento local:', error);
  }
  return migrados;
}

/**
 * Persiste un catálogo normalizado con una estrategia distinta por plataforma.
 *
 * En web las URI blob son temporales, por eso se convierten antes de serializar.
 * Luego se intenta IndexedDB, que admite imágenes grandes; si no está disponible,
 * se registra el fallo y se prueba AsyncStorage como respaldo. En móvil se guarda
 * directamente la lista que ya contiene rutas privadas para las fotos.
 */
async function guardarProductosStorage(productos: Producto[]) {
  let catalogo = productos;
  if (Platform.OS === 'web') {
    catalogo = [];
    // Se construye una nueva lista: no se mutan los productos que la interfaz ya muestra.
    for (const producto of productos) {
      const imagenUri = producto.imagenUri?.startsWith('blob:')
        ? await imagenPortable(producto.imagenUri)
        : producto.imagenUri;
      catalogo.push({ ...producto, imagenUri });
    }
  }
  const contenido = JSON.stringify(catalogo);
  if (Platform.OS === 'web') {
    try {
      await guardarProductosWeb(contenido);
      return;
    } catch (error) {
      console.warn('No se pudo guardar el catálogo en IndexedDB; se intentará el almacenamiento local:', error);
    }
  }
  await AsyncStorage.setItem(PRODUCTOS_KEY, contenido);
}

/**
 * Recupera favoritos en el formato actual o migra el favorito único antiguo.
 * Si no hay una lista moderna, el registro anterior se convierte en arreglo y se
 * infiere su categoría para que pueda mostrarse con el modelo actual de productos.
 */
async function cargarFavoritos(): Promise<ProductoFavorito[]> {
  try {
    const v2 = await AsyncStorage.getItem(FAVORITOS_KEY);
    if (v2) return JSON.parse(v2);
    const legacy = await AsyncStorage.getItem(LEGACY_FAVORITO_KEY);
    if (legacy) {
      const f = JSON.parse(legacy);
      const arr: ProductoFavorito[] = [{ ...f, categoria: inferirCategoria(f.nombre) }];
      await AsyncStorage.setItem(FAVORITOS_KEY, JSON.stringify(arr));
      return arr;
    }
  } catch {}
  return [];
}

/* ===================== BIENVENIDA ANIMADA PREMIUM ===================== */
/** Pantalla de entrada; App la muestra antes de abrir el catálogo y le pasa la acción de continuar. */
function PantallaBienvenida({ onEnter }: { onEnter: () => void }) {
  /*
   * Cada Animated.Value controla una propiedad visual distinta: aparición,
   * desplazamiento, escala, brillo, ancho de línea, subtítulo, botón y rotación.
   * Las referencias se crean una vez para que los ciclos puedan animarse sin
   * reconstruirse en cada render.
   */
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(40)).current;
  const scale = useRef(new Animated.Value(0.7)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;
  const buttonFade = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // La secuencia revela primero la marca y después sus textos y el botón de entrada.
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, friction: 6, useNativeDriver: true }),
      ]),
      Animated.timing(lineWidth, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.timing(subtitleFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(buttonFade, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    // Estos dos ciclos son decorativos y se ejecutan mientras la bienvenida permanezca montada.
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.16] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const rotateDeg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateInvDeg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View style={styles.bienvenidaFondo}>
      <Animated.View style={[styles.bienvenidaAura, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />

      <Animated.View style={[styles.bienvenidaAnillo, { transform: [{ rotate: rotateDeg }] }]}>
        <View style={styles.bienvenidaAnilloPunto} />
        <View style={[styles.bienvenidaAnilloPunto, { top: 'auto', bottom: 0 }]} />
      </Animated.View>

      <Animated.View style={[styles.bienvenidaAnillo2, { transform: [{ rotate: rotateInvDeg }] }]}>
        <View style={styles.bienvenidaAnilloPunto} />
      </Animated.View>

      <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }, { scale }], alignItems: 'center' }}>
        <Text style={styles.bienvenidaSello}>◆ ◆ ◆</Text>
        <Text style={styles.bienvenidaTitulo}>LUXOR</Text>
        <Text style={styles.bienvenidaTituloGrande}>COLLECTION</Text>

        <Animated.View style={[styles.bienvenidaLinea, { width: lineWidth.interpolate({ inputRange: [0, 1], outputRange: [0, 220] }) }]} />

        <Animated.Text style={[styles.bienvenidaSubtitulo, { opacity: subtitleFade }]}>
          Alta joyería · Exclusividad · Elegancia
        </Animated.Text>

        <Animated.Text style={[styles.bienvenidaFrase, { opacity: subtitleFade }]}>
          "Bienvenidos a Luxor Collection{'\n'}Tu joyería de confianza"
        </Animated.Text>
      </Animated.View>

      <Animated.View style={{ opacity: buttonFade, marginTop: 60 }}>
        <Pressable
          style={({ pressed }) => [styles.bienvenidaBoton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          onPress={onEnter}
        >
          <Text style={styles.bienvenidaBotonTexto}>EXPLORAR CATÁLOGO</Text>
          <Text style={styles.bienvenidaBotonFlecha}>→</Text>
        </Pressable>
      </Animated.View>

      <Animated.Text style={[styles.bienvenidaFooter, { opacity: buttonFade }]}>
        LUXOR COLLECTION · DESDE 2024
      </Animated.Text>
    </View>
  );
}

/* ===================== FILTROS (categoría desde las pastillas; búsqueda aparte) ===================== */
/** Criterios activos de categoría, rango de precio y género aplicados por el catálogo. */
type Filtros = {
  categoria: Categoria | 'Todas';
  precioMin: string;
  precioMax: string;
  genero: 'Todos' | 'Femenino' | 'Masculino' | 'Unisex';
};

/* ===================== TARJETA ===================== */
/** Acciones que el catálogo entrega a cada tarjeta para editar, comprar y abrir productos. */
type TarjetaProps = {
  producto: Producto;
  esFavorito?: boolean;
  enCarrito?: boolean;
  feedbackFavorito?: 'guardando' | 'guardado' | 'error' | null;
  onToggleFavorito: (producto: Producto) => void;
  onAbrirDetalle: (producto: Producto) => void;
  onAgregarCarrito: (producto: Producto, opciones?: { talla?: string; mililitros?: string }) => void;
  onEditar?: (producto: Producto) => void;
  onEliminar?: (id: string) => void;
};

/**
 * Tarjeta reutilizada por ProductosLista en catálogo y favoritos.
 *
 * Presenta los datos principales y conecta las acciones del usuario con callbacks
 * de App. Las opciones de talla y mililitros se solicitan antes de añadir al carrito
 * cuando el producto tiene alternativas configuradas.
 */
function Tarjeta({
  producto, esFavorito, enCarrito, feedbackFavorito,
  onToggleFavorito, onAbrirDetalle, onAgregarCarrito, onEditar, onEliminar,
}: TarjetaProps) {
  const [mostrarTallas, setMostrarTallas] = useState(false);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const entrada = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const primeraVez = useRef(true);
  const tieneImagen = !!producto.imagenUri;

  /*
   * La tarjeta aparece con una transición y luego mantiene una flotación sutil.
   * El ciclo decorativo se detiene al desmontarla para no dejar animaciones activas
   * cuando se filtra la lista o se cambia de pestaña.
   */
  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const flotar = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    flotar.start();
    return () => flotar.stop();
  }, []);

  useEffect(() => {
    // La primera ejecución ocurre al montar; no representa un cambio real de favorito.
    if (primeraVez.current) { primeraVez.current = false; return; }
    // Solo se anima el guardado; quitar el favorito no simula una confirmación positiva.
    if (esFavorito) {
      pop.setValue(0.55);
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 140, useNativeDriver: true }).start();
    }
  }, [esFavorito]);

  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  const entradaY = entrada.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  /**
   * Decide si se puede añadir directamente o se necesita una opción.
   * Anillos, cadenas y pulseras muestran sus tallas; perfumes muestran mililitros.
   * Si no hay opciones registradas, se llama inmediatamente al callback del carrito.
   */
  function manejarAgregar() {
    if ((producto.categoria === 'Anillo' || producto.categoria === 'Cadena' || producto.categoria === 'Pulsera')
      && producto.tallas && producto.tallas.length > 0) {
      setMostrarTallas(true); return;
    }
    if (producto.categoria === 'Perfume' && producto.mililitros && producto.mililitros.length > 0) {
      setMostrarTallas(true); return;
    }
    onAgregarCarrito(producto);
  }

  /*
   * El estado de favorito determina un único mensaje visual:
   * progreso mientras App guarda, confirmación cuando termina y error si falla.
   * Mantener el mapeo aquí evita duplicar el componente del banner en el JSX.
   */
  let bannerFeedback = null;
  if (feedbackFavorito === 'guardando') bannerFeedback = { texto: 'Guardando...', style: styles.feedbackAmarillo, color: '#D7B56D' };
  else if (feedbackFavorito === 'guardado') bannerFeedback = { texto: '★ Guardado', style: styles.feedbackVerde, color: '#8FE0BC' };
  else if (feedbackFavorito === 'error') bannerFeedback = { texto: 'Error al guardar', style: styles.feedbackRojo, color: '#EE9AA8' };

  return (
    <Animated.View style={[styles.tarjeta, { opacity: entrada, transform: [{ translateY: entradaY }] }]}>
      {/* La imagen es opcional: solo se muestra el bloque visual si hay una URI guardada. */}
      {tieneImagen && (
        <Pressable onPress={() => onAbrirDetalle(producto)}>
          <Animated.View style={[styles.imagenTarjetaFlotante, { transform: [{ translateY }] }]}>
            <Image
              source={{ uri: producto.imagenUri }}
              style={styles.imagenProducto}
              resizeMode={producto.modoImagen === 'ajustada' ? 'cover' : 'contain'}
            />
          </Animated.View>
          <View style={styles.badgeCategoria}>
            <Text style={styles.badgeCategoriaTexto}>{producto.categoria}</Text>
          </View>
        </Pressable>
      )}
      <View style={styles.encabezadoTarjeta}>
        <Pressable style={{ flex: 1 }} onPress={() => onAbrirDetalle(producto)}>
          <Text style={styles.nombre}>{producto.nombre}</Text>
        </Pressable>
        <Pressable
          style={[styles.botonFavorito, esFavorito && styles.botonFavoritoActivo, feedbackFavorito === 'guardando' && styles.botonFavoritoGuardando]}
          onPress={() => onToggleFavorito(producto)}
          disabled={feedbackFavorito === 'guardando'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Animated.Text style={[styles.textoFavorito, esFavorito && styles.textoFavoritoActivo, { transform: [{ scale: pop }] }]}>
            {feedbackFavorito === 'guardando' ? '…' : esFavorito ? '★' : '☆'}
          </Animated.Text>
        </Pressable>
      </View>
      <Text style={styles.descripcion}>{producto.descripcion}</Text>
      {producto.material && <Text style={styles.materialTexto}>Material: {producto.material}</Text>}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: '#E4D8BD' }} />
        <Text style={styles.precio}>{producto.precio}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Pressable style={[styles.botonCarrito, { flex: 1 }, enCarrito && styles.botonCarritoActivo]} onPress={manejarAgregar}>
          <Text style={styles.textoBotonCarrito}>{enCarrito ? '✓ Añadir otro' : 'Añadir'}</Text>
        </Pressable>
        <Pressable style={[styles.botonCarrito, { flex: 1, backgroundColor: '#132A22' }]} onPress={() => onAbrirDetalle(producto)}>
          <Text style={styles.textoBotonCarrito}>Ver</Text>
        </Pressable>
      </View>

      {/*
       * Las acciones administrativas solo aparecen si el padre proporciona callbacks.
       * Así la misma tarjeta sirve en vistas que permiten editar/eliminar y en otras
       * que solo permiten consultar, marcar favorito o comprar.
       */}
      {(onEditar || onEliminar) && (
        <View style={styles.filaAccionesExtra}>
          {onEditar && (
            <Pressable style={styles.botonAccion} onPress={() => onEditar(producto)}>
              <Text style={styles.textoBotonAccion}>Editar</Text>
            </Pressable>
          )}
          {!!onEliminar && (
            <Pressable style={[styles.botonAccion, styles.botonAccionEliminar]} onPress={() => onEliminar(producto.id)}>
              <Text style={[styles.textoBotonAccion, { color: '#F7F1E3' }]}>Eliminar</Text>
            </Pressable>
          )}
        </View>
      )}

      {bannerFeedback && (
        <View style={[styles.bannerFeedback, bannerFeedback.style]}>
          <Text style={[styles.bannerFeedbackTexto, { color: bannerFeedback.color }]}>{bannerFeedback.texto}</Text>
        </View>
      )}

      <Modal visible={mostrarTallas} transparent animationType="fade" onRequestClose={() => setMostrarTallas(false)}>
        <View style={styles.fondoModal}>
          <View style={styles.modalCaja}>
            <Text style={styles.modalTitulo}>
              {producto.categoria === 'Perfume' ? 'Elige mililitros' : 'Elige talla'}
            </Text>
            <View style={styles.filaChips}>
              {(producto.categoria === 'Perfume' ? producto.mililitros : producto.tallas)?.map((op) => (
                <Pressable key={op} style={styles.chip} onPress={() => {
                  onAgregarCarrito(producto, producto.categoria === 'Perfume' ? { mililitros: op } : { talla: op });
                  setMostrarTallas(false);
                }}>
                  <Text style={styles.textoChip}>{op}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.botonSincronizacion, { marginTop: 12 }]} onPress={() => setMostrarTallas(false)}>
              <Text style={styles.textoBotonSincronizacion}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

/* ===================== VISTA 3D ===================== */
/** Presenta la foto del detalle con giro simulado y controles de zoom. Se monta desde DetalleProducto. */
function Vista3D({ imagenUri }: { imagenUri: string }) {
  const rotacion = useRef(new Animated.Value(0)).current;
  const escala = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotacion, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const rotateY = rotacion.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '90deg', '180deg', '270deg', '360deg'],
  });

  return (
    <View style={styles.vista3DContenedor}>
      <Animated.View style={[styles.vista3DImagen, { transform: [{ perspective: 1000 }, { rotateY }, { scale: escala }] }]}>
        <Image source={{ uri: imagenUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </Animated.View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Pressable style={styles.botonSincronizacion} onPress={() => Animated.spring(escala, { toValue: 1.4, useNativeDriver: true }).start()}>
          <Text style={styles.textoBotonSincronizacion}>Acercar</Text>
        </Pressable>
        <Pressable style={styles.botonSincronizacion} onPress={() => Animated.spring(escala, { toValue: 1, useNativeDriver: true }).start()}>
          <Text style={styles.textoBotonSincronizacion}>Reset</Text>
        </Pressable>
      </View>
      <Text style={styles.vista3DNota}>Vista rotatoria 360° simulada del producto</Text>
    </View>
  );
}

/* ===================== DETALLE PRODUCTO ===================== */
/**
 * Vista ampliada abierta desde una tarjeta o la vitrina de sensores.
 * Muestra los datos y la foto disponibles, permite elegir talla/presentación y
 * entrega esas opciones al carrito; la selección no modifica el catálogo original.
 */
function DetalleProducto({
  producto, onCerrar, onAgregarCarrito, esFavorito, onToggleFavorito, onAsignarFoto,
}: {
  producto: Producto;
  onCerrar: () => void;
  onAgregarCarrito: (p: Producto, opciones?: { talla?: string; mililitros?: string }) => void;
  esFavorito: boolean;
  onToggleFavorito: (p: Producto) => void;
  onAsignarFoto?: (id: string) => void;
}) {
  const [tallaSel, setTallaSel] = useState<string | undefined>(producto.tallas?.[0]);
  const [mlSel, setMlSel] = useState<string | undefined>(producto.mililitros?.[0]);
  const [mostrar3D, setMostrar3D] = useState(false);
  const escalaTalla = useRef(new Animated.Value(1)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  /*
   * La pieza flota mientras el detalle está abierto. Una segunda animación adapta
   * la escala de su representación a la talla seleccionada para anillos, cadenas
   * y pulseras; cada categoría utiliza una relación de escala distinta.
   */
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const translateY = floatAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  useEffect(() => {
    if (producto.categoria === 'Anillo' && tallaSel) {
      const n = Number(tallaSel);
      const factor = 0.7 + n * 0.06;
      Animated.spring(escalaTalla, { toValue: factor, useNativeDriver: true, friction: 5 }).start();
    } else if (producto.categoria === 'Cadena' && tallaSel) {
      const n = parseInt(tallaSel);
      const factor = 0.6 + n * 0.012;
      Animated.spring(escalaTalla, { toValue: factor, useNativeDriver: true, friction: 5 }).start();
    } else if (producto.categoria === 'Pulsera' && tallaSel) {
      const n = parseInt(tallaSel);
      const factor = 0.65 + n * 0.02;
      Animated.spring(escalaTalla, { toValue: factor, useNativeDriver: true, friction: 5 }).start();
    }
  }, [tallaSel, producto.categoria]);

  /**
   * Elige una silueta visual de acuerdo con la categoría y talla activa.
   * Si aún no hay talla, o si la categoría no tiene maniquí implementado,
   * devuelve `null`; el resto de la ficha puede seguir mostrándose normalmente.
   */
  function renderManiqui() {
    // Sin selección no existe un valor que la representación pueda mostrar.
    if (!tallaSel) return null;

    // Las ramas son excluyentes: cada una dibuja la pieza apropiada y termina con su propio JSX.
    if (producto.categoria === 'Cadena') {
      return (
        <View style={styles.maniquiContenedor}>
          <Animated.View style={[styles.maniquiCuello, { transform: [{ scale: escalaTalla }] }]}>
            <View style={styles.maniquiCabeza} />
            <View style={styles.maniquiCuelloBase} />
            <View style={styles.maniquiCadenaArco}>
              <Text style={styles.maniquiCadenaTexto}>{tallaSel}</Text>
            </View>
          </Animated.View>
          <Text style={styles.maniquiEtiqueta}>Visualización · {tallaSel}</Text>
        </View>
      );
    }

    if (producto.categoria === 'Anillo') {
      return (
        <View style={styles.maniquiContenedor}>
          <Animated.View style={[styles.maniquiAnilloDedo, { transform: [{ scale: escalaTalla }] }]}>
            <View style={styles.maniquiDedoBase} />
            <View style={styles.maniquiAnilloAro}>
              <Text style={styles.maniquiAnilloTexto}>{tallaSel}</Text>
            </View>
          </Animated.View>
          <Text style={styles.maniquiEtiqueta}>Visualización · Talla {tallaSel}</Text>
        </View>
      );
    }

    if (producto.categoria === 'Pulsera') {
      return (
        <View style={styles.maniquiContenedor}>
          <Animated.View style={[styles.maniquiMuneca, { transform: [{ scale: escalaTalla }] }]}>
            <View style={styles.maniquiMunecaBase} />
            <View style={styles.maniquiPulseraAro}>
              <Text style={styles.maniquiMunecaTexto}>{tallaSel}</Text>
            </View>
          </Animated.View>
          <Text style={styles.maniquiEtiqueta}>Visualización · {tallaSel}</Text>
        </View>
      );
    }

    return null;
  }

  return (
    <ScrollView style={styles.lista} contentContainerStyle={{ paddingBottom: 40 }}>
      <Pressable style={styles.botonVolverMejorado} onPress={onCerrar}>
        <Text style={styles.textoBotonVolverMejorado}>← Volver al catálogo</Text>
      </Pressable>

      <Text style={styles.detalleTitulo}>{producto.nombre}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.badgeCategoriaTextoGrande}>{producto.categoria}</Text>
        <Pressable
          onPress={() => onToggleFavorito(producto)}
          style={[styles.botonFavorito, esFavorito && styles.botonFavoritoActivo]}
        >
          <Text style={[styles.textoFavorito, esFavorito && styles.textoFavoritoActivo]}>
            {esFavorito ? '★' : '☆'}
          </Text>
        </Pressable>
      </View>

      {/*
       * La rama con imagen ofrece la vista flotante y el control 3D.
       * Si no hay foto, se muestra un estado vacío y solo aparece el botón para
       * asignarla cuando App entregó el callback correspondiente.
       */}
      {producto.imagenUri ? (
        <>
          <Animated.View style={[styles.imagenFlotanteContenedor, { transform: [{ translateY }] }]}>
            <Image source={{ uri: producto.imagenUri }} style={styles.imagenFlotante} resizeMode="contain" />
          </Animated.View>
          <Pressable style={styles.botonSincronizacion} onPress={() => setMostrar3D((v) => !v)}>
            <Text style={styles.textoBotonSincronizacion}>
              {mostrar3D ? 'Cerrar vista 3D' : 'Ver en 3D (360°)'}
            </Text>
          </Pressable>
          {mostrar3D && <Vista3D imagenUri={producto.imagenUri} />}
        </>
      ) : (
        <View style={styles.panelVacio}>
          <Text style={styles.textoVacio}>Este producto no tiene foto todavía.</Text>
          {onAsignarFoto && (
            <Pressable style={[styles.botonSincronizacion, { marginTop: 12 }]} onPress={() => onAsignarFoto(producto.id)}>
              <Text style={styles.textoBotonSincronizacion}>Agregar foto</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.detalleDescripcion}>{producto.descripcion}</Text>
      {producto.material && <Text style={styles.materialTexto}>Material: {producto.material}</Text>}
      <Text style={styles.detallePrecio}>{producto.precio}</Text>

      {/* Solo se presentan tallas cuando el producto las trae y no es un perfume. */}
      {producto.tallas && producto.tallas.length > 0 && producto.categoria !== 'Perfume' && (
        <>
          <Text style={styles.etiquetaCampo}>Talla</Text>
          <View style={styles.filaChips}>
            {/* Cada talla se convierte en un chip; el activo actual recibe su estilo y actualiza la selección. */}
            {producto.tallas.map((t) => (
              <Pressable key={t} style={[styles.chip, tallaSel === t && styles.chipActivo]} onPress={() => setTallaSel(t)}>
                <Text style={[styles.textoChip, tallaSel === t && styles.textoChipActivo]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {renderManiqui()}
        </>
      )}

      {/* La pirámide y las presentaciones son datos propios de perfumes con ficha aromática registrada. */}
      {producto.categoria === 'Perfume' && producto.piramide && (
        <>
          <Text style={styles.etiquetaCampo}>Pirámide olfativa</Text>
          <View style={styles.piramideContenedor}>
            <View style={[styles.piramideFila, { backgroundColor: '#B08A3C' }]}>
              <Text style={styles.piramideTitulo}>SALIDA</Text>
              <Text style={styles.piramideNotas}>{producto.piramide.salida.join(' · ')}</Text>
            </View>
            <View style={[styles.piramideFila, { backgroundColor: '#8F7030', width: '85%' }]}>
              <Text style={styles.piramideTitulo}>CORAZÓN</Text>
              <Text style={styles.piramideNotas}>{producto.piramide.corazon.join(' · ')}</Text>
            </View>
            <View style={[styles.piramideFila, { backgroundColor: '#6B5424', width: '70%' }]}>
              <Text style={styles.piramideTitulo}>FONDO</Text>
              <Text style={styles.piramideNotas}>{producto.piramide.fondo.join(' · ')}</Text>
            </View>
          </View>
          <Text style={styles.etiquetaCampo}>Mililitros</Text>
          <View style={styles.filaChips}>
            {/* Las presentaciones disponibles se dibujan como opciones mutuamente seleccionables. */}
            {producto.mililitros?.map((ml) => (
              <Pressable key={ml} style={[styles.chip, mlSel === ml && styles.chipActivo]} onPress={() => setMlSel(ml)}>
                <Text style={[styles.textoChip, mlSel === ml && styles.textoChipActivo]}>{ml}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Pressable style={[styles.botonComprar, { marginTop: 24 }]} onPress={() => onAgregarCarrito(producto, { talla: tallaSel, mililitros: mlSel })}>
        <Text style={styles.textoBotonComprar}>Añadir al carrito</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ===================== EDITOR DE PRODUCTO ===================== */
/**
 * Formulario temporal para editar un producto existente.
 *
 * Mientras se escribe, cada campo vive en estado local. Al guardar se normalizan
 * los valores y se envía un producto actualizado a App; cancelar cierra la vista
 * sin aplicar esos cambios al catálogo.
 */
function EditorProducto({
  producto, onCerrar, onGuardar, onEliminar,
}: {
  producto: Producto;
  onCerrar: () => void;
  onGuardar: (p: Producto) => void;
  onEliminar: (id: string) => void;
}) {
  /*
   * El formulario inicializa sus campos a partir del producto recibido.
   * Las listas se convierten a texto separado por comas para facilitar su edición,
   * y la fotografía puede conservarse, reemplazarse o eliminarse antes de guardar.
   */
  const [nombre, setNombre] = useState(producto.nombre);
  const [descripcion, setDescripcion] = useState(producto.descripcion);
  const [precio, setPrecio] = useState(producto.precio);
  const [categoria, setCategoria] = useState<Categoria>(producto.categoria);
  const [material, setMaterial] = useState(producto.material || '');
  const [tallasTexto, setTallasTexto] = useState((producto.tallas || []).join(', '));
  const [mlTexto, setMlTexto] = useState((producto.mililitros || []).join(', '));
  const [salida, setSalida] = useState((producto.piramide?.salida || []).join(', '));
  const [corazon, setCorazon] = useState((producto.piramide?.corazon || []).join(', '));
  const [fondo, setFondo] = useState((producto.piramide?.fondo || []).join(', '));
  const [imagenUri, setImagenUri] = useState<string | undefined>(producto.imagenUri);

  const categorias: Categoria[] = ['Anillo', 'Cadena', 'Pulsera', 'Aretes', 'Reloj', 'Perfume'];

  /**
   * Valida los campos mínimos y construye una copia con los cambios locales.
   * Las cadenas de tallas/notas vuelven a convertirse en arreglos limpios; los
   * campos de perfume se guardan solo si esa es la categoría seleccionada.
   */
  function guardar() {
    // El editor no cierra ni envía una ficha incompleta; deja que el usuario la corrija.
    if (!nombre.trim() || !descripcion.trim() || !precio.trim()) {
      Alert.alert('Campos incompletos', 'Completa nombre, descripción y precio.');
      return;
    }
    // Se formatea cuando hay una cantidad numérica; si no, se conserva el texto ingresado.
    const numero = Number(precio.replace(/[^0-9]/g, ''));
    const precioFmt = numero ? formatearCOP(numero) : precio;

    const actualizado: Producto = {
      ...producto,
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      precio: precioFmt,
      categoria,
      material: material.trim() || undefined,
      imagenUri,
      tallas: tallasTexto.split(',').map((t) => t.trim()).filter(Boolean),
      mililitros: mlTexto.split(',').map((t) => t.trim()).filter(Boolean),
      piramide: categoria === 'Perfume' ? {
        salida: salida.split(',').map((n) => n.trim()).filter(Boolean),
        corazon: corazon.split(',').map((n) => n.trim()).filter(Boolean),
        fondo: fondo.split(',').map((n) => n.trim()).filter(Boolean),
      } : undefined,
    };
    onGuardar(actualizado);
  }

  /**
   * Selecciona una foto para el editor, sin guardarla todavía en el catálogo.
   * Si el usuario cancela, la URI actual se conserva; App persiste la nueva
   * imagen solo cuando se guarda el producto editado.
   */
  async function asignarFoto() {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    // Se comprueban cancelación y URI antes de cambiar la vista previa.
    if (!resultado.canceled && resultado.assets?.[0]?.uri) {
      setImagenUri(resultado.assets[0].uri);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <Pressable style={styles.botonVolverMejorado} onPress={onCerrar}>
        <Text style={styles.textoBotonVolverMejorado}>← Cancelar</Text>
      </Pressable>
      <Text style={styles.titulo}>Editar Producto</Text>

      {/* Con foto se puede previsualizar y quitar; sin foto se ofrece abrir la galería. */}
      {imagenUri ? (
        <>
          <Image source={{ uri: imagenUri }} style={styles.detalleImagen} resizeMode="contain" />
          <Pressable style={[styles.botonSincronizacion, { borderColor: '#7A1F33' }]} onPress={() => setImagenUri(undefined)}>
            <Text style={[styles.textoBotonSincronizacion, { color: '#EE9AA8' }]}>Eliminar foto (pasar a "sin imagen")</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.panelVacio}>
          <Text style={styles.textoVacio}>Este producto no tiene foto.</Text>
          <Pressable style={[styles.botonSincronizacion, { marginTop: 12 }]} onPress={asignarFoto}>
            <Text style={styles.textoBotonSincronizacion}>Agregar foto</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.etiquetaCampo}>Nombre</Text>
      <TextInput style={styles.input} value={nombre} onChangeText={setNombre} />

      <Text style={styles.etiquetaCampo}>Descripción</Text>
      <TextInput style={[styles.input, { minHeight: 80 }]} value={descripcion} onChangeText={setDescripcion} multiline />

      <Text style={styles.etiquetaCampo}>Precio (COP)</Text>
      <TextInput style={styles.input} value={precio} onChangeText={setPrecio} keyboardType="numeric" />

      <Text style={styles.etiquetaCampo}>Categoría</Text>
      <View style={styles.filaChips}>
        {categorias.map((c) => (
          <Pressable key={c} style={[styles.chip, categoria === c && styles.chipActivo]} onPress={() => setCategoria(c)}>
            <Text style={[styles.textoChip, categoria === c && styles.textoChipActivo]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.etiquetaCampo}>Material</Text>
      <TextInput style={styles.input} value={material} onChangeText={setMaterial} />

      {/* Joyería muestra tallas; los perfumes reemplazan ese campo por mililitros. */}
      {categoria !== 'Perfume' && (
        <>
          <Text style={styles.etiquetaCampo}>Tallas (separadas por coma)</Text>
          <TextInput style={styles.input} value={tallasTexto} onChangeText={setTallasTexto} placeholder="5, 6, 7, 8" placeholderTextColor="#6F7F74" />
        </>
      )}

      {/* Los campos aromáticos solo se muestran y guardan para la categoría Perfume. */}
      {categoria === 'Perfume' && (
        <>
          <Text style={styles.etiquetaCampo}>Mililitros (separados por coma)</Text>
          <TextInput style={styles.input} value={mlTexto} onChangeText={setMlTexto} placeholder="50 ml, 100 ml" placeholderTextColor="#6F7F74" />
          <Text style={styles.etiquetaCampo}>Notas de salida</Text>
          <TextInput style={styles.input} value={salida} onChangeText={setSalida} />
          <Text style={styles.etiquetaCampo}>Notas de corazón</Text>
          <TextInput style={styles.input} value={corazon} onChangeText={setCorazon} />
          <Text style={styles.etiquetaCampo}>Notas de fondo</Text>
          <TextInput style={styles.input} value={fondo} onChangeText={setFondo} />
        </>
      )}

      <Pressable style={styles.botonGuardarEdicion} onPress={guardar}>
        <Text style={[styles.textoBotonComprar, { color: '#07130F' }]}>Guardar cambios</Text>
      </Pressable>
      <Pressable style={[styles.botonGuardarEdicion, { backgroundColor: '#7A1F33', marginTop: 10 }]} onPress={() => onEliminar(producto.id)}>
        <Text style={styles.textoBotonComprar}>Eliminar producto</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ===================== CHECKOUT ===================== */
/** Pasos visibles del checkout y estados posibles del envío de correo de confirmación. */
type PasoCheckout = 'datos' | 'envio' | 'pago' | 'confirmacion';

type EstadoCorreo = 'idle' | 'enviando' | 'enviado' | 'no_configurado' | 'error';

/** Datos que Checkout entrega a App al confirmar una compra. */
type DatosPedido = {
  email: string; nombre: string; telefono: string; direccion: string;
  metodoPago: string; metodoEnvio: string; codigoPedido: string;
  subtotal: number; descuento: number; envio: number; total: number; cupon?: string;
};

/**
 * Flujo de compra en cuatro etapas: datos, envío, pago y confirmación.
 * El componente valida cada paso, calcula el resumen, simula el procesamiento
 * y comunica el pedido a App; no se conecta a una pasarela bancaria real.
 */
function Checkout({
  carrito, total: subtotal, cuponBrilloDesbloqueado, onCerrar, onConfirmarPedido, onVerRecibo,
}: {
  carrito: ItemCarrito[];
  total: number;
  cuponBrilloDesbloqueado: boolean;
  onCerrar: () => void;
  onConfirmarPedido: (datos: DatosPedido) => void;
  onVerRecibo: (codigoPedido: string) => void;
}) {
  /*
   * Los estados del formulario permanecen dentro del checkout mientras se avanza.
   * `paso` decide qué grupo de campos se muestra; los estados de correo y pedido
   * guardan el resultado final para que pueda ofrecerse un recibo o un reintento.
   */
  const [paso, setPaso] = useState<PasoCheckout>('datos');
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [envioElegido, setEnvioElegido] = useState<'estandar' | 'express'>('estandar');
  const [metodoPago, setMetodoPago] = useState<'Tarjeta' | 'PSE' | 'Contraentrega'>('Tarjeta');
  const [tarjeta, setTarjeta] = useState('');
  const [vence, setVence] = useState('');
  const [cvv, setCvv] = useState('');
  const [cuponTexto, setCuponTexto] = useState('');
  const [cupon, setCupon] = useState<{ codigo: string; porcentaje: number } | null>(null);
  const [mensajeCupon, setMensajeCupon] = useState<{ texto: string; ok: boolean } | null>(null);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [codigoPedido, setCodigoPedido] = useState('');
  const [estadoCorreo, setEstadoCorreo] = useState<EstadoCorreo>('idle');
  const [mensajeCorreo, setMensajeCorreo] = useState('');
  /*
   * `bloqueoRef` se actualiza sin esperar un nuevo render y frena dobles pulsaciones.
   * `montadoRef` protege actualizaciones tras salir de esta vista; `datosCorreoRef`
   * conserva el pedido para el botón que abre un mensaje manual.
   */
  const bloqueoRef = useRef(false);
  const montadoRef = useRef(true);
  const datosCorreoRef = useRef<DatosCorreo | null>(null);

  useEffect(() => {
    // Al montar se habilitan las actualizaciones; al salir se marca el componente como desmontado.
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const marca = marcaTarjeta(tarjeta);
  const nombreEnvio = envioElegido === 'express' ? 'Express (24 horas)' : 'Estándar (3-5 días hábiles)';
  const costoEnvio = envioElegido === 'express' ? ENVIO_EXPRESS : subtotal >= ENVIO_GRATIS_DESDE ? 0 : ENVIO_ESTANDAR;
  const descuento = cupon ? Math.round(subtotal * cupon.porcentaje) : 0;
  const totalFinal = subtotal - descuento + costoEnvio;
  const etiquetasPaso: Record<PasoCheckout, string> = { datos: 'Datos', envio: 'Envío', pago: 'Pago', confirmacion: 'Listo' };

  /**
   * Normaliza y valida el cupón antes de incorporarlo al total.
   * La definición determina el porcentaje; algunos códigos requieren que el reto
   * BRILLO10 esté desbloqueado. Cada salida temprana actualiza el mensaje visible
   * y evita que un cupón inválido afecte el cálculo.
   */
  function aplicarCupon() {
    const codigo = cuponTexto.trim().toUpperCase();
    // La entrada vacía no debe buscar una clave ni reemplazar el cupón por defecto.
    if (!codigo) { setMensajeCupon({ texto: 'Escribe un código.', ok: false }); return; }
    const def = CUPONES[codigo];
    if (!def) { setCupon(null); setMensajeCupon({ texto: 'Ese cupón no existe.', ok: false }); return; }
    // El cupón especial solo se aplica cuando App confirma el reto completado.
    if (def.requiereBrillo && !cuponBrilloDesbloqueado) {
      setCupon(null);
      setMensajeCupon({ texto: 'Cupón bloqueado: púlelo hasta 24K en la pestaña Sensores.', ok: false });
      return;
    }
    setCupon({ codigo, porcentaje: def.porcentaje });
    setMensajeCupon({ texto: `Cupón aplicado: ${def.descripcion}.`, ok: true });
  }

  /**
   * Construye una instantánea del pedido que comparten correo y recibo.
   * Convierte teléfono, dirección, envío y pago a texto listo para presentación,
   * y recorre el carrito para conservar las opciones seleccionadas en cada línea.
   */
  function datosCorreoDe(codigo: string): DatosCorreo {
    const metodo = metodoPago === 'Tarjeta'
      ? `Tarjeta ${marca !== 'Desconocida' ? `${marca} ` : ''}•••• ${ultimos4(tarjeta)}`
      : metodoPago;
    return {
      codigoPedido: codigo,
      fecha: new Date().toLocaleString('es-CO'),
      nombre: nombre.trim(),
      email: email.trim(),
      telefono: soloDigitos(telefono),
      direccion: `${direccion.trim()}, ${ciudad.trim()}`,
      metodoEnvio: nombreEnvio,
      metodoPago: metodo,
      // La proyección excluye estado de interfaz y solo conserva los datos de cada artículo.
      lineas: carrito.map((i) => ({
        nombre: i.nombre,
        detalle: [i.categoria, i.talla ? `Talla ${i.talla}` : '', i.mililitros ?? ''].filter(Boolean).join(' · '),
        precio: i.precio,
      })),
      subtotal: formatearCOP(subtotal),
      descuento: descuento > 0 ? formatearCOP(descuento) : '',
      envio: costoEnvio === 0 ? 'Gratis' : formatearCOP(costoEnvio),
      total: formatearCOP(totalFinal),
      cupon: cupon?.codigo,
    };
  }

  /**
   * Solicita el envío de confirmación y actualiza la pantalla si sigue abierta.
   * La excepción se convierte en un estado de error visible; al volver de una vista
   * ya desmontada no se ejecutan setState que pudieran actualizar una pantalla cerrada.
   */
  async function enviarCorreo(datos: DatosCorreo) {
    datosCorreoRef.current = datos;
    setEstadoCorreo('enviando');
    setMensajeCorreo('');
    let r: ResultadoCorreo;
    try {
      r = await enviarCorreoPedido(datos);
    } catch {
      r = { tipo: 'error', mensaje: 'Ocurrió un error inesperado al enviar el correo.' };
    }
    if (!montadoRef.current) return;
    setEstadoCorreo(r.tipo);
    setMensajeCorreo(r.mensaje);
  }

  /**
   * Abre la app de correo del dispositivo con los datos del pedido precargados.
   * Solo se puede usar después de preparar una instantánea; si no existe, la función
   * termina sin abrir un mensaje incompleto.
   */
  function abrirCorreoManual() {
    if (!datosCorreoRef.current) return;
    Linking.openURL(construirMailto(datosCorreoRef.current)).catch(() => {
      setEstadoCorreo('error');
      setMensajeCorreo('No hay una aplicación de correo configurada en este dispositivo.');
    });
  }

  /**
   * Valida el método de pago elegido y completa el flujo demostrativo.
   *
   * La tarjeta se comprueba solo si se seleccionó ese método; PSE y contraentrega
   * no necesitan los campos de tarjeta. Después se activa un bloqueo sincrónico,
   * se espera la simulación, se genera un código y se entrega el pedido a App.
   */
  async function pagar() {
    // Evita que dos pulsaciones cercanas creen códigos o correos duplicados.
    if (bloqueoRef.current) return;
    if (metodoPago === 'Tarjeta') {
      // Cada dato de tarjeta se verifica por separado para mostrar el error más útil.
      if (!tarjetaValida(tarjeta)) { setError('El número de tarjeta no es válido. Revísalo (de prueba: 4242 4242 4242 4242).'); return; }
      if (!vencimientoValido(vence)) { setError('La fecha de vencimiento no es válida. Usa el formato MM/AA.'); return; }
      if (!cvvValido(cvv, marca)) { setError(`El CVV debe tener ${marca === 'Amex' ? 4 : 3} dígitos.`); return; }
    }
    bloqueoRef.current = true;
    setError('');
    setProcesando(true);
    // La espera representa procesamiento visual: no envía datos a un banco ni cobra.
    await new Promise<void>((resolver) => setTimeout(resolver, 1500));
    const codigo = 'LX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const datos = datosCorreoDe(codigo);
    setCodigoPedido(codigo);
    onConfirmarPedido({
      email: datos.email, nombre: datos.nombre, telefono: datos.telefono, direccion: datos.direccion,
      metodoPago: datos.metodoPago, metodoEnvio: nombreEnvio, codigoPedido: codigo,
      subtotal, descuento, envio: costoEnvio, total: totalFinal, cupon: cupon?.codigo,
    });
    // Si la persona salió durante la espera, no se cambian estados de una vista desmontada.
    if (!montadoRef.current) return;
    setProcesando(false);
    setPaso('confirmacion');
    enviarCorreo(datos);
  }

  /**
   * Controla las transiciones entre etapas del checkout.
   * Cada bloque valida solo los campos de la etapa actual; ante un error muestra
   * el mensaje y retorna sin avanzar. El pago se delega a `pagar` en vez de cambiar
   * directamente al estado de confirmación.
   */
  function siguiente() {
    setError('');
    if (paso === 'datos') {
      // La primera etapa requiere identidad y un correo de formato válido.
      if (!nombre.trim()) { setError('Ingresa tu nombre completo.'); return; }
      if (!emailValido(email)) { setError('Ingresa un correo válido (ej. nombre@correo.com).'); return; }
      setPaso('envio');
    } else if (paso === 'envio') {
      // La segunda etapa valida contacto y dirección antes de aceptar opciones de entrega.
      if (!telefonoValido(telefono)) { setError('Ingresa un teléfono de 10 dígitos (ej. 300 123 4567).'); return; }
      if (direccion.trim().length < 5) { setError('Ingresa una dirección completa.'); return; }
      if (ciudad.trim().length < 2) { setError('Ingresa la ciudad.'); return; }
      setPaso('pago');
    } else if (paso === 'pago') {
      // Las validaciones específicas y la simulación se concentran en una sola función.
      pagar();
    }
  }

  return (
    <ScrollView style={styles.lista} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Pressable style={styles.botonVolverMejorado} onPress={onCerrar}>
        <Text style={styles.textoBotonVolverMejorado}>← Volver al carrito</Text>
      </Pressable>

      <Text style={styles.titulo}>Finalizar compra</Text>

      <View style={styles.progresoFila}>
        {/*
         * El indicador recorre los pasos en el orden del flujo. Los pasos con índice
         * menor o igual al actual se resaltan para mostrar el avance acumulado.
         */}
        {(['datos', 'envio', 'pago', 'confirmacion'] as PasoCheckout[]).map((p, i) => {
          const idx = ['datos', 'envio', 'pago', 'confirmacion'].indexOf(paso);
          const activo = i <= idx;
          return (
            <View key={p} style={{ flex: 1, alignItems: 'center' }}>
              <View style={[styles.progresoCirculo, activo && styles.progresoCirculoActivo]}>
                <Text style={[styles.progresoTexto, activo && styles.progresoTextoActivo]}>{i + 1}</Text>
              </View>
              <Text style={styles.progresoEtiqueta}>{etiquetasPaso[p]}</Text>
            </View>
          );
        })}
      </View>

      {/* Cada bloque de formulario se monta solo en su etapa para evitar mostrar campos de otros pasos. */}
      {paso === 'datos' && (
        <>
          <Text style={styles.etiquetaCampo}>Nombre completo</Text>
          <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Tu nombre" placeholderTextColor="#6F7F74" />
          <Text style={styles.etiquetaCampo}>Correo electrónico</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="tucorreo@ejemplo.com" placeholderTextColor="#6F7F74" />
          <Text style={styles.textoInfoSecundario}>Te enviaremos la confirmación del pedido a este correo.</Text>
        </>
      )}

      {paso === 'envio' && (
        <>
          <Text style={styles.etiquetaCampo}>Teléfono de contacto</Text>
          <TextInput style={styles.input} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="300 123 4567" placeholderTextColor="#6F7F74" maxLength={14} />
          <Text style={styles.etiquetaCampo}>Dirección</Text>
          <TextInput style={styles.input} value={direccion} onChangeText={setDireccion} placeholder="Calle 123 #45-67" placeholderTextColor="#6F7F74" />
          <Text style={styles.etiquetaCampo}>Ciudad</Text>
          <TextInput style={styles.input} value={ciudad} onChangeText={setCiudad} placeholder="Cali" placeholderTextColor="#6F7F74" />
          <Text style={styles.etiquetaCampo}>Método de envío</Text>
          {/*
           * Las opciones de envío comparten diseño y cálculo, pero muestran precio y
           * plazo distintos. El subtotal define si el envío estándar aparece gratis.
           */}
          {(['estandar', 'express'] as const).map((op) => {
            const activo = envioElegido === op;
            const precio = op === 'express' ? formatearCOP(ENVIO_EXPRESS) : subtotal >= ENVIO_GRATIS_DESDE ? 'Gratis' : formatearCOP(ENVIO_ESTANDAR);
            return (
              <Pressable key={op} style={[styles.opcionEnvio, activo && styles.opcionEnvioActiva]} onPress={() => setEnvioElegido(op)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.opcionEnvioTitulo, activo && { color: '#D7B56D' }]}>{op === 'express' ? 'Express' : 'Estándar'}</Text>
                  <Text style={styles.opcionEnvioSub}>{op === 'express' ? 'Entrega en 24 horas' : '3-5 días hábiles'}</Text>
                </View>
                <Text style={[styles.opcionEnvioPrecio, activo && { color: '#D7B56D' }]}>{precio}</Text>
              </Pressable>
            );
          })}
          <Text style={styles.textoInfoSecundario}>Envío estándar gratis en compras desde {formatearCOP(ENVIO_GRATIS_DESDE)}.</Text>
        </>
      )}

      {paso === 'pago' && (
        <>
          <Text style={styles.etiquetaCampo}>Método de pago</Text>
          <View style={styles.filaChips}>
            {/* Se puede elegir entre métodos; los campos de tarjeta se muestran solo si aplica. */}
            {(['Tarjeta', 'PSE', 'Contraentrega'] as const).map((m) => (
              <Pressable key={m} style={[styles.chip, metodoPago === m && styles.chipActivo]} onPress={() => setMetodoPago(m)}>
                <Text style={[styles.textoChip, metodoPago === m && styles.textoChipActivo]}>{m}</Text>
              </Pressable>
            ))}
          </View>
          {metodoPago === 'Tarjeta' && (
            // Los datos de tarjeta son parte de la demostración y no se guardan ni se cobran.
            <>
              <View style={styles.filaEtiquetaMarca}>
                <Text style={styles.etiquetaCampo}>Número de tarjeta</Text>
                {marca !== 'Desconocida' && <Text style={styles.marcaTarjeta}>{marca}</Text>}
              </View>
              <TextInput style={styles.input} value={tarjeta} onChangeText={(t) => setTarjeta(formatearTarjeta(t))} keyboardType="number-pad" placeholder="4242 4242 4242 4242" placeholderTextColor="#6F7F74" maxLength={19} />
              <View style={styles.filaDos}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.etiquetaCampo}>Vence (MM/AA)</Text>
                  <TextInput style={styles.input} value={vence} onChangeText={(t) => setVence(formatearVence(t))} keyboardType="number-pad" placeholder="12/28" placeholderTextColor="#6F7F74" maxLength={5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.etiquetaCampo}>CVV</Text>
                  <TextInput style={styles.input} value={cvv} onChangeText={(t) => setCvv(soloDigitos(t).slice(0, 4))} keyboardType="number-pad" secureTextEntry placeholder="123" placeholderTextColor="#6F7F74" maxLength={4} />
                </View>
              </View>
              <Text style={styles.textoInfoSecundario}>Pago simulado: no se realiza ningún cobro ni se guarda ningún dato de tu tarjeta.</Text>
            </>
          )}

          <Text style={styles.etiquetaCampo}>Cupón de descuento</Text>
          <View style={styles.filaCupon}>
            <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={cuponTexto} onChangeText={setCuponTexto} autoCapitalize="characters" autoCorrect={false} placeholder="BRILLO10" placeholderTextColor="#6F7F74" />
            <Pressable style={styles.botonCupon} onPress={aplicarCupon}>
              <Text style={styles.textoBotonCupon}>Aplicar</Text>
            </Pressable>
          </View>
          {mensajeCupon && (
            <Text style={[styles.mensajeCupon, mensajeCupon.ok ? styles.mensajeCuponOk : styles.mensajeCuponError]}>{mensajeCupon.texto}</Text>
          )}

          <View style={styles.resumenPedido}>
            <Text style={styles.resumenPedidoTitulo}>Resumen del pedido</Text>
            {/* El resumen conserva talla o presentación para identificar cada línea del pedido. */}
            {carrito.map((item) => (
              <Text key={item.id} style={styles.textoResumen}>
                {item.nombre} {item.talla ? `· ${item.talla}` : ''}{item.mililitros ? `· ${item.mililitros}` : ''} — {item.precio}
              </Text>
            ))}
            <View style={[styles.resumenFila, { marginTop: 10 }]}>
              <Text style={styles.textoResumen}>Subtotal</Text>
              <Text style={styles.textoResumen}>{formatearCOP(subtotal)}</Text>
            </View>
            {descuento > 0 && (
              <View style={styles.resumenFila}>
                <Text style={[styles.textoResumen, { color: '#8FE0BC' }]}>Descuento ({cupon?.codigo})</Text>
                <Text style={[styles.textoResumen, { color: '#8FE0BC' }]}>-{formatearCOP(descuento)}</Text>
              </View>
            )}
            <View style={styles.resumenFila}>
              <Text style={styles.textoResumen}>Envío · {envioElegido === 'express' ? 'Express' : 'Estándar'}</Text>
              <Text style={styles.textoResumen}>{costoEnvio === 0 ? 'Gratis' : formatearCOP(costoEnvio)}</Text>
            </View>
            <View style={[styles.resumenFila, styles.resumenFilaTotal]}>
              <Text style={[styles.textoResumen, { fontWeight: '900', color: '#D7B56D', letterSpacing: 1 }]}>Total</Text>
              <Text style={[styles.textoResumen, { fontWeight: '900', color: '#D7B56D', letterSpacing: 1 }]}>{formatearCOP(totalFinal)}</Text>
            </View>
          </View>
        </>
      )}

      {paso === 'confirmacion' && (
        <View style={styles.confirmacionCaja}>
          <Text style={styles.confirmacionTitulo}>Pedido confirmado</Text>
          <Text style={styles.confirmacionCodigo}>Código: {codigoPedido}</Text>
          <Text style={styles.confirmacionTexto}>Total: {formatearCOP(totalFinal)} · {nombreEnvio}</Text>

          <View style={[styles.estadoCorreo, estadoCorreo === 'enviado' && styles.estadoCorreoOk, (estadoCorreo === 'error' || estadoCorreo === 'no_configurado') && styles.estadoCorreoAviso]}>
            {estadoCorreo === 'enviando' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color="#D7B56D" />
                <Text style={styles.estadoCorreoTexto}>Enviando confirmación a {email.trim()}…</Text>
              </View>
            )}
            {estadoCorreo === 'enviado' && <Text style={styles.estadoCorreoTexto}>✓ {mensajeCorreo}</Text>}
            {(estadoCorreo === 'error' || estadoCorreo === 'no_configurado') && (
              <>
                <Text style={styles.estadoCorreoTexto}>⚠ {mensajeCorreo}</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  {estadoCorreo === 'error' && (
                    <Pressable style={styles.botonCorreo} onPress={() => { if (datosCorreoRef.current) enviarCorreo(datosCorreoRef.current); }}>
                      <Text style={styles.textoBotonCorreo}>Reintentar</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.botonCorreo} onPress={abrirCorreoManual}>
                    <Text style={styles.textoBotonCorreo}>Abrir mi correo</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22, width: '100%' }}>
            <Pressable style={[styles.botonComprar, { flex: 1, backgroundColor: '#D7B56D' }]} onPress={() => onVerRecibo(codigoPedido)}>
              <Text style={styles.textoBotonComprar}>Ver recibo</Text>
            </Pressable>
            <Pressable style={[styles.botonComprar, { flex: 1, backgroundColor: '#132A22', borderWidth: 1, borderColor: '#D7B56D' }]} onPress={onCerrar}>
              <Text style={[styles.textoBotonComprar, { color: '#D7B56D' }]}>Salir</Text>
            </Pressable>
          </View>
        </View>
      )}

      {paso !== 'confirmacion' && (
        <>
          {!!error && <Text style={styles.errorFormulario}>{error}</Text>}
          <Pressable style={[styles.botonComprar, procesando && { opacity: 0.6 }]} onPress={siguiente} disabled={procesando}>
            <Text style={styles.textoBotonComprar}>
              {procesando ? 'Procesando pago…' : paso === 'pago' ? `Pagar ${formatearCOP(totalFinal)}` : 'Continuar →'}
            </Text>
          </Pressable>
          {(paso === 'envio' || paso === 'pago') && !procesando && (
            <Pressable style={styles.enlaceAtras} onPress={() => { setError(''); setPaso(paso === 'pago' ? 'envio' : 'datos'); }}>
              <Text style={styles.textoEnlaceAtras}>← Paso anterior</Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

/* ===================== RECIBO ===================== */
/** Muestra el recibo confirmado y permite descargarlo como TXT o compartirlo en móvil. */
function ReciboPedido({ recibo, onCerrar }: { recibo: Recibo; onCerrar: () => void }) {
  /*
   * Evita solicitudes simultáneas y permite cambiar el texto/deshabilitar el botón
   * mientras la plataforma genera el TXT o abre el diálogo para compartirlo.
   */
  const [descargando, setDescargando] = useState(false);

  /**
   * Convierte la misma instantánea que se presenta en pantalla a texto plano.
   * Los artículos se recorren en orden; los detalles opcionales y el descuento
   * solo se agregan si existen para no dejar líneas vacías en el archivo.
   */
  function generarTextoRecibo(): string {
    const L: string[] = [];
    L.push('═══════════════════════════════════════');
    L.push('        LUXOR COLLECTION');
    L.push('       Tu joyería de confianza');
    L.push('═══════════════════════════════════════');
    L.push('');
    L.push(`Código de pedido: ${recibo.codigoPedido}`);
    L.push(`Fecha: ${recibo.fecha}`);
    L.push('');
    L.push('───────────────────────────────────────');
    L.push('  DATOS DEL CLIENTE');
    L.push('───────────────────────────────────────');
    L.push(`Nombre: ${recibo.nombre}`);
    L.push(`Correo: ${recibo.email}`);
    L.push(`Teléfono: ${recibo.telefono}`);
    L.push(`Dirección: ${recibo.direccion}`);
    L.push(`Envío: ${recibo.metodoEnvio}`);
    L.push(`Método de pago: ${recibo.metodoPago}`);
    L.push('');
    L.push('───────────────────────────────────────');
    L.push('  PRODUCTOS');
    L.push('───────────────────────────────────────');
    // El índice aporta numeración legible y cada condición añade solo opciones presentes.
    recibo.items.forEach((item, i) => {
      L.push(`${i + 1}. ${item.nombre}`);
      if (item.talla) L.push(`   Talla: ${item.talla}`);
      if (item.mililitros) L.push(`   Tamaño: ${item.mililitros}`);
      L.push(`   Precio: ${item.precio}`);
      L.push('');
    });
    L.push('───────────────────────────────────────');
    L.push(`Subtotal: ${formatearCOP(recibo.subtotal)}`);
    // Sin descuento se omite esa línea; el envío gratuito se representa como texto.
    if (recibo.descuento > 0) L.push(`Descuento${recibo.cupon ? ` (${recibo.cupon})` : ''}: -${formatearCOP(recibo.descuento)}`);
    L.push(`Envío: ${recibo.envio === 0 ? 'Gratis' : formatearCOP(recibo.envio)}`);
    L.push(`TOTAL: ${formatearCOP(recibo.total)}`);
    L.push('───────────────────────────────────────');
    L.push('');
    L.push('¡Gracias por tu compra!');
    L.push('Luxor Collection © ' + new Date().getFullYear());
    return L.join('\n');
  }

  /**
   * Descarga en web o guarda y comparte mediante Expo en móvil.
   * El estado de carga se libera en `finally`, por lo que también se recupera si
   * la creación del archivo o el diálogo nativo informa un error.
   */
  async function descargar() {
    setDescargando(true);
    try {
      const texto = generarTextoRecibo();
      const nombreArchivo = `recibo-${recibo.codigoPedido}.txt`;

      if (Platform.OS === 'web') {
        // El navegador descarga el Blob usando una URL temporal que se revoca al terminar el clic.
        const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // En móvil Expo escribe el TXT en caché y delega guardar/compartir al sistema operativo.
        const ruta = `${FileSystem.cacheDirectory}${nombreArchivo}`;
        await FileSystem.writeAsStringAsync(ruta, texto, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(ruta, { dialogTitle: 'Descargar recibo' });
      }
    } catch {
      // El recibo sigue visible aunque falle la descarga; el mensaje explica la acción fallida.
      Alert.alert('Error', 'No se pudo descargar el recibo.');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <ScrollView style={styles.lista} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.reciboTitulo}>Recibo de compra</Text>

      <View style={styles.reciboCaja}>
        <Text style={styles.reciboHeader}>LUXOR COLLECTION</Text>
        <Text style={styles.reciboSubtitulo}>Tu joyería de confianza</Text>
        <View style={styles.reciboLinea} />

        <Text style={styles.reciboLabel}>Código de pedido</Text>
        <Text style={styles.reciboValor}>{recibo.codigoPedido}</Text>

        <Text style={styles.reciboLabel}>Fecha</Text>
        <Text style={styles.reciboValor}>{recibo.fecha}</Text>

        <View style={styles.reciboLinea} />
        <Text style={styles.reciboSeccion}>DATOS DEL CLIENTE</Text>
        <Text style={styles.reciboLabel}>Nombre</Text>
        <Text style={styles.reciboValor}>{recibo.nombre}</Text>
        <Text style={styles.reciboLabel}>Correo</Text>
        <Text style={styles.reciboValor}>{recibo.email}</Text>
        <Text style={styles.reciboLabel}>Dirección</Text>
        <Text style={styles.reciboValor}>{recibo.direccion}</Text>
        <Text style={styles.reciboLabel}>Teléfono</Text>
        <Text style={styles.reciboValor}>{recibo.telefono}</Text>
        <Text style={styles.reciboLabel}>Envío</Text>
        <Text style={styles.reciboValor}>{recibo.metodoEnvio}</Text>
        <Text style={styles.reciboLabel}>Método de pago</Text>
        <Text style={styles.reciboValor}>{recibo.metodoPago}</Text>

        <View style={styles.reciboLinea} />
        <Text style={styles.reciboSeccion}>PRODUCTOS</Text>
        {/* La lista del recibo conserva el orden de compra y muestra solo opciones presentes. */}
        {recibo.items.map((item, i) => (
          <View key={item.id} style={styles.reciboItem}>
            <Text style={styles.reciboItemNombre}>{i + 1}. {item.nombre}</Text>
            {/* Talla y mililitros son excluyentes en la mayoría de productos; se muestran si el artículo los trae. */}
            {item.talla && <Text style={styles.reciboItemDetalle}>   Talla: {item.talla}</Text>}
            {item.mililitros && <Text style={styles.reciboItemDetalle}>   Tamaño: {item.mililitros}</Text>}
            <Text style={styles.reciboItemPrecio}>   {item.precio}</Text>
          </View>
        ))}

        <View style={styles.reciboLinea} />
        <View style={styles.resumenFila}>
          <Text style={styles.reciboItemDetalle}>Subtotal</Text>
          <Text style={styles.reciboItemDetalle}>{formatearCOP(recibo.subtotal)}</Text>
        </View>
        {/* La fila de descuento no aparece para compras sin cupón aplicable. */}
        {recibo.descuento > 0 && (
          <View style={styles.resumenFila}>
            <Text style={styles.reciboItemDetalle}>Descuento{recibo.cupon ? ` (${recibo.cupon})` : ''}</Text>
            <Text style={styles.reciboItemDetalle}>-{formatearCOP(recibo.descuento)}</Text>
          </View>
        )}
        <View style={styles.resumenFila}>
          <Text style={styles.reciboItemDetalle}>Envío</Text>
          <Text style={styles.reciboItemDetalle}>{recibo.envio === 0 ? 'Gratis' : formatearCOP(recibo.envio)}</Text>
        </View>
        <View style={styles.reciboLinea} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.reciboTotalLabel}>TOTAL</Text>
          <Text style={styles.reciboTotalValor}>{formatearCOP(recibo.total)}</Text>
        </View>
        <View style={styles.reciboLinea} />

        <Text style={styles.reciboGracias}>¡Gracias por tu compra!</Text>
        <Text style={styles.reciboFooter}>Luxor Collection © {new Date().getFullYear()}</Text>
      </View>

      <Pressable style={[styles.botonComprar, { marginTop: 18 }, descargando && { opacity: 0.6 }]} onPress={descargar} disabled={descargando}>
        <Text style={styles.textoBotonComprar}>{descargando ? 'Generando…' : 'Descargar recibo'}</Text>
      </Pressable>

      <Pressable style={[styles.botonComprar, { backgroundColor: '#132A22', borderWidth: 1, borderColor: '#D7B56D', marginTop: 10 }]} onPress={onCerrar}>
        <Text style={[styles.textoBotonComprar, { color: '#D7B56D' }]}>Salir al catálogo</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ===================== APP PRINCIPAL ===================== */
/** Orquesta navegación, catálogo, favoritos, compra y componentes secundarios de la aplicación. */
export default function App() {
  /*
   * Estado compartido entre las pestañas principales: catálogo, favoritos y carrito.
   * Los estados de búsqueda y filtros viven en App para que la cabecera y la lista
   * consulten la misma selección mientras se cambia de vista.
   */
  const [pantallaInicial, setPantallaInicial] = useState(true);
  const [pestana, setPestana] = useState<Pestana>('Catalogo');
  const [productos, setProductos] = useState<Producto[]>([]);
  const [favoritos, setFavoritos] = useState<ProductoFavorito[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>({ categoria: 'Todas', precioMin: '', precioMax: '', genero: 'Todos' });
  const [feedbackFavorito, setFeedbackFavorito] = useState<{ id: string; tipo: 'guardando' | 'guardado' | 'error' } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [toast, setToast] = useState<{ id: number; texto: string } | null>(null);

  /*
   * El toast se monta al recibir un mensaje y se limpia después de su duración.
   * La función de limpieza cancela el timeout si App se desmonta o si llega otro
   * mensaje antes de que termine el anterior.
   */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /*
   * El valor guardado permite conservar el desbloqueo del reto entre sesiones.
   * La lectura es de una sola ejecución; el estado inicial se mantiene falso hasta
   * que AsyncStorage confirme el valor almacenado.
   */
  const [cuponBrillo, setCuponBrillo] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(CUPON_BRILLO_KEY).then((v) => setCuponBrillo(v === '1')).catch(() => {});
  }, []);
  /** Desbloquea BRILLO10, guarda el estado y notifica el resultado al cliente. */
  function desbloquearCuponBrillo() {
    setCuponBrillo(true);
    AsyncStorage.setItem(CUPON_BRILLO_KEY, '1').catch(() => {});
    setToast({ id: Date.now(), texto: 'Cupón BRILLO10 desbloqueado: 10 % en tu compra' });
  }

  /*
   * Estos estados representan vistas que reemplazan temporalmente la navegación:
   * detalle, editor, cámara, checkout o recibo. App usa retornos condicionales más
   * adelante para mostrar solo la vista prioritaria activa.
   */
  const [mostrarIA, setMostrarIA] = useState(false);
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [productoDetalle, setProductoDetalle] = useState<Producto | null>(null);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  const [checkoutAbierto, setCheckoutAbierto] = useState(false);
  const [reciboActual, setReciboActual] = useState<Recibo | null>(null);
  const [mostrarRecibo, setMostrarRecibo] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState(false);

  /*
   * El modal de exportación conserva IDs seleccionados y un indicador de progreso.
   * Los IDs se usan para producir un archivo solo con los productos que la persona elija.
   */
  const [mostrarExportar, setMostrarExportar] = useState(false);
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);

  /*
   * Carga inicial en dos fases: primero migra el catálogo y después lee favoritos.
   * Solo cuando ambas operaciones terminan se actualizan las listas y se libera
   * la pantalla de carga. Si falla la recuperación, se usa el catálogo de respaldo;
   * `finally` garantiza que la aplicación no quede bloqueada en el indicador.
   */
  useEffect(() => {
    (async () => {
      try {
        const prods = await migrarProductos();
        const favs = await cargarFavoritos();
        setProductos(prods);
        setFavoritos(favs);
      } catch (error) {
        console.error('No se pudo cargar el catálogo:', error);
        setProductos([...CATALOGO_INICIAL]);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  /**
   * Persiste antes de publicar el nuevo catálogo en pantalla.
   * Si el almacenamiento rechaza la operación, la excepción llega al llamador y
   * el estado visible conserva la lista anterior en vez de aparentar un guardado exitoso.
   */
  async function actualizarProductos(nuevos: Producto[]) {
    await guardarProductosStorage(nuevos);
    setProductos(nuevos);
  }

  /**
   * Actualiza el estado de favoritos y guarda una copia ligera en AsyncStorage.
   * Los favoritos no duplican imágenes ni toda la ficha: guardan solo los campos
   * necesarios para identificarlos y mostrar su resumen.
   */
  async function actualizarFavoritos(nuevos: ProductoFavorito[]) {
    setFavoritos(nuevos);
    try { await AsyncStorage.setItem(FAVORITOS_KEY, JSON.stringify(nuevos)); } catch {}
  }

  /**
   * Agrega o quita el producto de favoritos y comunica el resultado a la tarjeta.
   * Si ya existe, se elimina y termina; si no existe, se muestra progreso, se guarda
   * el resumen y luego se muestra confirmación temporal o error.
   */
  async function toggleFavorito(p: Producto) {
    const existe = favoritos.find((f) => f.id === p.id);
    if (existe) {
      // Quitar un favorito no necesita el indicador de guardado de una nueva entrada.
      await actualizarFavoritos(favoritos.filter((f) => f.id !== p.id));
      return;
    }
    setFeedbackFavorito({ id: p.id, tipo: 'guardando' });
    try {
      // La pausa hace visible el estado de progreso que la interfaz muestra en la tarjeta.
      await new Promise((r) => setTimeout(r, 800));
      await actualizarFavoritos([...favoritos, { id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.categoria }]);
      setFeedbackFavorito({ id: p.id, tipo: 'guardado' });
      setTimeout(() => {
        setFeedbackFavorito((a) => (a?.id === p.id && a.tipo === 'guardado' ? null : a));
      }, 1000);
    } catch {
      setFeedbackFavorito({ id: p.id, tipo: 'error' });
      setTimeout(() => {
        setFeedbackFavorito((a) => (a?.id === p.id && a.tipo === 'error' ? null : a));
      }, 1500);
    }
  }

  /**
   * Añade una línea nueva al carrito sin combinarla con otras unidades.
   * Cada línea tiene un ID propio y copia la talla o presentación elegida, de modo
   * que un mismo producto pueda comprarse con opciones distintas.
   */
  function agregarAlCarrito(p: Producto, opciones?: { talla?: string; mililitros?: string }) {
    setCarrito((prev) => [
      ...prev,
      {
        id: `${p.id}_${Date.now()}`,
        productoId: p.id,
        nombre: p.nombre,
        precio: p.precio,
        categoria: p.categoria,
        talla: opciones?.talla,
        mililitros: opciones?.mililitros,
        imagenUri: p.imagenUri,
      },
    ]);
    setToast({ id: Date.now(), texto: `${p.nombre} añadido al carrito` });
  }

  /**
   * Elimina por ID de línea, no por ID de producto.
   * Así, si el mismo producto se agregó más de una vez, solo se quita la unidad elegida.
   */
  function eliminarDelCarrito(idLinea: string) {
    setCarrito((prev) => prev.filter((i) => i.id !== idLinea));
  }

  /**
   * Adapta el registro de la cámara al modelo central del catálogo.
   * Primero hace persistente la imagen; después persiste el producto nuevo y solo
   * tras el éxito cierra la cámara y regresa al catálogo.
   */
  async function registrarProductoConImagen(nuevo: ProductoConImagenBase) {
    const imagenUri = await guardarImagenPermanente(nuevo.imagenUri, nuevo.id);
    const convertido: Producto = {
      id: nuevo.id, nombre: nuevo.nombre, descripcion: nuevo.descripcion, precio: nuevo.precio,
      categoria: nuevo.categoria, imagenUri, tallas: nuevo.tallas,
      material: nuevo.material, mililitros: nuevo.mililitros, piramide: nuevo.piramide, genero: nuevo.genero,
    };
    await actualizarProductos([convertido, ...productos]);
    setPestana('Catalogo');
    setMostrarCamara(false);
  }

  /**
   * Sustituye la ficha editada y persiste el resultado antes de cerrar.
   * Solo copia la foto si cambió respecto al producto anterior; así editar texto
   * de una ficha antigua no obliga a volver a leer una imagen que podría faltar.
   */
  async function guardarEdicion(actualizado: Producto) {
    try {
      const anterior = productos.find((p) => p.id === actualizado.id);
      const imagenUri = actualizado.imagenUri && actualizado.imagenUri !== anterior?.imagenUri
        ? await guardarImagenPermanente(actualizado.imagenUri, actualizado.id)
        : actualizado.imagenUri;
      const productoGuardado = { ...actualizado, imagenUri };
      const nuevos = productos.map((p) => (p.id === actualizado.id ? productoGuardado : p));
      await actualizarProductos(nuevos);
      setProductoEditando(null);
      Alert.alert('Guardado', 'Producto actualizado.');
    } catch (error) {
      console.error('No se pudo guardar la edición del producto:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo guardar el producto.');
    }
  }

  /**
   * Solicita confirmación con el mecanismo nativo de cada plataforma.
   * Web usa `window.confirm`; móvil espera la elección de Alert. Si se cancela,
   * la función termina sin modificar catálogo ni editor.
   */
  async function eliminarProducto(id: string) {
    if (Platform.OS === 'web') {
      // El navegador devuelve la decisión de forma síncrona.
      if (!window.confirm('¿Eliminar este producto?')) return;
    } else {
      // En móvil Alert devuelve la decisión mediante callbacks, por eso se envuelve en Promise.
      const ok = await new Promise<boolean>((res) => {
        Alert.alert('Eliminar', '¿Seguro?', [
          { text: 'Cancelar', style: 'cancel', onPress: () => res(false) },
          { text: 'Eliminar', style: 'destructive', onPress: () => res(true) },
        ]);
      });
      // Si el usuario cancela, se conserva el producto exactamente como está.
      if (!ok) return;
    }
    await actualizarProductos(productos.filter((p) => p.id !== id));
    setProductoEditando(null);
  }

  /**
   * Solicita una foto para un producto que aún no tiene imagen.
   * La selección se mantiene temporal hasta copiarla al directorio privado y persistir
   * el catálogo. Después se actualiza el detalle abierto para mostrar la foto nueva.
   */
  async function asignarFotoAProducto(id: string) {
    try {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a la galería.');
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (resultado.canceled || !resultado.assets?.[0]?.uri) return;

      const imagenUri = await guardarImagenPermanente(resultado.assets[0].uri, id);
      const nuevos = productos.map((p) =>
        p.id === id ? { ...p, imagenUri, modoImagen: 'completa' as const } : p
      );
      await actualizarProductos(nuevos);
      const actualizado = nuevos.find((p) => p.id === id) || null;
      setProductoDetalle(actualizado);
      Alert.alert('Foto asignada', 'El producto ahora aparece como "con imagen".');
    } catch (error) {
      console.error('No se pudo asignar la foto:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo asignar la foto.');
    }
  }

  /**
   * Exporta productos seleccionados a un JSON portable.
   *
   * Recorre los registros seleccionados y convierte cada foto legible a data URI.
   * Si una ruta local ya no existe, registra esa foto como faltante y continúa con
   * los demás productos. Al final descarga o comparte el JSON según la plataforma.
   */
  async function exportarProductos() {
    setExportando(true);
    try {
      const seleccionados = productos.filter((p) => productosSeleccionados.includes(p.id));
      const productosPortables: Record<string, unknown>[] = [];
      const fotosNoDisponibles: string[] = [];
      // Se procesa cada producto por separado para que una foto faltante no aborte todo el archivo.
      for (const producto of seleccionados) {
        const { imagenUri, ...datos } = producto;
        let imagen: string | undefined;
        if (imagenUri) {
          try {
            imagen = await imagenPortable(imagenUri);
          } catch (error) {
            // Se omite solo el contenido de esta imagen; el registro y los demás productos se exportan.
            console.warn(`No se pudo incluir la foto del producto "${producto.nombre}".`, error);
            fotosNoDisponibles.push(producto.nombre);
          }
        }
        productosPortables.push({ ...datos, ...(imagen ? { imagen } : {}) });
      }
      const contenido = JSON.stringify({ version: 3, productos: productosPortables }, null, 2);
      if (Platform.OS === 'web') {
        // En navegador se genera una descarga desde Blob y se revoca después la URL temporal.
        const blob = new Blob([contenido], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'luxor-products.json';
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        // En móvil el JSON se escribe temporalmente y Expo Sharing abre el diálogo del sistema.
        const ruta = `${FileSystem.cacheDirectory}luxor-products.json`;
        await FileSystem.writeAsStringAsync(ruta, contenido, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(ruta, { dialogTitle: 'Exportar productos' });
      }
      setMostrarExportar(false);
      // El aviso posterior diferencia una exportación completa de otra que omitió fotos antiguas.
      if (fotosNoDisponibles.length) {
        const nombres = fotosNoDisponibles.slice(0, 3).join(', ');
        const restantes = fotosNoDisponibles.length > 3 ? ` y ${fotosNoDisponibles.length - 3} más` : '';
        Alert.alert(
          'Exportación incompleta',
          `El catálogo se exportó, pero no se pudieron incluir ${fotosNoDisponibles.length} foto(s): ${nombres}${restantes}. Vuelve a asignar esas fotos desde la galería para transferirlas.`
        );
      }
    } catch (error) {
      console.error('Error al exportar productos:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo exportar el archivo.');
    } finally {
      setExportando(false);
    }
  }

  /**
   * Valida y aplica el contenido de un JSON importado.
   *
   * Los IDs nuevos se agregan; si un ID ya existe, solo se modifica su imagen
   * portable y se conservan los demás campos actuales. Las rutas antiguas que no
   * traen bytes no pueden recuperar fotos ausentes y se contabilizan para avisar.
   */
  async function importarLista(contenido: string) {
    try {
      const archivo = JSON.parse(contenido);
      // Se aceptan tanto arreglos directos antiguos como el objeto portable versionado actual.
      const items = Array.isArray(archivo) ? archivo : archivo?.productos;
      if (!Array.isArray(items) || items.length === 0) throw new Error('El archivo no contiene productos.');
      /*
       * Las tres colecciones permiten separar casos sin perder datos:
       * `existentes` es el catálogo previo, `nuevos` acumula altas y `actualizados`
       * contiene únicamente cambios de imagen sobre IDs que ya estaban guardados.
       */
      const existentes = new Map(productos.map((p) => [p.id, p]));
      const nuevos = new Map<string, Producto>();
      const actualizados = new Map<string, Producto>();
      const duplicadosSinCambios = new Set<string>();
      const fotosActualizadas = new Set<string>();
      const fotosNoIncluidas = new Set<string>();
      // Cada registro se valida y procesa por separado; uno mal formado no invalida toda la lista.
      for (const p of items) {
        if (!p || typeof p.id !== 'string' || typeof p.nombre !== 'string') continue;

        /*
         * Las exportaciones actuales guardan la imagen en `imagen`. También se
         * acepta una data URI en `imagenUri` para compatibilidad con archivos previos.
         */
        const imagenEnArchivo = typeof p.imagen === 'string'
          ? p.imagen
          : typeof p.imagenUri === 'string' && /^data:image\//i.test(p.imagenUri)
            ? p.imagenUri
            : undefined;
        let imagenUri: string | undefined;
        if (imagenEnArchivo) {
          // La función elige almacenamiento web o archivo privado móvil según la plataforma.
          imagenUri = await guardarImagenImportada(imagenEnArchivo, p.id);
        } else if (typeof p.imagenUri === 'string') {
          // Una URL web sigue siendo utilizable; una ruta file solo puede comprobarse en móvil.
          if (/^https?:\/\//i.test(p.imagenUri)) {
            imagenUri = p.imagenUri;
          } else if (Platform.OS !== 'web' && /^file:\/\//i.test(p.imagenUri)) {
            try {
              const info = await FileSystem.getInfoAsync(p.imagenUri);
              if (info.exists) imagenUri = p.imagenUri;
              // Si el archivo ya no existe, el resto del producto se conserva y se registra el aviso.
              else fotosNoIncluidas.add(p.id);
            } catch {
              fotosNoIncluidas.add(p.id);
            }
          } else {
            fotosNoIncluidas.add(p.id);
          }
        }

        const datos = { ...p };
        delete datos.imagen;
        delete datos.imagenUri;
        const importado: Producto = {
          ...datos,
          id: p.id,
          nombre: p.nombre,
          categoria: p.categoria || inferirCategoria(p.nombre),
          imagenUri,
        };
        /*
         * Se consulta primero el resultado acumulado para manejar IDs repetidos
         * dentro del mismo archivo. Un ID inexistente se agrega; uno existente
         * solo recibe la imagen si el JSON realmente incluye una URI legible.
         */
        const previo = actualizados.get(p.id) ?? nuevos.get(p.id) ?? existentes.get(p.id);
        if (!previo) {
          nuevos.set(p.id, importado);
        } else if (imagenUri) {
          const combinado = { ...previo, imagenUri, modoImagen: p.modoImagen ?? previo.modoImagen };
          // Si el ID fue creado antes en este archivo se actualiza esa alta; de lo contrario,
          // el cambio queda en el mapa de actualizaciones sobre el catálogo que ya existía.
          if (nuevos.has(p.id)) nuevos.set(p.id, combinado);
          else actualizados.set(p.id, combinado);
          fotosActualizadas.add(p.id);
          duplicadosSinCambios.delete(p.id);
        } else if (!fotosActualizadas.has(p.id)) {
          duplicadosSinCambios.add(p.id);
        }
      }
      // Se conserva el orden actual del catálogo y se anteponen los productos nuevos.
      const listaNuevos = [...nuevos.values()];
      const listaActualizada = productos.map((p) => actualizados.get(p.id) ?? p);
      if (listaNuevos.length || fotosActualizadas.size) {
        // No se vuelve a escribir el almacenamiento si el archivo no produjo ningún cambio.
        await actualizarProductos([...listaNuevos, ...listaActualizada]);
      }

      const resumen = [
        `${listaNuevos.length} producto(s) nuevo(s)`,
        `${fotosActualizadas.size} foto(s) actualizada(s)`,
        `${duplicadosSinCambios.size} repetido(s) sin cambios`,
      ].join('; ');
      const avisoFotos = fotosNoIncluidas.size
        ? ` ${fotosNoIncluidas.size} foto(s) no venían incluidas en el archivo antiguo; vuelve a exportar desde el dispositivo donde están guardadas.`
        : '';
      Alert.alert(listaNuevos.length || fotosActualizadas.size ? 'Importación completada' : 'Sin cambios', `${resumen}.${avisoFotos}`);
    } catch (error) {
      console.error('Error al importar productos:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'El archivo no es válido.');
    }
  }

  /**
   * Abre el selector nativo/web, lee el archivo como texto y delega su validación.
   * Cancelar el selector no cambia el catálogo; los errores de lectura se muestran
   * al usuario antes de que se intente interpretar contenido incompleto.
   */
  async function importarProductos() {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/*json'],
        copyToCacheDirectory: true,
      });
      // Cancelar o recibir una selección sin archivo es una salida normal, no un error.
      if (resultado.canceled || !resultado.assets?.[0]) return;
      let contenido: string;
      if (Platform.OS === 'web') {
        // En web el picker entrega una URI local del navegador que se lee mediante fetch.
        const r = await fetch(resultado.assets[0].uri);
        if (!r.ok) throw new Error(`El archivo respondió con error (${r.status}).`);
        contenido = await r.text();
      } else {
        // En móvil Expo FileSystem lee el archivo que el selector copió a caché.
        contenido = await FileSystem.readAsStringAsync(resultado.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      await importarLista(contenido);
    } catch (error) {
      console.error('No se pudo leer el archivo de importación:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'No se pudo leer el archivo.');
    }
  }

  /*
   * Lista derivada que aplica criterios de consulta sin mutar el catálogo persistido.
   * Cada condición devuelve `false` al primer criterio incumplido; un producto
   * permanece solo si coincide con texto, categoría, límites de precio y género.
   */
  const productosFiltrados = useMemo(() => {
    const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = normalizar(busqueda.trim());
    return productos.filter((p) => {
      // La búsqueda compara una cadena normalizada con los campos de texto consultables.
      if (q && !normalizar(`${p.nombre} ${p.descripcion} ${p.categoria} ${p.material ?? ''}`).includes(q)) return false;
      // Los filtros vacíos ("Todas"/"Todos") no excluyen productos.
      if (filtros.categoria !== 'Todas' && p.categoria !== filtros.categoria) return false;
      const precio = parsePrecio(p.precio);
      // El precio se convierte a número solo para comparar límites; se conserva como texto en la ficha.
      if (filtros.precioMin && precio < Number(filtros.precioMin)) return false;
      if (filtros.precioMax && precio > Number(filtros.precioMax)) return false;
      if (filtros.genero !== 'Todos' && p.genero && p.genero !== filtros.genero) return false;
      return true;
    });
  }, [productos, filtros, busqueda]);

  // Totales y nodo de aviso derivados para compartirlos con las vistas.
  const totalCarrito = carrito.reduce((acc, i) => acc + parsePrecio(i.precio), 0);
  const toastNodo = toast ? <ToastLux key={toast.id} texto={toast.texto} /> : null;

  /*
   * Ramas de renderizado de prioridad. Cada vista especial sustituye temporalmente
   * la navegación principal; el orden garantiza que, por ejemplo, un recibo de una
   * compra abierta no se dibuje detrás del detalle o de la lista del catálogo.
   */
  if (cargando) {
    // No se muestran listas vacías mientras termina la recuperación del almacenamiento.
    return (
      <CargandoLux />
    );
  }

  if (pantallaInicial) {
    // La bienvenida se retira cuando el usuario pulsa explorar; no desmonta el estado del catálogo.
    return <PantallaBienvenida onEnter={() => setPantallaInicial(false)} />;
  }

  if (productoDetalle) {
    // El detalle tiene prioridad sobre las pestañas y entrega acciones al estado global de App.
    return (
      <View style={styles.container}>
        <DetalleProducto
          producto={productoDetalle}
          onCerrar={() => setProductoDetalle(null)}
          onAgregarCarrito={(p, op) => agregarAlCarrito(p, op)}
          esFavorito={!!favoritos.find((f) => f.id === productoDetalle.id)}
          onToggleFavorito={toggleFavorito}
          onAsignarFoto={asignarFotoAProducto}
        />
        {toastNodo}
      </View>
    );
  }

  if (productoEditando) {
    // El editor ocupa la pantalla completa y solo devuelve el catálogo tras guardar o cancelar.
    return (
      <View style={styles.container}>
        <EditorProducto
          producto={productoEditando}
          onCerrar={() => setProductoEditando(null)}
          onGuardar={guardarEdicion}
          onEliminar={eliminarProducto}
        />
      </View>
    );
  }

  if (checkoutAbierto) {
    if (mostrarRecibo && reciboActual) {
      // Una confirmación con recibo reemplaza el formulario de checkout.
      return (
        <View style={styles.container}>
          <ReciboPedido
            recibo={reciboActual}
            onCerrar={() => {
              setMostrarRecibo(false);
              setReciboActual(null);
              setCheckoutAbierto(false);
              setCarrito([]);
              setPedidoConfirmado(false);
              setPestana('Catalogo');
            }}
          />
        </View>
      );
    }
    // Si aún no hay recibo, se muestra el formulario y sus callbacks notifican a App.
    return (
      <View style={styles.container}>
        <Checkout
          carrito={carrito}
          total={totalCarrito}
          cuponBrilloDesbloqueado={cuponBrillo}
          onCerrar={() => {
            setCheckoutAbierto(false);
            if (pedidoConfirmado) {
              setCarrito([]);
              setReciboActual(null);
              setMostrarRecibo(false);
              setPedidoConfirmado(false);
              setPestana('Catalogo');
            }
          }}
          onConfirmarPedido={(datos) => {
            setReciboActual({
              codigoPedido: datos.codigoPedido,
              email: datos.email,
              nombre: datos.nombre,
              telefono: datos.telefono,
              direccion: datos.direccion,
              metodoPago: datos.metodoPago,
              metodoEnvio: datos.metodoEnvio,
              items: [...carrito],
              subtotal: datos.subtotal,
              descuento: datos.descuento,
              envio: datos.envio,
              cupon: datos.cupon,
              total: datos.total,
              fecha: new Date().toLocaleString('es-CO'),
            });
            setPedidoConfirmado(true);
          }}
          onVerRecibo={() => setMostrarRecibo(true)}
        />
      </View>
    );
  }

  if (mostrarCamara) {
    // La cámara es una tarea temporal; al guardar con éxito su callback vuelve al catálogo.
    return (
      <View style={styles.container}>
        <ExploracionCamara onCerrar={() => setMostrarCamara(false)} onGuardarProducto={registrarProductoConImagen} />
      </View>
    );
  }

  /*
   * RENDER PRINCIPAL: solo se alcanza cuando no hay una vista especial abierta.
   * En este punto se preparan cabeceras reutilizables y se compone la pestaña
   * activa junto a la barra de navegación y el modal de exportación.
   */
  // Elementos compartidos por las cabeceras de catálogo y favoritos.
  const botonIA = (etiquetaVolver: string) => (
    <Pressable onPress={() => setMostrarIA((v) => !v)} style={[styles.botonIA, mostrarIA && styles.botonIAActivo]}>
      <Text style={[styles.textoBotonIA, mostrarIA && { color: '#07130F' }]}>
        {mostrarIA ? etiquetaVolver : 'Asistente IA'}
      </Text>
    </Pressable>
  );
  // Catálogo y favoritos comparten cabecera fija; el asistente sustituye esa lista.
  const listaConCabecera = !mostrarIA && (pestana === 'Catalogo' || pestana === 'Favoritos');

  // La búsqueda y las categorías quedan fijas; las acciones de catálogo se desplazan con la lista.
  /* En el catálogo TODO se desplaza junto con la lista: solo la búsqueda y las categorías quedan fijas arriba. */
  const cabeceraCatalogo = {
    superior: <EncabezadoLux />,
    fijo: (
      <View style={styles.cabeceraFija}>
        <View style={styles.busquedaCaja}>
          <Text style={styles.busquedaIcono}>◆</Text>
          <TextInput
            style={styles.busquedaInput}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar anillos, relojes, perfumes…"
            placeholderTextColor="#6F7F74"
            returnKeyType="search"
            autoCorrect={false}
          />
          {busqueda.length > 0 && (
            <Pressable onPress={() => setBusqueda('')} hitSlop={10}>
              <Text style={styles.busquedaLimpiar}>✕</Text>
            </Pressable>
          )}
        </View>
        <BarraCategorias productos={productos} seleccion={filtros.categoria} onSeleccion={(c) => setFiltros({ ...filtros, categoria: c })} />
      </View>
    ),
    inferior: (
      <View>
        <View style={styles.panelAccionesCatalogo}>
          <View style={styles.panelSincronizacion}>
            <Pressable
              style={styles.botonSincronizacion}
              onPress={() => { setProductosSeleccionados(productos.map((p) => p.id)); setMostrarExportar(true); }}
            >
              <Text style={styles.textoBotonSincronizacion}>Exportar</Text>
            </Pressable>
            <Pressable style={styles.botonSincronizacion} onPress={importarProductos}>
              <Text style={styles.textoBotonSincronizacion}>Importar</Text>
            </Pressable>
            <Pressable style={styles.botonSincronizacion} onPress={() => setMostrarCamara(true)}>
              <Text style={styles.textoBotonSincronizacion}>Añadir</Text>
            </Pressable>
          </View>
        </View>
        {botonIA('Volver al catálogo')}
      </View>
    ),
  };

  return (
    <View style={styles.container}>
      {!listaConCabecera && <EncabezadoLux compacto />}
      {mostrarIA && botonIA(pestana === 'Favoritos' ? 'Volver a favoritos' : 'Volver al catálogo')}

      <Modal visible={mostrarExportar} transparent animationType="fade" onRequestClose={() => setMostrarExportar(false)}>
        <View style={styles.fondoModal}>
          <View style={styles.modalCaja}>
            <Text style={styles.modalTitulo}>Exportar productos</Text>
            <Text style={styles.textoInfo}>Selecciona cuáles quieres incluir:</Text>
            <ScrollView style={{ maxHeight: 300, marginVertical: 8 }}>
              {productos.map((p) => {
                const sel = productosSeleccionados.includes(p.id);
                return (
                  <Pressable key={p.id} style={[styles.itemSeleccion, sel && styles.itemSeleccionActivo]} onPress={() => setProductosSeleccionados((prev) => sel ? prev.filter((id) => id !== p.id) : [...prev, p.id])}>
                    <Text style={styles.textoSeleccion}>{sel ? '☑' : '☐'} {p.nombre}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.botonSincronizacion} onPress={exportarProductos} disabled={exportando}>
              <Text style={styles.textoBotonSincronizacion}>{exportando ? 'Exportando…' : `Exportar ${productosSeleccionados.length}`}</Text>
            </Pressable>
            <Pressable style={[styles.botonSincronizacion, { borderColor: '#7A1F33' }]} onPress={() => setMostrarExportar(false)}>
              <Text style={[styles.textoBotonSincronizacion, { color: '#EE9AA8' }]}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* El asistente recibe productos favoritos cuando se abre desde Favoritos; en las demás pestañas recibe el catálogo. */}
      {mostrarIA && (
        <AsistenteIA productos={pestana === 'Favoritos' ? favoritos.map((f) => productos.find((p) => p.id === f.id) || f) as Producto[] : productos} />
      )}

      {/* Cada pestaña principal se monta de forma excluyente según selección y modo IA. */}
      {!mostrarIA && pestana === 'Catalogo' && (
        <ProductosLista
          datos={productosFiltrados}
          favoritos={favoritos}
          carrito={carrito}
          feedbackFavorito={feedbackFavorito}
          onToggleFavorito={toggleFavorito}
          onAbrirDetalle={setProductoDetalle}
          onAgregarCarrito={agregarAlCarrito}
          onEditar={setProductoEditando}
          onEliminar={eliminarProducto}
          mensajeVacio="No encontramos piezas con esa búsqueda. Prueba otra categoría o palabra."
          cabecera={cabeceraCatalogo}
        />
      )}

      {!mostrarIA && pestana === 'Favoritos' && (
        <ProductosLista
          datos={productos.filter((p) => favoritos.find((f) => f.id === p.id))}
          favoritos={favoritos}
          carrito={carrito}
          feedbackFavorito={feedbackFavorito}
          onToggleFavorito={toggleFavorito}
          onAbrirDetalle={setProductoDetalle}
          onAgregarCarrito={agregarAlCarrito}
          onEditar={setProductoEditando}
          onEliminar={eliminarProducto}
          mensajeVacio="Aún no tienes favoritos. Toca la estrella en cualquier producto."
          cabecera={{ superior: <EncabezadoLux />, inferior: botonIA('Volver a favoritos') }}
        />
      )}

      {!mostrarIA && pestana === 'Sensores' && (
        <PantallaSensores
          productos={productos}
          cuponDesbloqueado={cuponBrillo}
          onDesbloquearCupon={desbloquearCuponBrillo}
          onAbrirDetalle={setProductoDetalle}
        />
      )}

      {!mostrarIA && pestana === 'Carrito' && (
        <PantallaCarrito
          carrito={carrito}
          total={totalCarrito}
          onEliminar={eliminarDelCarrito}
          onComprar={() => setCheckoutAbierto(true)}
        />
      )}

      <View style={styles.barraNav}>
        <BotonPestana activa={pestana === 'Catalogo'} icono="◆" texto="Catálogo" onPress={() => { setMostrarIA(false); setPestana('Catalogo'); }} />
        <BotonPestana activa={pestana === 'Favoritos'} icono="★" texto="Favoritos" insignia={favoritos.length} onPress={() => { setMostrarIA(false); setPestana('Favoritos'); }} />
        <BotonPestana activa={pestana === 'Sensores'} icono="◎" texto="Sensores" onPress={() => { setMostrarIA(false); setPestana('Sensores'); }} />
        <BotonPestana activa={pestana === 'Carrito'} icono="◈" texto="Carrito" insignia={carrito.length} onPress={() => { setMostrarIA(false); setPestana('Carrito'); }} />
      </View>
      {toastNodo}
    </View>
  );
}

/* ===================== ENCABEZADO ANIMADO ===================== */
/** Marca reutilizada por App y ProductosLista; cambia tamaño y subtítulo según el espacio disponible. */
function EncabezadoLux({ compacto = false }: { compacto?: boolean }) {
  // Valores que animan la aparición del título, los filetes y el brillo decorativo.
  const aparecer = useRef(new Animated.Value(0)).current;
  const lineas = useRef(new Animated.Value(0)).current;
  const brillo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(aparecer, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(lineas, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
    const destello = Animated.loop(
      Animated.sequence([
        Animated.timing(brillo, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(brillo, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    destello.start();
    return () => destello.stop();
  }, []);

  const anchoLinea = lineas.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });
  const brilloOpacidad = brillo.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const bajar = aparecer.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] });

  return (
    <Animated.View style={{ alignItems: 'center', marginBottom: compacto ? 6 : 8, opacity: aparecer, transform: [{ translateY: bajar }] }}>
      <Text style={[styles.titulo, compacto && { fontSize: 20, letterSpacing: 4 }]} numberOfLines={1} adjustsFontSizeToFit>LUXOR COLLECTION</Text>
      {!compacto && (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <Animated.View style={{ height: 1, width: anchoLinea, backgroundColor: '#D7B56D' }} />
        <Animated.Text style={{ color: '#D7B56D', fontSize: 8, opacity: brilloOpacidad }}>◆</Animated.Text>
        <Text style={styles.subtitulo}>Alta Joyería</Text>
        <Animated.Text style={{ color: '#D7B56D', fontSize: 8, opacity: brilloOpacidad }}>◆</Animated.Text>
        <Animated.View style={{ height: 1, width: anchoLinea, backgroundColor: '#D7B56D' }} />
      </View>
      )}
    </Animated.View>
  );
}

/* ===================== LISTA ===================== */
/** Renderiza productos en una o varias columnas, separados por presencia de imagen. App la usa en Catálogo y Favoritos. */
function ProductosLista({
  datos, favoritos, carrito, feedbackFavorito,
  onToggleFavorito, onAbrirDetalle, onAgregarCarrito, onEditar, onEliminar, mensajeVacio, cabecera,
}: {
  datos: Producto[];
  favoritos: ProductoFavorito[];
  carrito: ItemCarrito[];
  feedbackFavorito?: { id: string; tipo: 'guardando' | 'guardado' | 'error' } | null;
  onToggleFavorito: (p: Producto) => void;
  onAbrirDetalle: (p: Producto) => void;
  onAgregarCarrito: (p: Producto, op?: { talla?: string; mililitros?: string }) => void;
  onEditar: (p: Producto) => void;
  onEliminar: (id: string) => void;
  mensajeVacio?: string;
  cabecera?: { superior?: ReactNode; fijo?: ReactNode; inferior?: ReactNode };
}) {
  const { width } = useWindowDimensions();
  /*
   * La lista usa breakpoints simples para equilibrar densidad y legibilidad:
   * una columna en teléfono, dos en ventana mediana y tres en escritorio ancho.
   * Se conserva el mismo componente y solo cambia el acomodo de las celdas.
   */
  let columnas = 1;
  if (width >= 900) columnas = 3;
  else if (width >= 600) columnas = 2;

  /*
   * Se preparan dos grupos derivados sin alterar `datos`: productos con URI de foto
   * y productos sin imagen. Así la interfaz puede titular ambas secciones y mostrar
   * un mensaje vacío independiente cuando una de ellas no tiene registros.
   */
  const conImagen = datos.filter((p) => !!p.imagenUri);
  const sinImagen = datos.filter((p) => !p.imagenUri);
  // La barra de búsqueda/categorías (cabecera.fijo) queda pegada arriba mientras se desplaza el resto.
  const indiceFijo = cabecera?.fijo ? (cabecera.superior ? 1 : 0) : undefined;

  /**
   * Adapta un registro a Tarjeta y conecta las acciones que App entregó por props.
   * El estado de carrito se calcula por producto, mientras que favorito y feedback
   * se consultan por ID para que cada tarjeta muestre su propio estado.
   */
  const renderItem = (item: Producto) => {
    const feedback = feedbackFavorito?.id === item.id ? feedbackFavorito.tipo : null;
    return (
      <Tarjeta
        producto={item}
        esFavorito={!!favoritos.find((f) => f.id === item.id)}
        enCarrito={carrito.some((c) => c.productoId === item.id)}
        feedbackFavorito={feedback}
        onToggleFavorito={onToggleFavorito}
        onAbrirDetalle={onAbrirDetalle}
        onAgregarCarrito={onAgregarCarrito}
        onEditar={onEditar}
        onEliminar={onEliminar}
      />
    );
  };

  /**
   * Renderiza una sección de la lista, su contador y el estado vacío opcional.
   * Si no hay productos ni mensaje, omite por completo la sección; con mensaje,
   * muestra el encabezado y explica por qué no hay tarjetas.
   */
  const renderSeccion = (titulo: string, items: Producto[], vacio?: string) => {
    // Evita encabezados sin contenido cuando el llamador no pidió un estado vacío explícito.
    if (items.length === 0 && !vacio) return null;
    return (
      <View style={{ marginBottom: 20 }}>
        <View style={styles.seccionHeader}>
          <View style={styles.seccionLinea} />
          <Text style={styles.seccionTitulo}>{titulo}</Text>
          <View style={styles.seccionLinea} />
        </View>
        <Text style={styles.seccionContador}>{items.length} producto(s)</Text>
        {/* El arreglo vacío muestra el texto recibido; de lo contrario se mapean sus tarjetas. */}
        {items.length === 0 ? (
          <View style={styles.vacioCompacto}>
            <Text style={styles.textoVacio}>{vacio}</Text>
          </View>
        ) : (
          <View style={columnas > 1 ? styles.filaWrap : undefined}>
            {/*
             * Cada celda usa el ID del producto como clave estable. En anchos mayores
             * se asigna un porcentaje de columna; en móvil se deja que la tarjeta use el ancho completo.
             */}
            {items.map((item) => (
              <View key={item.id} style={columnas > 1 ? [styles.celda, { flexBasis: `${100 / columnas}%` }] : undefined}>
                {renderItem(item)}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.lista}
      contentContainerStyle={styles.listaContenido}
      stickyHeaderIndices={indiceFijo !== undefined ? [indiceFijo] : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {cabecera?.superior}
      {cabecera?.fijo}
      {cabecera?.inferior}
      {/* El mensaje global se reserva para cuando búsqueda y filtros no dejan ningún resultado. */}
      {datos.length === 0 ? (
        <View style={styles.panelVacio}>
          <Text style={styles.textoVacio}>{mensajeVacio || 'Sin resultados.'}</Text>
        </View>
      ) : (
        <View>
          {renderSeccion('Con imagen', conImagen, 'Aún no hay productos con imagen.')}
          {renderSeccion('Sin imagen', sinImagen, 'Aún no hay productos sin imagen.')}
        </View>
      )}
    </ScrollView>
  );
}

/* ===================== BOTÓN PESTAÑA ===================== */
/** Elemento de navegación inferior; App lo usa para cambiar de pestaña y mostrar insignias. */
function BotonPestana({ activa, texto, icono, insignia, onPress }: {
  activa: boolean; texto: string; icono?: string; insignia?: number; onPress: () => void;
}) {
  const escala = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // El efecto se dispara en la pestaña activa y devuelve su escala a 1 con un resorte.
    if (activa) {
      escala.setValue(0.82);
      Animated.spring(escala, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
  }, [activa]);
  return (
    <Pressable style={styles.itemNav} onPress={onPress}>
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: escala }] }}>
        <View>
          <Text style={[styles.iconoNav, activa && styles.iconoNavActivo]}>{icono ?? '◆'}</Text>
          {!!insignia && insignia > 0 && (
            <View style={styles.insignia}>
              <Text style={styles.insigniaTexto}>{insignia > 99 ? '99+' : insignia}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.textoNav, activa && styles.textoNavActivo]}>{texto}</Text>
        <View style={[styles.indicadorNav, activa && styles.indicadorNavActivo]} />
      </Animated.View>
    </Pressable>
  );
}

/* ===================== CATEGORÍAS RÁPIDAS ===================== */
/** Filtros horizontales de categoría usados por la cabecera del catálogo. */
function BarraCategorias({ productos, seleccion, onSeleccion }: {
  productos: Producto[]; seleccion: Categoria | 'Todas'; onSeleccion: (c: Categoria | 'Todas') => void;
}) {
  const cats: (Categoria | 'Todas')[] = ['Todas', 'Anillo', 'Cadena', 'Pulsera', 'Aretes', 'Reloj', 'Perfume'];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
      {/*
       * Las categorías se recorren para crear filtros uniformes. El contador de
       * "Todas" usa el total; los demás cuentan solo productos de esa categoría.
       */}
      {cats.map((c) => {
        const n = c === 'Todas' ? productos.length : productos.filter((p) => p.categoria === c).length;
        const activa = seleccion === c;
        return (
          <Pressable key={c} style={[styles.catPill, activa && styles.catPillActiva]} onPress={() => onSeleccion(c)}>
            <Text style={[styles.catPillTexto, activa && styles.catPillTextoActivo]}>{c}</Text>
            <Text style={[styles.catPillConteo, activa && styles.catPillTextoActivo]}>{n}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ===================== AVISO ANIMADO ===================== */
/** Mensaje temporal de confirmación que App monta al crear el toast correspondiente. */
function ToastLux({ texto }: { texto: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Entrada, permanencia y salida forman un único ciclo temporal para el aviso.
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(anim, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}
    >
      <Text style={styles.toastIcono}>✓</Text>
      <Text style={styles.toastTexto} numberOfLines={2}>{texto}</Text>
    </Animated.View>
  );
}

/* ===================== CARGA ELEGANTE ===================== */
/** Pantalla de espera que App muestra mientras migra catálogo y favoritos. */
function CargandoLux() {
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Se repite mientras dure la carga y se detiene al desmontar el componente.
    const lazo = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    lazo.start();
    return () => lazo.stop();
  }, []);
  return (
    <View style={[styles.container, styles.cargandoCentro]}>
      <Animated.Text style={{ color: '#D7B56D', fontSize: 30, opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }] }}>◆</Animated.Text>
      <Text style={styles.titulo}>LUXOR</Text>
      <Text style={styles.subtitulo}>Preparando la colección</Text>
    </View>
  );
}

/* ===================== CARRITO ===================== */
/** Lista las líneas de compra y delega eliminar o iniciar checkout a App. */
function PantallaCarrito({
  carrito, total, onEliminar, onComprar,
}: {
  carrito: ItemCarrito[]; total: number; onEliminar: (id: string) => void; onComprar: () => void;
}) {
  return (
    <ScrollView style={styles.lista} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.panelCarrito}>
        <Text style={styles.tituloCarrito}>Tu carrito</Text>
        {/*
         * El estado vacío evita mostrar totales o checkout sin artículos.
         * Cuando hay líneas, se dibujan individualmente y se permite quitar cada una.
         */}
        {carrito.length === 0 ? (
          <Text style={styles.textoVacioCarrito}>Aún no has añadido productos.</Text>
        ) : (
          <>
            {carrito.map((item) => (
              <View key={item.id} style={styles.itemCarrito}>
                {item.imagenUri && <Image source={{ uri: item.imagenUri }} style={{ width: 60, height: 60, borderRadius: 2, marginRight: 12, borderWidth: 1, borderColor: '#22372E' }} />}
                <View style={styles.infoItemCarrito}>
                  <Text style={styles.nombreItemCarrito}>{item.nombre}</Text>
                  <Text style={styles.origenItemCarrito}>
                    {item.categoria}{item.talla ? ` · ${item.talla}` : ''}{item.mililitros ? ` · ${item.mililitros}` : ''}
                  </Text>
                  <Text style={styles.precioItemCarrito}>{item.precio}</Text>
                </View>
                <Pressable style={styles.botonEliminarItem} onPress={() => onEliminar(item.id)}>
                  <Text style={styles.textoEliminarItem}>✕</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.totalCarrito}>
              <Text style={styles.textoTotalCarrito}>Total</Text>
              <Text style={styles.valorTotalCarrito}>{formatearCOP(total)}</Text>
            </View>
            <Pressable style={styles.botonComprar} onPress={onComprar}>
              <Text style={styles.textoBotonComprar}>Ir al checkout</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

/* ===================== VITRINA DE BRILLO (SENSORES) ===================== */
/**
 * Número máximo de cruces de luz que completa el reto.
 * Cada destello suma dos quilates desde el valor inicial de 10K, hasta 24K.
 */
const META_DESTELLOS = 7;
/**
 * Mantiene lecturas del acelerómetro y desplazamientos táctiles dentro del rango
 * normalizado que las interpolaciones visuales esperan: -1 a 1.
 */
const acotar = (v: number) => Math.max(-1, Math.min(1, v));
/**
 * Puntos decorativos sobre la vitrina. Cada objeto define su posición relativa
 * y tamaño; el mismo arreglo se recorre para dibujar todas las chispas animadas.
 */
const CHISPAS: { top: `${number}%`; left: `${number}%`; size: number }[] = [
  { top: '12%', left: '14%', size: 20 },
  { top: '22%', left: '78%', size: 16 },
  { top: '64%', left: '10%', size: 14 },
  { top: '70%', left: '82%', size: 22 },
  { top: '8%', left: '52%', size: 12 },
  { top: '80%', left: '48%', size: 14 },
];

/**
 * Vitrina que conecta movimiento con una actividad visual de pulido.
 *
 * A partir de la lectura real o simulada inclina la joya y el reflejo. Un cambio
 * lateral válido incrementa el progreso con un límite temporal; al llegar a la meta
 * notifica a App para que guarde el cupón. El componente no persiste el catálogo ni el cupón.
 */
function VitrinaBrillo({ productos, lectura, modo, cuponDesbloqueado, onInclinar, onDesbloquearCupon, onAbrirDetalle }: {
  productos: Producto[];
  lectura: Lectura;
  modo: Modo;
  cuponDesbloqueado: boolean;
  onInclinar: (x: number, y: number) => void;
  onDesbloquearCupon: () => void;
  onAbrirDetalle: (p: Producto) => void;
}) {
  const [indice, setIndice] = useState(0);
  const [destellos, setDestellos] = useState(0);
  /*
   * Valores animados para la orientación, el reflejo y la chispa. Los refs de modo
   * y callback permiten que PanResponder, creado una vez, lea los valores actuales
   * en vez de capturar props antiguas durante un arrastre prolongado.
   */
  const giroX = useRef(new Animated.Value(0)).current;
  const giroY = useRef(new Animated.Value(0)).current;
  const chispa = useRef(new Animated.Value(0)).current;
  const ladoRef = useRef(0);
  const ultimoRef = useRef(0);
  const cuponAvisadoRef = useRef(false);
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const inclinarRef = useRef(onInclinar);
  inclinarRef.current = onInclinar;

  /*
   * El índice recorre la colección de forma circular. Si no hay productos se deja
   * `producto` sin definir y `n` se mantiene en uno para que las operaciones módulo
   * de los botones no dividan por cero.
   */
  const producto = productos.length ? productos[indice % productos.length] : undefined;
  const x = acotar(lectura.x);
  const y = acotar(lectura.y);
  const completo = destellos >= META_DESTELLOS;
  const kilates = Math.min(24, 10 + destellos * 2);

  /**
   * Permite arrastrar la vitrina solo cuando el modo es simulación.
   * El desplazamiento en píxeles se escala y acota antes de pasarlo a App; al soltar
   * o cancelar el gesto se devuelve la inclinación al centro.
   */
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => modoRef.current === 'simulacion',
      onMoveShouldSetPanResponder: () => modoRef.current === 'simulacion',
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => inclinarRef.current(acotar(g.dx / 110), acotar(g.dy / 110)),
      onPanResponderRelease: () => inclinarRef.current(0, 0),
      onPanResponderTerminate: () => inclinarRef.current(0, 0),
    })
  ).current;

  useEffect(() => {
    // Las animaciones de giro siguen la lectura suavemente en ambos ejes.
    Animated.parallel([
      Animated.timing(giroX, { toValue: x, duration: 110, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(giroY, { toValue: y, duration: 110, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
    /*
     * Un destello requiere salir de la zona central y cruzar al lado opuesto.
     * El cooldown evita contar ruido del sensor como varios movimientos seguidos;
     * el contador se limita a la meta para que el progreso no exceda el 100 %.
     */
    if (Math.abs(x) > 0.25) {
      const lado = x > 0 ? 1 : -1;
      if (ladoRef.current !== 0 && ladoRef.current !== lado && Date.now() - ultimoRef.current > 600) {
        ultimoRef.current = Date.now();
        chispa.setValue(0);
        Animated.timing(chispa, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
        setDestellos((d) => Math.min(META_DESTELLOS, d + 1));
      }
      ladoRef.current = lado;
    }
  }, [x, y]);

  useEffect(() => {
    // El cupón se notifica una sola vez por ciclo del reto, incluso si hay renders posteriores.
    if (completo && !cuponAvisadoRef.current) {
      cuponAvisadoRef.current = true;
      if (!cuponDesbloqueado) onDesbloquearCupon();
    }
  }, [completo]);

  const rotY = giroX.interpolate({ inputRange: [-1, 1], outputRange: ['-32deg', '32deg'] });
  const rotX = giroY.interpolate({ inputRange: [-1, 1], outputRange: ['32deg', '-32deg'] });
  const luzX = giroX.interpolate({ inputRange: [-1, 1], outputRange: [-130, 130] });
  const luzFinaX = giroX.interpolate({ inputRange: [-1, 1], outputRange: [-100, 160] });
  const chispaOpacidad = chispa.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
  const chispaEscala = chispa.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.5] });
  const n = Math.max(productos.length, 1);

  return (
    <View style={styles.vitrina}>
      <Text style={styles.vitrinaEtiqueta}>VITRINA DE BRILLO</Text>
      <Text style={styles.vitrinaSub}>
        {/* La instrucción explica si el movimiento viene del teléfono o del gesto de arrastre. */}
        {modo === 'real'
          ? 'Inclina el teléfono de lado a lado y barre la luz sobre la joya.'
          : 'Arrastra sobre la joya de izquierda a derecha para simular la inclinación.'}
      </Text>

      <View style={styles.vitrinaSelector}>
        {/* Cambiar de producto se deshabilita con menos de dos opciones. */}
        <Pressable style={styles.vitrinaFlecha} onPress={() => setIndice((i) => (i - 1 + n) % n)} disabled={productos.length < 2}>
          <Text style={styles.vitrinaFlechaTexto}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.vitrinaNombre} numberOfLines={1}>{producto?.nombre ?? 'Sin productos'}</Text>
          {!!producto && <Text style={styles.vitrinaCategoria}>{producto.categoria} · {producto.precio}</Text>}
        </View>
        <Pressable style={styles.vitrinaFlecha} onPress={() => setIndice((i) => (i + 1) % n)} disabled={productos.length < 2}>
          <Text style={styles.vitrinaFlechaTexto}>›</Text>
        </Pressable>
      </View>

      <View style={styles.vitrinaEscenario} testID="vitrina-escenario" {...pan.panHandlers}>
        <Animated.View style={{ alignItems: 'center', justifyContent: 'center', transform: [{ perspective: 700 }, { rotateY: rotY }, { rotateX: rotX }] }}>
          {/* Sin foto se usa una gema ilustrada para mantener visible el reto y el movimiento. */}
          {producto?.imagenUri ? (
            <Image source={{ uri: producto.imagenUri }} style={styles.vitrinaImagen} resizeMode="contain" />
          ) : (
            <View style={styles.gemaExterior}>
              <View style={styles.gemaMedio}>
                <View style={styles.gemaNucleo} />
              </View>
            </View>
          )}
        </Animated.View>

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.vitrinaLuz, { transform: [{ translateX: luzX }, { rotate: '18deg' }] }]} />
          <Animated.View style={[styles.vitrinaLuzFina, { transform: [{ translateX: luzFinaX }, { rotate: '18deg' }] }]} />
          {/* Cada chispa comparte la animación de destello y toma ubicación/tamaño del arreglo. */}
          {CHISPAS.map((c, i) => (
            <Animated.Text key={i} style={[styles.vitrinaChispa, { top: c.top, left: c.left, fontSize: c.size, opacity: chispaOpacidad, transform: [{ scale: chispaEscala }] }]}>✦</Animated.Text>
          ))}
        </View>
      </View>

      <View style={styles.vitrinaMedidor}>
        <View style={styles.vitrinaMedidorFila}>
          <Text style={styles.vitrinaMedidorTexto}>Pureza del oro</Text>
          <Text style={styles.vitrinaKilates}>{kilates}K</Text>
        </View>
        <View style={styles.vitrinaRiel}>
          <View style={[styles.vitrinaRelleno, { width: `${(destellos / META_DESTELLOS) * 100}%` as `${number}%` }]} />
        </View>
        <Text style={styles.vitrinaPista}>
          {completo ? '¡Oro de 24K! Pulido a la perfección.' : `Destellos: ${destellos}/${META_DESTELLOS} · barre la luz de un lado a otro`}
        </Text>
      </View>

      {/* La tarjeta del cupón aparece solo después de que App confirma el desbloqueo. */}
      {cuponDesbloqueado && (
        <View style={styles.vitrinaCupon}>
          <Text style={styles.vitrinaCuponTitulo}>CUPÓN DESBLOQUEADO</Text>
          <Text selectable style={styles.vitrinaCuponCodigo}>BRILLO10</Text>
          <Text style={styles.vitrinaPista}>10 % de descuento: escríbelo en el paso de pago de tu compra.</Text>
        </View>
      )}

      <View style={styles.controlesSensor}>
        {/* Reiniciar borra progreso y refs de lado/cupón para permitir repetir el reto visual. */}
        <Pressable style={styles.botonSensor} onPress={() => { setDestellos(0); ladoRef.current = 0; cuponAvisadoRef.current = false; }}>
          <Text style={styles.textoBotonSensor}>Reiniciar pulido</Text>
        </Pressable>
        {/* No se puede abrir un detalle si el catálogo está vacío. */}
        <Pressable style={[styles.botonSensor, !producto && { opacity: 0.4 }]} disabled={!producto} onPress={() => producto && onAbrirDetalle(producto)}>
          <Text style={styles.textoBotonSensor}>Ver esta joya</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ===================== SENSORES ===================== */
/**
 * Coordina sensor, simulación, alarma y vitrina.
 * En web bloquea el acelerómetro físico y usa los desplazamientos que produce el
 * gesto de la vitrina; en móvil puede solicitar permiso y escuchar el sensor real.
 * La suscripción se elimina al cambiar de modo o desmontar la pantalla.
 */
function PantallaSensores({ productos, cuponDesbloqueado, onDesbloquearCupon, onAbrirDetalle }: {
  productos: Producto[];
  cuponDesbloqueado: boolean;
  onDesbloquearCupon: () => void;
  onAbrirDetalle: (p: Producto) => void;
}) {
  /*
   * Se mantienen lecturas físicas y simuladas por separado para que cambiar de modo
   * no mezcle datos. `estado` informa el resultado del permiso/sensor y las otras
   * variables controlan pausa, alarma actual e historial de alertas.
   */
  const [datos, setDatos] = useState<Lectura>({ x: 0, y: 0, z: 0 });
  const [simulados, setSimulados] = useState<Lectura>({ x: 0, y: 0, z: 1 });
  const [modo, setModo] = useState<Modo>('simulacion');
  const [estado, setEstado] = useState('Simulación: sin sensor físico');
  const [pausado, setPausado] = useState(false);
  const esWeb = Platform.OS === 'web';
  const UMBRAL = 1.5;
  const [alarmaActiva, setAlarmaActiva] = useState(false);
  const [ultimaAlerta, setUltimaAlerta] = useState<Alerta | null>(null);
  const [contadorAlertas, setContadorAlertas] = useState(0);
  const ultimaAlertaRef = useRef<number>(0);
  const COOLDOWN_MS = 1000;

  /*
   * La suscripción depende de plataforma, modo y pausa. En web se fuerza simulación;
   * en móvil se solicita permiso y se comprueba disponibilidad antes de escuchar.
   * `cancelado` evita que respuestas tardías cambien estado después de desmontar o cambiar modo.
   */
  useEffect(() => {
    // El entorno web no tiene este acelerómetro nativo, por eso se mantiene solo la simulación.
    if (esWeb) { setModo('simulacion'); setEstado('Entorno Web: sensor deshabilitado.'); return; }
    // No se pide permiso hasta que el usuario elige explícitamente el modo real.
    if (modo !== 'real') { setEstado('Simulación: sin sensor físico'); return; }
    // Pausar suspende la lectura; al reanudar, el efecto crea una nueva suscripción.
    if (pausado) { setEstado('Sensor pausado.'); return; }
    let cancelado = false;
    let subscription: { remove: () => void } | undefined;
    (async () => {
      try {
        const perm = await Accelerometer.requestPermissionsAsync();
        // Si el efecto ya se limpió o el usuario rechazó, no se registra el listener.
        if (cancelado || !perm.granted) { setEstado('Permiso denegado.'); return; }
        const disp = await Accelerometer.isAvailableAsync();
        // Algunos dispositivos no tienen sensor utilizable; la pantalla informa y conserva simulación.
        if (cancelado || !disp) { setEstado('Sensor no disponible.'); return; }
        Accelerometer.setUpdateInterval(120); // lectura fluida para la Vitrina de Brillo; la alarma conserva su umbral y enfriamiento
        subscription = Accelerometer.addListener((d) => {
          if (cancelado) return;
          setDatos({ x: d.x, y: d.y, z: d.z });
          setEstado('Sensor activo');
          const mag = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
          const ahora = Date.now();
          // La alerta requiere superar umbral y cooldown para no repetir avisos por cada muestra.
          if (mag > UMBRAL && ahora - ultimaAlertaRef.current > COOLDOWN_MS) {
            ultimaAlertaRef.current = ahora;
            setAlarmaActiva(true);
            setContadorAlertas((c) => c + 1);
            setUltimaAlerta({ hora: new Date().toLocaleTimeString('es-CO'), magnitud: mag });
          }
        });
      } catch {
        // Fallos de permiso o API se comunican solo si la pantalla todavía está activa.
        if (!cancelado) setEstado('No se pudo iniciar el sensor.');
      }
    })();
    // Se cancela la tarea pendiente y se libera el listener nativo al salir del modo real.
    return () => { cancelado = true; subscription?.remove(); };
  }, [modo, pausado, esWeb]);

  /*
   * La lectura activa alimenta tanto la vitrina como la información en pantalla.
   * La posición se deriva del eje X y solo etiqueta inclinaciones que superan ±0.5 g.
   */
  const lectura = modo === 'real' ? datos : simulados;
  const magnitud = Math.sqrt(lectura.x ** 2 + lectura.y ** 2 + lectura.z ** 2);
  let posicion = 'Posición centrada';
  if (lectura.x > 0.5) posicion = 'Inclinado a la derecha';
  else if (lectura.x < -0.5) posicion = 'Inclinado a la izquierda';

  /**
   * Permite probar la alerta sin sacudir el dispositivo.
   * Usa el mismo cooldown que la lectura física para que las dos rutas se comporten
   * igual y no generen varias alertas en menos de un segundo.
   */
  function simularSacudida() {
    const ahora = Date.now();
    if (ahora - ultimaAlertaRef.current > COOLDOWN_MS) {
      ultimaAlertaRef.current = ahora;
      setAlarmaActiva(true);
      setContadorAlertas((c) => c + 1);
      setUltimaAlerta({ hora: new Date().toLocaleTimeString('es-CO'), magnitud: 2.1 });
    }
  }

  return (
    <ScrollView style={styles.lista} contentContainerStyle={styles.panelSensor}>
      <Text style={styles.tituloSensor}>Mi app siente el movimiento</Text>
      {/* La advertencia evita presentar el arrastre de navegador como lectura física. */}
      {esWeb && (
        <View style={styles.bannerWebInfo}>
          <Text style={styles.textoBannerWeb}>Modo Web: simulación activada.</Text>
        </View>
      )}
      <View style={styles.controlesSensor}>
        {/* La opción física queda deshabilitada en web, pero la simulación está disponible en ambas plataformas. */}
        <Pressable disabled={esWeb} style={[styles.botonSensor, modo === 'real' && styles.botonSensorActivo, esWeb && { opacity: 0.4 }]} onPress={() => !esWeb && setModo('real')}>
          <Text style={[styles.textoBotonSensor, modo === 'real' && styles.textoBotonSensorActivo]}>Sensor real</Text>
        </Pressable>
        <Pressable style={[styles.botonSensor, modo === 'simulacion' && styles.botonSensorActivo]} onPress={() => setModo('simulacion')}>
          <Text style={[styles.textoBotonSensor, modo === 'simulacion' && styles.textoBotonSensorActivo]}>Simulación</Text>
        </Pressable>
      </View>
      <Text style={styles.estadoSensor}>{estado}</Text>

      {alarmaActiva && (
        <View style={styles.bannerAlarma}>
          <Text style={styles.textoAlarma}>¡Movimiento brusco detectado!</Text>
          <Text style={styles.textoAlarmaDetalle}>Magnitud: {ultimaAlerta?.magnitud.toFixed(2)} g</Text>
          <Pressable style={styles.botonCerrarAlarma} onPress={() => setAlarmaActiva(false)}>
            <Text style={styles.textoCerrarAlarma}>Entendido</Text>
          </Pressable>
        </View>
      )}

      <VitrinaBrillo
        productos={productos}
        lectura={lectura}
        modo={modo}
        cuponDesbloqueado={cuponDesbloqueado}
        onInclinar={(x, y) => setSimulados({ x, y, z: Math.sqrt(Math.max(0, 1 - x * x - y * y)) })}
        onDesbloquearCupon={onDesbloquearCupon}
        onAbrirDetalle={onAbrirDetalle}
      />

      <View style={styles.tarjetaSensor}>
        <Text style={styles.nombreSensor}>Lecturas en g</Text>
        <Text style={styles.lecturaSensor}>X: {lectura.x.toFixed(2)}</Text>
        <Text style={styles.lecturaSensor}>Y: {lectura.y.toFixed(2)}</Text>
        <Text style={styles.lecturaSensor}>Z: {lectura.z.toFixed(2)}</Text>
        <Text style={styles.lecturaSensor}>Magnitud: {magnitud.toFixed(2)} g</Text>
        <Text style={styles.posicionSensor}>Estado: {posicion}</Text>
      </View>

      <View style={styles.tarjetaAlarma}>
        <Text style={styles.nombreSensor}>Alarma de manipulación</Text>
        <Text style={styles.lecturaSensor}>Umbral: {UMBRAL.toFixed(1)} g</Text>
        <Text style={styles.lecturaSensor}>Alertas: {contadorAlertas}</Text>
        <View style={styles.controlesSensor}>
          <Pressable style={styles.botonSensor} onPress={simularSacudida}>
            <Text style={styles.textoBotonSensor}>Simular sacudida</Text>
          </Pressable>
          <Pressable style={styles.botonSensor} onPress={() => { setContadorAlertas(0); setUltimaAlerta(null); setAlarmaActiva(false); }}>
            <Text style={styles.textoBotonSensor}>Reiniciar</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

/* ===================== ESTILOS FLOTANTES PREMIUM ===================== */
/* PALETA "ESMERALDA REAL"
   Fondo #050E0B · Superficie #0D1D17 · Línea #22372E
   Oro champagne #D7B56D · Oro claro #F2E2B6 · Marfil #F7F1E3
   Burdeos #7A1F33 (alertas) · Jade #2E7D5F (éxito) */
/** Estilos compartidos por pantallas y componentes; los nombres se organizan por funcionalidad visual. */
const styles = StyleSheet.create({
  /* BASE */
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 40,
    backgroundColor: '#050E0B',
  },
  titulo: { fontSize: 30, fontWeight: '900', color: '#D7B56D', textAlign: 'center', letterSpacing: 6, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  subtitulo: { fontSize: 11, color: '#93A096', textAlign: 'center', letterSpacing: 3, textTransform: 'uppercase' },

  /* BIENVENIDA */
  bienvenidaFondo: { flex: 1, backgroundColor: '#07130F', justifyContent: 'center', alignItems: 'center', padding: 30 },
  bienvenidaAura: { position: 'absolute', width: 400, height: 400, borderRadius: 200, backgroundColor: '#D7B56D' },
  bienvenidaAnillo: { position: 'absolute', width: 320, height: 320, borderRadius: 160, borderWidth: 1, borderColor: '#D7B56D', opacity: 0.25, justifyContent: 'flex-start', alignItems: 'center' },
  bienvenidaAnillo2: { position: 'absolute', width: 250, height: 250, borderRadius: 125, borderWidth: 1, borderColor: '#D7B56D', opacity: 0.18, justifyContent: 'flex-start', alignItems: 'center' },
  bienvenidaAnilloPunto: { position: 'absolute', top: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#D7B56D' },
  bienvenidaSello: { color: '#D7B56D', fontSize: 14, letterSpacing: 8, marginBottom: 20, opacity: 0.8 },
  bienvenidaTitulo: { fontSize: 48, color: '#F7F1E3', fontWeight: '300', letterSpacing: 12, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  bienvenidaTituloGrande: { fontSize: 22, color: '#D7B56D', fontWeight: '900', letterSpacing: 10, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  bienvenidaLinea: { height: 1, backgroundColor: '#D7B56D', marginVertical: 24 },
  bienvenidaSubtitulo: { fontSize: 12, color: '#D7B56D', letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center', marginBottom: 16 },
  bienvenidaFrase: { fontSize: 14, color: '#C8CCBC', textAlign: 'center', lineHeight: 22, fontStyle: 'italic', letterSpacing: 1 },
  bienvenidaBoton: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 40, backgroundColor: '#D7B56D', borderRadius: 2, borderWidth: 1, borderColor: '#F2E2B6', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 8 },
  bienvenidaBotonTexto: { color: '#07130F', fontWeight: '900', fontSize: 13, letterSpacing: 3 },
  bienvenidaBotonFlecha: { color: '#07130F', fontWeight: '900', fontSize: 16 },
  bienvenidaFooter: { position: 'absolute', bottom: 30, color: '#3C5A4D', fontSize: 9, letterSpacing: 3 },

  /* CABECERA QUE SE DESPLAZA CON LA LISTA */
  cabeceraFija: { backgroundColor: '#050E0B', paddingTop: 6, paddingBottom: 10, zIndex: 5 },
  vacioCompacto: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 4, borderWidth: 1, borderColor: '#22372E', backgroundColor: '#0A1813', alignItems: 'center' },

  /* CHECKOUT */
  errorFormulario: { color: '#EE9AA8', backgroundColor: '#2A0F18', borderWidth: 1, borderColor: '#7A1F33', borderRadius: 4, padding: 12, marginBottom: 12, fontSize: 13, lineHeight: 19 },
  opcionEnvio: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10, borderRadius: 4, borderWidth: 1, borderColor: '#22372E', backgroundColor: '#0D1D17' },
  opcionEnvioActiva: { borderColor: '#D7B56D', backgroundColor: '#10231C' },
  opcionEnvioTitulo: { color: '#F7F1E3', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  opcionEnvioSub: { color: '#93A096', fontSize: 11, marginTop: 2 },
  opcionEnvioPrecio: { color: '#C8CCBC', fontWeight: '800', fontSize: 13 },
  filaDos: { flexDirection: 'row', gap: 12 },
  filaEtiquetaMarca: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  marcaTarjeta: { color: '#D7B56D', fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  filaCupon: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  botonCupon: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 2, borderWidth: 1, borderColor: '#D7B56D' },
  textoBotonCupon: { color: '#D7B56D', fontWeight: '900', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  mensajeCupon: { marginTop: 8, fontSize: 12, lineHeight: 18 },
  mensajeCuponOk: { color: '#8FE0BC' },
  mensajeCuponError: { color: '#EE9AA8' },
  resumenFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  resumenFilaTotal: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#22372E' },
  estadoCorreo: { width: '100%', marginTop: 16, padding: 14, borderRadius: 4, borderWidth: 1, borderColor: '#22372E', backgroundColor: '#0A1813' },
  estadoCorreoOk: { borderColor: '#2E7D5F', backgroundColor: '#0F2E23' },
  estadoCorreoAviso: { borderColor: '#A8863F', backgroundColor: '#2A2512' },
  estadoCorreoTexto: { color: '#F7F1E3', fontSize: 13, lineHeight: 20 },
  botonCorreo: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 2, borderWidth: 1, borderColor: '#D7B56D' },
  textoBotonCorreo: { color: '#D7B56D', fontWeight: '900', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  enlaceAtras: { alignSelf: 'center', paddingVertical: 14 },
  textoEnlaceAtras: { color: '#93A096', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },

  /* VITRINA DE BRILLO (SENSORES) */
  vitrina: { width: '100%', backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E', borderTopWidth: 2, borderTopColor: '#D7B56D', borderRadius: 4, padding: 16, marginBottom: 14 },
  vitrinaEtiqueta: { color: '#D7B56D', fontSize: 11, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
  vitrinaSub: { color: '#93A096', fontSize: 11, textAlign: 'center', marginTop: 6, marginBottom: 12, lineHeight: 17 },
  vitrinaSelector: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  vitrinaFlecha: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D7B56D', borderRadius: 2 },
  vitrinaFlechaTexto: { color: '#D7B56D', fontSize: 20, fontWeight: '900', marginTop: -2 },
  vitrinaNombre: { color: '#F7F1E3', fontSize: 15, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  vitrinaCategoria: { color: '#93A096', fontSize: 10, letterSpacing: 1.5, marginTop: 2, textTransform: 'uppercase' },
  vitrinaEscenario: { height: 210, borderRadius: 4, backgroundColor: '#07130F', borderWidth: 1, borderColor: '#22372E', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vitrinaImagen: { width: 150, height: 150 },
  vitrinaLuz: { position: 'absolute', top: -80, left: '50%', marginLeft: -27, width: 54, height: 380, backgroundColor: 'rgba(255,248,225,0.15)' },
  vitrinaLuzFina: { position: 'absolute', top: -80, left: '50%', marginLeft: -4, width: 8, height: 380, backgroundColor: 'rgba(255,248,225,0.28)' },
  vitrinaChispa: { position: 'absolute', color: '#F2E2B6' },
  gemaExterior: { width: 104, height: 104, borderRadius: 10, backgroundColor: '#D7B56D', borderWidth: 2, borderColor: '#F2E2B6', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 18, elevation: 8 },
  gemaMedio: { width: 70, height: 70, borderRadius: 6, backgroundColor: '#A8863F', alignItems: 'center', justifyContent: 'center' },
  gemaNucleo: { width: 32, height: 32, borderRadius: 4, backgroundColor: '#F2E2B6' },
  vitrinaMedidor: { marginTop: 14 },
  vitrinaMedidorFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  vitrinaMedidorTexto: { color: '#C8CCBC', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  vitrinaKilates: { color: '#D7B56D', fontSize: 20, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  vitrinaRiel: { height: 8, borderRadius: 4, backgroundColor: '#132A22', overflow: 'hidden' },
  vitrinaRelleno: { height: '100%', backgroundColor: '#D7B56D' },
  vitrinaPista: { color: '#93A096', fontSize: 11, marginTop: 8, lineHeight: 17, textAlign: 'center' },
  vitrinaCupon: { marginTop: 14, padding: 14, alignItems: 'center', borderRadius: 4, borderWidth: 1, borderColor: '#D7B56D', backgroundColor: '#10231C' },
  vitrinaCuponTitulo: { color: '#D7B56D', fontSize: 10, fontWeight: '900', letterSpacing: 3 },
  vitrinaCuponCodigo: { color: '#F2E2B6', fontSize: 26, fontWeight: '900', letterSpacing: 5, marginTop: 6, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },

  /* BARRA DE NAVEGACIÓN INFERIOR */
  barraNav: { flexDirection: 'row', marginHorizontal: -18, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 22 : 10, backgroundColor: '#0A1813', borderTopWidth: 1, borderTopColor: 'rgba(215,181,109,0.45)', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 12 },
  itemNav: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  iconoNav: { fontSize: 18, color: '#6F7F74' },
  iconoNavActivo: { color: '#D7B56D' },
  textoNav: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#6F7F74', marginTop: 3, fontWeight: '800' },
  textoNavActivo: { color: '#D7B56D' },
  indicadorNav: { width: 18, height: 2, borderRadius: 1, backgroundColor: 'transparent', marginTop: 5 },
  indicadorNavActivo: { backgroundColor: '#D7B56D' },
  insignia: { position: 'absolute', top: -6, right: -14, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: '#D7B56D', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#0A1813' },
  insigniaTexto: { color: '#07130F', fontSize: 9, fontWeight: '900' },

  /* BÚSQUEDA Y CATEGORÍAS RÁPIDAS */
  busquedaCaja: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E', borderRadius: 2, paddingHorizontal: 14, marginBottom: 12 },
  busquedaIcono: { color: '#D7B56D', fontSize: 10 },
  busquedaInput: { flex: 1, color: '#F7F1E3', paddingVertical: 13, fontSize: 14, letterSpacing: 0.5 },
  busquedaLimpiar: { color: '#93A096', fontSize: 14, fontWeight: '800' },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 2, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E' },
  catPillActiva: { backgroundColor: '#D7B56D', borderColor: '#F2E2B6' },
  catPillTexto: { color: '#C8CCBC', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  catPillConteo: { color: '#6F7F74', fontSize: 10, fontWeight: '800' },
  catPillTextoActivo: { color: '#07130F' },

  /* AVISO Y CARGA */
  toast: { position: 'absolute', top: 48, left: 24, right: 24, zIndex: 50, elevation: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#D7B56D', borderRadius: 4, shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  toastIcono: { color: '#07130F', backgroundColor: '#D7B56D', width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontWeight: '900', overflow: 'hidden' },
  toastTexto: { flex: 1, color: '#F7F1E3', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  cargandoCentro: { alignItems: 'center', justifyContent: 'center', gap: 14 },

  /* PESTAÑAS FLOTANTES */
  pestanas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  pestana: {
    flexGrow: 1,
    flexBasis: '22%',
    paddingVertical: 14,
    backgroundColor: '#10231C',
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22372E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  pestanaActiva: {
    backgroundColor: '#D7B56D',
    borderColor: '#F2E2B6',
    shadowColor: '#D7B56D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  textoPestana: { color: '#93A096', fontWeight: '800', fontSize: 10, textAlign: 'center', letterSpacing: 1.5, textTransform: 'uppercase' },
  textoActivo: { color: '#07130F' },

  /* FILTROS FLOTANTES */
  panelFiltros: {
    backgroundColor: '#0A1813',
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#22372E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.52,
    shadowRadius: 12,
    elevation: 8,
  },
  filtrosHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filtrosTitulo: { color: '#D7B56D', fontWeight: '900', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  filtrosResumen: { color: '#93A096', fontSize: 10, letterSpacing: 1 },

  /* CHIPS */
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 2, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E' },
  chipActivo: { backgroundColor: '#D7B56D', borderColor: '#D7B56D' },
  textoChip: { color: '#93A096', fontWeight: '700', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  textoChipActivo: { color: '#07130F' },

  /* ACCIONES CATÁLOGO FLOTANTES */
  panelAccionesCatalogo: {
    backgroundColor: '#0A1813',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#22372E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  panelAccionesTitulo: { color: '#D7B56D', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase', textAlign: 'center' },
  panelSincronizacion: { flexDirection: 'row', gap: 10 },
  botonSincronizacion: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    backgroundColor: '#132A22',
    borderWidth: 1,
    borderColor: '#2F4A3F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.38,
    shadowRadius: 6,
    elevation: 4,
  },
  textoBotonSincronizacion: { color: '#D7B56D', fontWeight: '800', textAlign: 'center', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },

  /* MODALES */
  fondoModal: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.92)' },
  modalCaja: { maxHeight: '85%', padding: 22, borderRadius: 4, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#D7B56D', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 10 },
  modalTitulo: { color: '#D7B56D', fontSize: 18, fontWeight: '900', marginBottom: 12, letterSpacing: 3, textTransform: 'uppercase', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  itemSeleccion: { padding: 12, marginBottom: 6, borderRadius: 4, borderWidth: 1, borderColor: '#22372E', backgroundColor: '#07130F' },
  itemSeleccionActivo: { borderColor: '#D7B56D', backgroundColor: '#132A22' },
  textoSeleccion: { color: '#F7F1E3', fontWeight: '600', fontSize: 13 },

  /* BOTÓN IA FLOTANTE */
  botonIA: {
    paddingVertical: 13,
    marginBottom: 12,
    borderRadius: 4,
    backgroundColor: '#10231C',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D7B56D',
    shadowColor: '#D7B56D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.11,
    shadowRadius: 12,
    elevation: 6,
  },
  botonIAActivo: { backgroundColor: '#D7B56D', shadowOpacity: 0.3 },
  textoBotonIA: { color: '#D7B56D', fontWeight: '900', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },

  /* LISTAS */
  lista: { flex: 1 },
  listaContenido: { paddingBottom: 30 },
  fila: { gap: 12 },
  filaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  celda: { flex: 1, minWidth: 0 },

  /* TARJETA */
  tarjeta: { marginBottom: 14, padding: 18, backgroundColor: '#F7F1E3', borderRadius: 4, borderWidth: 1, borderColor: '#E4D8BD', borderTopWidth: 2, borderTopColor: '#D7B56D', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 },
  imagenProducto: { width: '100%', height: 200, borderRadius: 2, marginBottom: 12, backgroundColor: '#EFE6D2' },
  imagenTarjetaFlotante: { width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.19, shadowRadius: 14, elevation: 8 },
  badgeCategoria: { position: 'absolute', top: 10, right: 10, backgroundColor: '#07130F', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 2, borderWidth: 1, borderColor: '#D7B56D' },
  badgeCategoriaTexto: { color: '#D7B56D', fontSize: 9, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  badgeCategoriaTextoGrande: { color: '#D7B56D', fontSize: 13, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase' },
  nombre: { flex: 1, fontSize: 16, fontWeight: '900', color: '#07130F', marginBottom: 6, letterSpacing: 0.5, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  encabezadoTarjeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  botonFavorito: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F1E3', borderWidth: 1.5, borderColor: '#D7B56D' },
  botonFavoritoActivo: { backgroundColor: '#D7B56D', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 6, elevation: 4 },
  botonFavoritoGuardando: { opacity: 0.6 },
  textoFavorito: { color: '#D7B56D', fontSize: 24 },
  textoFavoritoActivo: { color: '#07130F' },
  descripcion: { fontSize: 12, color: '#4F5A52', marginBottom: 10, lineHeight: 18 },
  materialTexto: { fontSize: 10, color: '#7A6A3E', fontStyle: 'italic', marginBottom: 8, letterSpacing: 0.5 },
  precio: { fontSize: 20, fontWeight: '900', color: '#07130F', alignSelf: 'flex-end', letterSpacing: 0.5, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  botonCarrito: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 4, backgroundColor: '#07130F', alignItems: 'center', borderWidth: 1, borderColor: '#07130F' },
  botonCarritoActivo: { backgroundColor: '#2E7D5F', borderColor: '#2E7D5F' },
  textoBotonCarrito: { color: '#F7F1E3', fontWeight: '800', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  filaAccionesExtra: { flexDirection: 'row', gap: 8, marginTop: 10 },
  botonAccion: { flex: 1, paddingVertical: 10, borderRadius: 4, backgroundColor: '#132A22', alignItems: 'center', borderWidth: 1, borderColor: '#D7B56D' },
  botonAccionEliminar: { backgroundColor: '#7A1F33', borderColor: '#7A1F33' },
  textoBotonAccion: { color: '#D7B56D', fontWeight: '800', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },

  /* SECCIONES CATÁLOGO */
  seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4 },
  seccionLinea: { flex: 1, height: 1, backgroundColor: '#D7B56D', opacity: 0.4 },
  seccionTitulo: { color: '#D7B56D', fontSize: 13, fontWeight: '900', letterSpacing: 4, textTransform: 'uppercase', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  seccionContador: { color: '#6F7F74', fontSize: 10, textAlign: 'center', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' },

  /* FEEDBACK */
  bannerFeedback: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 4, alignItems: 'center', borderWidth: 1 },
  bannerFeedbackTexto: { fontWeight: '900', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  feedbackAmarillo: { backgroundColor: '#2A2512', borderColor: '#D7B56D' },
  feedbackVerde: { backgroundColor: '#0F2E23', borderColor: '#2E7D5F' },
  feedbackRojo: { backgroundColor: '#2A0F18', borderColor: '#7A1F33' },

  /* DETALLE */
  detalleTitulo: { fontSize: 26, fontWeight: '900', color: '#D7B56D', marginVertical: 10, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  imagenFlotanteContenedor: { alignItems: 'center', justifyContent: 'center', marginVertical: 20, shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.26, shadowRadius: 20, elevation: 12 },
  imagenFlotante: { width: '90%', height: 320, borderRadius: 4, backgroundColor: '#0D1D17', borderWidth: 2, borderColor: '#D7B56D' },
  detalleImagen: { width: '100%', height: 320, borderRadius: 4, marginVertical: 12, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E' },
  detalleDescripcion: { color: '#C8CCBC', fontSize: 14, lineHeight: 22, marginTop: 12, letterSpacing: 0.3 },
  detallePrecio: { color: '#D7B56D', fontSize: 32, fontWeight: '900', marginVertical: 14, letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },

  /* MANIQUÍ */
  maniquiContenedor: { alignItems: 'center', justifyContent: 'center', marginVertical: 20, paddingVertical: 30, paddingHorizontal: 16, backgroundColor: '#0D1D17', borderRadius: 4, borderWidth: 1, borderColor: '#22372E', minHeight: 260 },
  maniquiEtiqueta: { color: '#D7B56D', fontSize: 11, marginTop: 20, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  maniquiCuello: { alignItems: 'center', justifyContent: 'flex-start', width: 200, height: 200 },
  maniquiCabeza: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#3A3935', borderWidth: 1, borderColor: '#4D4B45' },
  maniquiCuelloBase: { width: 36, height: 50, backgroundColor: '#3A3935', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#4D4B45' },
  maniquiCadenaArco: { position: 'absolute', top: 100, width: 140, height: 80, borderBottomWidth: 3, borderLeftWidth: 3, borderRightWidth: 3, borderColor: '#D7B56D', borderBottomLeftRadius: 70, borderBottomRightRadius: 70, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 8, shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10 },
  maniquiCadenaTexto: { color: '#D7B56D', fontSize: 14, fontWeight: '900', letterSpacing: 1, backgroundColor: '#0D1D17', paddingHorizontal: 8, borderRadius: 4 },
  maniquiAnilloDedo: { alignItems: 'center', justifyContent: 'center', width: 200, height: 200 },
  maniquiDedoBase: { width: 50, height: 160, backgroundColor: '#3A3935', borderRadius: 25, borderWidth: 1, borderColor: '#4D4B45' },
  maniquiAnilloAro: { position: 'absolute', top: 60, width: 80, height: 80, borderRadius: 40, borderWidth: 6, borderColor: '#D7B56D', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 12 },
  maniquiAnilloTexto: { color: '#D7B56D', fontSize: 14, fontWeight: '900', backgroundColor: '#0D1D17', paddingHorizontal: 6, borderRadius: 4 },
  maniquiMuneca: { alignItems: 'center', justifyContent: 'center', width: 200, height: 200 },
  maniquiMunecaBase: { width: 44, height: 160, backgroundColor: '#3A3935', borderRadius: 22, borderWidth: 1, borderColor: '#4D4B45' },
  maniquiPulseraAro: { position: 'absolute', top: 70, width: 90, height: 40, borderRadius: 20, borderWidth: 5, borderColor: '#D7B56D', justifyContent: 'center', alignItems: 'center', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10 },
  maniquiMunecaTexto: { color: '#D7B56D', fontSize: 12, fontWeight: '900', backgroundColor: '#0D1D17', paddingHorizontal: 6, borderRadius: 4 },

  /* PIRÁMIDE */
  piramideContenedor: { alignItems: 'center', marginVertical: 14, gap: 8 },
  piramideFila: { width: '100%', padding: 14, borderRadius: 2, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  piramideTitulo: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 }, fontWeight: '900', fontSize: 10, letterSpacing: 3, marginBottom: 6, textTransform: 'uppercase' },
  piramideNotas: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 }, fontSize: 12, textAlign: 'center', letterSpacing: 0.5 },

  /* VISTA 3D */
  vista3DContenedor: { alignItems: 'center', marginVertical: 18, padding: 20, backgroundColor: '#0D1D17', borderRadius: 4, borderWidth: 1, borderColor: '#22372E' },
  vista3DImagen: { width: 240, height: 240, borderRadius: 4, overflow: 'hidden', backgroundColor: '#07130F', borderWidth: 1, borderColor: '#D7B56D' },
  vista3DNota: { color: '#6F7F74', fontSize: 10, marginTop: 12, fontStyle: 'italic', letterSpacing: 1 },

  /* EDITOR */
  etiquetaCampo: { color: '#D7B56D', fontSize: 10, fontWeight: '900', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 2 },
  input: { backgroundColor: '#0D1D17', borderRadius: 2, borderWidth: 1, borderColor: '#22372E', color: '#F7F1E3', padding: 14, fontSize: 14, textAlignVertical: 'top', letterSpacing: 0.5 },
  botonGuardarEdicion: { marginTop: 18, paddingVertical: 16, borderRadius: 2, backgroundColor: '#D7B56D', alignItems: 'center', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  botonVolverMejorado: { padding: 14, marginVertical: 10, backgroundColor: '#0D1D17', borderRadius: 2, borderWidth: 1, borderColor: '#D7B56D' },
  textoBotonVolverMejorado: { color: '#D7B56D', fontWeight: '800', textAlign: 'center', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },

  /* CARRITO */
  panelCarrito: { marginTop: 14, padding: 20, backgroundColor: '#0D1D17', borderRadius: 4, borderWidth: 1, borderColor: '#D7B56D', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 15, elevation: 8 },
  tituloCarrito: { fontSize: 22, fontWeight: '900', color: '#D7B56D', marginBottom: 16, letterSpacing: 3, textTransform: 'uppercase', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  textoVacioCarrito: { color: '#93A096', fontSize: 13, lineHeight: 20, letterSpacing: 0.5 },
  itemCarrito: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#22372E' },
  infoItemCarrito: { flex: 1 },
  nombreItemCarrito: { color: '#F7F1E3', fontSize: 14, fontWeight: '800', letterSpacing: 0.5, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  origenItemCarrito: { color: '#93A096', fontSize: 10, marginTop: 4, letterSpacing: 1, textTransform: 'uppercase' },
  precioItemCarrito: { color: '#D7B56D', fontSize: 16, fontWeight: '900', marginTop: 6, letterSpacing: 0.5 },
  botonEliminarItem: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#7A1F33', alignItems: 'center', justifyContent: 'center', marginLeft: 12, borderWidth: 1, borderColor: '#A33A50' },
  textoEliminarItem: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  totalCarrito: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTopWidth: 2, borderTopColor: '#D7B56D' },
  textoTotalCarrito: { color: '#D7B56D', fontSize: 16, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase' },
  valorTotalCarrito: { color: '#D7B56D', fontSize: 24, fontWeight: '900', letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  botonComprar: { marginTop: 18, paddingVertical: 16, borderRadius: 2, backgroundColor: '#D7B56D', alignItems: 'center', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 8 },
  textoBotonComprar: { color: '#07130F', fontSize: 13, fontWeight: '900', letterSpacing: 2.5, textTransform: 'uppercase' },

  /* CHECKOUT */
  progresoFila: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 22 },
  progresoCirculo: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0D1D17', borderWidth: 2, borderColor: '#22372E', alignItems: 'center', justifyContent: 'center' },
  progresoCirculoActivo: { backgroundColor: '#D7B56D', borderColor: '#D7B56D', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.38, shadowRadius: 8, elevation: 4 },
  progresoTexto: { color: '#6F7F74', fontWeight: '900', fontSize: 14 },
  progresoTextoActivo: { color: '#07130F' },
  progresoEtiqueta: { color: '#6F7F74', fontSize: 9, marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 },
  resumenPedido: { marginTop: 20, padding: 16, backgroundColor: '#0D1D17', borderRadius: 2, borderWidth: 1, borderColor: '#22372E' },
  resumenPedidoTitulo: { color: '#D7B56D', fontWeight: '900', marginBottom: 10, letterSpacing: 2, textTransform: 'uppercase', fontSize: 11 },
  textoResumen: { color: '#C8CCBC', fontSize: 12, marginVertical: 3, letterSpacing: 0.3 },
  confirmacionCaja: { marginTop: 24, padding: 24, backgroundColor: '#0F2E23', borderRadius: 4, borderWidth: 2, borderColor: '#2E7D5F', alignItems: 'center', shadowColor: '#2E7D5F', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  confirmacionTitulo: { color: '#8FE0BC', fontSize: 20, fontWeight: '900', marginBottom: 12, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  confirmacionTexto: { color: '#C4E6D6', fontSize: 13, textAlign: 'center', marginVertical: 6, lineHeight: 20 },
  confirmacionEmail: { color: '#D7B56D', fontWeight: '900', fontSize: 15, marginVertical: 10, letterSpacing: 0.5 },
  confirmacionCodigo: { color: '#D7B56D', fontWeight: '900', fontSize: 14, marginVertical: 8, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  confirmacionNota: { color: '#7FA394', fontSize: 10, fontStyle: 'italic', marginTop: 14, textAlign: 'center', lineHeight: 16 },

  /* RECIBO */
  reciboTitulo: { fontSize: 26, fontWeight: '900', color: '#D7B56D', textAlign: 'center', marginVertical: 20, letterSpacing: 4, textTransform: 'uppercase', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  reciboCaja: { backgroundColor: '#F7F1E3', borderRadius: 4, padding: 24, borderWidth: 2, borderColor: '#D7B56D', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 15, elevation: 8 },
  reciboHeader: { fontSize: 22, fontWeight: '900', color: '#07130F', textAlign: 'center', letterSpacing: 6, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  reciboSubtitulo: { fontSize: 10, color: '#8C7A4A', textAlign: 'center', fontStyle: 'italic', marginTop: 4, marginBottom: 16, letterSpacing: 2 },
  reciboLinea: { height: 1, backgroundColor: '#D7B56D', marginVertical: 14 },
  reciboLabel: { fontSize: 9, color: '#8C7A4A', fontWeight: '800', textTransform: 'uppercase', marginTop: 10, letterSpacing: 2 },
  reciboValor: { fontSize: 14, color: '#07130F', fontWeight: '600', letterSpacing: 0.3 },
  reciboSeccion: { fontSize: 11, color: '#07130F', fontWeight: '900', letterSpacing: 3, marginTop: 10, marginBottom: 6, textTransform: 'uppercase', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  reciboItem: { marginVertical: 8, paddingLeft: 6 },
  reciboItemNombre: { fontSize: 13, color: '#07130F', fontWeight: '800', letterSpacing: 0.3 },
  reciboItemDetalle: { fontSize: 11, color: '#4F5A52', letterSpacing: 0.3 },
  reciboItemPrecio: { fontSize: 13, color: '#2E7D5F', fontWeight: '800', marginTop: 2 },
  reciboTotalLabel: { fontSize: 14, color: '#07130F', fontWeight: '900', letterSpacing: 3 },
  reciboTotalValor: { fontSize: 22, color: '#D7B56D', fontWeight: '900', letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  reciboGracias: { fontSize: 13, color: '#07130F', fontWeight: '700', textAlign: 'center', marginTop: 10, fontStyle: 'italic', letterSpacing: 0.5 },
  reciboFooter: { fontSize: 9, color: '#8C7A4A', textAlign: 'center', marginTop: 6, letterSpacing: 2 },

  /* VACÍOS */
  panelVacio: { padding: 24, borderRadius: 4, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E', marginBottom: 14, alignItems: 'center' },
  textoVacio: { color: '#93A096', fontSize: 12, textAlign: 'center', lineHeight: 20, letterSpacing: 0.5 },

  /* SENSORES */
  panelSensor: { padding: 18, paddingBottom: 40 },
  tituloSensor: { fontSize: 22, fontWeight: '900', color: '#D7B56D', marginBottom: 12, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  controlesSensor: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 10, gap: 8 },
  botonSensor: { padding: 12, borderRadius: 4, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E' },
  botonSensorActivo: { backgroundColor: '#D7B56D', borderColor: '#D7B56D' },
  textoBotonSensor: { color: '#93A096', fontWeight: '700', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  textoBotonSensorActivo: { color: '#07130F' },
  estadoSensor: { marginTop: 12, color: '#D7B56D', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  tarjetaSensor: { backgroundColor: '#0D1D17', padding: 18, borderRadius: 4, borderWidth: 1, borderColor: '#22372E', marginVertical: 12 },
  nombreSensor: { fontSize: 14, fontWeight: '900', color: '#D7B56D', marginBottom: 12, letterSpacing: 2, textTransform: 'uppercase' },
  lecturaSensor: { fontSize: 14, color: '#C8CCBC', fontWeight: '600', marginVertical: 3, letterSpacing: 0.5 },
  posicionSensor: { marginTop: 12, color: '#D7B56D', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  tarjetaAlarma: { backgroundColor: '#0D1D17', padding: 18, borderRadius: 4, borderWidth: 1, borderColor: '#22372E', marginVertical: 12 },
  bannerAlarma: { backgroundColor: '#7A1F33', padding: 16, borderRadius: 4, marginVertical: 12, borderWidth: 2, borderColor: '#A33A50', shadowColor: '#7A1F33', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 6 },
  textoAlarma: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: 1.5, textTransform: 'uppercase' },
  textoAlarmaDetalle: { color: '#F6D5DB', fontSize: 12, textAlign: 'center', marginBottom: 12, letterSpacing: 0.5 },
  botonCerrarAlarma: { backgroundColor: '#F7F1E3', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 4, alignSelf: 'center' },
  textoCerrarAlarma: { color: '#7A1F33', fontWeight: '900', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  bannerWebInfo: { backgroundColor: '#0D1D17', padding: 14, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#D7B56D', marginBottom: 14 },
  textoBannerWeb: { color: '#D7B56D', fontSize: 11, lineHeight: 18, letterSpacing: 0.5 },
  textoInfo: { color: '#C8CCBC', fontSize: 13, marginVertical: 4, letterSpacing: 0.3 },
  textoInfoSecundario: { color: '#6F7F74', fontSize: 11, marginTop: 10, letterSpacing: 0.5, fontStyle: 'italic' },
});