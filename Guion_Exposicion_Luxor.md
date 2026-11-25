# Guion para la exposición — Luxor Collection

Este guion sigue el orden acordado: introducción, problemática, diagrama de navegación, demostración web, reto móvil y cierre. Los textos entre corchetes son indicaciones y no se leen en voz alta.

## 1. Introducción — Matheo

> Buenos días. Somos Matheo López Caicedo y Brayan David Hernández Ruiz. Nuestro proyecto es **Luxor Collection**, un catálogo de joyería desarrollado con React Native y Expo.
>
> Hoy vamos a mostrar su navegación, cómo se adapta la interfaz web a distintos tamaños de pantalla y algunas de sus funciones. Después presentaremos en móvil la mejora de usabilidad que trabajamos: facilitar el registro de un producto con foto.

## 2. Problemática — Brayan

> En la versión anterior, la cámara estaba dentro de la pestaña **Sensores**, aunque su función era registrar productos. Esto hacía difícil encontrarla: durante una prueba, un usuario que no conocía la aplicación tardó cerca de tres minutos y necesitó ayuda.
>
> El objetivo fue poner el acceso a la cámara en un lugar más relacionado con la tarea, **Con Imagen**, y hacer más claro el guardado para reducir errores y registros duplicados.

## 3. Diagrama de navegación — Matheo

> Antes de mostrar la aplicación, revisemos su diagrama de navegación. Aquí se observa cómo se conectan las secciones principales y dónde se encuentra cada función.
>
> [Mostrar el diagrama y señalar el Catálogo, Con Imagen, Asistente IA y Sensores.]

## 4. Demostración web adaptable — Matheo

> Ahora vamos a ver la aplicación en la web. La distribución cambia según el ancho de pantalla: en móvil presenta una columna, en tamaños intermedios dos y en pantallas amplias puede mostrar hasta tres.
>
> [Mostrar la aplicación en un ancho estrecho y luego en uno amplio.]
>
> En el catálogo podemos recorrer los productos y usar la búsqueda y los filtros. Las tarjetas muestran información y permiten abrir las acciones disponibles para cada producto.
>
> También podemos abrir el **Asistente IA**. Este responde preguntas sobre los productos usando un modelo local; no es un servicio de inteligencia artificial generativa conectado a internet.
>
> [Hacer una pregunta sobre el nombre, precio o descripción de un producto.]
>
> Desde las opciones del catálogo también podemos modificar un producto o eliminarlo. Para la demostración usaremos un producto de prueba y confirmaremos que los cambios se reflejan en la lista.
>
> [Editar un producto; después, si corresponde, eliminar un producto de prueba.]
>
> Una precisión: algunas funciones dependen de la plataforma. Por ejemplo, el sensor se simula en la web, así que esta demostración no reemplaza la prueba nativa en un teléfono.

## 5. Reto de la aplicación en móvil — Brayan

> Ahora vamos a mostrar el recorrido principal en Android con Expo Go. En la versión anterior, el usuario tenía que buscar la cámara dentro de Sensores. En esta versión, entra a **Con Imagen** y encuentra directamente el botón **Añadir producto con foto**.
>
> [En el teléfono, abrir Con Imagen, pulsar el botón, tomar la foto y completar los datos ficticios del producto.]
>
> Al pulsar **Guardar producto**, el formulario muestra que está guardando y bloquea pulsaciones repetidas. Cuando termina, el producto aparece en la lista con su foto y sus datos.
>
> También consideramos el caso de permisos: si se deniega el acceso a la cámara, la aplicación muestra un aviso y permite volver a intentarlo o ir a los ajustes.
>
> En la prueba documentada, el usuario encontró el acceso enseguida y completó el recorrido sin ayuda, en aproximadamente un minuto. En la versión anterior había tardado cerca de tres minutos y había necesitado ayuda. Como fue la misma persona en ambas pruebas, reconocemos que pudo influir el aprendizaje.

## 6. Cierre — Ambos

> En conclusión, la mejora principal fue ubicar la cámara donde el usuario espera encontrar una función para agregar productos y hacer más claro el proceso de guardado.
>
> Algunas funciones todavía tienen límites: la compra es simulada y el sensor web también es una simulación. Quedamos atentos a sus preguntas sobre el funcionamiento y el código.

## Si preguntan por el código

- [App.tsx](./App.tsx) coordina la navegación, muestra las listas y conecta las acciones de la aplicación.
- [ExploracionCamara.tsx](./ExploracionCamara.tsx) maneja permisos, captura o selección de foto, formulario y bloqueo del doble guardado.
- [modeloIA.js](./modeloIA.js) contiene el clasificador local que usa el asistente.

## Alternativa si no se puede hacer la demostración en vivo

Narrar los mismos pasos mientras se muestran las capturas del antes y el después. Aclarar que la demostración web no sustituye la prueba nativa en Android y que el sensor web es simulado.
