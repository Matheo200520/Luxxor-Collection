import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Linking,
  Image,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

type ProductoConImagen = {
  id: string;
  nombre: string;
  descripcion: string;
  precio: string;
  imagenUri: string;
};

type Props = {
  onCerrar: () => void;
  onGuardarProducto: (producto: ProductoConImagen) => void;
};

type Fase = 'camara' | 'previsualizacion' | 'formulario';

export default function ExploracionCamara({ onCerrar, onGuardarProducto }: Props) {
  // Permisos y estados de la cámara: controlan si se puede capturar, previsualizar y guardar la fotografía.
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [frontal, setFrontal] = useState(false);
  const [error, setError] = useState("");
  const [solicitando, setSolicitando] = useState(false);

  const [fase, setFase] = useState<Fase>('camara');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);
  const camaraRef = useRef<CameraView>(null);
  const scrollFormularioRef = useRef<any>(null);
  const descripcionRef = useRef<any>(null);
  const precioRef = useRef<any>(null);

  // Datos del formulario y referencias usadas para recorrer los campos y ajustar el scroll con el teclado.
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");

  async function solicitar() {
    setError("");
    setSolicitando(true);
    try {
      await pedirPermiso();
    } catch {
      setError("No se pudo solicitar el permiso. Puedes cerrar esta función.");
    } finally {
      setSolicitando(false);
    }
  }

  async function abrirAjustes() {
    try {
      await Linking.openSettings();
    } catch {
      setError("No se pudieron abrir los ajustes del dispositivo automáticamente.");
    }
  }

  // Captura: toma una foto con expo-camera y cambia de fase para mostrar su previsualización.
  async function tomarFoto() {
    if (!camaraRef.current || capturando) return;
    setCapturando(true);
    setError("");
    try {
      const foto = await camaraRef.current.takePictureAsync({ quality: 0.7 });
      if (foto?.uri) {
        setFotoUri(foto.uri);
        setFase('previsualizacion');
      }
    } catch {
      setError("No se pudo tomar la foto. Intenta de nuevo.");
    } finally {
      setCapturando(false);
    }
  }

  function rechazarFoto() {
    setFotoUri(null);
    setFase('camara');
  }

  function aceptarFoto() {
    setFase('formulario');
  }

  // Registro: valida el formulario, normaliza el precio COP y entrega el producto al componente principal.
  function guardarProducto() {
    if (!fotoUri) {
      setError("No hay foto para guardar.");
      return;
    }
    if (!nombre.trim() || !descripcion.trim() || !precio.trim()) {
      Alert.alert("Campos incompletos", "Completa nombre, descripción y precio.");
      return;
    }
    // Normaliza precio a formato COP
    const numero = Number(precio.replace(/[^0-9]/g, ''));
    if (!numero) {
      Alert.alert("Precio inválido", "Ingresa un precio numérico válido.");
      return;
    }
    const precioFormateado = '$ ' + numero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    const nuevo: ProductoConImagen = {
      id: `img-${Date.now()}`,
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      precio: precioFormateado,
      imagenUri: fotoUri,
    };

    onGuardarProducto(nuevo);
    // Reset
    setFotoUri(null);
    setNombre("");
    setDescripcion("");
    setPrecio("");
    setFase('camara');
  }

  /* ---------- FASE: FORMULARIO ----------
     KeyboardAvoidingView evita que el teclado tape los campos. El ScrollView permite alcanzar
     descripción, precio y guardar producto; cada campo también avanza al siguiente.
  */
  if (fase === 'formulario' && fotoUri) {
    return (
      <KeyboardAvoidingView
        style={s.panelTeclado}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <ScrollView
        ref={scrollFormularioRef}
        style={s.panel}
        contentContainerStyle={{ paddingBottom: 360 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={true}
        showsVerticalScrollIndicator={true}
      >
        <Pressable style={s.botonVolverMejorado} onPress={() => setFase('previsualizacion')}>
          <Text style={s.textoBotonVolverMejorado}>← Volver a la foto</Text>
        </Pressable>

        <Text style={s.titulo}>Registrar producto</Text>
        <Text style={s.textoInfo}>Completa los datos del producto fotografiado.</Text>

        <Image source={{ uri: fotoUri }} style={s.previsualizacion} resizeMode="cover" />

        <Text style={s.etiquetaCampo}>Nombre del producto</Text>
        <TextInput
          style={s.input}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Ej: Anillo de oro 18k"
          placeholderTextColor="#64748B"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => descripcionRef.current?.focus()}
        />

        <Text style={s.etiquetaCampo}>Descripción</Text>
        <TextInput
          ref={descripcionRef}
          style={[s.input, s.inputMultilinea]}
          value={descripcion}
          onChangeText={setDescripcion}
          placeholder="Describe el producto..."
          placeholderTextColor="#64748B"
          multiline
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => precioRef.current?.focus()}
        />

        <Text style={s.etiquetaCampo}>Precio (COP)</Text>
        <TextInput
          ref={precioRef}
          style={s.input}
          value={precio}
          onChangeText={setPrecio}
          placeholder="Ej: 1500000"
          placeholderTextColor="#64748B"
          keyboardType="numeric"
          returnKeyType="done"
          onFocus={() => setTimeout(() => scrollFormularioRef.current?.scrollToEnd({ animated: true }), 250)}
          onSubmitEditing={guardarProducto}
        />

        <Pressable style={s.boton} onPress={guardarProducto}>
          <Text style={s.textoBoton}>💾 Guardar producto</Text>
        </Pressable>

        {!!error && <Text style={s.textoError}>{error}</Text>}
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* ---------- FASE: PREVISUALIZACIÓN ---------- */
  if (fase === 'previsualizacion' && fotoUri) {
    return (
      <ScrollView style={s.panel} contentContainerStyle={{ paddingBottom: 24 }}>
        <Pressable style={s.botonVolverMejorado} onPress={rechazarFoto}>
          <Text style={s.textoBotonVolverMejorado}>← Volver a la cámara</Text>
        </Pressable>

        <Text style={s.titulo}>¿Usar esta foto?</Text>
        <Text style={s.textoInfo}>
          Acepta para registrar el producto o rechaza para tomar otra foto.
        </Text>

        <Image source={{ uri: fotoUri }} style={s.previsualizacion} resizeMode="cover" />

        <View style={s.filaBotones}>
          <Pressable style={[s.boton, s.botonRechazar]} onPress={rechazarFoto}>
            <Text style={s.textoBoton}>✕ Rechazar</Text>
          </Pressable>
          <Pressable style={[s.boton, s.botonAceptar]} onPress={aceptarFoto}>
            <Text style={s.textoBoton}>✓ Aceptar</Text>
          </Pressable>
        </View>

        {!!error && <Text style={s.textoError}>{error}</Text>}
      </ScrollView>
    );
  }

  /* ---------- FASE: CÁMARA ---------- */
  return (
    <ScrollView style={s.panel} contentContainerStyle={{ paddingBottom: 24 }}>
      <Pressable style={s.botonVolverMejorado} onPress={onCerrar}>
        <Text style={s.textoBotonVolverMejorado}>← Volver a Sensores</Text>
      </Pressable>

      <Text style={s.titulo}>Exploración de cámara</Text>
      <Text style={s.textoInfo}>
        Toma una foto del producto para registrarlo en "Productos con Imagen".
      </Text>

      {!permiso ? (
        <Text style={s.textoInfo}>Comprobando permiso...</Text>
      ) : !permiso.granted ? (
        <View style={s.tarjetaEstado}>
          <Text style={s.tituloEstado}>
            {permiso.status === "denied" ? "⚠️ Permiso de cámara denegado" : "Permiso pendiente"}
          </Text>
          <Text style={s.textoInfo}>
            Necesitamos la cámara para fotografiar productos.
          </Text>

          {permiso.canAskAgain ? (
            <Pressable style={s.boton} disabled={solicitando} onPress={solicitar}>
              <Text style={s.textoBoton}>
                {solicitando ? "Solicitando..." : "Permitir cámara"}
              </Text>
            </Pressable>
          ) : (
            <View>
              <Text style={s.textoInfo}>
                El permiso fue denegado. Puedes habilitarlo en la configuración de la app:
              </Text>
              <Pressable style={s.botonAjustes} onPress={abrirAjustes}>
                <Text style={s.textoBotonAjustes}>⚙️ Abrir Ajustes del Dispositivo</Text>
              </Pressable>
            </View>
          )}

          <Text style={s.textoInfoSecundario}>
            Puedes volver al catálogo y continuar la práctica sin cámara.
          </Text>
        </View>
      ) : !error ? (
        <View>
          <Text style={s.textoInfo}>Permiso concedido</Text>
          <CameraView
            ref={camaraRef}
            style={s.camara}
            facing={frontal ? "front" : "back"}
            onMountError={() =>
              setError("No se pudo abrir la cámara. Cierra y revisa otra app que la use.")
            }
          />
          <Pressable style={s.boton} disabled={capturando} onPress={tomarFoto}>
            <Text style={s.textoBoton}>
              {capturando ? "Capturando..." : "📸 Tomar foto del producto"}
            </Text>
          </Pressable>
          <Pressable style={s.botonSecundario} onPress={() => setFrontal(!frontal)}>
            <Text style={s.textoBotonSecundario}>Cambiar cámara</Text>
          </Pressable>
        </View>
      ) : null}

      {!!error && <Text style={s.textoError}>{error}</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  panelTeclado: { flex: 1, minHeight: 0, backgroundColor: "#0F172A" },
  panel: { flex: 1, padding: 16, minHeight: 0, backgroundColor: "#0F172A" },
  titulo: { fontSize: 22, fontWeight: "700", marginVertical: 12, color: "#FFFFFF" },
  botonVolverMejorado: {
    padding: 12, marginVertical: 8, backgroundColor: "#1E293B", borderRadius: 8,
    borderWidth: 1.5, borderColor: "#F59E0B",
  },
  textoBotonVolverMejorado: { color: "#F59E0B", fontWeight: "800", textAlign: "center", fontSize: 14 },
  tarjetaEstado: {
    backgroundColor: "#1E293B", padding: 16, borderRadius: 12, borderWidth: 1,
    borderColor: '#334155', marginVertical: 12,
  },
  tituloEstado: { color: '#F59E0B', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  boton: {
    padding: 12, marginVertical: 8, backgroundColor: "#F59E0B", borderRadius: 8, flex: 1,
  },
  botonSecundario: {
    padding: 10, marginVertical: 6, backgroundColor: "#1E293B", borderRadius: 8,
    borderWidth: 1, borderColor: '#334155',
  },
  textoBotonSecundario: { color: '#94A3B8', fontWeight: '700', textAlign: 'center' },
  textoBoton: { color: "#0F172A", fontWeight: "700", textAlign: "center" },
  botonAjustes: { padding: 12, marginVertical: 10, backgroundColor: "#2563EB", borderRadius: 8 },
  textoBotonAjustes: { color: "#FFFFFF", fontWeight: "800", textAlign: "center" },
  textoInfo: { color: "#FFFFFF", fontSize: 14, lineHeight: 20, marginVertical: 4 },
  textoInfoSecundario: { color: "#94A3B8", fontSize: 12, marginTop: 8 },
  textoError: { color: "#F87171", fontSize: 14, marginVertical: 8, fontWeight: "600" },
  camara: { height: 320, marginTop: 12, borderRadius: 12, overflow: "hidden" },
  previsualizacion: { width: '100%', height: 320, borderRadius: 12, marginVertical: 12, backgroundColor: '#1E293B' },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 8 },
  botonRechazar: { backgroundColor: '#DC2626' },
  botonAceptar: { backgroundColor: '#059669' },
  etiquetaCampo: { color: '#F59E0B', fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#1E293B', borderRadius: 8, borderWidth: 1, borderColor: '#334155',
    color: '#FFFFFF', padding: 12, fontSize: 14,
  },
  inputMultilinea: { minHeight: 80, textAlignVertical: 'top' },
});