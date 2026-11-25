# Documentación del código — Luxor Collection

## Alcance y convenciones

Esta guía describe el código fuente mantenido en la raíz del proyecto y la configuración web. Los comentarios de código están escritos en español y aparecen junto a tipos, constantes, funciones, componentes y grupos de estado para explicar su intención y sus relaciones.

Los archivos `.json` se conservan como JSON válido: el formato JSON no admite comentarios. Por eso, la explicación de sus propiedades está en la sección **Configuración JSON**. No se documentan línea por línea `node_modules`, `dist`, archivos de bloqueo ni recursos binarios; son dependencias, resultados de compilación o imágenes.

## Qué hace la aplicación

Luxor Collection es un catálogo de joyería construido con Expo, React Native y React Native Web. Permite buscar y filtrar productos, guardar favoritos, añadir artículos al carrito, probar un checkout simulado, crear productos con fotos y exportar/importar el catálogo.

La aplicación también incluye un asistente local de preguntas sobre cada producto y una pantalla de sensores. En un teléfono puede leer el acelerómetro; en web usa una simulación por arrastre. Completar el reto visual de brillo desbloquea el cupón `BRILLO10`.

## Inicio y relación entre módulos

```text
index.ts
  └── registra App como componente raíz de Expo
      ├── App.tsx                 estado global y navegación por vistas
      ├── ExploracionCamara.tsx   captura/selección de fotos y registro de productos
      ├── AsistenteIA.tsx         preguntas y respuestas sobre el producto seleccionado
      │   └── modeloIA.js         normalización, similitud y clasificación local
      ├── validacionesCompra.ts   formato y validación de datos del checkout
      └── correoPedido.ts         construcción y envío de confirmaciones EmailJS
```

La navegación se controla mediante estado de React dentro de `App`; no hay un router separado. `App` presenta primero la carga, luego la bienvenida y después una de sus vistas secundarias o la pestaña seleccionada. Los componentes hijos reciben datos y acciones mediante props (callbacks).

## Archivos de código

### `index.ts`

Es el punto de entrada que importa `App` y lo registra con `registerRootComponent` de Expo. La misma entrada sirve para móvil y web.

### `App.tsx`

Es el módulo principal y contiene los tipos compartidos, almacenamiento, reglas comerciales y componentes de pantalla.

#### Tipos y datos

- `Categoria`: conjunto cerrado de categorías admitidas en productos y filtros.
- `PiramideOlfativa`: listas de notas de salida, corazón y fondo de un perfume.
- `Producto`: modelo central, con identificador, nombre, descripción, precio, categoría y propiedades opcionales.
- `ProductoConImagen`: producto que necesariamente incluye una URI de foto; lo recibe el callback de cámara.
- `ProductoFavorito`: versión ligera de un producto que se persiste en la lista de favoritos.
- `Pestana`: opciones de la barra inferior: Catálogo, Favoritos, Sensores y Carrito.
- `ItemCarrito`: copia de un producto con la talla o presentación elegida.
- `Lectura`, `Modo` y `Alerta`: datos del acelerómetro, su fuente (real/simulada) y los avisos.
- `Recibo`: datos finales de cliente, artículos, costos y pedido confirmado.
- `CATALOGO_INICIAL`: catálogo de respaldo usado cuando aún no hay datos locales.
- `CUPONES` y las constantes de envío: reglas locales de compra. El pago es una simulación; no se cobra una tarjeta.

#### Utilidades y persistencia

- `parsePrecio`: elimina símbolos y separadores para usar un precio en cálculos.
- `formatearCOP`: representa un importe en pesos colombianos.
- `inferirCategoria`: propone una categoría según palabras del nombre, principalmente al migrar registros antiguos.
- `abrirAlmacenWeb`, `leerProductosWeb` y `guardarProductosWeb`: abren y consultan IndexedDB para persistir el catálogo web, incluidas imágenes grandes.
- `mimeImagenDesdeUri` y `extensionDesdeMime`: identifican formatos de imagen para convertirlos o guardarlos.
- `imagenPortable`: convierte una URI local, `blob:` o `data:` en una imagen autocontenida para exportación.
- `guardarImagenImportada`: valida la imagen portable y la deja como archivo en móvil o como `data:` URI en web.
- `guardarImagenPermanente`: copia las fotos nuevas de cámara/galería al directorio privado de la app en móvil, para que no dependan de la caché temporal.
- `migrarProductos`: carga el catálogo actual, intenta migrar claves antiguas y usa `CATALOGO_INICIAL` como respaldo.
- `guardarProductosStorage`: normaliza imágenes temporales `blob:`; en web prioriza IndexedDB y usa AsyncStorage como respaldo.
- `cargarFavoritos`: carga la lista moderna o convierte el favorito único de una versión anterior.

Las claves `PRODUCTOS_KEY`, `FAVORITOS_KEY`, `LEGACY_FAVORITO_KEY`, `LEGACY_PRODUCTOS_IMG_KEY` y `CUPON_BRILLO_KEY` identifican los datos de AsyncStorage. En web, AsyncStorage usa almacenamiento del navegador; el catálogo principal se guarda en IndexedDB para evitar el límite pequeño de localStorage.

#### Componentes y llamadas

| Componente | Responsabilidad | Quién lo monta / con qué trabaja |
|---|---|---|
| `App` | Coordina datos, acciones, navegación y vistas. | Lo monta `index.ts`; entrega estado y callbacks a todos los componentes de pantalla. |
| `CargandoLux` | Muestra una animación mientras se carga el almacenamiento. | `App`, antes de mostrar la bienvenida. |
| `PantallaBienvenida` | Presenta la marca y permite entrar al catálogo. | `App`; recibe `onEnter`. |
| `EncabezadoLux` | Dibuja el encabezado con o sin subtítulo compacto. | `App` y `ProductosLista`. |
| `ProductosLista` | Separa productos con/sin imagen, calcula columnas adaptables y prepara tarjetas. | `App` para Catálogo y Favoritos; contiene `Tarjeta`. |
| `Tarjeta` | Muestra producto, foto, favorito, precio y acciones de compra/edición. | `ProductosLista`; recibe callbacks de `App`. |
| `BarraCategorias` | Muestra filtros rápidos y conteos por categoría. | La cabecera fija del Catálogo creada en `App`. |
| `BotonPestana` | Cambia pestañas y muestra insignias de favoritos o carrito. | Barra de navegación inferior de `App`. |
| `DetalleProducto` | Muestra información ampliada, opciones, imagen y acción de compra. | `App`, al seleccionar una tarjeta o producto de sensores. |
| `Vista3D` | Simula giro y zoom de la imagen del producto. | `DetalleProducto`, solo cuando hay una foto y se abre la vista 3D. |
| `EditorProducto` | Edita los campos y la foto de un producto existente. | `App`, después de elegir Editar en una tarjeta. |
| `PantallaCarrito` | Lista las líneas de compra y permite quitarlas o iniciar checkout. | `App`, en la pestaña Carrito. |
| `Checkout` | Valida datos, calcula envío/descuento y confirma el pedido simulado. | `App`, al pulsar Ir al checkout. |
| `ReciboPedido` | Presenta el pedido confirmado y permite descargar/compartir un TXT. | `App`, desde la confirmación del checkout. |
| `ExploracionCamara` | Captura o selecciona foto y crea un producto con formulario. | `App`, mediante el botón Añadir; entrega el resultado a `registrarProductoConImagen`. |
| `AsistenteIA` | Responde preguntas sobre los productos y muestra el ranking del modelo. | `App`, al abrir Asistente IA. |
| `PantallaSensores` | Gestiona acelerómetro o simulación, alertas y vitrina. | `App`, en la pestaña Sensores. |
| `VitrinaBrillo` | Representa el movimiento de la joya, suma destellos y desbloquea el cupón. | `PantallaSensores`; llama a sus callbacks para inclinación, detalle y cupón. |
| `ToastLux` | Muestra un aviso temporal animado. | `App`, cuando una acción produce un mensaje breve. |

#### Acciones principales de `App`

- `actualizarProductos` guarda el catálogo mediante `guardarProductosStorage` y solo después lo muestra en pantalla.
- `actualizarFavoritos` guarda la lista de favoritos.
- `toggleFavorito` agrega o quita un favorito y actualiza el indicador de la tarjeta.
- `agregarAlCarrito` crea una línea con talla/mililitros y muestra un toast; `eliminarDelCarrito` quita una línea.
- `registrarProductoConImagen` adapta el producto entregado por `ExploracionCamara` al tipo central.
- `guardarEdicion`, `eliminarProducto` y `asignarFotoAProducto` realizan acciones de mantenimiento del catálogo.
- `exportarProductos` selecciona los productos marcados, integra sus fotos como `data:` y descarga o comparte el JSON.
- `importarProductos` lee el archivo seleccionado y llama a `importarLista`; esta agrega registros nuevos y, si un ID ya existe, solo actualiza su foto portable para conservar los demás datos del producto.
- `desbloquearCuponBrillo` guarda el desbloqueo y muestra un aviso.
- `productosFiltrados` es una lista derivada por búsqueda, categoría, precio y género; no reemplaza el catálogo original.

Relaciones entre acciones: `Tarjeta` y `DetalleProducto` llaman a `agregarAlCarrito`; la pantalla Carrito llama a `eliminarDelCarrito` o abre `Checkout`. `Checkout` usa `datosCorreoDe`, `pagar`, `enviarCorreo` y las validaciones importadas. Tras confirmar, sus callbacks actualizan `Recibo` en `App`; el botón Ver recibo monta `ReciboPedido`. `ProductosLista` llama a los callbacks de favorito, edición y eliminación que `App` conecta con sus funciones. El botón Exportar abre el modal y su botón de confirmación ejecuta `exportarProductos`; Importar llama a `importarProductos`, que delega el contenido a `importarLista`.

El carrito vive en el estado de `App` durante la sesión. El catálogo y los favoritos se guardan localmente; el cupón de brillo también conserva su estado.

#### Formato para transferir fotos

Las exportaciones nuevas usan un objeto con `version: 3` y una lista `productos`. Cada registro conserva los datos del producto y añade `imagen` con una URI `data:image/...;base64,...`. La foto queda dentro del archivo, a diferencia de una ruta `file:///...` que solo existe en el dispositivo de origen.

Al importar, web conserva la imagen portable y guarda el catálogo en IndexedDB; móvil escribe la imagen en el directorio persistente de la aplicación. Las fotos nuevas de cámara y galería también se copian al directorio privado antes de guardar el producto. Si una foto antigua ya fue eliminada de la caché, la exportación continúa con los demás productos y avisa qué fotos no pudo incluir; hay que volver a asignar esas imágenes desde la galería.

### `ExploracionCamara.tsx`

Componente de creación de productos con imagen. Usa `CameraView` y `useCameraPermissions` de `expo-camera`, además de `expo-image-picker` para la galería.

Su flujo es `camara` → `previsualizacion` → `formulario`. `solicitar` pide permiso; `tomarFoto` captura; `elegirDeGaleria` selecciona; `aceptarFoto` y `rechazarFoto` controlan la vista previa. `toggleTalla` y `toggleMl` administran opciones, `parsearNotas` convierte las notas de perfume a listas y `guardarProducto` valida el formulario, espera a `onGuardarProducto` y solo limpia el formulario después de persistir correctamente. El callback conecta con `App.registrarProductoConImagen`.

El formulario exige foto, nombre, descripción, precio y categoría. Anillos/cadenas/pulseras requieren talla; perfumes requieren tamaño y notas de las tres fases.

### `AsistenteIA.tsx`

Recibe `productos` desde `App` y mantiene la pregunta, respuesta, índice de producto y posibles elecciones manuales. `consultar` llama a `clasificar` de `modeloIA.js`; si el modelo no decide con suficiente claridad, `consultarManualmente` ofrece elegir nombre, precio o descripción. `datoVerificable` obtiene el campo solicitado del producto activo. `BarraSimilitud` anima cada puntuación del `ranking`.

`ETIQUETAS` traduce las intenciones a texto visible y `SUGERENCIAS` ofrece preguntas rápidas. El ranking es una similitud explicativa, no un porcentaje de certeza.

### `modeloIA.js` y `modeloIA.d.ts`

`modeloIA.js` contiene el clasificador local:

- `ejemplos`: frases asociadas a las intenciones precio, nombre y descripción.
- `vacias`: palabras funcionales que se descartan.
- `tokens`: normaliza acentos y puntuación y separa términos.
- `similitud`: calcula similitud coseno entre conjuntos de tokens.
- `clasificar`: calcula el máximo por intención, ordena `ranking` y devuelve la intención solo si supera sus umbrales.

`modeloIA.d.ts` declara los tipos de ese módulo JavaScript para que TypeScript conozca `Intencion`, `ResultadoClasificacion`, los ejemplos y la forma de retorno de `clasificar`. `AsistenteIA` consume ese contrato.

### `validacionesCompra.ts`

Funciones puras utilizadas por `Checkout`; no dependen de componentes ni de almacenamiento:

- `soloDigitos`: limpia números antes de validar o mostrar.
- `emailValido`, `telefonoValido`: comprueban correo y teléfono colombiano.
- `marcaTarjeta`, `formatearTarjeta`: reconocen Visa/Mastercard/Amex y agrupan dígitos.
- `luhnValido`, `tarjetaValida`: verifican checksum y longitud de tarjeta.
- `formatearVence`, `vencimientoValido`: editan y validan vencimiento `MM/AA`.
- `cvvValido`: verifica 3 dígitos o 4 para Amex.
- `ultimos4`: produce la parte segura que se muestra en el resumen del método de pago.

`Checkout` importa estas funciones para validar cada paso antes de avanzar o simular el pago.

### `correoPedido.ts`

Construye el contenido de confirmación y llama a EmailJS:

- `DatosCorreo`, `LineaPedido`, `ConfigCorreo` y `ResultadoCorreo` describen entrada, configuración y salida.
- `CONFIG_CORREO` lee variables `EXPO_PUBLIC_EMAILJS_*` y `EXPO_PUBLIC_CORREO_TIENDA`.
- `correoConfigurado` verifica la configuración mínima.
- `textoPedido` y `htmlPedido` generan las versiones de texto y HTML del resumen.
- `parametros` prepara las variables que espera la plantilla EmailJS.
- `mensajeDeError` traduce estados HTTP a mensajes de ayuda.
- `enviarUno` envía una plantilla con timeout.
- `enviarCorreoPedido` manda confirmación al cliente y, si corresponde, copia a la tienda.
- `construirMailto` crea una alternativa para abrir el cliente de correo local.

`Checkout` llama a `enviarCorreoPedido` al confirmar. Si el envío automático falla, ofrece reintento o `construirMailto`. Los valores `EXPO_PUBLIC_*` se incorporan al bundle del cliente; no deben tratarse como secretos.

Variables leídas desde `.env`:

- `EXPO_PUBLIC_EMAILJS_SERVICE_ID`: identificador del servicio EmailJS.
- `EXPO_PUBLIC_EMAILJS_TEMPLATE_ID`: identificador de la plantilla del pedido.
- `EXPO_PUBLIC_EMAILJS_PUBLIC_KEY`: clave pública de EmailJS.
- `EXPO_PUBLIC_EMAILJS_PRIVATE_KEY`: el código la adjunta como `accessToken` opcional; al llevar prefijo `EXPO_PUBLIC_`, queda visible en el bundle y no debe considerarse privada.
- `EXPO_PUBLIC_CORREO_TIENDA`: dirección opcional que recibe una copia de la venta.

## Configuración JSON

JSON estricto no acepta comentarios. Estos archivos se dejan intactos en formato y se explican aquí:

- `package.json`: nombre y versión de la app, punto de entrada (`index.ts`), dependencias de Expo/React Native y scripts `start`, `android`, `ios` y `web`.
- `package-lock.json`: archivo generado por npm que fija versiones exactas e integridad de dependencias; se actualiza con npm y no se comenta manualmente.
- `app.json`: configuración Expo `name`, `slug`, versión y orientación; rutas de iconos; soporte tablet; icono adaptativo Android; favicon web; plugins y permisos/cadenas de cámara y galería.
- `tsconfig.json`: extiende la configuración base Expo y activa `strict` para TypeScript.
- `public/manifest.json`: metadatos de instalación PWA, nombres, iconos, URL inicial, modo standalone y colores.

`public/index.html` contiene la plantilla web: metadatos, enlace al manifest, favicon, estilos del contenedor a pantalla completa y el elemento `#root` donde Expo monta `App`.

## Ejecución y comprobaciones

Desde la carpeta del proyecto `Luxxor final`:

```powershell
npm run start
```

Para borrar la caché del bundler antes de volver a probar:

```powershell
npx expo start -c
```

Comprobaciones disponibles en este proyecto:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\expo.cmd export --platform web
```
