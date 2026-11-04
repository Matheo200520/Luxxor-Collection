import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import ExploracionCamara from './ExploracionCamara';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsistenteIA from './AsistenteIA';

/* ===================== TIPOS ===================== */
type VariedadLuxor = {
  tipo: string;
  desc: string;
  min: number;
  max: number;
};

type Producto = {
  id: string;
  nombre: string;
  descripcion: string;
  precio: string;
};

type ProductoConImagen = Producto & { imagenUri: string; modoImagen?: 'completa' | 'ajustada' };

type ProductoFavorito = Pick<Producto, 'id' | 'nombre' | 'precio'>;

type Pestana = 'SinImagen' | 'ConImagen' | 'Sensores' | 'Carrito';

type ItemCarrito = {
  id: string;
  nombre: string;
  precio: string;
  origen: 'sin-imagen' | 'con-imagen';
};

type Lectura = { x: number; y: number; z: number };
type Modo = 'real' | 'simulacion';
type Alerta = { hora: string; magnitud: number };

// Claves de almacenamiento
const FAVORITO_STORAGE_KEY = '@luxor:producto-favorito';
const PRODUCTOS_IMAGEN_STORAGE_KEY = '@luxor:productos-con-imagen';

/* ===================== DATOS ===================== */
const variedadesLuxor: VariedadLuxor[] = [
  { tipo: 'Cadena Tejido Cubano 18k', desc: 'Eslabones gruesos de oro amarillo macizo de 18 quilates.', min: 1200000, max: 4500000 },
  { tipo: 'Anillo con Esmeralda Colombiana', desc: 'Anillo de oro blanco con esmeralda corte gota y diamantes.', min: 2500000, max: 6000000 },
  { tipo: 'Aretes Topo de Diamante', desc: 'Diamantes de 0.5 quilates montados en oro blanco.', min: 800000, max: 1500000 },
  { tipo: 'Pulsera Tejido Cartier', desc: 'Diseño clásico en oro amarillo de 18k, cierre de seguridad.', min: 950000, max: 2200000 },
  { tipo: 'Argollas de Matrimonio', desc: 'Par de argollas clásicas en oro rosado de 18k.', min: 1100000, max: 2000000 },
  { tipo: 'Collar de Oro Blanco con Zafiro', desc: 'Gargantilla elegante con dije de zafiro azul y brillantes.', min: 1800000, max: 3500000 },
  { tipo: 'Anillo Sello de Oro Macizo', desc: 'Anillo robusto para hombre en oro de 24k.', min: 1500000, max: 3800000 },
  { tipo: 'Dije de Cruz con Rubíes', desc: 'Cruz de oro amarillo incrustada con pequeños rubíes naturales.', min: 650000, max: 1300000 },
  { tipo: 'Reloj de Lujo Bañado en Oro', desc: 'Mecanismo automático suizo con revestimiento de oro.', min: 2000000, max: 5500000 },
  { tipo: 'Gargantilla de Oro Italiano', desc: 'Fina cadena italiana con diseño trenzado de alta pureza.', min: 450000, max: 950000 },
  { tipo: 'Tobillera de Oro 18k', desc: 'Tobillera delicada con pequeños dijes de estrellas.', min: 250000, max: 500000 },
  { tipo: 'Cadena de Plata 925 y Oro', desc: 'Diseño mixto con eslabones entrelazados en dos tonos.', min: 180000, max: 450000 },
  { tipo: 'Anillo Solitario de Platino', desc: 'Anillo clásico con diamante central corte brillante.', min: 3000000, max: 8500000 },
  { tipo: 'Aretes Largos de Perlas', desc: 'Perlas cultivadas naturales con ganchos de oro de 18k.', min: 350000, max: 750000 },
  { tipo: 'Pulsera Balín de Oro', desc: 'Pulsera ajustable con balines de oro amarillo 18k.', min: 550000, max: 1200000 },
];

const productos: Producto[] = Array.from({ length: 300 }, (_, index) => {
  const item = variedadesLuxor[index % variedadesLuxor.length];
  const precioRandom = Math.floor(Math.random() * (item.max - item.min + 1) + item.min);
  const precioRedondeado = Math.round(precioRandom / 1000) * 1000;
  const precioCOP = '$ ' + precioRedondeado.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return {
    id: (index + 1).toString(),
    nombre: `${item.tipo} #${index + 1}`,
    descripcion: item.desc,
    precio: precioCOP,
  };
});

/* ===================== UTILIDADES ===================== */
function parsePrecio(precio: string): number {
  return Number(precio.replace(/[^0-9]/g, '')) || 0;
}
function formatearCOP(valor: number): string {
  return '$ ' + valor.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/* ===================== TARJETA ===================== */
type TarjetaProps = {
  producto: Producto;
  imagenUri?: string;
  modoImagen?: 'completa' | 'ajustada';
  esFavorito?: boolean;
  guardando?: boolean;
  enCarrito?: boolean;
  onSeleccionarFavorito?: (producto: Producto) => Promise<void>;
  onAgregarCarrito: (producto: Producto, origen: 'sin-imagen' | 'con-imagen') => void;
  onEditar?: (producto: ProductoConImagen) => void;
  onEliminar?: (id: string) => void;
};

function Tarjeta({
  producto,
  imagenUri,
  modoImagen = 'completa',
  esFavorito = false,
  guardando = false,
  enCarrito = false,
  onSeleccionarFavorito,
  onAgregarCarrito,
  onEditar,
  onEliminar,
}: TarjetaProps) {
  const [errorLocal, setErrorLocal] = useState(false);
  const [mostrarExitoLocal, setMostrarExitoLocal] = useState(false);

  useEffect(() => {
    if (!errorLocal && !mostrarExitoLocal) return;
    const timer = setTimeout(() => {
      setErrorLocal(false);
      setMostrarExitoLocal(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [errorLocal, mostrarExitoLocal]);

  async function manejarPulsacion() {
    if (guardando || !onSeleccionarFavorito) return;
    setErrorLocal(false);
    setMostrarExitoLocal(false);
    try {
      await onSeleccionarFavorito(producto);
      setMostrarExitoLocal(true);
    } catch {
      setErrorLocal(true);
    }
  }

  let textoBanner = null;
  if (guardando) textoBanner = 'Guardando...';
  else if (errorLocal) textoBanner = '❌ Error al guardar';
  else if (mostrarExitoLocal) textoBanner = '★ Guardado localmente';

  return (
    <View style={styles.tarjeta}>
      {imagenUri && (
        <Image
          source={{ uri: imagenUri }}
          style={[styles.imagenProducto, modoImagen === 'completa' && styles.imagenProductoCompleta]}
          resizeMode={modoImagen === 'completa' ? 'contain' : 'cover'}
        />
      )}
      <View style={styles.encabezadoTarjeta}>
        <Text style={styles.nombre}>{producto.nombre}</Text>
        {onSeleccionarFavorito && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={esFavorito ? `${producto.nombre} ya es favorito` : `Guardar ${producto.nombre}`}
            accessibilityState={{ selected: esFavorito, disabled: guardando }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={guardando}
            style={({ pressed }) => [
              styles.botonFavorito,
              esFavorito && styles.botonFavoritoActivo,
              guardando && styles.botonFavoritoGuardando,
              pressed && { opacity: 0.6 },
            ]}
            onPress={manejarPulsacion}
          >
            <Text style={[styles.textoFavorito, esFavorito && styles.textoFavoritoActivo]}>
              {guardando ? '…' : esFavorito ? '★' : '☆'}
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.descripcion}>{producto.descripcion}</Text>
      <Text style={styles.precio}>{producto.precio}</Text>

      <Pressable
        style={({ pressed }) => [
          styles.botonCarrito,
          enCarrito && styles.botonCarritoActivo,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => onAgregarCarrito(producto, imagenUri ? 'con-imagen' : 'sin-imagen')}
        accessibilityRole="button"
        accessibilityLabel={`Añadir ${producto.nombre} al carrito`}
      >
        <Text style={styles.textoBotonCarrito}>
          {enCarrito ? '✓ Añadido — Añadir otro' : '🛒 Añadir al carrito'}
        </Text>
      </Pressable>

      {(onEditar || onEliminar) && (
        <View style={styles.filaAccionesExtra}>
          {imagenUri && onEditar && (
            <Pressable style={styles.botonAccion} onPress={() => onEditar(producto as ProductoConImagen)}>
              <Text style={styles.textoBotonAccion}>✏️ Editar</Text>
            </Pressable>
          )}
          {!!onEliminar && (
            <Pressable style={[styles.botonAccion, styles.botonAccionEliminar]} onPress={() => onEliminar(producto.id)}>
              <Text style={styles.textoBotonAccion}>🗑️ Eliminar</Text>
            </Pressable>
          )}
        </View>
      )}

      {textoBanner && (
        <View
          style={[
            styles.contenedorFeedback,
            guardando && styles.contenedorFeedbackGuardando,
            errorLocal && styles.contenedorFeedbackError,
            (!guardando && !errorLocal) && styles.contenedorFeedbackExito,
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.textoFeedback}>{textoBanner}</Text>
        </View>
      )}
    </View>
  );
}

/* ===================== APP PRINCIPAL =====================
   Punto central de la aplicación: conserva los estados, carga los datos locales y coordina
   las pestañas, el carrito, los productos fotografiados y la sincronización por archivo.
===================== */
export default function App() {
  const [pestana, setPestana] = useState<Pestana>('SinImagen');
  const [favorito, setFavorito] = useState<ProductoFavorito | null>(null);
  const [cargandoFavorito, setCargandoFavorito] = useState(true);
  const [mensajeFavorito, setMensajeFavorito] = useState('');
  const [guardandoFavoritoId, setGuardandoFavoritoId] = useState<string | null>(null);
  const [mostrarIA, setMostrarIA] = useState(false);

  // Catálogo con fotografía, carrito de compra y opciones de transferencia entre móvil/web.
  const [productosConImagen, setProductosConImagen] = useState<ProductoConImagen[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  
  // Estados para edición
  const [productoEditando, setProductoEditando] = useState<ProductoConImagen | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [jsonImportar, setJsonImportar] = useState('');
  const [exportando, setExportando] = useState(false);
  const [mostrarExportar, setMostrarExportar] = useState(false);
  const [productosSeleccionados, setProductosSeleccionados] = useState<string[]>([]);
  const [modoExportacionImagen, setModoExportacionImagen] = useState<'completa' | 'ajustada'>('completa');

  // Persistencia: recupera el favorito y los productos con imagen desde AsyncStorage al iniciar.
  useEffect(() => {
    async function cargarDatos() {
      try {
        const valorGuardado = await AsyncStorage.getItem(FAVORITO_STORAGE_KEY);
        if (valorGuardado) {
          setFavorito(JSON.parse(valorGuardado) as ProductoFavorito);
          setMensajeFavorito('Favorito recuperado desde el almacenamiento local.');
        }

        const imagenesGuardadas = await AsyncStorage.getItem(PRODUCTOS_IMAGEN_STORAGE_KEY);
        if (imagenesGuardadas) {
          setProductosConImagen(JSON.parse(imagenesGuardadas));
        }
      } catch {
        setMensajeFavorito('No se pudieron recuperar los datos guardados.');
      } finally {
        setCargandoFavorito(false);
      }
    }
    void cargarDatos();
  }, []);

  async function guardarFavorito(producto: Producto) {
    if (guardandoFavoritoId) return;
    const nuevoFavorito: ProductoFavorito = {
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
    };
    setGuardandoFavoritoId(producto.id);
    try {
      await AsyncStorage.setItem(FAVORITO_STORAGE_KEY, JSON.stringify(nuevoFavorito));
      await new Promise((r) => setTimeout(r, 800));
      setFavorito(nuevoFavorito);
      setMensajeFavorito('Guardado exitosamente.');
    } catch {
      setMensajeFavorito('Error al guardar. Reintenta.');
      throw new Error('Fallo en AsyncStorage');
    } finally {
      setGuardandoFavoritoId(null);
    }
  }

  async function eliminarFavorito() {
    try {
      await AsyncStorage.removeItem(FAVORITO_STORAGE_KEY);
      setFavorito(null);
      setMensajeFavorito('Favorito eliminado del almacenamiento local.');
    } catch {
      setMensajeFavorito('No se pudo eliminar el favorito. Inténtalo de nuevo.');
    }
  }

  // Carrito: agrega una línea independiente para permitir cantidades repetidas del mismo producto.
  function agregarAlCarrito(producto: Producto, origen: 'sin-imagen' | 'con-imagen') {
    setCarrito((prev) => [
      ...prev,
      {
        id: `${producto.id}_${Date.now()}`,  
        nombre: producto.nombre,
        precio: producto.precio,
        origen,
      },
    ]);
  }

  function eliminarDelCarrito(idLinea: string) {
    setCarrito((prev) => prev.filter((i) => i.id !== idLinea));
  }

  // Compra: confirma el pedido y usa Alert en móvil o window.alert en la versión web.
  function comprar() {
    if (carrito.length === 0) {
      if (Platform.OS === 'web') window.alert('El carrito está vacío.');
      else Alert.alert('Carrito vacío', 'Agrega productos antes de comprar.');
      return;
    }
    if (Platform.OS === 'web') {
      window.alert('¡Gracias por su compra! Su pedido ya será enviado.');
      setCarrito([]);
      return;
    }
    Alert.alert(
      '¡Gracias por su compra!',
      'Su pedido ya será enviado. Recibirá confirmación pronto.',
      [{ text: 'Aceptar', onPress: () => setCarrito([]) }]
    );
  }

  // Registro desde cámara: incorpora el nuevo producto al inicio y lo conserva en AsyncStorage.
  async function registrarProductoConImagen(nuevo: ProductoConImagen) {
    const nuevaLista = [nuevo, ...productosConImagen];
    setProductosConImagen(nuevaLista);
    try {
      await AsyncStorage.setItem(PRODUCTOS_IMAGEN_STORAGE_KEY, JSON.stringify(nuevaLista));
    } catch {
      Alert.alert("Error", "No se pudo guardar el producto permanentemente.");
    }
    setPestana('ConImagen');
  }

  // Exportación: abre el selector modal donde se eligen los productos y el ajuste de sus imágenes.
  function abrirExportacion() {
    if (productosConImagen.length === 0) {
      Alert.alert('Sin productos', 'No hay productos con imagen para exportar.');
      return;
    }
    setProductosSeleccionados(productosConImagen.map((producto) => producto.id));
    setMostrarExportar(true);
  }

  async function exportarProductos() {
    const seleccionados = productosConImagen.filter((producto) => productosSeleccionados.includes(producto.id));
    if (seleccionados.length === 0) {
      Alert.alert('Selecciona productos', 'Marca al menos un producto para exportar.');
      return;
    }

    setExportando(true);
    try {
      const productosExportables = await Promise.all(seleccionados.map(async (producto) => {
        let imagenUri = producto.imagenUri;
        if (imagenUri && !imagenUri.startsWith('data:') && !imagenUri.startsWith('http')) {
          try {
            const base64 = await FileSystem.readAsStringAsync(imagenUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            imagenUri = `data:image/jpeg;base64,${base64}`;
          } catch {
            // Mantiene la URI si el archivo no puede convertirse; las fotos antiguas siguen
            // disponibles en el dispositivo desde donde fueron exportadas.
          }
        }
        return { ...producto, imagenUri, modoImagen: modoExportacionImagen };
      }));
      const contenido = JSON.stringify({ version: 1, productos: productosExportables }, null, 2);

      if (Platform.OS === 'web') {
        const blob = new Blob([contenido], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = 'luxor-products.json';
        enlace.click();
        URL.revokeObjectURL(url);
      } else {
        const ruta = `${FileSystem.cacheDirectory}luxor-products.json`;
        await FileSystem.writeAsStringAsync(ruta, contenido, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(ruta, { dialogTitle: 'Exportar productos de Luxor' });
      }
      setMostrarExportar(false);
    } catch {
      Alert.alert('Error', 'No se pudo exportar el catálogo.');
    } finally {
      setExportando(false);
    }
  }

  async function importarLista(contenido: string) {
    try {
      const archivo = JSON.parse(contenido);
      const productosImportados = Array.isArray(archivo)
        ? archivo
        : archivo?.productos;
      if (!Array.isArray(productosImportados) || productosImportados.length === 0) {
        throw new Error('Formato inválido');
      }

      const validos = productosImportados.filter((producto) =>
        producto && typeof producto.id === 'string'
        && typeof producto.nombre === 'string'
        && typeof producto.descripcion === 'string'
        && typeof producto.precio === 'string'
        && typeof producto.imagenUri === 'string'
      ) as ProductoConImagen[];
      if (validos.length === 0) throw new Error('Sin productos válidos');

      const idsExistentes = new Set(productosConImagen.map((producto) => producto.id));
      const nuevos = validos.filter((producto) => !idsExistentes.has(producto.id));
      const listaFinal = [...nuevos, ...productosConImagen];
      setProductosConImagen(listaFinal);
      await AsyncStorage.setItem(PRODUCTOS_IMAGEN_STORAGE_KEY, JSON.stringify(listaFinal));
      setJsonImportar('');
      setMostrarImportar(false);
      Alert.alert('Importación completada', `Se importaron ${nuevos.length} producto(s).`);
      setPestana('ConImagen');
    } catch {
      Alert.alert('Archivo inválido', 'Selecciona un archivo JSON válido exportado desde Luxor Collection.');
    }
  }

  // Importación: abre el selector JSON tanto en Android/iOS como en la versión web.
  async function importarProductos() {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/*json'],
        copyToCacheDirectory: true,
      });
      if (resultado.canceled || !resultado.assets?.[0]) return;
      let contenido: string;
      if (Platform.OS === 'web') {
        const respuesta = await fetch(resultado.assets[0].uri);
        contenido = await respuesta.text();
      } else {
        contenido = await FileSystem.readAsStringAsync(resultado.assets[0].uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }
      await importarLista(contenido);
    } catch {
      Alert.alert('Error', 'No se pudo leer el archivo seleccionado.');
    }
  }

  // --- EDICIÓN Y ELIMINACIÓN DE PRODUCTOS CON IMAGEN ---
  // La eliminación usa window.confirm en web y Alert.alert en dispositivos móviles.
  function iniciarEdicion(producto: ProductoConImagen) {
    setProductoEditando(producto);
    setEditNombre(producto.nombre);
    setEditDescripcion(producto.descripcion);
    setEditPrecio(producto.precio);
  }

  async function guardarEdicion() {
    if (!productoEditando) return;
    if (!editNombre.trim() || !editDescripcion.trim() || !editPrecio.trim()) {
      Alert.alert("Campos incompletos", "Completa todos los campos.");
      return;
    }
    const numero = Number(editPrecio.replace(/[^0-9]/g, ''));
    const precioFormateado = numero ? formatearCOP(numero) : editPrecio;

    const actualizado: ProductoConImagen = {
      ...productoEditando,
      nombre: editNombre.trim(),
      descripcion: editDescripcion.trim(),
      precio: precioFormateado,
    };

    const nuevaLista = productosConImagen.map(p => p.id === actualizado.id ? actualizado : p);
    setProductosConImagen(nuevaLista);
    
    try {
      await AsyncStorage.setItem(PRODUCTOS_IMAGEN_STORAGE_KEY, JSON.stringify(nuevaLista));
      Alert.alert("Éxito", "Producto actualizado correctamente.");
    } catch {
      Alert.alert("Error", "No se pudo guardar la edición.");
    }
    setProductoEditando(null);
  }

  async function eliminarProductoConImagen(id: string) {
    const nuevaLista = productosConImagen.filter((producto) => producto.id !== id);
    setProductosConImagen(nuevaLista);
    try {
      await AsyncStorage.setItem(PRODUCTOS_IMAGEN_STORAGE_KEY, JSON.stringify(nuevaLista));
    } catch {
      Alert.alert('Error', 'El producto fue ocultado, pero no se pudo guardar la eliminación.');
    }
  }

  function confirmarEliminarProducto(id: string) {
    if (Platform.OS === 'web') {
      if (window.confirm('¿Estás seguro de que quieres borrar este producto con imagen?')) {
        void eliminarProductoConImagen(id);
      }
      return;
    }
    Alert.alert(
      'Eliminar producto',
      '¿Estás seguro de que quieres borrar este producto con imagen?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void eliminarProductoConImagen(id) },
      ]
    );
  }

  const totalCarrito = carrito.reduce((acc, i) => acc + parsePrecio(i.precio), 0);
  const idsEnCarrito = new Set(carrito.map((i) => i.id.split('_')[0]));

  // RENDERIZADO DE PANTALLA DE EDICIÓN
  if (productoEditando) {
    return (
      <View style={styles.container}>
        <Text style={styles.titulo}>Editar Producto</Text>
        <ScrollView style={{ marginTop: 16 }}>
          <Image source={{ uri: productoEditando.imagenUri }} style={styles.imagenEdicion} />
          
          <Text style={styles.etiquetaCampo}>Nombre</Text>
          <TextInput style={styles.input} value={editNombre} onChangeText={setEditNombre} />
          
          <Text style={styles.etiquetaCampo}>Descripción</Text>
          <TextInput style={[styles.input, { minHeight: 80 }]} value={editDescripcion} onChangeText={setEditDescripcion} multiline />
          
          <Text style={styles.etiquetaCampo}>Precio (COP)</Text>
          <TextInput style={styles.input} value={editPrecio} onChangeText={setEditPrecio} keyboardType="numeric" />
          
          <Pressable style={styles.botonGuardarEdicion} onPress={guardarEdicion}>
            <Text style={styles.textoBotonCarrito}>💾 Guardar Cambios</Text>
          </Pressable>
          
          <Pressable style={[styles.botonGuardarEdicion, { backgroundColor: '#7F1D1D', marginTop: 8 }]} onPress={() => setProductoEditando(null)}>
            <Text style={styles.textoBotonCarrito}>Cancelar</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>LUXOR COLLECTION</Text>
      <Text style={styles.subtitulo}>Catálogo de Alta Joyería</Text>

      <View style={styles.pestanas}>
        <BotonPestana activa={pestana === 'SinImagen'} texto="Sin imagen" onPress={() => { setMostrarIA(false); setPestana('SinImagen'); }} />
        <BotonPestana activa={pestana === 'ConImagen'} texto="Con Imagen" onPress={() => { setMostrarIA(false); setPestana('ConImagen'); }} />
        <BotonPestana activa={pestana === 'Sensores'} texto="Sensores" onPress={() => { setMostrarIA(false); setPestana('Sensores'); }} />
        <BotonPestana activa={pestana === 'Carrito'} texto={`🛒 (${carrito.length})`} onPress={() => { setMostrarIA(false); setPestana('Carrito'); }} />
      </View>

      {(pestana === 'SinImagen' || pestana === 'ConImagen') && (
        <Pressable
          onPress={() => setMostrarIA((visible) => !visible)}
          style={[styles.botonIA, mostrarIA && styles.botonIAActivo]}
          accessibilityRole="button"
        >
          <Text style={styles.textoBotonIA}>
            {mostrarIA ? 'Volver al catálogo' : 'Abrir asistente IA'}
          </Text>
        </Pressable>
      )}

      <View style={styles.panelSincronizacion}>
        <Pressable style={styles.botonSincronizacion} disabled={exportando} onPress={abrirExportacion}>
          <Text style={styles.textoBotonSincronizacion}>{exportando ? 'Preparando...' : '📤 Exportar'}</Text>
        </Pressable>
        <Pressable style={styles.botonSincronizacion} onPress={importarProductos}>
          <Text style={styles.textoBotonSincronizacion}>📥 Importar</Text>
        </Pressable>
      </View>

      <Modal visible={mostrarExportar} animationType="fade" transparent onRequestClose={() => setMostrarExportar(false)}>
        <View style={styles.fondoModalImportar}>
          <View style={styles.modalImportar}>
            <Text style={styles.tituloModalImportar}>Exportar productos</Text>
            <Text style={styles.textoModalImportar}>Selecciona qué productos quieres incluir.</Text>
            <Pressable style={styles.botonSeleccionarTodos} onPress={() => {
              const todos = productosSeleccionados.length === productosConImagen.length
                ? []
                : productosConImagen.map((producto) => producto.id);
              setProductosSeleccionados(todos);
            }}>
              <Text style={styles.textoBotonSincronizacion}>
                {productosSeleccionados.length === productosConImagen.length ? '☑ Deseleccionar todos' : '☐ Seleccionar todos'}
              </Text>
            </Pressable>
            <ScrollView style={styles.listaSeleccionExportar}>
              {productosConImagen.map((producto) => {
                const seleccionado = productosSeleccionados.includes(producto.id);
                return (
                  <Pressable
                    key={producto.id}
                    style={[styles.itemSeleccionExportar, seleccionado && styles.itemSeleccionExportarActivo]}
                    onPress={() => setProductosSeleccionados((actuales) => seleccionado
                      ? actuales.filter((id) => id !== producto.id)
                      : [...actuales, producto.id])}
                  >
                    <Text style={styles.textoSeleccionExportar}>{seleccionado ? '☑' : '☐'} {producto.nombre}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.textoModalImportar}>Ajuste de las imágenes:</Text>
            <View style={styles.opcionesImagenExportar}>
              <Pressable style={[styles.opcionImagen, modoExportacionImagen === 'completa' && styles.opcionImagenActiva]} onPress={() => setModoExportacionImagen('completa')}>
                <Text style={styles.textoBotonSincronizacion}>🖼 Completa</Text>
              </Pressable>
              <Pressable style={[styles.opcionImagen, modoExportacionImagen === 'ajustada' && styles.opcionImagenActiva]} onPress={() => setModoExportacionImagen('ajustada')}>
                <Text style={styles.textoBotonSincronizacion}>✂ Ajustada</Text>
              </Pressable>
            </View>
            <Pressable style={styles.botonImportarModal} disabled={exportando} onPress={exportarProductos}>
              <Text style={styles.textoBotonSincronizacion}>{exportando ? 'Exportando...' : `Exportar ${productosSeleccionados.length} producto(s)`}</Text>
            </Pressable>
            <Pressable style={[styles.botonImportarModal, styles.botonCancelarModal]} onPress={() => setMostrarExportar(false)}>
              <Text style={styles.textoBotonSincronizacion}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {mostrarIA && pestana === 'SinImagen' && <AsistenteIA productos={productos} />}
      {mostrarIA && pestana === 'ConImagen' && <AsistenteIA productos={productosConImagen} />}
      {!mostrarIA && pestana === 'SinImagen' && (
        <PantallaProductos
          titulo="Productos (Sin imagen)"
          datos={productos}
          favorito={favorito}
          cargandoFavorito={cargandoFavorito}
          mensajeFavorito={mensajeFavorito}
          onGuardarFavorito={guardarFavorito}
          onEliminarFavorito={eliminarFavorito}
          guardandoFavoritoId={guardandoFavoritoId}
          onAgregarCarrito={agregarAlCarrito}
          idsEnCarrito={idsEnCarrito}
        />
      )}
      {!mostrarIA && pestana === 'ConImagen' && (
        <PantallaProductos
          titulo="Productos con Imagen"
          datos={productosConImagen}
          favorito={favorito}
          cargandoFavorito={cargandoFavorito}
          mensajeFavorito=""
          onGuardarFavorito={guardarFavorito}
          onEliminarFavorito={eliminarFavorito}
          guardandoFavoritoId={guardandoFavoritoId}
          onAgregarCarrito={agregarAlCarrito}
          idsEnCarrito={idsEnCarrito}
          mensajeVacio="Aún no hay productos con imagen. Ve a Sensores → Explorar cámara para crear uno."
          onEditarProducto={iniciarEdicion}
          onEliminarProducto={confirmarEliminarProducto}
        />
      )}
      {!mostrarIA && pestana === 'Sensores' && (
        <PantallaSensores onRegistrarProducto={registrarProductoConImagen} />
      )}
      {!mostrarIA && pestana === 'Carrito' && (
        <PantallaCarrito
          carrito={carrito}
          total={totalCarrito}
          onEliminar={eliminarDelCarrito}
          onComprar={comprar}
        />
      )}
    </View>
  );
}

function BotonPestana({ activa, texto, onPress }: { activa: boolean; texto: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.pestana, activa && styles.pestanaActiva]} onPress={onPress}>
      <Text style={[styles.textoPestana, activa && styles.textoActivo]}>{texto}</Text>
    </Pressable>
  );
}

/* ===================== PANTALLA UNIFICADA DE PRODUCTOS ===================== */
type PantallaProductosProps = {
  titulo: string;
  datos: (Producto | ProductoConImagen)[];
  favorito: ProductoFavorito | null;
  cargandoFavorito: boolean;
  mensajeFavorito: string;
  onGuardarFavorito: (producto: Producto) => Promise<void>;
  onEliminarFavorito: () => void;
  guardandoFavoritoId: string | null;
  onAgregarCarrito: (producto: Producto, origen: 'sin-imagen' | 'con-imagen') => void;
  idsEnCarrito: Set<string>;
  mensajeVacio?: string;
  onEditarProducto?: (producto: ProductoConImagen) => void;
  onEliminarProducto?: (id: string) => void;
};

function PantallaProductos({
  titulo, datos, favorito, cargandoFavorito, mensajeFavorito,
  onGuardarFavorito, onEliminarFavorito, guardandoFavoritoId,
  onAgregarCarrito, idsEnCarrito, mensajeVacio, onEditarProducto, onEliminarProducto,
}: PantallaProductosProps) {
  const { width } = useWindowDimensions();
  const esPantallaGrande = width >= 900;
  const esTableta = width >= 600 && width < 900;
  let columnas = 1;
  if (esPantallaGrande) columnas = 3;
  else if (esTableta) columnas = 2;

  const esDispositivoGrande = width >= 600;
  const usarFlatList = datos.length > 5;
  const tipoDispositivo = esPantallaGrande ? 'Pantalla grande' : esTableta ? 'Tableta' : 'Teléfono';

  const encabezado = (
    <View>
      <View style={styles.panelFavorito}>
        <Text style={styles.tituloFavorito}>★ Producto favorito guardado</Text>
        {cargandoFavorito ? (
          <Text style={styles.textoFavoritoInfo}>Recuperando información local...</Text>
        ) : favorito ? (
          <>
            <Text style={styles.nombreFavorito}>{favorito.nombre}</Text>
            <Text style={styles.precioFavorito}>{favorito.precio}</Text>
            <Pressable style={styles.botonEliminarFavorito} onPress={onEliminarFavorito}>
              <Text style={styles.textoEliminarFavorito}>Eliminar favorito</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.textoFavoritoInfo}>Toca la estrella de cualquier producto para guardarlo.</Text>
        )}
        {!!mensajeFavorito && (
          <Text style={styles.mensajeFavorito} accessibilityLiveRegion="polite">{mensajeFavorito}</Text>
        )}
      </View>

      <View style={styles.resumen}>
        <Text style={styles.tituloResumen}>{titulo}</Text>
        <View style={esDispositivoGrande ? styles.resumenInfoGrande : styles.resumenInfoPequeño}>
          <Text style={styles.textoResumen}>Productos: {datos.length}</Text>
          {esDispositivoGrande && <Text style={styles.textoResumen}> | </Text>}
          <Text style={styles.textoResumen}>Disp: {tipoDispositivo}</Text>
          {esDispositivoGrande && <Text style={styles.textoResumen}> | </Text>}
          <Text style={styles.textoResumen}>Col: {columnas}</Text>
        </View>
        <Text style={styles.indicadorTexto}>
          {usarFlatList ? 'Vista optimizada: FlatList' : 'Vista sencilla: ScrollView + map()'}
        </Text>
      </View>

      {datos.length === 0 && mensajeVacio && (
        <View style={styles.panelVacio}><Text style={styles.textoVacio}>{mensajeVacio}</Text></View>
      )}
    </View>
  );

  const renderItem = (item: Producto | ProductoConImagen) => {
    const imagenUri = 'imagenUri' in item ? item.imagenUri : undefined;
    return (
      <Tarjeta
        producto={item}
        imagenUri={imagenUri}
        modoImagen={'modoImagen' in item ? item.modoImagen : undefined}
        esFavorito={favorito?.id === item.id}
        guardando={guardandoFavoritoId === item.id}
        enCarrito={idsEnCarrito.has(item.id)}
        onSeleccionarFavorito={onGuardarFavorito}
        onAgregarCarrito={onAgregarCarrito}
        onEditar={onEditarProducto}
        onEliminar={onEliminarProducto}
      />
    );
  };

  if (usarFlatList) {
    return (
      <FlatList
        key={`lista-${columnas}`}
        style={styles.lista} data={datos} keyExtractor={(item) => item.id}
        numColumns={columnas} initialNumToRender={8} ListHeaderComponent={encabezado}
        columnWrapperStyle={columnas > 1 ? styles.fila : undefined}
        contentContainerStyle={styles.listaContenido} showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={columnas > 1 ? styles.celda : undefined}>{renderItem(item)}</View>
        )}
      />
    );
  }

  return (
    <ScrollView style={styles.lista} contentContainerStyle={styles.listaContenido} showsVerticalScrollIndicator={false}>
      {encabezado}
      <View style={columnas > 1 ? styles.filaWrap : undefined}>
        {datos.map((item) => (
          <View key={item.id} style={columnas > 1 ? [styles.celda, { flexBasis: `${100 / columnas}%` }] : undefined}>
            {renderItem(item)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/* ===================== CARRITO ===================== */
function PantallaCarrito({ carrito, total, onEliminar, onComprar }: {
  carrito: ItemCarrito[]; total: number; onEliminar: (id: string) => void; onComprar: () => void;
}) {
  return (
    <ScrollView style={styles.lista} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.panelCarrito}>
        <Text style={styles.tituloCarrito}>🛒 Tu carrito</Text>
        {carrito.length === 0 ? (
          <Text style={styles.textoVacioCarrito}>Aún no has añadido productos. Explora el catálogo y añade tus joyas favoritas.</Text>
        ) : (
          <>
            {carrito.map((item) => (
              <View key={item.id} style={styles.itemCarrito}>
                <View style={styles.infoItemCarrito}>
                  <Text style={styles.nombreItemCarrito}>{item.nombre}</Text>
                  <Text style={styles.origenItemCarrito}>{item.origen === 'con-imagen' ? '📷 Con imagen' : '📦 Sin imagen'}</Text>
                  <Text style={styles.precioItemCarrito}>{item.precio}</Text>
                </View>
                <Pressable style={styles.botonEliminarItem} onPress={() => onEliminar(item.id)}>
                  <Text style={styles.textoEliminarItem}>✕</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.totalCarrito}>
              <Text style={styles.textoTotalCarrito}>Total:</Text>
              <Text style={styles.valorTotalCarrito}>{formatearCOP(total)}</Text>
            </View>
            <Pressable style={styles.botonComprar} onPress={onComprar}>
              <Text style={styles.textoBotonComprar}>💳 Comprar</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

/* ===================== PANTALLA SENSORES ===================== */
function PantallaSensores({ onRegistrarProducto }: { onRegistrarProducto: (producto: ProductoConImagen) => void }) {
  const [datos, setDatos] = useState<Lectura>({ x: 0, y: 0, z: 0 });
  const [simulados, setSimulados] = useState<Lectura>({ x: 0, y: 0, z: 1 });
  const [modo, setModo] = useState<Modo>('simulacion');
  const [estado, setEstado] = useState('Simulación: sin sensor físico');
  const [pausado, setPausado] = useState(false);
  const [mostrarCamara, setMostrarCamara] = useState(false);

  const esWeb = Platform.OS === 'web';
  const UMBRAL_ALARMA = 1.5;
  const [alarmaActiva, setAlarmaActiva] = useState(false);
  const [ultimaAlerta, setUltimaAlerta] = useState<Alerta | null>(null);
  const [contadorAlertas, setContadorAlertas] = useState(0);
  const ultimaAlertaRef = useRef<number>(0);
  const COOLDOWN_MS = 1000;

  useEffect(() => {
    if (esWeb) { setModo('simulacion'); setEstado('🌐 Entorno Web: sensor deshabilitado.'); return; }
    if (modo !== 'real') { setEstado('Simulación: sin sensor físico'); return; }
    if (pausado) { setEstado('Sensor pausado. Pulsa Activar sensor para reanudar.'); return; }
    let cancelado = false;
    let subscription: { remove: () => void } | undefined;

    async function iniciar() {
      setEstado('Comprobando sensor y permiso...'); setDatos({ x: 0, y: 0, z: 0 });
      try {
        const permiso = await Accelerometer.requestPermissionsAsync();
        if (cancelado) return;
        if (!permiso.granted) { setEstado('Permiso denegado.'); return; }
        const disponible = await Accelerometer.isAvailableAsync();
        if (cancelado) return;
        if (!disponible) { setEstado('Sensor no disponible.'); return; }
        Accelerometer.setUpdateInterval(500);
        setEstado('Esperando la primera lectura...');
        subscription = Accelerometer.addListener((data) => {
          if (cancelado) return;
          setDatos({ x: data.x, y: data.y, z: data.z }); setEstado('Sensor activo');
          const magnitud = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
          const ahora = Date.now();
          if (magnitud > UMBRAL_ALARMA && ahora - ultimaAlertaRef.current > COOLDOWN_MS) {
            ultimaAlertaRef.current = ahora; setAlarmaActiva(true); setContadorAlertas((c) => c + 1);
            setUltimaAlerta({ hora: new Date().toLocaleTimeString('es-CO'), magnitud });
          }
        });
      } catch { if (!cancelado) setEstado('No se pudo iniciar el sensor.'); }
    }
    iniciar();
    return () => { cancelado = true; subscription?.remove(); };
  }, [modo, pausado, esWeb]);

  const lectura = modo === 'real' ? datos : simulados;
  const lista = modo === 'simulacion' || estado === 'Sensor activo';
  let posicion = 'Posición centrada';
  if (lectura.x > 0.5) posicion = 'Inclinado a la derecha';
  else if (lectura.x < -0.5) posicion = 'Inclinado a la izquierda';
  const magnitud = Math.sqrt(lectura.x ** 2 + lectura.y ** 2 + lectura.z ** 2);

  function simularSacudida() {
    const ahora = Date.now();
    if (ahora - ultimaAlertaRef.current > COOLDOWN_MS) {
      ultimaAlertaRef.current = ahora; setAlarmaActiva(true); setContadorAlertas((c) => c + 1);
      setUltimaAlerta({ hora: new Date().toLocaleTimeString('es-CO'), magnitud: 2.1 });
    }
  }

  if (mostrarCamara) {
    return (
      <ExploracionCamara
        onCerrar={() => setMostrarCamara(false)}
        onGuardarProducto={(nuevo) => { onRegistrarProducto(nuevo); setMostrarCamara(false); }}
      />
    );
  }

  return (
    <ScrollView style={styles.lista} contentContainerStyle={styles.panelSensor}>
      <Text style={styles.tituloSensor}>Mi app siente el movimiento</Text>
      {esWeb && (
        <View style={styles.bannerWebInfo}>
          <Text style={styles.textoBannerWeb}>🌐 Modo Web: simulación activada.</Text>
        </View>
      )}
      <View style={styles.controlesSensor}>
        <Pressable disabled={esWeb} style={[styles.botonSensor, modo === 'real' && styles.botonSensorActivo, esWeb && styles.botonSensorDeshabilitado]} onPress={() => !esWeb && setModo('real')}>
          <Text style={[styles.textoBotonSensor, modo === 'real' && styles.textoBotonSensorActivo, esWeb && styles.textoDeshabilitado]}>
            {esWeb ? 'Sensor físico (Web)' : 'Usar sensor real'}
          </Text>
        </Pressable>
        <Pressable style={[styles.botonSensor, modo === 'simulacion' && styles.botonSensorActivo]} onPress={() => setModo('simulacion')}>
          <Text style={[styles.textoBotonSensor, modo === 'simulacion' && styles.textoBotonSensorActivo]}>Usar simulación</Text>
        </Pressable>
      </View>
      <Text style={styles.estadoSensor}>{estado}</Text>
      <Text style={styles.origenSensor}>Origen: {modo === 'real' ? 'Sensor físico' : 'SIMULADO'}</Text>

      {alarmaActiva && (
        <View style={styles.bannerAlarma}>
          <Text style={styles.textoAlarma}>🚨 ¡Movimiento brusco detectado!</Text>
          <Text style={styles.textoAlarmaDetalle}>Magnitud: {ultimaAlerta?.magnitud.toFixed(2)} g · Hora: {ultimaAlerta?.hora}</Text>
          <Pressable style={styles.botonCerrarAlarma} onPress={() => setAlarmaActiva(false)}>
            <Text style={styles.textoCerrarAlarma}>Entendido</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.tarjetaSensor}>
        <Text style={styles.nombreSensor}>Lecturas en g</Text>
        <Text style={styles.lecturaSensor}>X: {lista ? lectura.x.toFixed(2) : '--'}</Text>
        <Text style={styles.lecturaSensor}>Y: {lista ? lectura.y.toFixed(2) : '--'}</Text>
        <Text style={styles.lecturaSensor}>Z: {lista ? lectura.z.toFixed(2) : '--'}</Text>
        <Text style={styles.lecturaSensor}>Magnitud: {lista ? magnitud.toFixed(2) : '--'} g</Text>
        <Text style={styles.posicionSensor}>Estado: {lista ? posicion : 'Sin lectura'}</Text>
      </View>

      {lista && (
        <View style={[styles.pista, lectura.x > 0.5 && styles.pistaDerecha, lectura.x < -0.5 && styles.pistaIzquierda]}>
          <View style={styles.indicador} />
        </View>
      )}

      <View style={styles.tarjetaAlarma}>
        <Text style={styles.nombreSensor}>🛡️ Alarma de manipulación</Text>
        <Text style={styles.lecturaSensor}>Umbral: {UMBRAL_ALARMA.toFixed(1)} g</Text>
        <Text style={styles.lecturaSensor}>Alertas: {contadorAlertas}</Text>
        {ultimaAlerta && <Text style={styles.lecturaSensor}>Última: {ultimaAlerta.hora}</Text>}
        <View style={styles.controlesSensor}>
          <Pressable style={styles.botonSensor} onPress={simularSacudida}><Text style={styles.textoBotonSensor}>Simular sacudida</Text></Pressable>
          <Pressable style={styles.botonSensor} onPress={() => { setContadorAlertas(0); setUltimaAlerta(null); setAlarmaActiva(false); }}><Text style={styles.textoBotonSensor}>Reiniciar</Text></Pressable>
        </View>
      </View>

      {modo === 'real' && (
        <View style={styles.controlesSensor}>
          <Pressable style={[styles.botonSensor, pausado && styles.botonSensorPausa]} onPress={() => setPausado(!pausado)}>
            <Text style={styles.textoBotonSensor}>{pausado ? 'Activar sensor' : 'Pausar sensor'}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.controlesSensor}>
        <Pressable style={styles.botonSensor} onPress={() => setMostrarCamara(true)}>
          <Text style={styles.textoBotonSensor}>📷 Explorar cámara y tomar foto</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/* ===================== ESTILOS ===================== */
const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 30, backgroundColor: '#0F172A' },
  titulo: { fontSize: 28, fontWeight: '900', color: '#F59E0B', textAlign: 'center', letterSpacing: 2 },
  subtitulo: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginBottom: 15, fontStyle: 'italic' },
  pestanas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  panelSincronizacion: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  botonSincronizacion: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#334155', borderWidth: 1, borderColor: '#F59E0B' },
  textoBotonSincronizacion: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  fondoModalImportar: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.75)' },
  modalImportar: { maxHeight: '85%', padding: 18, borderRadius: 12, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#F59E0B' },
  tituloModalImportar: { color: '#F59E0B', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  textoModalImportar: { color: '#CBD5E1', marginBottom: 10 },
  inputJsonImportar: { height: 220, padding: 12, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: '#64748B', color: '#FFFFFF', textAlignVertical: 'top' },
  botonImportarModal: { padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#059669', marginBottom: 8 },
  botonCancelarModal: { backgroundColor: '#7F1D1D' },
  botonSeleccionarTodos: { padding: 10, marginBottom: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#475569' },
  listaSeleccionExportar: { maxHeight: 240, marginBottom: 10 },
  itemSeleccionExportar: { padding: 10, marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: '#64748B', backgroundColor: '#0F172A' },
  itemSeleccionExportarActivo: { borderColor: '#F59E0B', backgroundColor: '#334155' },
  textoSeleccionExportar: { color: '#FFFFFF', fontWeight: '700' },
  opcionesImagenExportar: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  opcionImagen: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#475569' },
  opcionImagenActiva: { backgroundColor: '#D97706' },
  pestana: { flexGrow: 1, flexBasis: '48%', padding: 10, backgroundColor: '#1E293B', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  pestanaActiva: { backgroundColor: '#F59E0B', borderColor: '#D97706' },
  textoPestana: { color: '#94A3B8', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', textAlign: 'center' },
  textoActivo: { color: '#0F172A' },
  botonIA: { padding: 12, marginBottom: 12, borderRadius: 8, backgroundColor: '#126d80', alignItems: 'center' },
  botonIAActivo: { backgroundColor: '#F59E0B' },
  textoBotonIA: { color: '#FFFFFF', fontWeight: '900' },
  lista: { flex: 1 },
  listaContenido: { paddingBottom: 24 },
  tarjeta: { marginBottom: 10, padding: 14, backgroundColor: '#FFFFFF', borderRadius: 10, borderLeftWidth: 6, borderLeftColor: '#F59E0B' },
  imagenProducto: { width: '100%', height: 180, borderRadius: 8, marginBottom: 10, backgroundColor: '#E2E8F0' },
  imagenProductoCompleta: { backgroundColor: '#E2E8F0' },
  nombre: { flex: 1, fontSize: 15, fontWeight: '900', color: '#1E293B', marginBottom: 4 },
  encabezadoTarjeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  botonFavorito: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#F59E0B' },
  botonFavoritoActivo: { backgroundColor: '#F59E0B' },
  botonFavoritoGuardando: { opacity: 0.5 },
  textoFavorito: { color: '#D97706', fontSize: 22, lineHeight: 24 },
  textoFavoritoActivo: { color: '#0F172A' },
  descripcion: { fontSize: 12, color: '#475569', marginBottom: 8 },
  precio: { fontSize: 18, fontWeight: '900', color: '#059669', alignSelf: 'flex-end' },
  botonCarrito: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#0F172A', alignItems: 'center' },
  botonCarritoActivo: { backgroundColor: '#059669' },
  textoBotonCarrito: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  
  filaAccionesExtra: { flexDirection: 'row', gap: 8, marginTop: 8 },
  botonAccion: { flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: '#334155', alignItems: 'center' },
  botonAccionEliminar: { backgroundColor: '#991B1B' },
  textoBotonAccion: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },

  contenedorFeedback: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  contenedorFeedbackGuardando: { backgroundColor: '#FEF3C7', borderColor: '#D97706' },
  contenedorFeedbackError: { backgroundColor: '#FEE2E2', borderColor: '#DC2626' },
  contenedorFeedbackExito: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  textoFeedback: { color: '#0F172A', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  fila: { gap: 10 },
  filaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  celda: { flex: 1, minWidth: 0 },
  panelFavorito: { marginBottom: 12, padding: 14, borderRadius: 10, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#F59E0B' },
  tituloFavorito: { color: '#F59E0B', fontSize: 15, fontWeight: '900', marginBottom: 6 },
  textoFavoritoInfo: { color: '#E2E8F0', fontSize: 13 },
  nombreFavorito: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  precioFavorito: { color: '#34D399', fontSize: 16, fontWeight: '900', marginTop: 4 },
  botonEliminarFavorito: { alignSelf: 'flex-start', marginTop: 10, padding: 8, borderRadius: 7, backgroundColor: '#7F1D1D' },
  textoEliminarFavorito: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  mensajeFavorito: { color: '#94A3B8', fontSize: 12, marginTop: 10 },
  resumen: { backgroundColor: '#1E293B', padding: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  resumenInfoPequeño: { flexDirection: 'column', gap: 4 },
  resumenInfoGrande: { flexDirection: 'row', alignItems: 'center' },
  tituloResumen: { color: '#F59E0B', fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  textoResumen: { color: '#E2E8F0', fontSize: 13 },
  indicadorTexto: { color: '#F59E0B', fontWeight: 'bold', fontSize: 12, marginTop: 6 },
  panelVacio: { padding: 20, borderRadius: 10, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', marginBottom: 12, alignItems: 'center' },
  textoVacio: { color: '#94A3B8', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  panelCarrito: { marginTop: 12, padding: 16, backgroundColor: '#1E293B', borderRadius: 12, borderWidth: 1, borderColor: '#F59E0B' },
  tituloCarrito: { fontSize: 20, fontWeight: '900', color: '#F59E0B', marginBottom: 12 },
  textoVacioCarrito: { color: '#94A3B8', fontSize: 14, lineHeight: 20 },
  itemCarrito: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  infoItemCarrito: { flex: 1 },
  nombreItemCarrito: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  origenItemCarrito: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  precioItemCarrito: { color: '#34D399', fontSize: 15, fontWeight: '900', marginTop: 4 },
  botonEliminarItem: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#7F1D1D', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  textoEliminarItem: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  totalCarrito: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 2, borderTopColor: '#F59E0B' },
  textoTotalCarrito: { color: '#F59E0B', fontSize: 16, fontWeight: '900' },
  valorTotalCarrito: { color: '#34D399', fontSize: 20, fontWeight: '900' },
  botonComprar: { marginTop: 16, paddingVertical: 14, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center' },
  textoBotonComprar: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  
  // Estilos de edición
  etiquetaCampo: { color: '#F59E0B', fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
  input: { backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1, borderColor: '#334155', color: '#FFFFFF', padding: 12, fontSize: 14, textAlignVertical: 'top' },
  imagenEdicion: { width: '100%', height: 180, borderRadius: 8, marginBottom: 12, backgroundColor: '#E2E8F0' },
  botonGuardarEdicion: { marginTop: 16, paddingVertical: 14, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center' },

  // Sensores
  panelSensor: { padding: 16, paddingBottom: 32 },
  tituloSensor: { fontSize: 22, fontWeight: '900', color: '#F59E0B', marginBottom: 8 },
  controlesSensor: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8, gap: 8 },
  botonSensor: { padding: 12, borderRadius: 8, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  botonSensorActivo: { backgroundColor: '#F59E0B', borderColor: '#D97706' },
  botonSensorPausa: { backgroundColor: '#DC2626', borderColor: '#991B1B' },
  textoBotonSensor: { color: '#94A3B8', fontWeight: '700', fontSize: 12 },
  textoBotonSensorActivo: { color: '#0F172A' },
  estadoSensor: { marginTop: 10, color: '#F59E0B', fontWeight: '700', fontSize: 13 },
  origenSensor: { color: '#E2E8F0', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  tarjetaSensor: { backgroundColor: '#1E293B', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#334155', marginVertical: 10 },
  nombreSensor: { fontSize: 16, fontWeight: '900', color: '#F59E0B', marginBottom: 10 },
  lecturaSensor: { fontSize: 15, color: '#E2E8F0', fontWeight: '600', marginVertical: 2 },
  posicionSensor: { marginTop: 10, color: '#F59E0B', fontWeight: '700', fontSize: 14 },
  pista: { height: 100, borderRadius: 14, padding: 16, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', marginVertical: 12 },
  pistaDerecha: { alignItems: 'flex-end' },
  pistaIzquierda: { alignItems: 'flex-start' },
  indicador: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F59E0B' },
  tarjetaAlarma: { backgroundColor: '#1E293B', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#334155', marginVertical: 10 },
  bannerAlarma: { backgroundColor: '#DC2626', padding: 14, borderRadius: 10, marginVertical: 10, borderWidth: 2, borderColor: '#991B1B' },
  textoAlarma: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
  textoAlarmaDetalle: { color: '#FEE2E2', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  botonCerrarAlarma: { backgroundColor: '#FFFFFF', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'center' },
  textoCerrarAlarma: { color: '#DC2626', fontWeight: '900', fontSize: 13 },
  bannerWebInfo: { backgroundColor: '#1E293B', padding: 12, borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#2563EB', marginBottom: 12 },
  textoBannerWeb: { color: '#93C5FD', fontSize: 12, lineHeight: 18 },
  botonSensorDeshabilitado: { opacity: 0.4, borderColor: '#475569' },
  textoDeshabilitado: { color: '#64748b' },
});