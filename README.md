# Luxxor Collection

Aplicación móvil desarrollada con **React Native y Expo** para explorar, registrar y administrar productos de joyería de Luxxor Collection.

## Características

- Catálogo de más de 300 productos de joyería generados en pesos colombianos (COP).
- Productos organizados en dos vistas: **Sin imagen** y **Con imagen**.
- Selección de un producto favorito.
- Registro de productos con fotografías tomadas desde la cámara.
- Edición y eliminación de productos personalizados con imagen.
- Carrito de compras con cálculo automático del valor total.
- Simulación de compra y eliminación de productos del carrito.
- Uso del acelerómetro para detectar sacudidas en dispositivos compatibles.
- Modo real y modo de simulación para probar las lecturas del sensor.
- Asistente local que consulta el nombre, precio o descripción de un producto.
- Exportación e importación de productos mediante archivos JSON.
- Compartir productos exportados desde la aplicación.
- Diseño adaptable para teléfonos, tabletas y pantallas grandes.
- Almacenamiento local persistente mediante `AsyncStorage`.

## Funcionamiento

La aplicación está construida con navegación por pestañas dentro de `App.tsx`.

### Productos sin imagen

Muestra el catálogo general generado por la aplicación. Permite:

- Guardar un producto como favorito.
- Agregar productos al carrito.
- Consultar productos mediante el asistente de joyería.

### Productos con imagen

Muestra los productos personalizados registrados con una fotografía. Permite:

- Abrir la cámara y capturar una imagen.
- Completar nombre, descripción y precio.
- Editar o eliminar los productos guardados.
- Agregar los productos al carrito.

### Sensores

Utiliza el acelerómetro del dispositivo para medir movimientos y detectar sacudidas. Cuando se detecta una sacudida, la pantalla permite iniciar el flujo de exploración con cámara y registrar un producto nuevo.

También incluye una simulación para ejecutar esta función en plataformas que no tengan acelerómetro disponible, como algunos navegadores y emuladores.

### Carrito

Permite revisar los productos añadidos, eliminar elementos individuales y consultar el valor total. La compra final cambia el estado de los productos seleccionados antes de vaciar el carrito.

### Asistente de joyería

El asistente utiliza un modelo local didáctico para identificar consultas sobre:

- Nombre del producto.
- Precio.
- Descripción.

No se conecta a servicios externos de inteligencia artificial. Las respuestas se obtienen a partir del catálogo disponible en la aplicación.

### Persistencia y sincronización

Los datos guardados localmente se conservan con las siguientes funciones:

- Favorito de producto: `AsyncStorage`.
- Productos con imagen: `AsyncStorage`.
- Exportación de productos: archivo JSON.
- Importación: selección de archivo JSON desde el dispositivo.
- Imágenes exportadas: opción completa o ajustada.

## Tecnologías utilizadas

- React Native
- Expo SDK 58
- TypeScript
- React 19
- Expo Camera
- Expo Sensors
- AsyncStorage
- Expo File System
- Expo Document Picker
- Expo Sharing
- React Native Web

## Estructura del proyecto

```text
Luxxor Collection/
├── App.tsx                 # Catálogo, pestañas, carrito, persistencia y sensores
├── AsistenteIA.tsx         # Interfaz del asistente local
├── ExploracionCamara.tsx   # Captura, previsualización y registro con cámara
├── modeloIA.d.ts           # Definiciones del clasificador local
├── index.ts                # Punto de entrada de Expo
├── app.json                # Configuración de la aplicación Expo
├── package.json            # Dependencias y scripts
└── public/                 # Recursos utilizados por la versión web
```

## Requisitos

- Node.js 20 o superior.
- npm.
- Expo CLI o `npx expo`.
- Para Android: Android Studio o un dispositivo Android con Expo Go.
- Para iOS: Xcode y un dispositivo o simulador compatible.
- Permisos de cámara en los dispositivos que usen el registro fotográfico.

## Instalación

Desde la carpeta raíz del proyecto:

```bash
npm install
```

## Ejecución

### Desarrollo general

```bash
npm start
```

También puedes ejecutar la aplicación directamente para una plataforma:

```bash
npm run android
npm run ios
npm run web
```

Al iniciar Expo se mostrarán las opciones disponibles para abrir la aplicación mediante:

- Expo Go.
- Emulador Android.
- Simulador iOS.
- Navegador web.

## Permisos y plataforma

La captura de imágenes requiere permiso de cámara. En algunos navegadores, el acceso a la cámara puede estar limitado o no estar disponible.

El acelerómetro funciona principalmente en dispositivos físicos Android o iOS. En emuladores y navegadores se recomienda usar el modo de simulación incluido en la pestaña **Sensores**.
