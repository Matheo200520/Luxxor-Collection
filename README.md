# 💎 Luxor Collection

**Catálogo adaptativo de joyería y perfumería**
Programación para Dispositivos Móviles II · UNIAJC · S841A

Aplicación para Android, iOS y navegador web construida con **React Native, Expo y TypeScript**. Permite explorar un catálogo de joyas y perfumes, registrar productos con fotografía, gestionar favoritos y carrito, simular una compra y transferir productos entre dispositivos mediante archivos JSON portables.

---

## 👥 Autoría y propósito

- **Integrantes:** Matheo López Caicedo y Brayan David Hernández Ruiz — Equipo SynCup.
- **Objetivo:** ofrecer una experiencia sencilla para consultar y administrar un catálogo de joyería y perfumería desde móvil o web.
- **Recorrido principal:** entrar al catálogo, explorar o filtrar productos y registrar una pieza con foto desde **Añadir**.
- **Repositorio:** [Dav09z10/Luxxor-Collection](https://github.com/Dav09z10/Luxxor-Collection).

## ✨ Funcionalidades

| Área | Qué permite hacer |
|---|---|
| 🛍️ Catálogo | Explorar el catálogo inicial de 23 productos en las categorías anillo, cadena, pulsera, aretes, reloj y perfume. |
| 🔎 Búsqueda y filtros | Buscar por texto y filtrar por categoría, precio y género. |
| 📱 Diseño adaptable | Presentar una columna en móvil, dos en pantallas medianas y hasta tres en pantallas amplias. |
| 📸 Productos con foto | Crear productos usando la cámara o la galería; editar, asignar o cambiar una foto y eliminar productos. |
| 💛 Favoritos | Guardar varios favoritos y conservarlos en el almacenamiento local. |
| 🧾 Detalle | Consultar la información del producto, opciones de talla o presentación, pirámide olfativa y visualizador 3D simulado cuando hay foto. |
| 🛒 Carrito | Añadir artículos con las opciones elegidas, quitarlos y consultar el subtotal. |
| 💳 Checkout | Completar datos, envío, pago demostrativo y confirmación; validar formatos y aplicar cupones. |
| 🧾 Recibo | Ver y descargar o compartir un recibo de texto `.txt`. |
| 🧠 Asistente local | Consultar nombre, precio o descripción; ver el ranking explicativo o seleccionar el dato manualmente si la pregunta es ambigua. |
| 📳 Sensores | Leer el acelerómetro en dispositivos compatibles o usar la simulación por arrastre en web. Completar el reto visual desbloquea `BRILLO10`. |
| 📤 Importar y exportar | Transferir productos y fotos en un JSON portable entre instalaciones. |

---

## 🚀 Inicio rápido

### Requisitos

- Node.js 20 o superior y npm.
- Expo Go para probar en un teléfono Android o iOS.
- Android Studio o Xcode si se utilizará un emulador.
- Navegador moderno para ejecutar la versión web.

### Instalar y ejecutar

Desde la carpeta del repositorio:

```bash
npm install
npm start
```

Expo mostrará un QR y opciones para abrir la aplicación. Atajos:

```bash
npm run android
npm run ios
npm run web
```

En Windows PowerShell, el archivo de variables de ejemplo se puede copiar así si se desea configurar el envío de correos:

```powershell
Copy-Item .env.example .env
```

En macOS o Linux:

```bash
cp .env.example .env
```

El correo automático es opcional; el catálogo, la cámara, la importación y las demás funciones no requieren configurar EmailJS.

## 🧭 Recorrido de demostración

1. Abrir la app y pulsar **Explorar catálogo**.
2. Recorrer el catálogo y probar búsqueda, categorías y filtros.
3. Abrir un producto para consultar sus detalles, elegir opciones y añadirlo al carrito.
4. En **Añadir**, tomar una foto o seleccionarla desde la galería; completar los datos y guardar.
5. Editar o eliminar el producto creado y comprobar el cambio en la lista.
6. Marcar productos como favoritos y abrir el asistente para consultar su nombre, precio o descripción.
7. En **Sensores**, probar el movimiento real en un dispositivo compatible o la simulación web; completar el reto para desbloquear `BRILLO10`.
8. Revisar el carrito y avanzar por los pasos de checkout para generar el código del pedido y el recibo.
9. Usar **Exportar** e **Importar** para transferir los productos seleccionados y sus fotos.

Usa información ficticia durante las demostraciones. El checkout es demostrativo: **no procesa pagos ni realiza cargos**.

---

## 📦 Importación, exportación y almacenamiento

### Archivo portable

La exportación genera `luxor-products.json` con una estructura versionada (`version: 3`). Las fotos se incorporan al JSON como datos `data:image/...;base64,...`, así que no dependen de la ruta temporal del teléfono que las creó.

- **Android/iOS:** el archivo se comparte mediante el diálogo del sistema.
- **Web:** el navegador descarga el JSON.
- **Importación:** se selecciona el archivo desde el dispositivo o navegador.
- **Productos repetidos:** se agregan los IDs nuevos; cuando un ID ya existe, se conserva su información y se actualiza su foto si el archivo trae una imagen portable.

Los archivos antiguos que solo contienen una ruta local `file:///...` no transportan los bytes de la foto. Para transferirla, vuelve a exportar desde el dispositivo que todavía conserva la imagen o asígnala de nuevo desde la galería.

### Persistencia local

- **Móvil:** catálogo y favoritos se guardan en el almacenamiento local de la aplicación; las fotos nuevas o importadas se copian al directorio privado de la app.
- **Web:** el catálogo, incluidas las imágenes, se guarda en IndexedDB; los favoritos usan almacenamiento local del navegador.
- **Carrito:** permanece en memoria durante la sesión actual.
- **Entre dispositivos:** no hay sincronización automática en la nube. La transferencia se realiza exportando e importando el JSON.

---

## 🧠 Asistente y sensores

### Asistente de joyería

El asistente es un clasificador local didáctico, no un modelo generativo ni un servicio externo. Normaliza la pregunta y compara sus palabras con ejemplos para identificar si se consulta el **nombre**, **precio** o **descripción**. Si la intención es ambigua, permite escoger el campo manualmente. Las puntuaciones muestran similitud, no una probabilidad de certeza.

### Reto de brillo

En Android o iOS, la pantalla de sensores puede utilizar el acelerómetro si el dispositivo concede el permiso y dispone del sensor. En navegador se utiliza el arrastre para simular la inclinación. El reto visual cuenta los destellos y desbloquea el cupón `BRILLO10`.

---

## ✉️ Correo de confirmación

El checkout puede enviar una confirmación mediante EmailJS cuando se configura el servicio. Si no está configurado o falla el envío, la app informa el estado y ofrece reintentar o abrir una aplicación de correo con el pedido preparado.

Variables disponibles en `.env`:

| Variable | Uso |
|---|---|
| `EXPO_PUBLIC_EMAILJS_SERVICE_ID` | ID del servicio EmailJS. |
| `EXPO_PUBLIC_EMAILJS_TEMPLATE_ID` | ID de la plantilla del pedido. |
| `EXPO_PUBLIC_EMAILJS_PUBLIC_KEY` | Clave pública de EmailJS. |
| `EXPO_PUBLIC_CORREO_TIENDA` | Destinatario opcional de la copia para la tienda. |
| `EXPO_PUBLIC_EMAILJS_PRIVATE_KEY` | Campo opcional aceptado por la implementación. No coloques aquí una credencial confidencial. |

⚠️ **Importante:** cualquier variable `EXPO_PUBLIC_*` se incorpora al bundle de la aplicación y puede ser visible para quien la ejecute. No guardes secretos en ellas ni subas `.env` a GitHub. El archivo `.env.example` contiene únicamente nombres de variables vacíos.

---

## 🧰 Tecnologías

- React 19, React Native 0.88 y TypeScript.
- Expo SDK 58 y React Native Web.
- AsyncStorage e IndexedDB para persistencia local.
- Expo Camera e Image Picker para cámara y galería.
- Expo Sensors para el acelerómetro.
- Expo Document Picker, File System y Sharing para transferir archivos y recibos.
- EmailJS REST API, opcional, para confirmaciones de compra.

## 🗂️ Estructura del proyecto

```text
Luxxor-Collection/
├── App.tsx                    # Estado global, navegación, catálogo, compra y persistencia
├── ExploracionCamara.tsx      # Permisos, cámara/galería y formulario de producto
├── AsistenteIA.tsx            # Interfaz del asistente local
├── modeloIA.js                # Normalización, similitud y clasificación
├── modeloIA.d.ts              # Tipos TypeScript del clasificador
├── validacionesCompra.ts      # Validaciones puras del checkout
├── correoPedido.ts            # Plantillas y envío opcional mediante EmailJS
├── index.ts                   # Entrada y registro de la aplicación Expo
├── app.json                   # Configuración de Expo y permisos
├── package.json               # Dependencias y comandos npm
├── .env.example               # Plantilla de configuración sin credenciales
├── assets/                    # Iconos y recursos de la app
└── public/                    # Plantilla, manifest e iconos para web
```

## 🧪 Comprobaciones

Desde la raíz del proyecto:

```powershell
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\expo.cmd export --platform web
```

La primera orden comprueba los tipos TypeScript y la segunda genera la exportación web de Expo.

## 🎨 Diseño y permisos

La interfaz utiliza una paleta verde esmeralda, negro, marfil y dorado, con tarjetas y navegación adaptables al ancho disponible.

- **Cámara/galería:** el sistema solicita permiso al registrar productos o seleccionar fotos.
- **Acelerómetro:** disponible en dispositivos compatibles; la versión web usa simulación.
- **Archivos:** la app requiere acceso al archivo que el usuario seleccione para importar y utiliza el diálogo de compartir para exportar en móvil.

## ✅ Alcance de la entrega

- Aplicación de catálogo lista para ejecutar en móvil y web.
- Registro, edición, eliminación, búsqueda y filtros de productos.
- Persistencia local y transferencia manual del catálogo con imágenes portables.
- Favoritos, carrito, checkout demostrativo, correo opcional y recibo.
- Asistente de clasificación local y experiencia de sensores con simulación web.

El repositorio contiene el código fuente, configuración y documentación de la entrega. No se incluyen dependencias instaladas, compilaciones generadas ni archivos `.env` locales.
