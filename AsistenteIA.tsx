import { useEffect, useRef, useState } from 'react';
import type { Intencion } from './modeloIA';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image,
  Animated, Easing, Platform, useWindowDimensions,
} from 'react-native';
import { clasificar } from './modeloIA';

/** Campos del producto que el asistente puede mostrar al consultar el catálogo. */
type Producto = {
  id?: string; nombre?: string; precio?: string | number; descripcion?: string;
  categoria?: string; imagenUri?: string;
};
/** Datos que App entrega al asistente; en favoritos le pasa los productos asociados. */
type Props = { productos: Producto[] };

/** Etiquetas visibles para las intenciones declaradas en modeloIA.js. */
const ETIQUETAS: Record<Intencion, string> = { nombre: 'Nombre', precio: 'Precio', descripcion: 'Descripción' };
/** Preguntas rápidas que llaman directamente al flujo consultar. */
const SUGERENCIAS = ['¿Cuánto cuesta?', '¿Cómo se llama?', 'Dame los detalles'];

/** Barra reutilizada en el panel de razonamiento para presentar el puntaje de cada intención. */
function BarraSimilitud({ etiqueta, valor, ganadora }: { etiqueta: string; valor: number; ganadora: boolean }) {
  // La barra comienza vacía y vuelve a animarse cuando cambia el puntaje de esa intención.
  const ancho = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Los puntajes se limitan a 1 porque el ancho visual representa un rango de 0 a 100 %.
    Animated.timing(ancho, { toValue: Math.min(valor, 1), duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [valor]);
  return (
    <View style={s.barraFila}>
      <Text style={[s.barraEtiqueta, ganadora && s.barraEtiquetaGanadora]}>{etiqueta}</Text>
      <View style={s.barraRiel}>
        <Animated.View
          style={[s.barraRelleno, ganadora && s.barraRellenoGanadora,
            // Interpola el valor numérico a porcentaje para que la barra sea adaptable al ancho disponible.
            { width: ancho.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
        />
      </View>
      <Text style={[s.barraValor, ganadora && s.barraEtiquetaGanadora]}>{valor.toFixed(2)}</Text>
    </View>
  );
}

/**
 * Asistente local invocado por App.
 *
 * Conserva la pregunta, el producto activo y el resultado de la clasificación. No consulta
 * servicios externos: obtiene el valor solicitado directamente de `productos` y solo usa
 * el clasificador local para interpretar si se pidió nombre, precio o descripción.
 */
export default function AsistenteIA({ productos }: Props) {
  /*
   * Estado de la interacción: pregunta y respuesta visibles, índice del producto que
   * se está consultando y opciones manuales para las preguntas que el modelo no resuelve.
   * `indice` se mantiene aunque cambie la pregunta para que el usuario controle el producto.
   */
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [indice, setIndice] = useState(0);
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  /*
   * `ranking` conserva todos los puntajes para explicar la decisión; `ganadora` marca
   * la intención que superó los umbrales del clasificador. Un ranking puede existir
   * aunque no haya una ganadora cuando las puntuaciones son bajas o muy parecidas.
   */
  const [ranking, setRanking] = useState<[Intencion, number][]>([]);
  const [ganadora, setGanadora] = useState<Intencion | null>(null);
  const aparece = useRef(new Animated.Value(0)).current;
  /*
   * El formulario cambia a disposición horizontal desde 600 px. El índice usa módulo
   * para recorrer la lista circularmente; Math.max evita dividir por cero si no hay productos.
   */
  const { width } = useWindowDimensions();
  const producto = productos[indice % Math.max(productos.length, 1)];

  /*
   * La animación solo se ejecuta cuando hay respuesta: reinicia opacidad y posición,
   * y luego muestra el resultado con un fundido. La guarda evita animar la vista vacía
   * cada vez que se monta el componente.
   */
  useEffect(() => {
    if (!respuesta) return;
    aparece.setValue(0);
    Animated.timing(aparece, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [respuesta]);

  /** Devuelve un valor legible del catálogo o explica que ese campo no está registrado. */
  function datoVerificable(intencion: Intencion) {
    const valor = producto?.[intencion];
    return valor === undefined || valor === null || String(valor).trim() === ''
      ? 'Dato no registrado en el catálogo.' : String(valor);
  }

  /** Permite elegir un campo manualmente cuando el clasificador no encuentra una intención clara. */
  function consultarManualmente(intencion: Intencion) {
    setMostrarOpciones(false);
    setRanking([]);
    setRespuesta(`${ETIQUETAS[intencion]} seleccionado manualmente:\nDato del catálogo: ${datoVerificable(intencion)}`);
  }

  /** Clasifica la pregunta, maneja negaciones y ambigüedad, y forma la respuesta con datos del producto. */
  function consultar(textoPregunta?: string) {
    const q = textoPregunta ?? pregunta;
    setRanking([]); setGanadora(null);
    // Primero se validan entradas y contexto para no clasificar una consulta vacía
    // ni intentar leer datos cuando App no entregó productos.
    if (!q.trim()) { setMostrarOpciones(false); setRespuesta('Escribe una pregunta antes de consultar.'); return; }
    if (!producto) { setMostrarOpciones(false); setRespuesta('No hay productos disponibles en los datos recibidos.'); return; }

    // La normalización iguala acentos y mayúsculas al buscar negaciones y palabras clave.
    const texto = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hayNegacion = /\b(no|nunca|sin)\b/.test(texto);
    const palabrasPorCampo = {
      precio: ['precio', 'costo', 'coste', 'cuesta', 'valor', 'importe', 'monto', 'tarifa'],
      nombre: ['nombre', 'llama', 'denominacion', 'titulo', 'articulo'],
      descripcion: ['descripcion', 'caracteristicas', 'detalles', 'detalles', 'describe', 'material'],
    };
    // Si hay negación, se detecta el campo que la acompaña antes de llamar al modelo;
    // así, "no me digas el precio" no se interpreta como una petición de precio.
    const negada = hayNegacion
      ? (['precio', 'nombre', 'descripcion'] as const).find((campo) => palabrasPorCampo[campo].some((palabra) => texto.includes(palabra)))
      : undefined;

    /*
     * La negación se trata como una regla determinista. Se excluye únicamente el campo
     * solicitado en negativo y se presentan los otros dos datos del mismo producto;
     * se retorna aquí para evitar que el clasificador sobrescriba ese sentido.
     */
    if (negada) {
      const camposRestantes = (['nombre', 'precio', 'descripcion'] as const).filter((campo) => campo !== negada);
      const datosRestantes = camposRestantes.map((campo) => `${ETIQUETAS[campo]}: ${datoVerificable(campo)}`).join('\n');
      setMostrarOpciones(false);
      setRespuesta(`Entendido: no mostraré el ${negada}. Otros datos del producto:\n${datosRestantes}`);
      return;
    }

    const r = clasificar(q);
    setRanking(r.ranking);
    // Si no hay intención suficientemente clara, se ofrecen botones para que la persona
    // elija el campo directamente en vez de mostrar una respuesta potencialmente incorrecta.
    if (!r.intencion) {
      setMostrarOpciones(true);
      setRespuesta('No puedo identificar una sola intención. Elige manualmente qué dato quieres consultar:');
      return;
    }

    // Una intención aceptada identifica qué propiedad consultar en el producto activo.
    setGanadora(r.intencion);
    setMostrarOpciones(false);
    setRespuesta(`Intención: ${r.intencion}. Similitud: ${r.puntuacion.toFixed(2)}.\nDato del catálogo: ${datoVerificable(r.intencion)}`);
  }

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      {/* Cabecera: identifica el asistente y aclara que el modelo es local y didáctico. */}
      <View style={s.cabecera}>
        <Text style={s.titulo}>Asistente de joyería</Text>
        <View style={s.cabeceraLinea}>
          <View style={s.filete} /><Text style={s.rombo}>◆</Text><View style={s.filete} />
        </View>
        <Text style={s.descripcion}>Modelo local didáctico · reconoce nombre, precio y descripción</Text>
      </View>

      {/*
       * La tarjeta da contexto a la pregunta. El botón avanza al siguiente producto
       * y limpia cualquier respuesta anterior para no mezclar datos de dos artículos.
       * El incremento se conserva en estado y el índice circular se calcula arriba.
       */}
      <View style={s.tarjetaProducto}>
        {!!producto?.imagenUri && <Image source={{ uri: producto.imagenUri }} style={s.imagenProducto} resizeMode="cover" />}
        <View style={{ flex: 1 }}>
          {!!producto?.categoria && <Text style={s.categoria}>{producto.categoria}</Text>}
          <Text style={s.producto}>{producto?.nombre ?? 'Sin nombre'}</Text>
          <Text style={s.contador}>Producto {productos.length ? (indice % productos.length) + 1 : 0} de {productos.length}</Text>
          <Pressable accessibilityRole="button" style={s.botonSecundario}
            onPress={() => { setIndice(i => i + 1); setRespuesta(''); setRanking([]); setGanadora(null); setMostrarOpciones(false); }}>
            <Text style={s.textoSecundario}>Siguiente producto →</Text>
          </Pressable>
        </View>
      </View>

      {/*
       * Las sugerencias ejecutan la misma función que el botón Consultar, pero sin
       * exigir que el usuario escriba la frase. El campo libre permite otras formulaciones.
       */}
      <Text accessibilityRole="header" style={s.instruccion}>Pregunta por su nombre, precio o descripción</Text>
      <View style={s.filaSugerencias}>
        {SUGERENCIAS.map((sug) => (
          <Pressable key={sug} style={s.chip} onPress={() => { setPregunta(sug); consultar(sug); }}>
            <Text style={s.textoChip}>{sug}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[s.formulario, width >= 600 && s.fila]}>
        {/* Al editar la pregunta se invalida la respuesta anterior para no asociarla con texto nuevo. */}
        <TextInput value={pregunta} onChangeText={t => { setPregunta(t); setRespuesta(''); setRanking([]); setGanadora(null); }}
          placeholder="Ejemplo: ¿cuánto cuesta?" placeholderTextColor="#6F7F74"
          accessibilityLabel="Pregunta sobre el producto seleccionado"
          style={s.entrada} multiline />
        <Pressable accessibilityRole="button" style={s.boton} onPress={() => consultar()}>
          <Text style={s.textoBoton}>Consultar</Text>
        </Pressable>
      </View>

      {/*
       * La respuesta se anuncia para tecnologías de asistencia y se anima solo cuando
       * existe contenido nuevo; antes de consultar se muestra una indicación neutra.
       */}
      <Animated.View style={{ opacity: respuesta ? aparece : 1, transform: [{ translateY: respuesta ? aparece.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) : 0 }] }}>
        <Text style={s.resultado} accessibilityLiveRegion="polite">{respuesta || 'Aquí aparecerá el resultado.'}</Text>
      </Animated.View>

      {/*
       * El panel se monta solo si el modelo entregó puntajes. Se presentan como
       * similitudes para explicar la clasificación, no como porcentajes de confianza.
       */}
      {ranking.length > 0 && (
        <View style={s.panelRazonamiento}>
          <Text style={s.panelTitulo}>Cómo razonó el modelo</Text>
          {ranking.map(([etiqueta, valor]) => (
            <BarraSimilitud key={etiqueta} etiqueta={ETIQUETAS[etiqueta]} valor={valor} ganadora={etiqueta === ganadora} />
          ))}
        </View>
      )}

      {/*
       * Los botones manuales aparecen únicamente si el clasificador no eligió una
       * intención. Cada opción vuelve a consultar el dato del mismo producto activo.
       */}
      {mostrarOpciones && (
        <View style={s.opciones}>
          {(['nombre', 'precio', 'descripcion'] as const).map((opcion) => (
            <Pressable key={opcion} style={s.botonOpcion} onPress={() => consultarManualmente(opcion)}>
              <Text style={s.textoOpcion}>{ETIQUETAS[opcion]}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={s.nota}>La similitud no es un porcentaje de certeza. Los datos provienen del catálogo seleccionado.</Text>
    </ScrollView>
  );
}

/** Fuente de títulos adaptada a la plataforma para mantener una presentación consistente. */
const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
/** Hoja de estilos de la cabecera, tarjeta, formularios, respuestas y barras del asistente. */
const s = StyleSheet.create({
  pantalla: { flex: 1, minHeight: 0, backgroundColor: '#050E0B' },
  contenido: { padding: 4, paddingBottom: 40, gap: 16 },

  cabecera: { alignItems: 'center', gap: 8 },
  titulo: { fontSize: 24, fontWeight: '900', color: '#D7B56D', textAlign: 'center', letterSpacing: 3, textTransform: 'uppercase', fontFamily: SERIF },
  cabeceraLinea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filete: { width: 40, height: 1, backgroundColor: '#D7B56D', opacity: 0.6 },
  rombo: { color: '#D7B56D', fontSize: 8 },
  descripcion: { color: '#93A096', textAlign: 'center', fontSize: 11, letterSpacing: 1 },

  tarjetaProducto: { flexDirection: 'row', gap: 14, padding: 16, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E', borderTopWidth: 2, borderTopColor: '#D7B56D', borderRadius: 4 },
  imagenProducto: { width: 96, height: 96, borderRadius: 2, borderWidth: 1, borderColor: '#D7B56D', backgroundColor: '#07130F' },
  categoria: { color: '#D7B56D', fontSize: 9, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 },
  producto: { fontSize: 17, fontWeight: '800', color: '#F7F1E3', fontFamily: SERIF, letterSpacing: 0.5 },
  contador: { color: '#6F7F74', fontSize: 10, letterSpacing: 1, marginTop: 4, textTransform: 'uppercase' },

  instruccion: { color: '#F7F1E3', fontWeight: '800', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  nota: { color: '#6F7F74', fontStyle: 'italic', fontSize: 11, letterSpacing: 0.5, lineHeight: 17 },

  filaSugerencias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 2, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E' },
  textoChip: { color: '#D7B56D', fontWeight: '700', fontSize: 11, letterSpacing: 0.5 },

  formulario: { gap: 12 }, fila: { flexDirection: 'row', alignItems: 'center' },
  entrada: { flex: 1, minWidth: 0, minHeight: 52, borderWidth: 1, borderColor: '#D7B56D', borderRadius: 2, padding: 12, backgroundColor: '#0D1D17', color: '#F7F1E3', fontSize: 14 },
  boton: { paddingVertical: 15, paddingHorizontal: 26, backgroundColor: '#D7B56D', borderRadius: 2, alignSelf: 'flex-start', shadowColor: '#D7B56D', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  textoBoton: { color: '#07130F', fontWeight: '900', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  botonSecundario: { marginTop: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 2, borderWidth: 1, borderColor: '#D7B56D', alignSelf: 'flex-start' },
  textoSecundario: { color: '#D7B56D', fontWeight: '800', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },

  resultado: { padding: 18, backgroundColor: '#F7F1E3', color: '#07130F', fontSize: 16, lineHeight: 24, borderLeftWidth: 4, borderLeftColor: '#D7B56D', borderRadius: 4, fontFamily: SERIF, overflow: 'hidden' },

  panelRazonamiento: { padding: 16, backgroundColor: '#0D1D17', borderWidth: 1, borderColor: '#22372E', borderRadius: 4, gap: 10 },
  panelTitulo: { color: '#D7B56D', fontSize: 10, fontWeight: '900', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 2 },
  barraFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barraEtiqueta: { width: 92, color: '#93A096', fontSize: 11, letterSpacing: 0.5 },
  barraEtiquetaGanadora: { color: '#F2E2B6', fontWeight: '800' },
  barraRiel: { flex: 1, height: 8, backgroundColor: '#132A22', borderRadius: 4, overflow: 'hidden' },
  barraRelleno: { height: '100%', backgroundColor: '#3C5A4D', borderRadius: 4 },
  barraRellenoGanadora: { backgroundColor: '#D7B56D' },
  barraValor: { width: 38, textAlign: 'right', color: '#93A096', fontSize: 11, fontVariant: ['tabular-nums'] },

  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  botonOpcion: { paddingVertical: 12, paddingHorizontal: 20, backgroundColor: '#D7B56D', borderRadius: 2 },
  textoOpcion: { color: '#07130F', fontWeight: '900', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
});