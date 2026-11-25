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
import * as ImagePicker from "expo-image-picker";

/*
 * Tipos compartidos con App para mantener el producto creado compatible con el catálogo.
 * La cámara construye su propio registro y el callback de App lo adapta y persiste;
 * la separación evita que este componente conozca el almacenamiento global.
 */
/** Categorías que determinan las opciones y validaciones del formulario. */
export type Categoria =
  | "Anillo"
  | "Cadena"
  | "Pulsera"
  | "Aretes"
  | "Reloj"
  | "Perfume";

/**
 * Notas aromáticas opcionales para un perfume. Las tres listas se construyen
 * a partir de texto separado por comas antes de enviar el producto a App.
 */
export type PiramideOlfativa = {
  salida: string[];
  corazon: string[];
  fondo: string[];
};

/**
 * Contrato del producto que se entrega a App tras validar el formulario.
 * `imagenUri` siempre está presente porque el flujo de esta pantalla exige
 * capturar o seleccionar una foto antes de crear el registro.
 */
export type ProductoConImagen = {
  id: string;
  nombre: string;
  descripcion: string;
  precio: string;
  imagenUri: string;
  categoria: Categoria;
  // Joyería / reloj
  tallas?: string[];
  material?: string;
  // Perfume
  mililitros?: string[];
  piramide?: PiramideOlfativa;
  genero?: "Femenino" | "Masculino" | "Unisex";
};

/**
 * Acciones que el componente no resuelve por sí mismo:
 * `onCerrar` vuelve a la vista anterior y `onGuardarProducto` persiste el registro.
 * El callback puede ser asíncrono para que el formulario espere el resultado real.
 */
type Props = {
  onCerrar: () => void;
  onGuardarProducto: (producto: ProductoConImagen) => void | Promise<void>;
};

/**
 * Etapas ordenadas del flujo. La vista previa permite descartar una imagen antes
 * de mostrar el formulario; `camara` también ofrece seleccionar desde la galería.
 */
type Fase = "camara" | "previsualizacion" | "formulario";

/** Opciones de categoría, talla, presentación y género disponibles en el formulario. */
const CATEGORIAS: Categoria[] = [
  "Anillo",
  "Cadena",
  "Pulsera",
  "Aretes",
  "Reloj",
  "Perfume",
];

const TALLAS_ANILLO = ["5", "6", "7", "8", "9", "10", "11"];
const TALLAS_CADENA = ["40 cm", "45 cm", "50 cm", "55 cm", "60 cm"];
const TALLAS_PULSERA = ["16 cm", "17 cm", "18 cm", "19 cm", "20 cm"];
const ML_PERFUME = ["30 ml", "50 ml", "100 ml", "150 ml"];
const GENEROS = ["Femenino", "Masculino", "Unisex"] as const;

/**
 * Pantalla que lleva al usuario desde una imagen hasta un producto listo para el catálogo.
 * Administra permisos locales, captura/selección, confirmación de imagen y datos de producto;
 * App conserva la responsabilidad de copiar la foto al almacenamiento y guardar el catálogo.
 */
export default function ExploracionCamara({ onCerrar, onGuardarProducto }: Props) {
  /* ---------- PERMISOS Y CÁMARA ---------- */
  /*
   * Expo entrega el estado actual del permiso y la función para volver a solicitarlo.
   * `frontal` selecciona la cámara visible; `solicitando` y `error` controlan el feedback
   * mientras el sistema operativo responde o la vista previa falla.
   */
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [frontal, setFrontal] = useState(false);
  const [error, setError] = useState("");
  const [solicitando, setSolicitando] = useState(false);

  /*
   * `fase` selecciona cuál de las tres vistas se renderiza. `fotoUri` conserva la imagen
   * temporal entre cámara, vista previa y formulario. Los refs permiten tomar la foto
   * desde CameraView y mover el foco al siguiente campo sin buscarlo en el árbol.
   */
  const [fase, setFase] = useState<Fase>("camara");
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const camaraRef = useRef<CameraView>(null);
  const scrollFormularioRef = useRef<any>(null);
  const descripcionRef = useRef<any>(null);
  const precioRef = useRef<any>(null);

  /* ---------- FORMULARIO BASE ---------- */
  /*
   * Campos principales del producto. Se mantienen separados en estado para que cada
   * TextInput se actualice mientras se escribe; las opciones específicas se validan
   * y se copian al objeto final solamente cuando se guarda.
   */
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [material, setMaterial] = useState("");
  const [genero, setGenero] = useState<(typeof GENEROS)[number]>("Unisex");

  /* ---------- TALLAS ---------- */
  const [tallasSeleccionadas, setTallasSeleccionadas] = useState<string[]>([]);
  /*
   * Las tallas predefinidas dependen de la categoría de joyería. Para categorías sin
   * talla y para perfumes la lista queda vacía; los perfumes presentan mililitros
   * en un bloque distinto, por lo que no se mezclan ambas unidades.
   */
  const tallasDisponibles =
    categoria === "Anillo"
      ? TALLAS_ANILLO
      : categoria === "Cadena"
      ? TALLAS_CADENA
      : categoria === "Pulsera"
      ? TALLAS_PULSERA
      : [];

  /* ---------- PERFUME ---------- */
  /*
   * Campos que solo se usan para perfumes. Se conservan en estado mientras se edita
   * el formulario, pero solo se adjuntan al producto si la categoría seleccionada
   * sigue siendo Perfume al guardar.
   */
  const [mlSeleccionados, setMlSeleccionados] = useState<string[]>([]);
  const [salida, setSalida] = useState("");
  const [corazon, setCorazon] = useState("");
  const [fondo, setFondo] = useState("");

  /* ===================== PERMISOS ===================== */
  /**
   * Solicita al sistema operativo el permiso de cámara.
   * Se limpia cualquier error anterior y se marca la solicitud como activa para
   * deshabilitar acciones repetidas. El finally siempre libera ese estado, incluso
   * si Expo rechaza la petición.
   */
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

  /**
   * Lleva a los ajustes del sistema cuando `canAskAgain` es falso.
   * El usuario puede habilitar allí el permiso; si el sistema no permite abrir
   * ajustes desde la app, se conserva un mensaje visible en lugar de fallar en silencio.
   */
  async function abrirAjustes() {
    try {
      await Linking.openSettings();
    } catch {
      setError("No se pudieron abrir los ajustes del dispositivo automáticamente.");
    }
  }

  /* ===================== CÁMARA ===================== */
  /**
   * Captura una imagen y avanza únicamente si CameraView devuelve una URI.
   * La guarda evita usar una ref inexistente o iniciar dos capturas simultáneas;
   * el catch comunica fallos de cámara y finally vuelve a habilitar el botón.
   */
  async function tomarFoto() {
    if (!camaraRef.current || capturando) return;
    setCapturando(true);
    setError("");
    try {
      const foto = await camaraRef.current.takePictureAsync({ quality: 0.7 });
      // Solo se cambia de etapa si la captura produjo una ruta que Image pueda mostrar.
      if (foto?.uri) {
        setFotoUri(foto.uri);
        setFase("previsualizacion");
      }
    } catch {
      setError("No se pudo tomar la foto. Intenta de nuevo.");
    } finally {
      setCapturando(false);
    }
  }

  /* ===================== GALERÍA ===================== */
  /**
   * Abre la galería como alternativa a la cámara.
   * Si se deniega el permiso, se informa y se termina sin abrir el selector; si se
   * cancela la selección, la etapa actual se conserva. Una URI válida lleva a vista previa.
   */
  async function elegirDeGaleria() {
    setError("");
    try {
      const permisoGaleria = await ImagePicker.requestMediaLibraryPermissionsAsync();
      // La selección no puede continuar sin acceso autorizado a la biblioteca de medios.
      if (!permisoGaleria.granted) {
        setError("Necesitamos permiso para acceder a la galería.");
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      // Cancelar no modifica la imagen previa; solo una selección completa avanza de etapa.
      if (!resultado.canceled && resultado.assets?.[0]?.uri) {
        setFotoUri(resultado.assets[0].uri);
        setFase("previsualizacion");
      }
    } catch {
      setError("No se pudo abrir la galería. Intenta de nuevo.");
    }
  }

  /**
   * Descarta la selección actual y limpia su URI para no enviar una foto rechazada.
   * Se vuelve a la etapa de cámara, donde también permanece disponible la galería.
   */
  function rechazarFoto() {
    setFotoUri(null);
    setFase("camara");
  }

  /**
   * Acepta la foto en vista previa y permite completar los datos del producto.
   * La URI no se transforma aquí: App la persistirá después de que el formulario sea válido.
   */
  function aceptarFoto() {
    setFase("formulario");
  }

  /* ===================== HELPERS DE TOGGLE ===================== */
  /**
   * Alterna una talla usando el estado anterior para evitar cierres obsoletos.
   * Si ya estaba seleccionada la elimina; de lo contrario la agrega al final.
   */
  function toggleTalla(talla: string) {
    setTallasSeleccionadas((prev) =>
      prev.includes(talla) ? prev.filter((t) => t !== talla) : [...prev, talla]
    );
  }

  /**
   * Alterna un tamaño de perfume con la misma regla de selección de tallas.
   * La lista funcional siempre se deriva del estado anterior y no contiene duplicados.
   */
  function toggleMl(ml: string) {
    setMlSeleccionados((prev) =>
      prev.includes(ml) ? prev.filter((m) => m !== ml) : [...prev, ml]
    );
  }

  /**
   * Convierte una cadena de notas en valores listos para almacenar.
   * Cada segmento se recorta y se descartan los vacíos, por ejemplo comas
   * consecutivas o espacios al final del campo.
   */
  function parsearNotas(texto: string): string[] {
    return texto
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
  }

  /* ===================== GUARDAR ===================== */
  /**
   * Valida y envía el producto a App para persistirlo.
   *
   * Las validaciones se ejecutan antes de activar el estado de guardado para que
   * el usuario pueda corregir el formulario. Durante la escritura, el botón queda
   * bloqueado; el formulario solo se reinicia si el callback confirma el guardado.
   */
  async function guardarProducto() {
    // Bloqueo temprano: evita que pulsaciones rápidas creen más de un registro.
    if (guardando) return;
    if (!fotoUri) {
      setError("No hay foto para guardar.");
      return;
    }
    // Los datos comunes se validan para todas las categorías antes de calcular el precio.
    if (!nombre.trim() || !descripcion.trim() || !precio.trim()) {
      Alert.alert("Campos incompletos", "Completa nombre, descripción y precio.");
      return;
    }
    if (!categoria) {
      Alert.alert("Falta categoría", "Selecciona la categoría del producto.");
      return;
    }

    // Se aceptan separadores introducidos por el usuario, pero el cálculo usa solo dígitos.
    const numero = Number(precio.replace(/[^0-9]/g, ""));
    if (!numero) {
      Alert.alert("Precio inválido", "Ingresa un precio numérico válido.");
      return;
    }

    /*
     * Reglas condicionales según el tipo de producto: joyería física requiere
     * al menos una talla; perfume requiere tamaño y sus tres grupos de notas.
     * Se detiene en el primer error para que el mensaje señale qué corregir.
     */
    if (
      (categoria === "Anillo" || categoria === "Cadena" || categoria === "Pulsera") &&
      tallasSeleccionadas.length === 0
    ) {
      Alert.alert("Faltan tallas", "Selecciona al menos una talla disponible.");
      return;
    }

    if (categoria === "Perfume") {
      if (mlSeleccionados.length === 0) {
        Alert.alert("Faltan mililitros", "Selecciona al menos un tamaño.");
        return;
      }
      if (!salida.trim() || !corazon.trim() || !fondo.trim()) {
        Alert.alert(
          "Pirámide incompleta",
          "Completa las notas de salida, corazón y fondo (separadas por coma)."
        );
        return;
      }
    }

    // A partir de aquí comienza la operación asíncrona que persiste la imagen y el producto.
    setGuardando(true);
    setError("");
    try {
      const precioFormateado =
        "$ " + numero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

      const base: ProductoConImagen = {
        id: `img-${Date.now()}`,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        precio: precioFormateado,
        imagenUri: fotoUri,
        categoria,
        material: material.trim() || undefined,
      };

      /*
       * Las propiedades opcionales se adjuntan según la categoría.
       * Esto evita enviar tallas a un perfume y evita guardar notas aromáticas
       * en un anillo, cadena u otra pieza de joyería.
       */
      if (categoria === "Perfume") {
        base.genero = genero;
        base.mililitros = mlSeleccionados;
        base.piramide = {
          salida: parsearNotas(salida),
          corazon: parsearNotas(corazon),
          fondo: parsearNotas(fondo),
        };
      } else {
        base.tallas = tallasSeleccionadas;
      }

      /*
       * App puede tardar al copiar la foto y guardar el catálogo. Se espera ese
       * resultado para no borrar el formulario antes de confirmar la persistencia.
       */
      await onGuardarProducto(base);

      /*
       * Este bloque solo se alcanza si el callback termina correctamente.
       * Limpia todos los campos específicos y devuelve el flujo a cámara para
       * que el siguiente producto empiece sin datos del registro anterior.
       */
      setFotoUri(null);
      setNombre("");
      setDescripcion("");
      setPrecio("");
      setCategoria(null);
      setMaterial("");
      setGenero("Unisex");
      setTallasSeleccionadas([]);
      setMlSeleccionados([]);
      setSalida("");
      setCorazon("");
      setFondo("");
      setFase("camara");
    } catch (error) {
      // En un fallo se conserva la foto y los campos para permitir corregir o reintentar.
      console.error("No se pudo guardar el producto:", error);
      setError(
        error instanceof Error
          ? `No se pudo guardar el producto: ${error.message}`
          : "No se pudo guardar el producto. Intenta de nuevo."
      );
    } finally {
      setGuardando(false);
    }
  }

  /*
   * FASE FORMULARIO: retorno temprano cuando ya existe una foto aceptada.
   * Las secciones de tallas y perfume se muestran de forma condicional según
   * la categoría, de modo que no se mezclan campos de productos distintos.
   */
  if (fase === "formulario" && fotoUri) {
    // Estas banderas controlan los campos específicos que aparecen en la etapa de registro.
    const esPerfume = categoria === "Perfume";
    const muestraTallas =
      categoria === "Anillo" || categoria === "Cadena" || categoria === "Pulsera";

    return (
      <KeyboardAvoidingView
        style={s.panelTeclado}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
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
          <Pressable
            style={s.botonVolverMejorado}
            onPress={() => setFase("previsualizacion")}
          >
            <Text style={s.textoBotonVolverMejorado}>← Volver a la foto</Text>
          </Pressable>

          <Text style={s.titulo}>Registrar producto</Text>
          <Text style={s.textoInfo}>
            Completa los datos del producto fotografiado.
          </Text>

          <Image
            source={{ uri: fotoUri }}
            style={s.previsualizacion}
            resizeMode="cover"
          />

          {/* Nombre */}
          <Text style={s.etiquetaCampo}>Nombre del producto</Text>
          <TextInput
            style={s.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Ej: Anillo de oro 18k"
            placeholderTextColor="#6F7F74"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => descripcionRef.current?.focus()}
          />

          {/* Descripción */}
          <Text style={s.etiquetaCampo}>Descripción</Text>
          <TextInput
            ref={descripcionRef}
            style={[s.input, s.inputMultilinea]}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Describe el producto..."
            placeholderTextColor="#6F7F74"
            multiline
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => precioRef.current?.focus()}
          />

          {/* Precio */}
          <Text style={s.etiquetaCampo}>Precio (COP)</Text>
          <TextInput
            ref={precioRef}
            style={s.input}
            value={precio}
            onChangeText={setPrecio}
            placeholder="Ej: 1500000"
            placeholderTextColor="#6F7F74"
            keyboardType="numeric"
            returnKeyType="done"
            onFocus={() =>
              setTimeout(
                () => scrollFormularioRef.current?.scrollToEnd({ animated: true }),
                250
              )
            }
          />

          {/* Categoría */}
          <Text style={s.etiquetaCampo}>Categoría</Text>
          <View style={s.filaChips}>
            {/*
             * Cada categoría se representa como una opción seleccionable. Al cambiarla
             * se limpian tallas y mililitros anteriores porque podrían no ser válidos
             * para el nuevo tipo de producto.
             */}
            {CATEGORIAS.map((cat) => {
              const activa = categoria === cat;
              return (
                <Pressable
                  key={cat}
                  style={[s.chip, activa && s.chipActivo]}
                  onPress={() => {
                    setCategoria(cat);
                    setTallasSeleccionadas([]);
                    setMlSeleccionados([]);
                  }}
                >
                  <Text style={[s.textoChip, activa && s.textoChipActivo]}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* El material describe joyería; en perfumes se oculta para mostrar notas y tamaños. */}
          {categoria && !esPerfume && (
            <>
              <Text style={s.etiquetaCampo}>Material (opcional)</Text>
              <TextInput
                style={s.input}
                value={material}
                onChangeText={setMaterial}
                placeholder="Ej: Oro 18k, Plata 925, Platino"
                placeholderTextColor="#6F7F74"
              />
            </>
          )}

          {/*
           * Solo anillos, cadenas y pulseras requieren talla. El mapa construye un chip
           * por opción disponible y el estado visual refleja si esa talla está seleccionada.
           */}
          {muestraTallas && (
            <>
              <Text style={s.etiquetaCampo}>
                Tallas disponibles ({categoria})
              </Text>
              <View style={s.filaChips}>
                {tallasDisponibles.map((t) => {
                  const activa = tallasSeleccionadas.includes(t);
                  return (
                    <Pressable
                      key={t}
                      style={[s.chip, activa && s.chipActivo]}
                      onPress={() => toggleTalla(t)}
                    >
                      <Text style={[s.textoChip, activa && s.textoChipActivo]}>
                        {t}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/*
           * Los campos de perfume se agrupan para que aparezcan juntos solo en esa categoría:
           * género, mililitros y notas de salida, corazón y fondo.
           */}
          {esPerfume && (
            <>
              <Text style={s.etiquetaCampo}>Género</Text>
              <View style={s.filaChips}>
                {GENEROS.map((g) => {
                  const activo = genero === g;
                  return (
                    <Pressable
                      key={g}
                      style={[s.chip, activo && s.chipActivo]}
                      onPress={() => setGenero(g)}
                    >
                      <Text style={[s.textoChip, activo && s.textoChipActivo]}>
                        {g}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={s.etiquetaCampo}>Mililitros disponibles</Text>
              <View style={s.filaChips}>
                {ML_PERFUME.map((ml) => {
                  const activo = mlSeleccionados.includes(ml);
                  return (
                    <Pressable
                      key={ml}
                      style={[s.chip, activo && s.chipActivo]}
                      onPress={() => toggleMl(ml)}
                    >
                      <Text style={[s.textoChip, activo && s.textoChipActivo]}>
                        {ml}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={s.etiquetaCampo}>
                Notas de salida (separadas por coma)
              </Text>
              <TextInput
                style={s.input}
                value={salida}
                onChangeText={setSalida}
                placeholder="Ej: Bergamota, Limón, Pimienta rosa"
                placeholderTextColor="#6F7F74"
              />

              <Text style={s.etiquetaCampo}>
                Notas de corazón (separadas por coma)
              </Text>
              <TextInput
                style={s.input}
                value={corazon}
                onChangeText={setCorazon}
                placeholder="Ej: Rosa, Jazmín, Lavanda"
                placeholderTextColor="#6F7F74"
              />

              <Text style={s.etiquetaCampo}>
                Notas de fondo (separadas por coma)
              </Text>
              <TextInput
                style={s.input}
                value={fondo}
                onChangeText={setFondo}
                placeholder="Ej: Ámbar, Sándalo, Vainilla"
                placeholderTextColor="#6F7F74"
              />
            </>
          )}

          <Pressable
            style={[s.boton, guardando && s.botonDeshabilitado]}
            onPress={guardarProducto}
            disabled={guardando}
            accessibilityRole="button"
            accessibilityState={{ disabled: guardando, busy: guardando }}
          >
            <Text style={s.textoBoton}>
              {guardando ? "⏳ Guardando…" : "💾 Guardar producto"}
            </Text>
          </Pressable>

          {!!error && <Text style={s.textoError}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /*
   * FASE PREVISUALIZACIÓN: se muestra solo si hay una foto pendiente de aceptación.
   * Rechazarla elimina la URI y vuelve a cámara; aceptarla conserva la URI y abre el formulario.
   */
  if (fase === "previsualizacion" && fotoUri) {
    return (
      <ScrollView style={s.panel} contentContainerStyle={{ paddingBottom: 24 }}>
        <Pressable style={s.botonVolverMejorado} onPress={rechazarFoto}>
          <Text style={s.textoBotonVolverMejorado}>← Volver a la cámara</Text>
        </Pressable>

        <Text style={s.titulo}>¿Usar esta foto?</Text>
        <Text style={s.textoInfo}>
          Acepta para registrar el producto o rechaza para tomar otra foto.
        </Text>

        <Image
          source={{ uri: fotoUri }}
          style={s.previsualizacion}
          resizeMode="cover"
        />

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

  /*
   * FASE CÁMARA: es el estado de retorno cuando no hay formulario ni una foto
   * pendiente de revisar. Los permisos determinan si se muestra carga, solicitud,
   * instrucciones de ajustes o la vista CameraView con sus controles.
   */
  return (
    <ScrollView style={s.panel} contentContainerStyle={{ paddingBottom: 24 }}>
      <Pressable style={s.botonVolverMejorado} onPress={onCerrar}>
        <Text style={s.textoBotonVolverMejorado}>← Volver</Text>
      </Pressable>

      <Text style={s.titulo}>Exploración de cámara</Text>
      <Text style={s.textoInfo}>
        Toma una foto del producto o elige una de tu galería para registrarlo en
        "Productos con Imagen".
      </Text>

      {/* Botón galería SIEMPRE visible */}
      <Pressable style={s.botonGaleria} onPress={elegirDeGaleria}>
        <Text style={s.textoBotonGaleria}>🖼️ Elegir desde galería</Text>
      </Pressable>

      {/*
       * Árbol de estados del permiso:
       * 1. `null`: Expo todavía está consultando el permiso.
       * 2. Sin permiso: mostrar solicitud o acceso a ajustes según `canAskAgain`.
       * 3. Con permiso y sin error: montar la cámara y permitir captura.
       * La galería permanece disponible en todos los estados.
       */}
      {/* La cámara física solo se monta con permiso; onMountError conserva un mensaje visible. */}
      {!permiso ? (
        <Text style={s.textoInfo}>Comprobando permiso...</Text>
      ) : !permiso.granted ? (
        <View style={s.tarjetaEstado}>
          <Text style={s.tituloEstado}>
            {permiso.status === "denied"
              ? "⚠️ Permiso de cámara denegado"
              : "Permiso pendiente"}
          </Text>
          <Text style={s.textoInfo}>
            Necesitamos la cámara para fotografiar productos. También puedes usar
            la galería.
          </Text>

          {/* Si se puede preguntar de nuevo, se ofrece el botón de permiso; si no, ajustes. */}
          {permiso.canAskAgain ? (
            <Pressable style={s.boton} disabled={solicitando} onPress={solicitar}>
              <Text style={s.textoBoton}>
                {solicitando ? "Solicitando..." : "Permitir cámara"}
              </Text>
            </Pressable>
          ) : (
            <View>
              <Text style={s.textoInfo}>
                El permiso fue denegado. Puedes habilitarlo en la configuración
                de la app:
              </Text>
              <Pressable style={s.botonAjustes} onPress={abrirAjustes}>
                <Text style={s.textoBotonAjustes}>
                  ⚙️ Abrir Ajustes del Dispositivo
                </Text>
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
          <View>
            <CameraView
              ref={camaraRef}
              style={s.camara}
              facing={frontal ? "front" : "back"}
              onMountError={() =>
                setError(
                  "No se pudo abrir la cámara. Cierra y revisa otra app que la use."
                )
              }
            />
            <View style={s.marcoCamara} pointerEvents="none">
              <View style={[s.esquina, s.esquinaTL]} />
              <View style={[s.esquina, s.esquinaTR]} />
              <View style={[s.esquina, s.esquinaBL]} />
              <View style={[s.esquina, s.esquinaBR]} />
              <Text style={s.marcoTexto}>ENCUADRA LA JOYA</Text>
            </View>
          </View>
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

/* ===================== ESTILOS ===================== */
/** Estilos de cámara, vista previa, teclado y formulario con la paleta Luxor. */
const s = StyleSheet.create({
  panelTeclado: { flex: 1, minHeight: 0, backgroundColor: "#050E0B" },
  panel: { flex: 1, padding: 16, minHeight: 0, backgroundColor: "#050E0B" },
  titulo: {
    fontSize: 22,
    fontWeight: "700",
    marginVertical: 12,
    color: "#D7B56D",
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  botonVolverMejorado: {
    padding: 12,
    marginVertical: 8,
    backgroundColor: "#0D1D17",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#D7B56D",
  },
  textoBotonVolverMejorado: {
    color: "#D7B56D",
    fontWeight: "800",
    textAlign: "center",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  tarjetaEstado: {
    backgroundColor: "#0D1D17",
    padding: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#22372E",
    marginVertical: 12,
  },
  tituloEstado: {
    color: "#D7B56D",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  boton: {
    padding: 12,
    marginVertical: 8,
    backgroundColor: "#D7B56D",
    borderRadius: 4,
    flex: 1,
  },
  botonDeshabilitado: { backgroundColor: "#3C5A4D", opacity: 0.7 },
  botonSecundario: {
    padding: 10,
    marginVertical: 6,
    backgroundColor: "#0D1D17",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#22372E",
  },
  textoBotonSecundario: {
    color: "#93A096",
    fontWeight: "700",
    textAlign: "center",
  },
  textoBoton: { color: "#07130F", fontWeight: "900", textAlign: "center", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12 },
  botonAjustes: {
    padding: 12,
    marginVertical: 10,
    backgroundColor: "#2E7D5F",
    borderRadius: 4,
  },
  textoBotonAjustes: {
    color: "#FFFFFF",
    fontWeight: "800",
    textAlign: "center",
  },
  botonGaleria: {
    padding: 12,
    marginVertical: 8,
    backgroundColor: "#0D1D17",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#D7B56D",
  },
  textoBotonGaleria: {
    color: "#D7B56D",
    fontWeight: "800",
    textAlign: "center",
  },
  textoInfo: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
    marginVertical: 4,
  },
  textoInfoSecundario: { color: "#93A096", fontSize: 12, marginTop: 8 },
  textoError: {
    color: "#EE9AA8",
    fontSize: 14,
    marginVertical: 8,
    fontWeight: "600",
  },
  camara: { height: 320, marginTop: 12, borderRadius: 4, overflow: "hidden" },
  previsualizacion: {
    width: "100%",
    height: 320,
    borderRadius: 4,
    marginVertical: 12,
    backgroundColor: "#0D1D17",
  },
  marcoCamara: { position: "absolute", top: 12, left: 0, right: 0, height: 320, alignItems: "center", justifyContent: "flex-end" },
  esquina: { position: "absolute", width: 34, height: 34, borderColor: "#D7B56D" },
  esquinaTL: { top: 18, left: 18, borderTopWidth: 2, borderLeftWidth: 2 },
  esquinaTR: { top: 18, right: 18, borderTopWidth: 2, borderRightWidth: 2 },
  esquinaBL: { bottom: 18, left: 18, borderBottomWidth: 2, borderLeftWidth: 2 },
  esquinaBR: { bottom: 18, right: 18, borderBottomWidth: 2, borderRightWidth: 2 },
  marcoTexto: { color: "#F2E2B6", fontSize: 10, letterSpacing: 4, fontWeight: "800", marginBottom: 22, textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  filaBotones: { flexDirection: "row", gap: 10, marginTop: 8 },
  botonRechazar: { backgroundColor: "#E58A94" },
  botonAceptar: { backgroundColor: "#5FBF99" },
  etiquetaCampo: {
    color: "#D7B56D",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 6,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#0D1D17",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#22372E",
    color: "#FFFFFF",
    padding: 12,
    fontSize: 14,
  },
  inputMultilinea: { minHeight: 80, textAlignVertical: "top" },
  filaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 6,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: "#0D1D17",
    borderWidth: 1,
    borderColor: "#22372E",
  },
  chipActivo: { backgroundColor: "#D7B56D", borderColor: "#A8863F" },
  textoChip: { color: "#93A096", fontWeight: "700", fontSize: 12 },
  textoChipActivo: { color: "#050E0B" },
});