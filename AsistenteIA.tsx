import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { clasificar } from './modeloIA';

type Producto = { id?: string; nombre?: string; precio?: string | number; descripcion?: string };
type Props = { productos: Producto[] };
export default function AsistenteIA({ productos }: Props) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [indice, setIndice] = useState(0);
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const { width } = useWindowDimensions();
  const producto = productos[indice % Math.max(productos.length, 1)];
  function datoVerificable(intencion: 'nombre' | 'precio' | 'descripcion') {
    const valor = producto?.[intencion];
    return valor === undefined || valor === null || String(valor).trim() === ''
      ? 'Dato no registrado en el catálogo.' : String(valor);
  }

  // MEJORA 7: el usuario puede elegir manualmente qué dato consultar si el modelo está dudoso.
  function consultarManualmente(intencion: 'nombre' | 'precio' | 'descripcion') {
    const etiquetas = { nombre: 'Nombre', precio: 'Precio', descripcion: 'Descripción' };
    setMostrarOpciones(false);
    setRespuesta(`${etiquetas[intencion]} seleccionado manualmente:\nDato del catálogo: ${datoVerificable(intencion)}`);
  }

  function consultar() {
    if (!pregunta.trim()) { setMostrarOpciones(false); setRespuesta('Escribe una pregunta antes de consultar.'); return; }
    if (!producto) { setMostrarOpciones(false); setRespuesta('No hay productos disponibles en los datos recibidos.'); return; }

    const texto = pregunta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const hayNegacion = /\b(no|nunca|sin)\b/.test(texto);
    const palabrasPorCampo = {
      precio: ['precio', 'costo', 'coste', 'cuesta', 'valor', 'importe', 'monto', 'tarifa'],
      nombre: ['nombre', 'llama', 'denominacion', 'titulo', 'articulo'],
      descripcion: ['descripcion', 'caracteristicas', 'detalles', 'detalles', 'describe', 'material'],
    };
    const negada = hayNegacion
      ? (['precio', 'nombre', 'descripcion'] as const).find((campo) => palabrasPorCampo[campo].some((palabra) => texto.includes(palabra)))
      : undefined;

    // MEJORA NEGACIÓN: oculta solo el dato rechazado y muestra los otros dos del mismo producto.
    if (negada) {
      const camposRestantes = (['nombre', 'precio', 'descripcion'] as const).filter((campo) => campo !== negada);
      const etiquetas = { nombre: 'Nombre', precio: 'Precio', descripcion: 'Descripción' };
      const datosRestantes = camposRestantes.map((campo) => `${etiquetas[campo]}: ${datoVerificable(campo)}`).join('\n');
      setMostrarOpciones(false);
      setRespuesta(`Entendido: no mostraré el ${negada}. Otros datos del producto:\n${datosRestantes}`);
      return;
    }

    const r = clasificar(pregunta);
    if (!r.intencion) {
      setMostrarOpciones(true);
      setRespuesta('No puedo identificar una sola intención. Elige manualmente qué dato quieres consultar:');
      return;
    }

    setMostrarOpciones(false);
    setRespuesta(`Intención: ${r.intencion}. Similitud: ${r.puntuacion.toFixed(2)}.\nDato del catálogo: ${datoVerificable(r.intencion)}`);
  }
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      {/* MEJORA VISUAL 7: colores alineados con la identidad azul marino, naranja y turquesa de la app. */}
      <Text style={s.titulo}>Asistente de joyería</Text>
      <Text style={s.descripcion}>Modelo local didáctico. Reconoce nombre, precio y descripción.</Text>
      <Text style={s.producto}>Producto seleccionado: {producto?.nombre ?? 'Sin nombre'}</Text>
      <Pressable accessibilityRole="button" style={s.boton} onPress={() => { setIndice(i => i + 1); setRespuesta(''); }}>
        <Text style={s.blanco}>Siguiente producto</Text>
      </Pressable>
      <Text accessibilityRole="header" style={s.instruccion}>Pregunta por su nombre, precio o descripción:</Text>
      <View style={[s.formulario, width >= 600 && s.fila]}>
        <TextInput value={pregunta} onChangeText={t => { setPregunta(t); setRespuesta(''); }}
          placeholder="Ejemplo: ¿cuánto cuesta?" accessibilityLabel="Pregunta sobre el producto seleccionado"
          style={s.entrada} multiline />
        <Pressable accessibilityRole="button" style={s.boton} onPress={consultar}><Text style={s.blanco}>Consultar</Text></Pressable>
      </View>
      <Text style={s.resultado} accessibilityLiveRegion="polite">{respuesta || 'Aquí aparecerá el resultado.'}</Text>
      {/* MEJORA 7 - opciones visibles solo cuando el clasificador no decide con claridad */}
      {mostrarOpciones && (
        <View style={s.opciones}>
          {(['nombre', 'precio', 'descripcion'] as const).map((opcion) => (
            <Pressable key={opcion} style={s.botonOpcion} onPress={() => consultarManualmente(opcion)}>
              <Text style={s.blanco}>{opcion === 'descripcion' ? 'Descripción' : opcion[0].toUpperCase() + opcion.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={s.nota}>La similitud no es un porcentaje de certeza. Los datos provienen del catálogo seleccionado.</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  pantalla: { flex: 1, minHeight: 0, backgroundColor: '#0F172A' },
  contenido: { padding: 16, gap: 16 },
  titulo: { fontSize: 24, fontWeight: '900', color: '#F59E0B', textAlign: 'center' },
  descripcion: { color: '#94A3B8', textAlign: 'center' },
  producto: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  instruccion: { color: '#FFFFFF', fontWeight: '700' },
  nota: { color: '#94A3B8', fontStyle: 'italic' },
  formulario: { gap: 12 }, fila: { flexDirection: 'row', alignItems: 'center' },
  entrada: { flex: 1, minWidth: 0, minHeight: 52, borderWidth: 1, borderColor: '#F59E0B', borderRadius: 8, padding: 12, backgroundColor: '#FFFFFF', color: '#0F172A' },
  boton: { padding: 14, backgroundColor: '#126d80', borderRadius: 8, alignSelf: 'flex-start' },
  blanco: { color: '#FFFFFF', fontWeight: '900' },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  botonOpcion: { paddingVertical: 12, paddingHorizontal: 18, backgroundColor: '#F59E0B', borderRadius: 8 },
  resultado: { padding: 16, backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: 17, borderLeftWidth: 6, borderLeftColor: '#F59E0B', borderRadius: 8 },
});
