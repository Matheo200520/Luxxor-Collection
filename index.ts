/*
 * Punto único de entrada de la aplicación para web y móvil.
 * Expo carga este módulo primero y espera que se registre un componente raíz;
 * la navegación y la lógica de negocio permanecen dentro de App.
 */
import { registerRootComponent } from 'expo';

/*
 * App concentra el estado global del catálogo y decide qué vista se muestra.
 * Los componentes de cámara, compra y asistente se conectan desde App mediante
 * props y callbacks, por lo que este archivo no contiene su lógica interna.
 */
import App from './App';

/*
 * Registra App con el runtime correcto de Expo. La misma llamada sirve cuando
 * se inicia el proyecto en Expo Go y cuando se genera una compilación nativa;
 * por eso no se registra AppRegistry manualmente para cada plataforma.
 */
registerRootComponent(App);
