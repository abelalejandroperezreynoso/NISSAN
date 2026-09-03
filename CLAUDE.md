# NISSAN — Panel de Mantenimiento

Aplicación web sin framework ni build: HTML, CSS y JavaScript plano servidos
como archivos estáticos. No hay `package.json`, ni bundler, ni pasos de
compilación. Se edita el archivo y se recarga el navegador.

## Flujo de trabajo con git

**Fusiona siempre los cambios a `main` al terminar.** No hay que preguntar ni
esperar aprobación: desarrolla en la rama que corresponda, haz commit, y
enseguida fusiona a `main` y empuja.

```
git checkout main
git merge --ff-only <rama>
git push -u origin main
```

Única excepción: si el merge **no** es limpio porque `main` avanzó por otro
lado, no lo fuerces — avisa primero y resuelve el conflicto de común acuerdo.

No abras pull requests salvo que se pidan explícitamente.

Los mensajes de commit van en español.

## Estructura

`index.html` es el panel principal y carga los módulos en orden numerado:

| Archivo | Contenido |
|---|---|
| `1-config.js` | Credenciales y cliente Supabase (`sb`), constantes globales |
| `2a-core-nav.js` | Navegación y sesión |
| `2b-core-dashboard.js` | Dashboard principal |
| `3-incidentes.js` | Incidentes |
| `4-evaluaciones-*.js` | Evaluaciones (base, admin, estadísticas) |
| `5-objetivos.js` … `9-estadisticas.js` | Objetivos, calendario, pendientes, hallazgos, estadísticas |
| `10-refacciones.js` | Solo inyecta el botón; la pantalla vive aparte |
| `10-refacciones.html` | Panel de refacciones completo, con su JS inline |
| `11-mapa-activos.html` | Mapa de activos: treemap de refacciones, con tres puntos de vista — activos (planta → línea → equipo), solicitantes (departamento → persona) y atendedores |
| `estilos.css` | Estilos compartidos |
| `manifest.json` | Manifiesto PWA; su `scope` cubre las tres páginas |
| `version.json` | La versión que sirve el servidor; la aplicación compara con la suya |
| `subir-version.sh` | Sube la versión en los cuatro sitios donde vive |

Las pantallas independientes (`10-refacciones.html`, `11-mapa-activos.html`)
cargan `1-config.js` por su cuenta y llevan su propio `<script>` inline.

La carpeta `sql/` guarda los scripts que hay que correr a mano en el editor SQL
de Supabase cuando un cambio necesita una columna o una tabla nueva. La
aplicación no los ejecuta: son un registro de lo que se le pidió a la base.
Conviene que el código aguante mientras el script no se haya corrido todavía.

## Convenciones del código

- Las funciones que se invocan desde atributos `onclick` del HTML se declaran
  como `window.nombreFuncion = ...`. Si una función no cuelga de `window`, el
  HTML no la encuentra.
- Los estilos van mayormente inline, en atributos `style`. Los bloques nuevos
  y reutilizables sí conviene ponerlos en el `<style>` del propio archivo o en
  `estilos.css`.
- Textos de interfaz, nombres de variables y comentarios: en español.
- La sesión se guarda en `localStorage` bajo la clave `usuarioLogueado`.

## Trampas conocidas

- **Un teléfono puede llevar semanas con el JavaScript viejo.** No hay service
  worker ni paso de compilación: el navegador se guarda los `.js` y el `.html`
  con su propia caché, y una aplicación instalada en la pantalla de inicio
  puede pasarse semanas abierta sin recargar el documento ni una vez —la sesión
  dura treinta días—. El teléfono sigue ejecutando el código de hace un mes
  contra la base de hoy, y eso **no se nota hasta que algo nuevo pasa de
  largo**: una pregunta de un tipo que ese código no conoce no entra en ninguna
  rama del `if` que dibuja los controles, así que **se dibuja el enunciado y
  nada debajo**, se envía en `null` y la respuesta queda incompleta. Pasó con
  la evidencia fotográfica: se agregó el 25 de agosto y durante semanas
  llegaron respuestas sin foto de gente cuyo teléfono tenía el código de antes
  del 23, que era también anterior a exigir contestarlo todo. Un dispositivo
  con código de entre las dos fechas se queda al revés, sin poder enviar.

  Contra eso hay tres cosas, y las tres tienen que ir juntas:

  - **La versión viaja en la URL de cada archivo** (`1-config.js?v=2026-09-03-1`)
    en las tres pantallas, y también al navegar de una a otra, que por eso se
    hace con **`window.irAPantalla('index.html')`** y nunca con
    `location.href = 'index.html'`: son documentos distintos y ese `.html` lo
    puede servir la caché. Los archivos de un CDN se quedan sin `?v=`.
  - **`version.json` dice qué versión hay en el servidor**, y se pide con
    `cache: 'no-store'` y un parámetro distinto cada vez: es la única petición
    que no puede venir de la caché, así que es la que descubre el desfase. Se
    comprueba al cargar, **al volver a primer plano** —el único momento en que
    se entera una aplicación instalada que no recarga nunca— y al abrir una
    encuesta. Al encontrarlo salta a una URL con `?v=` nueva, que el navegador
    tampoco ha visto y tiene que pedir a la red.

    ```js
    await window.comprobarVersionApp({ forzar: true })  // ¿hay una más nueva?
    window.hayVersionNueva()                            // lo que ya se sabe
    window.versionEnServidor()                          // la última que dijo
    window.avisarVersionNueva({ bloqueante: true })     // la hoja, sin «Ahora no»
    ```

  - **El salto se da solo, y nadie tiene que tocar el botón.** Abrir la
    aplicación —o volver a ella— basta para quedarse al día: si la pantalla
    está en reposo se recarga sin preguntar. Con **dos frenos**, que son lo que
    lo hace seguro:

    **Con una hoja abierta no se recarga jamás.** Ahí puede haber media
    encuesta llena, un incidente a medio redactar o una foto ya tomada, y nada
    de eso sobrevive a una recarga. Se mira la clase `modal-abierto` que el
    observador deja en `<html>`, que es exactamente donde vive todo formulario
    de la aplicación: si la hay, se avisa con la hoja y decide la persona. Por
    eso el aviso se ve poco — es lo que queda para lo que no se puede hacer
    solo.

    **Y no se salta dos veces a la misma versión.** Si tras el salto seguimos
    desfasados es que el despliegue quedó a medias —`version.json` subido y los
    `.js` todavía viejos, o al revés— y sin este freno la aplicación se
    quedaría recargando en bucle para siempre, que es peor que la versión
    vieja. La marca va en `sessionStorage.versionIntentada` y da un intento por
    arranque; al comprobar que ya se está al día se borra sola. Un navegador
    que no deje escribir ahí no salta nunca: sin red de seguridad, mejor el
    botón.

  - **`window.responderDirecto` no abre una encuesta con la versión vieja.** Es
    el único sitio de la aplicación donde el aviso no admite un «Ahora no»:
    contestar con el cuestionario incompleto estropea el trabajo de quien la
    llena y no se nota hasta que alguien la revisa. En todo lo demás el aviso
    se puede posponer.

  **Los cuatro sitios donde vive la versión se cambian con
  `./subir-version.sh`** —`version.json`, `window.VERSION_APP` de `1-config.js`
  y el `?v=` de las tres pantallas—. No es un paso de compilación: los archivos
  se siguen sirviendo y editando tal cual, y el script sólo evita el olvido.
  Cambiarlos por separado rompe cosas: si `version.json` y `VERSION_APP` no
  coinciden, la aplicación avisa de una versión nueva que ya tiene y **deja de
  dejar contestar encuestas**; si falta el `?v=`, el HTML nuevo puede acabar
  cargando el JavaScript viejo. **Se sube la versión en cada cambio que tenga
  que llegar a los teléfonos**, y los archivos se despliegan juntos.

  Nada de esto alcanza a un dispositivo que ya arrastra la versión anterior:
  ese código no trae la comprobación. A ésos sólo los rescata una recarga —en
  iOS, cerrar la aplicación del todo desde el conmutador y volver a abrirla—,
  y de ahí en adelante quedan protegidos. Sin `version.json` en el servidor, o
  sin red, todo se comporta como antes: no se avisa ni se bloquea nada.

- **El administrador puede obligar a todos a volver a identificarse, y eso es
  un instante, no un interruptor.** El botón «🔒 Forzar inicio de sesión» del
  panel de administración sella la hora de la orden en `system_config`
  (`cierre_sesion_global`, en la columna `texto`), y toda sesión iniciada antes
  de esa hora deja de valer. La diferencia con un interruptor importa: uno
  encendido y olvidado deja a la plantilla entera fuera para siempre, mientras
  que un instante **se agota solo** —en cuanto cada quien vuelve a entrar, su
  sesión es posterior a la orden y ya no le alcanza—. Volver a darla es
  adelantar el instante, y no hay nada que apagar después.

  ```js
  await window.ordenarCierreDeSesiones()   // el administrador la da
  await window.sesionEstaInvalidada()      // ¿le alcanza a esta sesión?
  window.cerrarSesionForzada(mensaje)      // sacar a quien esté dentro
  ```

  La comparación sale de `loginTimestamp`, que `2a-core-nav.js` guarda en
  `localStorage` junto a la sesión. Una sesión **sin** esa hora es de una
  versión anterior a que se guardara y se cierra igual: no se puede saber si es
  de antes o de después de la orden, y ante la duda se pide entrar de nuevo,
  que es lo que ya hacía la caducidad de treinta días.

  **Quien da la orden no se echa a sí mismo**: `ordenarCierreDeSesiones` renueva
  su propio `loginTimestamp`, o el administrador acabaría en el login a mitad de
  lo que estuviera administrando.

  Se comprueba **al abrir la aplicación** —siempre, que es lo que la función
  promete y ahí no hay nada a medias que perder— y al volver a primer plano,
  esto último con el freno de `modal-abierto`: con una hoja abierta puede haber
  media encuesta llena o una foto ya tomada, y cerrar la sesión de golpe se lo
  llevaría sin enviar. Se deja para la próxima vez que se abra la aplicación,
  que es lo que la orden pedía de todos modos. Es el mismo freno que la
  comprobación de versión y por lo mismo.

  Todo esto vive en `1-config.js` porque lo comprueban los tres documentos, y
  por eso **`cerrarSesionForzada` se mudó ahí desde `2a-core-nav.js`**, que sólo
  lo carga `index.html`. El login vive únicamente en el panel principal, así que
  desde las otras dos pantallas hay que ir hasta allí en vez de recargar la que
  se esté viendo.

  No hace falta ningún script de `sql/`: la tabla `system_config` ya existe y la
  clave es una fila más, como `titulo_accesos_directos`. Lo que sí hace falta es
  **contar las filas del `.select()`** al escribirla —una política de RLS que la
  rechace no da error, sólo afecta a cero filas—, o el panel diría que la orden
  se dio sin que nadie vaya a salir.

- **Fuente de 16px en los campos de formulario.** Safari en iOS ignora el
  `user-scalable=no` del viewport, así que cualquier `input`, `select` o
  `textarea` con fuente menor a 16px provoca zoom automático al enfocarlo.
  Para compactar un formulario hay que reducir padding y márgenes, nunca el
  tamaño de la fuente de los campos.
- **El manifiesto y las metas de pantalla completa van en todas las páginas.**
  `manifest.json` declara `"scope": "./"` y `"display": "standalone"`. El
  scope es lo que mantiene dentro de la app instalada la navegación entre
  `index.html`, `10-refacciones.html` y `11-mapa-activos.html`, que son
  documentos distintos y no vistas de uno solo: sin scope iOS decide
  documento por documento y acaba abriendo Safari. El `<link rel="manifest">`
  va en las tres páginas porque cualquiera puede ser la que se añada a la
  pantalla de inicio. Las metas `apple-mobile-web-app-capable` y
  `apple-mobile-web-app-status-bar-style` se quedan y toda pantalla nueva las
  lleva: son lo único que entienden las instalaciones hechas antes de que
  existiera el manifiesto. El valor `default` de la barra de estado es el que
  mantiene esa franja fuera del viewport, que es lo que suponen los estilos;
  cambiarlo a `black-translucent` metería el contenido debajo del reloj. El
  manifiesto no lleva `theme_color` a propósito: lo pintaría de un color fijo
  en toda la app y esa franja se pinta hoy con el fondo de `<html>` de cada
  documento. Un cambio en el manifiesto sólo se aplica reinstalando el icono
  desde la pantalla de inicio; iOS congela el que había al añadirlo.
- **Safe area del iPhone.** Las páginas llevan `viewport-fit=cover` en el meta
  viewport para que fondos y overlays lleguen al borde físico de la pantalla.
  Como contrapartida, el contenido debe apartarse de la barra de estado y del
  indicador de inicio con `env(safe-area-inset-*)`; las reglas viven al final
  de `estilos.css`. Si se añade una pantalla nueva a pantalla completa, hay
  que darle ese padding o su encabezado quedará bajo el reloj.

  Arriba sí; **abajo, en el contenedor de altura completa, no.** Un
  `padding-bottom: env(safe-area-inset-bottom)` sobre un contenedor de
  `100dvh` con `box-sizing:border-box` le resta 34pt de alto útil y deja una
  franja muerta del color del fondo antes del borde, que es exactamente el
  aspecto de un navegador con su barra. Ninguna de las tres pantallas lo
  lleva: `10-refacciones.html` aparta el indicador desde el padding de su
  lista, que además así puede desplazarse hasta el final, y
  `11-mapa-activos.html` desde el margen del lienzo. El mapa lo llevó un
  tiempo y por eso parecía que no se abría a pantalla completa.

  Por lo mismo, el fondo de `<html>` de cada pantalla tiene que ser el del
  elemento que queda pegado arriba —en el mapa, el blanco del encabezado—.
  Instalada en la pantalla de inicio, iOS pinta con ese color la franja de
  la barra de estado, y un tono distinto del que tiene debajo dibuja una
  costura que se lee como el borde del navegador.
- **La franja de la barra de estado no es alcanzable por CSS.** Con la app
  instalada en la pantalla de inicio, iOS deja esa franja fuera del viewport
  y la pinta con el color de fondo de `<html>`. Ningún overlay puede cubrirla,
  por muy `position:fixed` que sea. Por eso **todos** los paneles flotantes de
  la aplicación se presentan como hoja inferior: al no haber capa oscura a
  pantalla completa, no hay corte que disimular. Ver más abajo.
- **Los paneles son hojas inferiores.** Las clases `.hoja-overlay` (la capa,
  sin atenuado: sólo desenfoque) y `.hoja-contenido` (la hoja blanca, con
  tirador y esquinas de 44px) viven al final de `estilos.css` y las comparten
  todas las pantallas. Un panel nuevo se escribe así:

  ```html
  <div id="modal-ejemplo" class="hoja-overlay" style="z-index:2000;">
      <div class="hoja-contenido" style="max-width:500px; overflow:hidden; padding:12px 0 0;">…</div>
  </div>
  ```

  y se abre con `style.display = 'flex'`. Nada de `position:fixed`,
  `background:rgba(0,0,0,…)`, `border-radius` ni `animation` propios: eso ya
  lo pone la clase. Para un panel con formulario conviene
  `class="form-content hoja-contenido"` con `overflow-y:auto` y padding
  `12px 25px 25px`; para una lista a sangre, `padding: 12px 0 0` con
  `overflow:hidden`.
- **Todas las hojas llevan el mismo encabezado**: título a la izquierda,
  botón de cerrar a la derecha y una línea fina de separación. Las clases
  están en `estilos.css` y no se estilan a mano:

  ```html
  <div class="hoja-encabezado-lista">
      <div style="min-width:0;">
          <h3 class="hoja-titulo">Empleados</h3>
          <div class="hoja-subtitulo">Modo administrador</div>
      </div>
      <button onclick="cerrar()" class="ios-boton-cerrar ios-boton-icono"
              title="Cerrar" aria-label="Cerrar"></button>
  </div>
  ```

  `.hoja-encabezado-lista` es para las hojas a sangre (`padding: 12px 0 0`):
  pone su propio relleno lateral y el separador cruza la hoja entera.
  `.hoja-encabezado` es para las de formulario, que ya traen relleno lateral.
  El `<div>` que envuelve título y subtítulo sólo hace falta si hay
  subtítulo, y necesita `min-width:0` para que un título largo se recorte en
  lugar de empujar al botón fuera de la hoja. Si a la derecha va más de un
  control, se agrupan en un `<div class="hoja-acciones">`.

  **En una hoja con desplegables, la acción principal va en el encabezado**,
  a la izquierda del botón de cerrar y con su mismo `.ios-boton-icono`. Al
  pie del formulario queda debajo del último campo, y ahí es donde la rueda
  de iOS la pone en el camino del dedo: así es como «Agregar nuevo equipo»
  guardaba al ir a elegir la línea. Es la razón de que esa hoja no tenga
  botonera inferior —ni «Cancelar», que sería otro blanco fácil y duplica lo
  que ya hace la cruz—: debajo del último campo no hay nada que pulsar.
  «Solicitar refacciones» y «Editar equipo» siguen el mismo patrón.

  Un botón de icono no tiene texto, así que lo que antes decía hay que
  repartirlo: **la etiqueta va al `aria-label` y al `title`** —en refacciones
  cambia con el modo, que la hoja sirve para solicitar, editar y volver a
  solicitar— y **el estado va al subtítulo del encabezado** («Subiendo
  foto…»), con el botón apagado mientras tanto. Nunca con `innerText`: eso
  borraría el `<svg>` de dentro.

  El botón de cerrar va **vacío**: la cruz la dibuja `.ios-boton-cerrar` con
  pseudoelementos, así que no lleva `✕` ni SVG, pero sí `aria-label`. Para
  otros iconos está `.ios-boton-icono` a secas, con un `<svg>` dentro.

  El teclado de iOS lo resuelve `1-config.js`: publica su altura en
  `--alto-teclado`, que las hojas suman a su margen inferior para apoyarse
  encima en vez de esconderse detrás, y ancla el documento mientras haya una
  hoja abierta.

  Sólo cuenta el teclado de texto. La rueda de un `<select>` y la de los
  campos de fecha y hora encogen el viewport visual exactamente igual, pero
  ahí `--alto-teclado` se deja en cero a propósito: iOS ya deja el campo
  enfocado a la vista, y si además subimos la hoja el formulario entero se
  recoloca mientras la rueda está abierta. Al cerrarse, la hoja baja
  animada y el dedo que iba al siguiente campo se encuentra el botón de
  guardar pasando por esa posición. En una pantalla de 375×667, elegir la
  planta en «Agregar nuevo equipo» movía la hoja 198 px y el botón
  «Guardar Equipo» cruzaba justo por donde estaba el desplegable de línea.
  Todo campo nuevo que abra una rueda en vez de un teclado va en la lista
  `TIPOS_SIN_TECLADO` de `1-config.js`.

  Como red de seguridad hay un segundo bloque en `1-config.js` que descarta
  el *toque fantasma*: al cerrarse una rueda, iOS sintetiza un click en las
  coordenadas del dedo sin el `pointerdown` que trae cualquier toque real.
  Se filtran sólo los clicks sobre `<button>` y sólo en los 700 ms
  siguientes a haber usado una rueda; el `.click()` programático sobre un
  `<input type="file">` escondido tras una etiqueta tampoco trae
  `pointerdown` y por eso el filtro no toca a los `input`.

  Los paneles de responder y calificar encuestas son un caso aparte: el
  contenedor `#modal-responder-eval` de `index.html` va vacío y lleva sólo la
  clase; `4-evaluaciones-base.js` y `4-evaluaciones-admin.js` le meten su
  propia `.hoja-contenido` con `innerHTML` y lo vacían al cerrar. Si se toca
  ese marcado hay que mantener el `<div class="hoja-contenido">` envolviendo
  a `#simple-form-container`, o la hoja pierde tirador, esquinas y tope de
  altura.

  El panel de administración es otro caso. La barra `#admin-toolbar`, que
  aparece al encender el modo administrador, ya no guarda las acciones: sólo
  trae el botón que abre la hoja `#modal-admin` (`window.abrirPanelAdmin` y
  `window.cerrarPanelAdmin`, en `2a-core-nav.js`). Un botón nuevo se le añade
  al marcado de `index.html` y **no necesita nada más**: llama a su función de
  `window` desde el `onclick`, como el resto de la aplicación, y si abre otra
  hoja el observador de `1-config.js` aparta ésta al ver dos abiertas a la vez
  —los botones actuales llaman además a `cerrarPanelAdmin()` ellos mismos, que
  es lo que evita el fotograma con las dos a la vista, pero olvidarlo ya no
  rompe nada—.

  Esto no siempre fue así, y las tres reglas que sostenían el panel se
  quitaron de raíz:

  - `2a-core-nav.js` enganchaba `btn-nuevo` con un `getElementById(…).onclick`
    sin comprobar, nada más cargarse. Un botón que no estuviera ya en el
    marcado no dejaba sin manejador a ese botón: reventaba ahí y se llevaba
    por delante las seis funciones que el archivo declara después —el modo
    administrador, `checkAdmin`, el cierre de sesión—. Hoy la acción es
    `window.abrirNuevoRegistro()` y el enganche por id no existe; igual con
    `btn-nueva-eval`, que era `window.abrirNuevaEvaluacion()`.
  - El z-index de `#modal-admin` (1700) sigue por debajo del de las hojas que
    abre, pero ya sólo como red de seguridad: el que las separa es el
    observador.
  - `btn-toggle-ahorro` y `btn-backup-download` cambiaban su texto con
    `innerText`, que borra todo lo que hubiera dentro del botón. Ahora lo
    escriben con **`window.textoBoton(btn, texto)`** (en `1-config.js`), que
    apunta al `<span data-texto>` de dentro y deja en paz al emoji; sin
    segundo argumento sólo lee, y al escribir devuelve el texto anterior para
    poder restaurarlo. Todo botón que anuncie su estado va así.

  **Un formulario que no cabe de una vez desplaza su cuerpo, no la hoja.** La
  hoja pasa a `overflow:hidden; padding:12px 0 0` y el formulario va dentro de
  un `<div class="hoja-cuerpo-formulario">`, que pone el relleno lateral, el
  fondo gris y el hueco del indicador de inicio. Así el encabezado —con el
  botón de guardar— se queda a la vista en lugar de irse por arriba al primer
  arrastre. Dentro, los campos se agrupan en tarjetas `.hoja-grupo` bajo un
  rótulo `.hoja-grupo-titulo`, las casillas con explicación son filas
  `.eval-opcion` y lo opcional se pliega con `<details class="hoja-plegable">`.
  Es lo que se hizo con «Nueva evaluación», que eran doce bloques seguidos,
  cada uno de un color, dentro de una hoja que se desplazaba entera.

  Ojo con las rejillas de tarjetas ahí dentro: `flex-wrap` con
  `min-width:150px` **no** da dos columnas en un teléfono —dos de 150 más el
  hueco pasan de los 309px útiles—, así que las cinco tarjetas de destinatarios
  se apilaban de una en una y se llevaban 800px de alto. Como filas de una
  lista ocupan la mitad y se leen mejor.

  Los campos que un módulo arma con `innerHTML` fuera de un `.form-group` —los
  de cada pregunta, en `window.agregarCampoPregunta`— no heredan el
  `box-sizing: border-box` de aquella regla y con `width:100%` más su padding
  se salen de su tarjeta; y un `<select>` dentro de un flex necesita
  `min-width:0` o se niega a encoger por debajo de su opción más larga. Las dos
  reglas viven en `estilos.css` bajo `.pregunta-wrapper`.

  Queda a pantalla completa, y a propósito, sólo el visor de imágenes
  (`#modal-visor`).

  Un observador en `1-config.js` marca `<html>` con la clase `modal-abierto`
  mientras haya algún overlay visible (id que empiece por `modal-` y
  `position:fixed`). Ya no sirve para atenuar nada —las hojas no atenúan—,
  pero sigue disponible si una pantalla necesita teñir esa franja: es lo que
  hace `10-refacciones.html`, cuyo fondo no es el del panel principal.
- **La contraseña de administrador se pide con una hoja, nunca con `prompt()`.**
  En iOS, `prompt()` capitaliza la primera letra —y la contraseña va en
  minúsculas—, no deja ocultar lo tecleado y se dibuja como un aviso del
  navegador encima de la aplicación instalada. La hoja `#modal-clave-admin`
  vive entera en `1-config.js`, marcado incluido, porque la comparten dos
  documentos que no tienen más JavaScript en común; se monta la primera vez
  que se pide, así que una pantalla que no la abra no carga con ella. Lo único
  que cambia de una pantalla a otra es qué pasa al acertar, y va en el
  argumento:

  ```js
  window.abrirClaveAdmin(() => { window.modoAdminActivo = true; /* … */ });
  ```

  Es también el sitio donde mirar cómo se hace un campo de contraseña aquí: el
  botón del ojo alterna `type` entre `password` y `text` y cuenta lo que hace
  en su `aria-label` y su `title`, que es lo que le queda a un botón sin
  texto.

  **El modo encendido viaja entre pantallas**, y por eso sólo se pide la
  contraseña una vez: las tres páginas son documentos distintos y al saltar de
  una a otra `window.modoAdminActivo` volvería a false —el mapa de activos ni
  siquiera pide la contraseña en ningún sitio—. Se sostiene en `sessionStorage`,
  que dura lo que la pestaña y no sobrevive a cerrar la aplicación.

  ```js
  window.sostenerModoAdmin(true)   // enciende y deja la marca
  window.sostenerModoAdmin(false)  // apaga y la quita
  window.modoAdminSostenido()      // lo que dejó puesto la pantalla anterior
  ```

  **Nadie toca `sessionStorage.adminSostenido` a mano**: encender por un lado y
  no apagar por el otro es exactamente lo que pasaba antes —refacciones apagaba
  el modo sin quitar la marca, y al volver al panel principal seguías siendo
  administrador—. Cada documento lee el estado al cargar (`index.html` en
  `2b-core-dashboard.js`, que deja las visuales a `mostrarDashboard`) y cerrar
  sesión lo apaga.
- **La hoja de evaluaciones dice en el encabezado en qué pantalla estás.**
  Seis pantallas se dibujan dentro del mismo `#contenido-modal-evaluaciones`
  —la lista, la encuesta abierta, el historial global, la revisión por
  empleado, el expediente y la certificación por clasificación—, así que el
  título de la hoja no puede ser fijo: se pone con
  `window.encabezadoHojaEvaluaciones(titulo, alVolver)`, en
  `4-evaluaciones-base.js`. Sin argumentos vuelve a «Evaluaciones y encuestas»
  con la cruz. **Toda pantalla que repinte ese contenedor tiene que llamarlo**,
  o se queda con el título de la anterior.

  Al abrir una encuesta el botón del encabezado deja de ser la cruz y pasa a
  ser la flecha de volver: dentro de una encuesta lo que busca el dedo es
  retroceder, no cerrarlo todo. Como la cruz la dibuja `.ios-boton-cerrar` con
  pseudoelementos, cambiar de icono es quitar esa clase y meter el `<svg>`
  dentro —y al revés, vaciarlo y devolvérsela—.

  La lista de respuestas de una encuesta va plegada en un
  `<details class="hoja-plegable">`, y se abre sola sólo si hay algo esperando
  la calificación de quien mira. Arriba, en cambio, sale siempre el último
  resultado propio, que es a lo que entra la mayoría. Ojo con
  `.hoja-plegable-resumen`, que es un flex con `gap`: cada nodo suelto del
  `<summary>` cuenta como elemento, así que el rótulo y su contador van
  envueltos en un solo `<span>` o el «(3)» se separa del texto.
- **El `id_interno` identifica al equipo y el nombre va pegado a él.** La
  misma máquina suele estar dada de alta varias veces en `equipos`, una fila
  por línea, todas con el mismo `id_interno`. La base no tiene restricción de
  unicidad: la regla la sostiene la aplicación, y quien la rompe deja el
  catálogo con un mismo ID repartido en nombres distintos. Por eso el
  renombrado del mapa de activos actualiza de golpe todas las filas que
  comparten ese `id_interno`, igual que ya hacía el renombrado en lote de
  `10-refacciones.html`. Cualquier código nuevo que escriba `equipos.nombre`
  tiene que respetarlo. El mapa dibuja un cuadro por máquina y no por fila:
  agrupa las altas de la línea por `id_interno` y, cuando falta, por nombre,
  ambos normalizados sin espacios y en mayúsculas. Sin eso, una máquina dada
  de alta dos veces en la misma línea partía su carga en dos cuadros.

  Lo que edita esa máquina —el ID interno, el nombre y la unión de altas
  repetidas— vive en `#modal-editar-equipo`, una hoja aparte que se abre con
  el lápiz del encabezado del detalle. El detalle (`#modal-detalle-activo`)
  es sólo de consulta. El cuerpo de la hoja de edición se arma con
  `innerHTML` al abrirla y se vacía al cerrarla, así que los ids de sus
  campos (`inp-detalle-id`, `inp-detalle-nombre`, `lista-altas`…) existen
  sólo mientras está a la vista; funciones como `idInternoElegido()` los
  buscan por id y devuelven vacío si no están. `cerrarDetalleActivo()`
  cierra también la de edición: la hija no puede sobrevivir a la madre.
- **Una escritura que la base no permite no da error.** PostgREST responde
  con éxito a un `update` o un `delete` que las políticas de RLS rechazan:
  simplemente afecta a cero filas. Comprobar `error` no basta, y el código
  que da por hecho que la escritura ocurrió deja la pantalla mintiendo hasta
  la siguiente recarga. Donde importe, hay que encadenar `.select()` a la
  escritura y contar las filas que devuelve, que es lo que hacen la unión de
  altas repetidas del mapa de activos y `guardarEmpleado()` en
  `10-refacciones.html`. Las políticas van por operación, así que una tabla
  puede dejar actualizar y no borrar.
- **Eliminar un empleado borra también su historial.** La baja —desmarcar
  «Activo»— es el camino normal y lo conserva todo; el bote de basura del
  encabezado de «Editar empleado», en `10-refacciones.html`, borra la ficha y
  todo lo que esa persona dejó registrado, sin papelera ni vuelta atrás.

  La base no lo hace sola. Las firmas, las respuestas de encuestas, los
  objetivos, los hallazgos, las encuestas programadas y las solicitudes de
  refacciones guardan a la persona por su número —unas veces el `id` numérico
  de la fila y otras el `employee_id` de texto, según la antigüedad del
  registro— y esas columnas no son llaves foráneas: borrar la ficha no borra
  en cascada ni se queja, dejaba el registro apuntando a alguien que ya no
  existe y un alta futura con ese mismo número lo heredaba. El barrido lo hace
  `window.eliminarEmpleado()`, tabla por tabla, según la lista
  `window.RASTROS_DEL_EMPLEADO`.

  Esa lista separa **lo suyo de lo ajeno**, que no es lo mismo: las columnas
  `suyas` dicen que la fila ES suya —la solicitud que pidió, la encuesta que
  contestó— y la fila entera se borra; las columnas `menciones` son donde
  aparece dentro de la fila de otro —la solicitud que atendió, el hallazgo que
  le asignaron, el acta que firmó, sus subordinados— y ahí sólo se le desliga
  poniendo la columna a null, porque borrar esa fila destruiría el registro de
  un tercero. **Toda tabla nueva que guarde a una persona por su número se
  añade a esa lista**, en la mitad que le toque, o su historial sobrevivirá al
  borrado sin dueño que lo reclame.

  **El orden lo manda lo que no tiene vuelta atrás: primero la ficha, después
  el historial.** Si la base rechaza el borrado —una política de RLS sin
  DELETE, y van por operación, así que una tabla puede dejar actualizar y no
  borrar— no se ha perdido nada; al revés, el historial se habría barrido para
  dejar la ficha en pie. La única excepción es `certificado_por` de
  `certificaciones_clasificacion`, que sí es llave foránea contra
  `employees(id)` y sin poner a null impide borrar a quien haya certificado
  algo: ahí la base responde 23503, se desliga y se reintenta **una** vez. Por
  ser llaves foráneas, las dos columnas de esa tabla se filtran sólo por el
  `id` numérico (`soloIdNumerico`): el `employee_id` de texto es otro número y
  podría casar con la fila de otra persona.

  El aviso previo enseña lo que se va a borrar y lo que se va a desligar, con
  una consulta por tabla y columna —`or` con `{ count: 'exact', head: true }`,
  así no viaja ninguna fila—. Una tabla que todavía no exista devuelve null y
  el resumen dice «no se pudo comprobar», que no es lo mismo que decir que no
  hay nada, y no detiene el borrado: lo que falle después de que la ficha ya
  no esté se informa al final como pendiente de limpiar desde el editor SQL,
  porque no habrá otra ficha desde la que reintentarlo.

  Nadie borra su propia ficha —la sesión dura treinta días y seguiría abierta
  sin nada detrás—. Lo que **no** se toca son los archivos de los buckets (el
  avatar, las imágenes de firma) ni los arreglos `target_employees` y
  `reviewer_employees` de las encuestas, que son asignación y no historial.

- **Quién debe firmar un registro.** No hay tabla que lo diga: la regla la
  sostiene el código, y desde que se separó en cuatro copias vive en un solo
  sitio, `1-config.js`. Le toca firmar a todo empleado **activo** dado de alta
  **en o antes** de la fecha del registro, salvo los puestos exentos
  (`JR. MANAGER`, `SR MANAGER`, con y sin punto). Las capacitaciones no se
  firman y quedan fuera de cualquier conteo de avance.

  ```js
  window.leTocaFirmar(emp, window.fechaDeRegistro(inc.date))
  ```

  Lo usan `2b-core-dashboard.js` (badges de pendientes), `3-incidentes.js`
  (avance de la tarjeta y lista de quién falta), `7-pendientes.js` y
  `9-estadisticas.js`. **Ninguna pantalla vuelve a escribir la lista de puestos
  exentos ni la comparación de fechas**: si hace falta cambiar la regla, se
  cambia el helper y cambian las cuatro a la vez. Cuando sólo se necesita una
  mitad están `window.esPuestoExentoDeFirmar(puesto)` y
  `window.empleadoActivo(emp)`, que acepta tanto `isActive` (cachés del
  navegador) como `is_active` (la base) y ante la duda da por activo.

  Ojo con la fecha, que llega como `'YYYY-MM-DD'`: `window.fechaDeRegistro` la
  arma a mano porque `new Date('2026-01-31')` se lee en UTC y la zona horaria
  la corre un día hacia atrás.

  Un empleado dado de baja no cuenta **en ningún lado**: ni como pendiente
  suyo, ni en el denominador del avance de un registro anterior a su baja —que
  si no, se quedaba clavado por debajo del 100% para siempre—, ni como encuesta
  atrasada de su jefe. La baja no cierra la sesión que ya estaba abierta, así
  que las pantallas que deciden sobre el usuario actual miran su ficha en
  `window.todosLosEmpleadosData` y no en `usuarioLogueado`, que no trae el
  campo.
- **La evidencia fotográfica es un tipo de pregunta más.** Al crear la encuesta
  se elige «📷 Evidencia fotográfica» en el desplegable de tipo; el enunciado
  pasa a ser lo que se pide fotografiar («Foto del extintor con su etiqueta
  vigente») y la respuesta es la URL de lo que se subió. Al ser una pregunta y
  no un ajuste de la encuesta, se ordena, se edita, se borra y se califica como
  las demás, y **pedir varias evidencias es agregar varias preguntas**.

  ```js
  window.esPreguntaDeFoto(pregunta)   // en 1-config.js
  ```

  No lleva opciones ni respuesta modelo, y por lo mismo no pide motivo. La
  califica quien revise, con el mismo correcto/incorrecto de las de texto.

  **En modo `boss` la evidencia entra y la encuesta se sigue calificando
  sola.** Esa encuesta se guarda ya como `'Revisado'` al enviarla, así que sólo
  admite lo que se puntúa solo —la escala— y las evidencias, que no puntúan:
  `calcularScoreRespuesta` promedia lo que hay en `grades_json` y una foto sin
  calificar simplemente no entra, de modo que queda como constancia de lo que
  el jefe vio sin diluir el resultado. Un texto o unas opciones sí quedarían
  sin calificar y sin nadie que las revisara, y por eso siguen fuera: la lista
  está en `window.TIPOS_EN_MODO_JEFE`. `verificarRestriccionesModo` apaga las
  opciones que no valen en vez de bloquear el desplegable entero —que es lo que
  antes dejaba «Rango Numérico» como única salida— y devuelve a escala
  cualquier pregunta con un tipo que no cuadre, incluida la recién agregada,
  que nace como texto. Al calificar se ve la
  foto y no la URL: editarla desde ahí no tendría sentido —habría que volver a
  tomarla—, así que ni en modo administrador aparece un campo de texto.

  Comparte con la foto del área el encogido, el bucket y
  `window.subirFotoEvaluacion(blob, prefijo)`; lo que cambia es dónde acaba la
  URL: la del área bajo `__foto_area`, la de cada evidencia bajo el id de su
  pregunta, que es donde va la respuesta de cualquier otra.
- **Una evaluación por área lleva foto, y la foto se encoge antes de subir.**
  Las encuestas con `evaluates_area` piden una fotografía del área que se está
  evaluando: sin ella la evaluación es la palabra de quien la llenó contra
  nada. Es obligatoria y el envío se planta igual que con el área.

  La cuenta de Supabase es gratuita y una foto de teléfono son varios MB, así
  que **ninguna se sube tal cual**: `window.optimizarImagen(file, { maxLado,
  maxBytes })` en `1-config.js` la reescala por su lado más largo y la comprime
  —WebP, y JPEG si el navegador no lo da— hasta caber. Las de evaluación van a
  `window.MAX_LADO_FOTO_EVAL` (600px) y 300 KB de tope; medido con una imagen
  de ruido de 2400×1800 y 4.2 MB, que es el peor caso posible para comprimir,
  salen 600×450 y 66 KB. El ayudante estaba en `10-refacciones.html` y se mudó
  aquí en cuanto lo necesitaron dos documentos.

  Se encoge **al elegirla, no al enviar**: así se ve el tamaño real de lo que
  se va a subir y el envío no se queda pensando. El blob espera en
  `window.fotoAreaLista`.

  Se sube **después** de validar toda la encuesta, o cada arrepentimiento
  dejaría un archivo huérfano en el bucket. La URL se guarda dentro de
  `answers_json`, bajo `window.LLAVE_FOTO_AREA` (`__foto_area`), igual que los
  motivos y por lo mismo: así no hay columna nueva que crear. Lo que sí hace
  falta es el bucket `fotos-evaluaciones`, y su script está en
  `sql/fotos-evaluaciones.sql`; sin correrlo la foto se toma y se encoge igual
  pero el envío avisa de que falta. Ese script no da permiso de borrado a
  propósito.

  El campo se abre con un `<label for>` y no con un `.click()` sobre el input
  escondido: en iOS ese click programático es indistinguible del toque fantasma
  de las ruedas (ver más arriba).

  **La última foto de cada área sale en las estadísticas**, encabezando su
  tarjeta en «Comparativa de desempeño por áreas», con la fecha en que se tomó
  y ampliable al tocarla. No se traen con el resto de las respuestas —que se
  piden sin `answers_json`—, sino en una consulta aparte que filtra por la
  llave del jsonb (`.not('answers_json->>__foto_area', 'is', null)`), ordenada
  de la más reciente y con tope de 400 filas: la primera de cada área es la que
  se enseña. Si esa consulta falla, la sección se dibuja igual sin foto.

  El área se agrupa por nombre normalizado con `window.claveDeArea()`: la
  respuesta guarda el nombre que tenía el empleado ese día y la pantalla agrupa
  por el de su ficha, así que «Planta 1» y « planta 1 » tienen que caer en el
  mismo sitio. La foto **no** sigue al filtro de periodo de esa pantalla: es
  siempre la última que hay, y por eso lleva la fecha encima.
- **Una encuesta se entrega completa.** No se puede enviar dejando preguntas en
  blanco: `enviarRespuestasEval` reúne lo que falta —lo sin contestar y los
  motivos sin escribir—, lo dice todo junto en un solo aviso, señala en rojo
  las tarjetas `.pregunta-card` que faltan y lleva la pantalla a la primera. Ir
  descubriendo pega a pega en qué pregunta se quedó uno es lo que hace que se
  abandone a medio llenar.

  A una pregunta sin contestar se le reclama la respuesta y **no** además el
  motivo: pedir las dos cosas a la vez de la misma pregunta se lee como si
  fueran dos fallos. Lo que ya estaba guardado a medias se queda como está;
  esto sólo mira lo que se envía de aquí en adelante.

  `is_obligatory` es otra cosa: dice que la encuesta no se puede dejar sin
  contestar, no que haya que llenar todas sus preguntas.
- **Una pregunta de opciones puede decir cuáles son correctas, y entonces se
  califica sola.** Es lo que convierte una encuesta en un examen: al crearla se
  marca con ✔ la opción —o las opciones— que dan por buena la respuesta, y al
  enviarla queda calificada sin que nadie la revise. Si todas las preguntas son
  así, la respuesta se guarda ya como `'Revisado'` —lo decide `autoGradedCount`,
  el mismo camino de la escala— y quien la contestó ve su resultado al momento.
  Sin marcar ninguna todo sigue como antes: la califica quien revise. Las reglas
  viven en `1-config.js`:

  ```js
  window.opcionesCorrectas(pregunta)             // [] si no se marcó ninguna
  window.seCalificaSola(pregunta)                // si hay alguna marcada
  window.aciertaEnOpciones(pregunta, respuesta)  // si acertó
  ```

  En `multiple` basta con haber elegido **una** de las correctas —marcar varias
  es dar por válidas varias salidas—; en `checklist` hay que marcar
  **exactamente** ésas, ni una de más ni una de menos, que es lo que se está
  preguntando.

  Van **dentro de `correct_answer_text`**, así que no hay columna nueva ni
  script que correr. Ese campo no guardaba aquí nada aprovechable: era el
  arreglo con **todas** las opciones, copiado del propio campo de opciones. Lo
  nuevo se escribe como **objeto** (`{"correctas": [...]}`) precisamente para
  distinguirlo: un arreglo se lee como «no se marcó ninguna», y por eso las
  encuestas de antes se siguen calificando a mano en vez de darse todas por
  correctas de golpe. La pantalla de calificar enseña las marcadas —«Opción
  correcta: ✔ …»— en lugar del JSON crudo que salía antes, y dice «se calificó
  sola» junto a los botones, que siguen ahí para corregirla.

  El envío escribe en `grades_json` la misma forma que pone `setGrade` a mano
  —`{ type: 'standard', status, question }`—, más un `auto: true` que sólo sirve
  para decirlo en pantalla. Quien la recalifique a mano lo pierde, que es lo
  correcto.

- **Una pregunta con opciones pide además el porqué.** Marcar una casilla no
  dice por qué se marcó, y en una encuesta de seguridad eso es justo lo que hay
  que saber: «no» a secas y «no, porque la máquina estaba en paro» son
  hallazgos distintos. Los tipos de `window.PREGUNTAS_CON_MOTIVO` —hoy
  `multiple`, `checklist` y `range`— llevan un campo de texto obligatorio
  debajo de las opciones, y `enviarRespuestasEval` no deja enviar sin él. Fuera
  quedan `text` —que ya es texto libre— y `list_match`, que es una lista de
  elementos y no una elección.

  **Una pregunta que se califica sola no lleva motivo.** Ahí sí hay una
  respuesta buena y otra mala —se acierta o no se acierta—, y pedir además el
  porqué de cada una convierte un examen de diez preguntas en diez redacciones:
  es la diferencia entre examinar y levantar hallazgos. Lo decide
  `window.llevaMotivo(pregunta)`, que es por donde pasan el formulario, el
  envío y la pantalla de calificar; `pideMotivo` se apoya en él.

  **`range` lleva motivo y sigue calificándose sola.** Un 0 en «existe un
  estándar de 5S» vale como hallazgo sólo si dice qué se encontró, pero eso no
  toca su calificación automática: el estado lo decide `autoGradedCount` al
  enviar, así que una encuesta toda de escala —las de 5S, y las de modo
  `boss`— se sigue guardando ya como `'Revisado'`. Su motivo se lee abriendo la
  respuesta.

  **En una escala, el tope no pide explicación.** Es el «todo bien»: no hay
  hallazgo que contar. Cualquier valor por debajo sí, y ahí está lo que hay que
  corregir. Lo decide `window.pideMotivo(pregunta, valor)`, que para todo lo
  que no sea `range` responde siempre que sí —en una pregunta de opciones
  ninguna respuesta es la buena—. El tope sale de `window.maximoDeEscala()`,
  que también usan el formulario al dibujar los círculos y el envío al
  calificar: tres copias del parseo de `options` acabarían discrepando. El
  rótulo lo dice en cuanto se elige, con el asterisco o un «(opcional)», para
  no reclamar al enviar algo que no hacía falta.

  Se pide **sólo de lo que se contestó**: a lo que aún no tiene opción marcada
  se le reclama antes la respuesta. Al revés sí se guarda —quien escribe el
  motivo y olvida marcar no pierde lo escrito—.

  Los motivos viajan **dentro de `answers_json`**, bajo la llave reservada
  `window.LLAVE_MOTIVOS` (`__comentarios`), no en una columna nueva: así no hay
  otro script que correr a mano. Las demás llaves de ese objeto son ids de
  pregunta, siempre numéricos, de modo que no pueden chocar, y todo lo que ya
  lee `answers_json` lo hace por id y no se entera. Se leen con
  `window.motivoDePregunta(respuesta, idPregunta)`.

  Ojo con `guardarCalificacionAdmin`, que en modo administrador **reescribe
  `answers_json` entero** a partir de los campos de la pantalla: parte de una
  copia de lo que había (`{ ...window.respuestasTempAdmin }`) y por eso el
  motivo sobrevive. Quien toque ese bloque tiene que seguir partiendo de la
  copia, o calificar borraría las explicaciones. El motivo se enseña al
  calificar pero no se edita ahí: lo escribió quien contestó.

  Lo contestado antes de que existiera esta regla no trae motivo, y la pantalla
  de calificar lo dice en lugar de dejar el hueco en blanco.
- **Una escala puede explicar qué significa cada valor.** «¿Existe un estándar
  de 5S?» del 0 al 3 no se contesta igual si nadie dice qué es un 2, y dos
  personas calificando lo mismo ponen números distintos. Por eso cada pregunta
  de tipo `range` lleva su propia guía: un texto largo, con los saltos de línea
  con que se escribió, que sale **plegado** entre el enunciado y los círculos
  —al contestarla y al calificarla, que el criterio tiene que ser el mismo para
  los dos—.

  ```js
  window.guiaDeEscala(pregunta)      // '' si no tiene
  window.bloqueGuiaEscala(pregunta)  // el <details>, o '' si no hay nada que decir
  ```

  Es **de la pregunta**, y no hay que confundirla con las etiquetas de
  `evaluations.range_labels`, que son **de la encuesta entera** y caben en dos
  palabras debajo de cada círculo. Las dos pueden convivir.

  Viaja en la **cuarta posición de `options`** —que para una escala es
  `[min, max, paso, guía]`— y no en una columna nueva, así que no hay ningún
  script que correr: todo lo que ya lee `options` de una escala mira sólo las
  tres primeras. El índice está en `window.PLAZA_GUIA_ESCALA` y el parseo del
  campo, que llega unas veces como arreglo y otras como el texto JSON de
  PostgREST, se hace en un solo sitio: `window.opcionesDePregunta()`.

  El campo para escribirla está en la tarjeta de la pregunta, dentro del bloque
  que ya sólo salía para las escalas (`.range-info-container`), así que aparece
  y desaparece al cambiar el tipo como el resto de los campos. Cambiar una
  pregunta de escala a otro tipo **pierde la guía**, igual que se pierden las
  opciones: `guardarNuevaEvaluacion` rearma `options` desde cero según el tipo.

- **Quién califica una respuesta.** Tampoco lo dice ninguna tabla por defecto:
  la califica el **jefe inmediato** de quien contestó, y esa regla la sostiene
  el código. Una encuesta puede en cambio nombrar a sus propios revisores en
  `reviewer_employees`, y entonces deja de ser cosa del jefe. La regla vive en
  `1-config.js` porque la usan cinco pantallas —la lista de encuestas, el
  historial, el detalle de una respuesta, los pendientes y el badge del panel—
  y cinco copias acabarían discrepando:

  ```js
  window.leTocaRevisar(ev, empleadoQueContesto, revisorId)
  window.revisoresDeEncuesta(ev)        // vacío = el jefe inmediato
  window.encuestasQueRevisa(encuestas, revisorId)
  ```

  **Nadie califica su propia respuesta.** La de un revisor se la quedan los
  demás revisores; si no hay más, la lista sale vacía y vuelve a su jefe
  inmediato, que es preferible a dejarla sin nadie que pueda tocarla. Por eso
  las consultas **no** filtran por encuesta —`.in('evaluation_id', …)` no sabe
  de ese caso—: se traen las respuestas del equipo directo como siempre y es
  `leTocaRevisar` quien decide, con lo que la lista de pendientes y el badge no
  pueden separarse de la regla.

  El nombramiento **no depende de ser jefe de nadie**, así que quien revisa una
  encuesta la ve en su lista aunque no le toque contestarla —si no, no tendría
  por dónde entrar una vez resuelto el pendiente— y ahí no le sale el botón de
  responder, sino el aviso de que le toca revisarla. La insignia de
  clasificación certificada sigue contando sólo lo que le tocaría contestar:
  habla de otra cosa.

  El modo `boss` es aparte: esa encuesta la contesta el jefe y
  `4-evaluaciones-base.js` la guarda ya como `'Revisado'`, así que no hay nada
  que repartir y el bloque de revisores se esconde en la hoja.

  **Quien revisa una encuesta puede además corregir a quién va dirigida**, sin
  ser administrador y sin tocar nada más: es el instructor que la imparte y es
  quien sabe a quién le falta tomarla. Se entra por dos sitios: el lápiz de la
  tarjeta en la lista —el mismo que tiene el administrador— y el botón «👥
  Editar a quién va dirigida» de la pantalla de la encuesta, debajo del de
  responder. Los dos llaman a `window.editarDestinatariosEncuesta(id)`, que
  comprueba el permiso con `window.puedeEditarDestinatarios(ev, empleadoId)`
  (en `1-config.js`, junto a las demás reglas de revisión).

  Ese botón **no cuelga de cuál sea la acción principal de la pantalla**.
  Colgaba del aviso de «te toca revisar esta encuesta», que sale sólo cuando la
  encuesta **no** va dirigida a quien mira; al revisor al que además le tocaba
  contestarla —que es lo normal— le salía el botón de responder y nunca el
  otro. Hoy se decide aparte, con el permiso y nada más.

  Es **la misma hoja** `#modal-crear-eval` con todo lo demás escondido, no una
  segunda: así el selector de puestos, departamentos y personas sigue siendo
  uno solo. Lo esconde `window.aplicarModoSoloDestinatarios(activo)` a partir
  de la lista `window.SECCIONES_FUERA_DE_DESTINATARIOS`, y por eso **cada
  bloque de esa hoja lleva id** —`grupo-datos`, `grupo-opciones`,
  `grupo-preguntas`…—: un bloque nuevo que no sea de destinatarios hay que
  añadirlo a esa lista o se le quedará a la vista al revisor. El título de la
  encuesta se va con el bloque «Datos», así que en este modo lo dice el
  subtítulo del encabezado.

  **Y la pantalla de inicio dice de cuáles es revisor**, en la tarjeta que
  llena `window.cargarEncuestasQueReviso(userId)` (`2b-core-dashboard.js`)
  dentro de `#container-encuestas-reviso`. Hacía falta porque revisar no
  depende de ser jefe de nadie y no se notaba en ninguna parte: la encuesta
  puede no tocarle a él —así que no le sale como pendiente— y el badge sólo se
  enciende cuando alguien ya contestó. Cada renglón lleva lo que espera su
  calificación, con el mismo filtro del badge de `calcularPendientesBatch`
  —`'Pendiente'` y `'Mal Revisada'`, sin las respuestas propias, que vuelven al
  jefe inmediato—, y abre la encuesta con `window.abrirEncuestaQueReviso`, que
  monta antes la lista porque el detalle se dibuja dentro de su hoja. Sin
  encuestas que revisar la tarjeta no se dibuja: quien no sea revisor no ve
  nada nuevo en su inicio.

  El guardado es otro: `window.guardarNuevaEvaluacion` desvía a
  `window.guardarDestinatariosEncuesta` en cuanto ve `editandoSoloDestinatarios`,
  porque el guardado entero lee el título, la escala y las preguntas —campos
  escondidos, que escribiría con lo que hubiera quedado dentro—. Sólo escribe
  las tres columnas de destinatarios, que arma
  `window.destinatariosDeLaHoja()` para los dos. Y **cuenta las filas que
  devuelve el `update`**: aquí escribe alguien que no es administrador y una
  política de RLS que lo rechace no da error, simplemente no afecta a ninguna
  fila.

  **La columna es nueva y el script se corre a mano** (`sql/revisores-por-encuesta.sql`).
  Pedirle a PostgREST una columna que no existe no devuelve la fila sin ese
  campo: revienta la consulta entera. Por eso toda consulta que la pida arma su
  lista de columnas con `window.camposConRevisores(campos)`, que se apoya en
  `window.hayColumna(tabla, columna)` —una sola pregunta por columna y por
  sesión, guardada como promesa—. Ése es el molde de todas las columnas que
  añade un script de `sql/`: `window.camposConColumna(campos, tabla, columna)`
  y un envoltorio con nombre. Sin la columna todo se comporta como antes, la
  casilla se queda apagada y la hoja dice qué script falta.
- **Quién manda en las refacciones.** El permiso para ver todas las
  solicitudes de la empresa —y para repartirlas entre atendedores desde el
  mapa— no va por puesto sino por **encargo extra**: en «Configurar permisos»
  se marcan los encargos que autorizan y los tiene quien los lleve en su ficha.
  La regla vive en `1-config.js` porque la usan dos documentos distintos,
  `10-refacciones.html` y `11-mapa-activos.html`, que no comparten más
  JavaScript que ese archivo:

  ```js
  await window.tienePermisoRefacciones()            // se los pregunta a la base
  await window.tienePermisoRefacciones(misEncargos) // si ya se tienen a mano
  ```

  Los encargos del usuario **no se leen de `usuarioLogueado`**: la sesión dura
  treinta días y un encargo asignado después no aparecería ahí. El panel los
  saca de su caché de empleados y se los pasa al helper; el mapa, que no tiene
  esa caché, deja que el helper los consulte. El modo administrador es aparte:
  viaja en `sessionStorage` y sigue valiendo al pasar de una pantalla a la
  otra (ver más arriba).
- **No toda clasificación se certifica, y eso se decide por clasificación.**
  Certificar es de una clasificación entera —se da fe de lo que alguien
  contestó en «Seguridad» ese periodo—, así que la decisión no vive en la
  encuesta sino en la tabla `clasificaciones_certificacion`, con el nombre
  normalizado por llave. La que no tiene fila se certifica, que es lo de
  siempre: sólo hacen falta filas para las que se apaguen.

  ```js
  await window.cargarCertificacionDeClasificaciones()   // llena la caché
  window.clasificacionSeCertifica(nombre)               // sin esperar a nadie
  await window.guardarCertificacionDeClasificacion(nombre, requiere)
  ```

  Se enciende y se apaga desde el conmutador que sale al elegir una
  clasificación en **«⭐ Certificar por Clasificación»**; apagada, la pantalla
  no lista a nadie y lo dice. Las encuestas de esa clasificación se siguen
  contestando, calificando y contando en las estadísticas.

  `estadoCertificacion` lo pregunta **sin poder esperar**, así que la caché se
  llena antes: `cargarVistaEvaluaciones` y `abrirExpedienteEmpleado` la piden
  al entrar, y la pantalla de certificar la relee de la base cada vez que se
  abre, porque es la que la cambia. Mientras no esté cargada, todo se
  certifica: es lo que hacía antes y lo que deja la aplicación en pie sin la
  tabla.

  El script es `sql/clasificaciones-certificacion.sql`. Hubo antes una columna
  `evaluations.requires_certification` que hacía esto por encuesta; ya no la
  lee nadie y se puede borrar.

  **El puntaje mínimo es cosa aparte**, y lo dice `requires_min_score` con la
  misma forma: nula o `true` es lo de siempre, `false` quita el mínimo. Las dos
  banderas son **independientes** y así se presentan: una encuesta puede no
  certificarse y aun así exigir el 80% —de ahí sale el plazo para repetirla—, y
  al revés, certificarse con el puntaje que sea porque se contesta para dejar
  constancia y no para aprobar. Ninguna casilla apaga a la otra; lo único que
  las ata es que la columna llega en el mismo script.

  ```js
  window.exigeMinimo(ev)   // sin encuesta a mano, exige
  ```

  Se mira en tres sitios: al resumir la certificación (`estadoCertificacion`,
  que manda la respuesta a `certificables` o a `bajoUmbral`), en la puerta de
  una respuesta suelta (`motivoNoAplicable`, por donde pasan tanto certificar
  de una en una como el lote) y en el plazo de reintento. En los dos primeros
  la encuesta se busca en `window.encuestaEnCache`, y si no aparece se exige el
  mínimo: es preferible no dar por buena una respuesta que dar por buena la que
  no se debía.

  **Y cuánto tiempo hay para reponerla** lo dice `retry_days`, en días. En 0
  —el valor por defecto— no pasa nada. Con un número, una respuesta ya
  calificada por debajo del mínimo vuelve a salir en los pendientes de quien la
  contestó, con la insignia «🔁 Repetir en 3 días»:

  ```js
  window.reintentoDeRespuesta(ev, resp, fecha)   // null si no hay nada que reponer
  ```

  Se engancha en `esEvaluacionPendiente`, justo detrás de «mal revisada» y por
  las mismas razones: la contestó, pero no cuenta. Con eso lo heredan la
  pantalla de pendientes, el badge del panel y el calendario sin tocarlos; lo
  que sí hubo que hacer es pasarle la encuesta —quinto argumento— y traerse
  `review_status` y `grades_json` en las dos consultas de respuestas, porque
  sin el puntaje no se sabe si hay que reponerla.

  **Tres cosas tienen que llegarle o el plazo se dispara donde no debe**, y las
  tres se colaron alguna vez:

  - **`requires_min_score`, en la consulta.** `exigeMinimo` lo lee del objeto
    de la encuesta, así que una columna que no se pidió llega `undefined` y eso
    no es `false`: se pedía repetir hasta las encuestas que tienen apagado el
    mínimo. Toda consulta que vaya a decidir un pendiente arma sus columnas con
    `window.camposConMinimo(...)`, encadenado con `camposConReintento` —lo
    hacen `7-pendientes.js` y `2b-core-dashboard.js`—.
  - **Alguna pregunta calificada.** `calcularScoreRespuesta` devuelve 0 tanto
    cuando se falló todo como cuando no hay nada que calificar, y las dos cosas
    no son lo mismo: una encuesta de modo jefe hecha sólo de evidencias
    fotográficas se guarda ya `'Revisado'` con `grades_json` vacío y pedía
    repetirse para siempre. Lo tapa `window.tieneCalificaciones(resp)`, en
    `1-config.js`, antes de mirar el puntaje.
  - **Que quien mira sea quien la contesta**, que es el sexto argumento de
    `esEvaluacionPendiente` (`contestaQuienMira`). Reponer una respuesta le
    toca a quien la contesta, y en una encuesta de modo jefe no es el evaluado
    sino su jefe: al evaluado le salía «Esperando evaluación» con la insignia
    de repetir y un botón que no resuelve nada, y del lado del jefe no aparecía
    porque su consulta de respuestas del equipo no traía `review_status` ni
    `grades_json`. Nadie podía quitarlo. Hoy la de modo jefe se repone desde
    «Evaluar a …», con la nota en tercera persona, y la de modo `self` desde el
    panel del propio interesado. Lo demás —el periodo, la racha, «mal
    revisada»— no depende de quién mire y se decide igual para los dos.

  **Un pendiente de reintento se explica solo.** «Vuelve a contestarla» no le
  dice nada a quien ya la contestó, así que la tarjeta sustituye el bloque del
  periodo por el de `window.bloqueDeReintento(reintento, vencida, persona)`, en
  `7-pendientes.js`, que dice las cuatro cosas que faltan: **que el pendiente
  se reactivó** —y no que falte contestarla—, por qué —qué sacó contra qué se
  pide—, hasta cuándo hay —o desde cuándo venció, y entonces en rojo— y **qué
  se espera que haga**, que es generar contramedidas para lo que salió mal y
  volver a evaluar, no repetir la misma respuesta. Esa última línea va aparte,
  en `.pendiente-nota-accion`. El puntaje salió de la insignia porque ahí sólo
  cabe el plazo, y el botón dice «Repetir» en vez de «Responder».

  Con `persona` el mismo bloque habla de un tercero —«Se reactivó por la baja
  puntuación de Luis», «acuerda con Luis las contramedidas»—: es la encuesta de
  modo jefe, que la repone quien evalúa y no el evaluado. Lo pasa la tarjeta
  «Evaluar a …» con el nombre de pila del colaborador.

  Ese bloque es `.pendiente-nota` —en `estilos.css`, con su variante
  `.vencida`— y va como **una fila más del `.card-header`**, nunca dentro de
  `.card-info`. Cualquier explicación nueva que se le quiera poner a un
  pendiente va igual.

  **El plazo se cuenta desde que se envió, no desde que se calificó**: la base
  no guarda cuándo se calificó. Si la revisión tarda más que el plazo, el
  pendiente sale igual pero ya vencido —visible y accionable—; lo que no puede
  pasar es que no salga. Para contarlo desde la calificación haría falta una
  columna `reviewed_at` sellada al calificar.

  Las tres columnas van en `sql/certificacion-por-encuesta.sql`, que se puede
  correr las veces que haga falta —cada una se crea sólo si no está—. Sin
  correrlo, todas las encuestas se consideran certificables y con mínimo, sin
  plazo de reintento —como hasta ahora— y los controles se quedan apagados
  avisando de qué falta.
- **Certificar es de una persona y de un periodo.** Certificar quiere decir dar
  fe de que las respuestas de alguien son verídicas, así que la unidad es
  **clasificación × empleado × periodo**. Sin el periodo, el sello de enero
  seguiría valiendo en diciembre, que es justo lo que hacía la insignia vieja:
  tomaba la última respuesta calificada que hubiera —`.find()` sobre la lista
  ordenada por fecha— sin mirar en qué periodo caía, así que la certificada de
  julio tapaba la de agosto sin revisar, y una anulada reciente ni siquiera la
  tumbaba porque `.find()` también se la saltaba.

  La regla vive en `1-config.js` porque la usan el panel del usuario y las
  pantallas del administrador:

  ```js
  window.estadoCertificacion(encuestasQueLeTocan, susRespuestas, fecha)
  // → { estado, total, contestadas, certificadas, observadas, calificadas,
  //     bajoUmbral, sinCalificar, sinContestar, periodo, periodoFechas,
  //     certificables }
  window.insigniaCertificacion(resumen)   // el mismo texto en todas las pantallas
  ```

  Una clasificación puede mezclar frecuencias, así que **no hay un periodo de la
  clasificación**: cada encuesta se mira en el suyo con
  `window.periodoDeEncuesta(ev, fecha)`, que se apoya en el `periodoVigente` de
  `7-pendientes.js` —se carga después que `1-config.js`, pero para cuando
  alguien llama ya está puesto—. Las de `once` cuentan «alguna vez». El nombre
  del periodo que se enseña sale de la encuesta más frecuente del grupo, que es
  la que marca el ritmo de revisión.

  Los cinco estados son `vacio`, `proceso`, `lista`, `certificada` y
  `observaciones`. El último manda sobre todos: una anulada o mal revisada hay
  que resolverla antes de dar nada por bueno, y antes se veía igual que
  «todavía no».

  **La verdad sigue en `evaluation_responses.review_status`**, que es lo que
  leen estadísticas, pendientes y dashboard. Certificar una clasificación
  (`window.certificarClasificacionExpediente`) sella esas respuestas una por
  una, con las mismas reglas que `motivoNoAplicable()` —nada que no se pudiera
  hacer respuesta por respuesta, y el umbral de
  `window.UMBRAL_CERTIFICACION`—. Lo que añade la tabla
  `certificaciones_clasificacion` (script en `sql/`) es el **acta**: quién dio
  fe, cuándo y de qué periodo, que antes no quedaba en ningún lado. La insignia
  **no** se lee del acta sino de las respuestas: si mañana se anula una, la
  clasificación deja de estar certificada aunque el acta siga guardada, que es
  lo correcto para una auditoría. Si la tabla todavía no existe porque el
  script no se ha corrido, la certificación se hace igual y sólo se avisa de
  que no hubo constancia.

  La clasificación es texto libre —un `input` con datalist, sin catálogo—, así
  que todo lo que la compare o la guarde pasa por
  `window.normalizarClasificacion()`. Aun así, renombrarla en una sola encuesta
  parte el grupo y deja las actas viejas colgando de un nombre que ya no existe.

  Se certifica desde dos sitios, y los dos son del modo administrador:
  **«⭐ Certificar por Clasificación»** (`abrirCertificacionPorClasificacion`)
  toma una clasificación y enseña a quien la tiene lista; y el **expediente por
  empleado** trae el mismo botón en su bloque de «listas para certificar», para
  resolver a una persona sin salir de ahí.

  Esa pantalla tiene **dos modos**. En reposo lista **sólo a los que están
  listos**, acotables por departamento; los demás estados se cuentan en el
  encabezado pero no se listan, porque se certifica de una persona en una
  persona y ver a los cuarenta que aún no han contestado no ayuda a encontrar
  al que sí. **En cuanto se escribe algo en el buscador aparece cualquiera**,
  en el estado que sea y de cualquier departamento —si escribes un nombre es
  porque quieres ver a esa persona, no que te digan que no califica—, y su
  renglón dice qué le falta con `window.faltaParaCertificar(resumen)`. La
  búsqueda **se salta el filtro de departamento** a propósito y lo avisa en el
  encabezado.

  Tiene además **dos vistas** (`#vista-cert`): «Por certificar», que es lo de
  arriba, y «Certificadas», que lista a quien ya tiene la clasificación cerrada
  en ese periodo. Y un **selector de periodo** para mirar hacia atrás, que sale
  de `window.periodosDeClasificacion(encuestas, cuantos)`: los últimos doce
  periodos del ritmo de la clasificación —el de su encuesta más frecuente,
  `window.encuestaQueMarcaElRitmo()`—, cada uno con la **fecha de referencia**
  que hay que pasarle a `estadoCertificacion`, que es el último instante del
  periodo y no su inicio, para que caiga dentro aunque ya esté cerrado. Los
  periodos pasados se nombran por su fecha (`window.etiquetaDePeriodo`) porque
  `periodoVigente` los llama a todos «este mes».

  Cambiar de periodo **recarga**, porque cambian las respuestas que hay que
  traerse: la consulta lleva `gte` y también `lt`, o mirando atrás se traería
  todo lo posterior para nada. Certificar un periodo cerrado se puede, y el
  aviso de confirmación lo dice.

  La vista de certificadas es la única que lee la tabla de actas
  (`window.actasDeClasificacion`), y sólo para el renglón de «Dio fe Fulano ·
  fecha»: quién sale en la lista se sigue decidiendo por las respuestas. Sin la
  tabla, la lista se dibuja igual y ese renglón dice sólo cuántas encuestas
  cubre.

  A quien no está listo no se le ofrece el botón de certificar ni casilla: se
  entra a su expediente desde «Abrir» y se resuelve allí. El buscador y el
  desplegable viven **fuera** de `#cuerpo-certificacion` porque repintar la
  lista se los llevaría por delante y el foco se perdería a cada letra; el
  desplegable se arma con los departamentos de toda la gente a la que le toca
  la clasificación, no sólo de los listos, para que no se vacíe según se van
  certificando. Nada viene marcado de entrada y «Marcar todas» sólo alcanza a
  los listos que se están viendo: con un filtro puesto, marcar a los que
  quedaron fuera sería marcar a ciegas. `window.certificarSoloA(id)` es el
  atajo de un toque y entra por la misma función que el lote —devolviendo su
  promesa, o nadie podría esperar a que termine ni enterarse de un fallo—. El primero acota la consulta con
  `.in('evaluation_id', …)` y un `.gte('submitted_at', …)` calculado del
  periodo más temprano en juego: sin eso se traería el historial completo de
  toda la empresa. Una encuesta de `once` no se puede acotar —su periodo es
  «desde siempre»— y entonces no se filtra por fecha.

  **A quién le toca una encuesta también vive en `1-config.js`**
  (`window.leTocaEstaEncuesta(ev, empleado, tieneEquipo)`), y por lo mismo: el
  administrador tiene que preguntarlo de otras personas, y dos copias de la
  regla acabarían certificando un juego de encuestas distinto del que ve el
  interesado. Acota por destinatarios concretos (`target_employees`, que manda
  sobre todo lo demás), por puesto y por departamento; una lista vacía o con
  `'ALL'` no acota nada.

  **`is_obligatory` no tiene nada que ver con a quién le toca.** Significa que
  no se puede dejar sin contestar —así lo dice la casilla del formulario, «Si
  se desactiva, será opcional»—, y lo usan las estadísticas para el aviso de
  «¡Faltan Obligatorias!». Esta regla llevaba un `if (ev.is_obligatory !==
  false) return true;` que salía **antes** de mirar el puesto, así que una
  encuesta obligatoria dirigida a ciertos puestos se le contaba a todo el
  mundo: de ahí que el avance de una clasificación dijera «6 de 7» a quien
  sólo tenía seis. Era la única regla del proyecto que lo hacía —el dashboard,
  los pendientes y las estadísticas siempre respetaron puesto y
  departamento—, y ya no.

  Quien pregunte por una persona concreta tiene que filtrar con ella: el
  expediente por empleado contaba todas las encuestas de la clasificación sin
  mirar si le tocaban, y por eso su aviso de certificación decía que quedaba
  una sin contestar que esa persona nunca tuvo asignada. Toda consulta que
  vaya a usar esta regla necesita traerse `mode`, `is_obligatory`,
  `target_employees`, `target_positions` y `target_departments`.

  **Las estadísticas usan esta misma regla, en los cinco sitios donde deciden
  qué está asignado**: el conteo de asignadas, el filtro de respuestas, el
  radar y los dos desgloses por colaborador. Antes cada uno miraba sólo puesto
  y departamento, así que una encuesta dirigida a tres personas concretas —o
  una de modo jefe— se le contaba como asignada a la plantilla entera. Eso
  engordaba el denominador y hacía que «Certificadas» del desglose no cuadrara
  con el panel de certificación: con los mismos datos, uno decía 50% y el otro
  100%. `tieneEquipoDirecto` recorre la plantilla, así que se resuelve una vez
  por persona y no una vez por encuesta.

  Queda una diferencia a propósito: en modo administrador las estadísticas
  incluyen las encuestas apagadas y el panel de certificación nunca. Es la
  regla de `active` de más arriba, y por eso un administrador puede ver
  números distintos en las dos pantallas si hay encuestas inactivas.

  `window.sanitizeForHTML` se mudó de `4b-evaluaciones-stats.js` a
  `1-config.js`: lo usan las pantallas del administrador, que se cargan antes,
  y un ayudante de escapado no puede depender del orden de carga.

- **Una encuesta inactiva sigue existiendo, pero sólo para el administrador.**
  La columna `active` de `evaluations` decide quién la ve: apagada, la encuesta
  desaparece de la lista, de los pendientes, de las encuestas atrasadas y de
  las estadísticas de todo el mundo salvo de quien tenga el modo administrador
  encendido. Sus respuestas no se tocan y volver a encenderla la devuelve tal
  cual estaba, que es lo que la separa de borrarla.

  ```js
  window.encuestaActiva(ev)   // en 1-config.js; si el campo no vino, activa
  ```

  Se apaga y se enciende desde el botón 🚫/✅ de la tarjeta —
  `window.alternarEncuestaActiva(id, activar)` en `4-evaluaciones-admin.js`— o
  desde la casilla «Activa» de la hoja de crear y editar.

  Los pendientes salen de dos sitios y hay que apagar los dos. Las consultas
  que preguntan **qué encuesta falta por contestar** parten de `evaluations` y
  ya filtraban por `active` (`2b-core-dashboard.js`, `7-pendientes.js`,
  `6-calendario.js`). Las que preguntan **qué respuesta falta por calificar**
  parten de `evaluation_responses`, que no tiene ese campo: se traen `active`
  en el embebido —`evaluations(title, active)`— y descartan al dibujar
  («Revisión: …» y «Mal Revisada: …» en `7-pendientes.js`), o acotan por
  `evaluation_id` a las encendidas (el badge `countPorCalificar` de
  `2b-core-dashboard.js`). Si el embebido viene vacío porque la encuesta ya no
  existe, el pendiente se deja pasar, que es como estaba antes. **Toda consulta
  nueva que liste encuestas o respuestas a un usuario tiene que filtrar
  igual.**

  La lista de `4-evaluaciones-base.js` es la excepción: se trae también las
  inactivas y las esconde al dibujar. Filtrarlas en la consulta ataría
  `window.evalCache` al modo que hubiera al cargarla, y encender el modo
  administrador no la invalida. La cronología de esa misma pantalla sí recibe
  la lista completa: sólo la usa para saber de qué clasificación era cada
  respuesta ya contestada, y apagar una encuesta no borra el historial de
  nadie.

  Lo que no mira `active` es el calendario: una encuesta programada a una
  persona concreta en `scheduled_evaluations` sigue apareciendo en su día
  aunque después se apague la encuesta. Esa programación es una asignación
  explícita y se cancela desde el propio calendario.
- **La tarjeta de un pendiente se parte en filas en el teléfono.** El
  `.card-header` reparte el ancho en tres columnas —el icono, el texto y el
  botón—, y en un iPhone 12 mini la tarjeta mide 329px: descontando los 60 del
  icono, los 90 de `.card-actions` y los rellenos, a la columna del texto le
  quedaban **107px**. El título salía en tres renglones, cada insignia en dos y
  el bloque de detalle en una tira de una palabra por línea.

  Por eso el encabezado lleva `flex-wrap: wrap` y, en `@media (max-width:600px)`,
  el icono baja a 48px, `.card-info` va a `flex: 1 1 0%` y `.card-actions` a
  `flex: 1 1 100%`: con esa base el botón ya no cabe en la primera fila y se va
  solo a la suya, a lo ancho, que además es un blanco mucho más fácil para el
  dedo. La columna del texto pasa de 107 a **233px** y las tarjetas encogen
  —la de reintento, de 342 a 289px—. En pantalla ancha no cambia nada: la
  primera fila sigue cabiendo entera.

  El orden de las filas lo decide `order`, no el marcado: `.pendiente-nota`
  está en el HTML entre el texto y el botón, pero lleva `order: 1` para caer
  **debajo** del botón en pantalla ancha —donde el botón está a la derecha, no
  estorba— y vuelve a `order: 0` en el teléfono, para explicar qué pasó
  **antes** de pedir la acción.

  Y `.card-info` lleva `min-width: 0` —con `flex-shrink: 0` en
  `.card-actions`—: sin eso la columna del texto no encogía por debajo de su
  insignia más ancha («📉 6 meses sin contestar», 150px) y empujaba el botón
  fuera del borde de la tarjeta, cortado por la mitad y sin que el dedo
  llegara.

  Estas cuatro clases —`.card-header`, `.card-info`, `.card-actions`,
  `.thumb-container`— **sólo las usa `7-pendientes.js`**; `.incident-card` a
  secas sí la comparten objetivos, hallazgos y el detalle de una respuesta, y
  ésa no se toca aquí.
- **Las estadísticas tienen dos desgloses y dos orígenes.** Por
  departamentos, los conteos vienen del reporte `obtener_estadisticas_empleados`,
  que suma todos los registros del filtro en la base. Por registro, en cambio,
  se traen los incidentes con sus firmas incrustadas
  (`incidents … incident_signatures(employee_id)`, de 25 en 25) y el avance se
  calcula en el navegador, así que bajar a departamento → supervisor →
  colaborador no cuesta ninguna consulta más. Como uno lo calcula la base y el
  otro el navegador, sus totales pueden discrepar un poco si la función SQL
  no aplica exactamente la regla de arriba.

  Lo que salva la parte de los exentos y las bajas es que el reporte devuelve
  **una fila por empleado**: el navegador la cruza con
  `window.todosLosEmpleadosData` y descarta la fila entera, así que descontar a
  alguien no necesita tocar la función SQL. Lo que sí puede discrepar es la
  fecha de alta, que la aplica la base por su cuenta.
- **El orden de las preguntas es el del documento.** `guardarNuevaEvaluacion`
  recorre los `.pregunta-wrapper` en el orden en que están y escribe su
  posición en `order_index`, así que reordenar es literalmente moverlos de
  sitio: `window.moverPregunta(btn, direccion)` intercambia la tarjeta con su
  vecina y no hay nada más que recalcular. Cualquier cosa que quite o agregue
  una tarjeta tiene que llamar a `window.renumerarPreguntas()`, que es quien
  pone el número y apaga la flecha del primero y la del último.
- **Editar una encuesta parte su historial en dos.** `answers_json` y
  `grades_json` guardan cada respuesta bajo el **id de la pregunta**
  (`evaluation_questions.id`). Editar el enunciado conserva el id, así que la
  respuesta vieja queda colgada del texto nuevo; borrar la pregunta borra su
  fila pero **deja la calificación dentro de cada respuesta anterior**, y
  agregar una deja a las viejas sin ese dato. Ninguna consulta lo limpia.

  La regla es la del periodo: lo contestado antes de la edición vale para su
  periodo con el cuestionario que había entonces, y del periodo siguiente en
  adelante manda el actualizado. `window.cuestionarioDeReferencia(respuestas,
  preguntasVigentes)` en `4b-evaluaciones-stats.js` decide cuál rige lo que se
  está mirando: si en el periodo hay aunque sea una respuesta con el juego de
  preguntas de hoy, manda el de hoy; si no, el periodo es anterior a la edición
  y manda el suyo, el más repetido. **La versión se deduce del juego de
  preguntas calificadas**, no de ninguna columna: por eso no hace falta tocar
  la base, y por eso un cambio de sólo enunciado no se detecta.

  El radar de una encuesta dibuja un eje por pregunta de ese cuestionario y en
  su orden (`window.ejesPorPregunta`), no uno por cada llave que aparezca en
  las respuestas —así dejó de dibujar preguntas ya borradas—, y las respuestas
  de otra versión se quedan fuera de la gráfica pero siguen contando en
  participación y calificación, que es lo que avisa
  `window.avisoDeVersion`. Una pregunta que nadie ha contestado todavía no
  dibuja eje: valdría cero y se leería como que todos la fallaron.

  Al calificar se copia el enunciado dentro de la calificación
  (`grades_json[idPregunta].question`, en `guardarCalificacionAdmin` y en el
  envío de `4-evaluaciones-base.js`). Es lo que permite rotular el eje de una
  pregunta que ya no existe, y sólo vale de aquí en adelante: lo contestado
  antes no lo trae y cae en «Pregunta N».

  **El rótulo de la punta lo recorta quien la dibuja, no quien la calcula.**
  `ejesPorPregunta` entrega el enunciado entero y «Pregunta N» significa una
  sola cosa: que esa pregunta no tiene enunciado en ningún lado. Partirlo para
  que quepa es de `window.rotuloDeEje(texto, anchoLienzo)`, que reparte por
  ancho —no de tres palabras en tres, que es lo que dejaba salirse a
  «de responsabilidades»— y recorta con «…» lo que pase de
  `window.MAX_LINEAS_ROTULO_RADAR` renglones. El presupuesto por renglón sale
  del ancho real del lienzo, medido al dibujar: en un teléfono, dos rótulos
  anchos a los lados dejan al polígono sin sitio. Una palabra suelta puede
  pasarse hasta un 40% antes de partirse por la mitad.

  Antes ese recorte estaba en `ejesPorPregunta` y era una guillotina: el
  enunciado de más de 40 caracteres se sustituía **entero** por «Pregunta 3»,
  así que una encuesta de 5S enseñaba media gráfica sin decir qué medía. Lo que
  no cabe se lee hoy en el globo, que dice el enunciado completo: es para lo
  que se llenaba `radarFullLabels`, que hasta entonces no lo usaba nadie.
- **Cuánto tardan en contestar sale de la fecha, no de un registro.** La base
  no guarda en ningún sitio el momento en que una encuesta apareció en el panel
  de pendientes de alguien: los pendientes se calculan al vuelo cada vez que se
  abre el panel. No hace falta guardarlo, porque el inicio es determinista —una
  mensual arranca el día 1, una semanal el lunes—, y de eso ya sabe
  `window.periodoVigente(frecuencia, referencia)` en `7-pendientes.js`, que es
  la misma definición con la que el panel decide qué te muestra.

  `window.origenDelPendiente(frecuencia, altaEncuesta, empleado, fecha)` en
  `4b-evaluaciones-stats.js` toma el más tardío de tres fechas: el inicio del
  periodo, el alta de la encuesta —antes no existía— y el alta del empleado
  —antes no estaba para contestarla—. Con eso, cada respuesta queda sellada al
  vuelo con `r.diasAtencion` y `r.prontitud` (la parte del plazo que le quedaba
  sin gastar), igual que ya se sellaba `r.finalScoreCalculated`, y los
  desgloses por colaborador sólo tienen que sumarlos.

  **El sello tiene que calcularse antes de sumarlo**: al ponerlo después del
  bucle de calificaciones, el acumulado del periodo salía `NaN` y la tarjeta
  decía «sin datos» aunque las respuestas estuvieran bien selladas.

  Lo que esta medida **no** dice es cuánto le costó llenarla: la fila de
  respuesta se inserta entera al final, así que no hay rastro de cuándo la
  abrió. Para eso haría falta una columna nueva sellada al abrir, y sólo
  mediría de ahí en adelante. Ojo también con que `submitted_at` se puede
  editar a mano desde el calendario: cualquier medida hereda esa edición.
- **Las rejillas se salen de la hoja en un teléfono.** `repeat(auto-fit,
  minmax(300px, 1fr))` no encoge por debajo de ese mínimo: con 327 px de ancho
  útil la pista sigue midiendo 300 y la tarjeta desborda. El mínimo va siempre
  envuelto, `minmax(min(300px, 100%), 1fr)`. Es lo que partía la pantalla de
  estadísticas de encuestas en un iPhone 12 mini, que con 375 px es el más
  estrecho que se usa en campo.

  Un `width` con `!important` tampoco basta cuando el elemento trae
  `min-width`: el mínimo manda siempre, venga de donde venga, así que la regla
  de `estilos.css` gana la pelea del alto y pierde la del ancho y el elemento
  acaba con unas medidas que no quiso nadie. Es lo que le pasaba al radar del
  encabezado del panel: `@media (max-width:600px)` le imponía 220×180 mientras
  el marcado de `window.mostrarDashboard` pedía 450×260 con `min-width`, y el
  resultado era 450 de ancho —desbordando la tarjeta de 313 px, con el sobrante
  izquierdo fuera del alcance del dedo por culpa del `justify-content:center`
  del contenedor desplazable— y 180 de alto, que recortaba por abajo el círculo
  gris de carga, de 190 px y apoyado a 20 px del borde. Las medidas del radar
  viven hoy sólo en el marcado y son fluidas (`width:100%` con `max-width`);
  ese bloque del `@media` ya no lleva ninguna.

  Esa pantalla ya no se estila a mano: sus bloques repetidos —`.stats-filtros`,
  `.stats-resumen`, `.stats-tarjeta`, `.stats-seccion`, `.stats-conmutador`,
  `.stats-columna`— viven al final de `estilos.css` con su variante para
  pantallas de 600 px o menos, donde las tres cifras de cabecera pasan a una
  sola fila y los rellenos se aprietan. Un bloque nuevo se le añade ahí, no en
  un atributo `style`.

  Los dos desplegables van en su propia fila (`#encabezado-filtro-stats`) y no
  dentro del encabezado de la hoja: `.hoja-acciones` no encoge, así que ahí
  estrujaban el título hasta dejarlo en una columna de tres letras. Su fuente
  es de 16px por la trampa de siempre del zoom de Safari.

  Departamento y puesto comparten un solo bloque, «Desglose», con tres
  conmutadores en su encabezado: por qué se corta —`dimensionDesglose`—, con
  qué forma se dibuja —`formaDesglose`— y qué se mide
  —`currentStatsSortCriterion`, de la lista `window.CRITERIOS_STATS`—. Las tres
  elecciones viven en `sessionStorage` y las pinta `window.pintarDesglose()`,
  que es también lo que llaman los botones «Volver» para no salirse del modo, y
  que de paso devuelve el radar a la vista general. Los tres desgloses
  —departamento, supervisor y puesto— escriben en el mismo
  `#desglose-container` y respetan la forma elegida: en cuadros, entrar a un
  departamento dibuja los cuadros de sus supervisores y entrar a uno de ellos
  los de sus colaboradores, con `window.vistaCuadrosDentro()` poniendo las
  migas y el «Volver». Las filas por colaborador no usan los nombres de campo
  de las cachés (`totalAssigned`, `totalResp`…), así que pasan por
  `window.nodosDeColaboradores()` antes de dibujarse. Quien repinta al girar
  el teléfono es `window.__redibujarCuadros`, que deja puesto el último
  dibujo: así la rotación no se sale del nivel en el que se esté.

  En barras, los cinco niveles arman su columna con
  `window.columnaDeCriterio()` —o con `window.columnaDeColaborador()`, que le
  pasa la fila por `filaCanonica` y le pone el rótulo de cuatro renglones—.
  Antes cada nivel repetía cuarenta líneas del mismo marcado y un cambio en el
  gráfico había que hacerlo cinco veces; departamento y puesto, que sólo se
  diferencian en a dónde lleva el toque, comparten hoy
  `window.renderCacheDetailed(mapa, funcion)`. El alto sale de
  `window.alturaDeCriterio(fila, escala)` y la escala del nivel de
  `window.escalaDelNivel(filas)`, las mismas dos que usan los cuadros: así
  prontitud se estira igual en las dos formas. Lo que va escrito encima de la
  barra lo decide `window.cifraCortaDelCriterio()`, que parte la cifra en dos
  renglones porque una columna mide 78px en un teléfono; en un cuadro cabe de
  una línea y allí manda `cifraDelCriterio`.

  Todos los desgloses ordenan con `window.valorDeCriterio(fila)`, que mide la
  fila venga de la caché por departamento, por puesto o de las filas por
  colaborador —esas pasan por `window.filaCanonica()`, que traduce sus nombres
  de campo—. Antes cada uno de los cinco niveles repetía la misma cadena de
  ifs y añadir un criterio obligaba a tocar las cinco.

  El criterio antes era una leyenda de colores clicable que sólo ordenaba las
  barras. Ahora es un conmutador más y **manda también en los cuadros**: cada
  criterio de `CRITERIOS_STATS` trae su color y su `valor(fila)`, que es la
  proporción con la que se llena el cuadro. **Un relleno, una medida**: la del
  criterio elegido y nada más, tanto en los cuadros como en las barras.
  Participación llevaba encima una segunda banda con lo ya revisado, y cada
  columna dibujaba dos barras —el flujo de revisión, con cinco colores
  apilados dentro, y la calificación— de cuando eso no se podía ver en ningún
  otro sitio; desde que cada cosa es un criterio con su propio dibujo, todo
  eso sólo estorbaba: dos medidas distintas sobre la misma columna no se
  comparan con las de al lado, que es justo para lo que sirve el gráfico. El
  detalle completo sigue en el globo de cada cuadro y de cada columna
  (`window.globoDeFila`). Un treemap coloca por tamaño y no por medida, así
  que con valores parecidos los rellenos se ven iguales y no hay forma de ver
  quién va peor: para eso cada cuadro lleva su puesto en la tabla (`#3 · 6.5
  días`), que en falsas y mal revisadas cuenta al revés —el #1 es el que menos
  tiene, y eso es lo que dice `peorEsAlto`—.

  **El encabezado del gráfico dice el total del nivel**, con la misma medida
  del criterio y a la derecha de su nombre: «50% · 40/80 personas» en 80%
  Líderes, «4.4 días» en prontitud. Sale de `window.totalDelNivel(nodos)`, que
  suma en una sola fila los contadores numéricos de todos los cuadros que se
  están viendo —los campos que no son números, la lista de empleados y el mapa
  de supervisores, se quedan fuera— y se la pasa a `cifraDelCriterio`. Así el
  total se lee en las unidades de cada criterio sin tener que contar figuras a
  ojo, y vale igual para las tres formas y para los niveles de dentro.

  **Debajo de esa cifra, en 80% Líderes, van los grupos de supervisor**: «42% ·
  5/12 grupos», alineado con ella a la derecha. Un grupo cuenta en cuanto
  **uno** de los suyos cumple en todas, porque entre un grupo sin nadie y otro
  con uno hay toda la diferencia y el porcentaje de personas no la enseña. El
  renglón va corto y de una sola línea —qué cuenta lo dice su globo—: dos
  cifras que se parten dejan el encabezado más alto que el propio gráfico. Lo
  cuenta
  `window.gruposDelNivel(nodos)`, y sólo para los criterios que traen
  `cuentaAlGrupo` —hoy ése—: en los demás el renglón no se dibuja.

  Los grupos se cuentan **desde la gente que se está viendo**, no sumando las
  filas: en el desglose por puesto un mismo grupo aparecería una vez por
  puesto. La clave es el par departamento + supervisor, que «Sin Supervisor»
  existe en más de un departamento y no es el mismo grupo. Donde las fichas no
  dicen de qué grupo es cada quien —el último nivel, donde el cuadro ya es una
  persona— el renglón no sale; en barras, los niveles de dentro arman su propio
  encabezado y tampoco lo llevan.

  Ahí estuvieron antes dos renglones que se quitaron a propósito: una nota que
  describía el dibujo («llena los cuadros», «una figura es una persona») y el
  señalamiento del peor del nivel, con su `window.extremoDelCriterio` y la
  propiedad `extremo` de cada criterio. El total dice más en el mismo sitio.

  Casi todos los criterios miden **sobre las asignadas**, que es lo que hace
  comparables las barras y los cuadros entre sí. Las tres excepciones son
  calificación, que ya viene en porcentaje; **80% Líderes**, que mide sobre
  la gente y no sobre las encuestas (más abajo); y **avance de revisión**, que se
  mide sobre las **contestadas**: dice qué parte de lo que ya entregaron lleva
  calificada quien revisa, y meter en el denominador una encuesta que nadie
  contestó volvería a medir participación en lugar del trabajo del revisor.
  Su cifra son las dos cosas —`60% · 12/20`—, porque un porcentaje sobre
  cuatro respuestas no dice lo mismo que sobre cuarenta. Quien no tiene ni una
  respuesta dice «sin contestar»: no hay revisión atrasada que reprocharle. Lo que cuenta como revisado es
  cualquier veredicto —revisada, certificada, falsa o mal revisada—, que es lo
  que reúne `window.procesadasDe(fila)`.

  **«Revisadas ≥80%» y «80% Líderes» no son el mismo filtro.** El primero
  cuenta encuestas —qué parte de lo asignado se calificó por encima del
  mínimo—, así que quien saca un 100 y un 60 sale a la mitad y quien saca dos
  ochentas sale entero, y un promedio que llega al 80 tapa la encuesta que se
  reprobó. El segundo cuenta **gente**: cuántas de las personas que ya tienen
  algo calificado no bajaron del mínimo en **ninguna** de sus encuestas. Es el
  que responde a «enséñame quién cumple en todas», y su cifra son las dos cosas
  —`60% · 3/5 personas`—.

  ```js
  window.cumpleMinimoEnTodas(fila)   // ¿esta persona no bajó del mínimo en ninguna?
  window.conMinimoEnTodas(fila)      // le pone sus dos contadores y la devuelve
  ```

  Se mira **sobre lo ya calificado**, las mismas respuestas procesadas que
  cuenta `revisadasAltas`: una encuesta que nadie ha revisado todavía no dice
  nada de quien la contestó, y meterla aquí volvería a medir participación en
  lugar de puntaje. Quien no tiene ni una calificada dice «sin calificar»:
  todavía no cumple ni deja de cumplir, igual que en avance de revisión. Por
  eso el total del encabezado dice «40/80 personas» y no «40/120»: el
  denominador es la gente a la que ya se le calificó algo, que es la misma
  cuenta con la que cada cuadro saca su porcentaje —las figuras grises de
  quien no tiene nada calificado se dibujan igual—.

  Los dos contadores —`personasEvaluadas` y `personasAlMinimo`— **no se
  derivan de la fila de un grupo**: ahí no se puede, porque el grupo suma
  respuestas y no gente, y `revisadasAltas === procesadas` diría que todos
  cumplen en todas o que no cumple nadie. Los suma el motor en una pasada
  aparte sobre `porEmpleado`, **después** del bucle de respuestas —dentro
  contaría a la misma persona una vez por encuesta— y una fila que **es** una
  persona (la de un colaborador, cada figura del gráfico de personas) los
  resuelve con lo suyo en `conMinimoEnTodas`. Toda caché nueva que quiera
  dibujarse aquí tiene que traerlos, como trae `personasAsignadas`.

  Donde el cuadro es una persona, la cifra no dice «100% · 1/1 personas» sino
  «cumple en todas» —o «Sí»/«No» en la columna, que es estrecha—: ahí no hay
  proporción que enseñar, se cumple o no se cumple.

  **Todo porcentaje que se imprima pasa por `window.pctTexto()`**, nunca por
  `Math.round` a secas. Con 478 de 480 el redondeo decía 100% —faltando dos— y
  con 1 de 480 decía 0% —habiendo uno—, que son justo las dos cifras que no
  pueden estar mal: el 100% es el cierre total y el 0% es no haber empezado.
  El ayudante reserva los dos extremos para lo exacto y aparca lo de en medio
  en 99 y en 1; en todo lo demás coincide con `Math.round`, así que los cortes
  de color (el ≥80 de `getColorScore`) no se mueven. Admite la proporción ya
  hecha —`pctTexto(0.995)`— o la cuenta y su total —`pctTexto(478, 480)`—.

  Es sólo para el texto: **la geometría se calcula con la proporción sin
  redondear**. El relleno de un cuadro al 99.6% se ve lleno y no pasa nada;
  un rótulo que dice 100% sin serlo da por cerrado lo que no lo está.

  Prontitud además se llena en **escala relativa** (`escalaRelativa` en su
  criterio): en un mes de 31 días, contestar en 6 o en 7 son 81% y 77%, así que
  en absoluto los ocho cuadros salían igual de llenos. Con la escala del nivel,
  el más rápido llena el cuadro y el más lento lo deja vacío; los días y el
  puesto de dentro siguen siendo los absolutos. Si todos van igual —menos de
  dos puntos entre el mejor y el peor— no se estira nada: amplificar ese ruido
  diría que uno va mal cuando no va peor que nadie. El gráfico lleva encima el criterio con su color
  (`.stats-grafico-titulo`): el conmutador también lo marca, pero se desplaza
  y el elegido puede quedar fuera de la vista. Debajo no va nada: el pie que
  explicaba los colores de la barra apilada se quitó a propósito, así que hoy
  esos colores no los nombra ningún texto de la pantalla.

  **El treemap de esta pantalla no usa d3.** El del mapa de activos sí, pero
  ése es un documento aparte que ya carga la librería; traerla al panel
  principal por un solo gráfico serían 280 KB en el arranque de todos los
  días. La geometría la reparte `window.repartirEnCuadros(valores, ancho,
  alto)`, que es el mismo algoritmo *squarify* que hay detrás de
  `d3.treemapSquarify`. Se validó contra d3 con seis repartos: misma área
  exacta, sin solapes y proporciones igual de buenas o mejores. El reparto va
  en píxeles, así que al girar el teléfono hay que rehacerlo — de eso se
  encarga el oyente de `resize` que se registra una sola vez.

  **Y hay una tercera forma, «Personas», donde una figura es una persona.**
  No es un relleno con forma de gente: **el número de figuras de un cuadro es
  el número de personas que hay detrás de él** —las del departamento, las del
  grupo del supervisor, las del puesto— y, en el último nivel, donde el cuadro
  ES una persona, hay exactamente una. Lo que colorea el criterio no son
  figuras enteras: **cada figura se llena por partes**, así que 14.6 personas
  son catorce enteras y una llena hasta las rodillas. Es lo que el relleno liso
  no sabe hacer: un 62% y un 71% dan dos bandas casi iguales, mientras que
  catorce figuras de veinte contra dieciséis se cuentan de un vistazo.

  Hubo antes una versión donde las figuras eran decoración —se dibujaban las
  que cupieran— y no servía: dos cuadros con la misma plantilla enseñaban
  distinta gente según lo grandes que hubieran salido.

  Se cuenta la gente **a la que le toca alguna encuesta del filtro**
  (`personasAsignadas`, que llenan las tres cachés del motor) y no la plantilla
  entera (`employeesCount`, que se escribía y no lo leía nadie): a quien no le
  toca ninguna encuesta no le puede tocar ninguna respuesta, así que su figura
  no podría colorearse nunca y sólo engordaría el gris. Toda caché nueva que
  vaya a dibujarse aquí tiene que llevar ese contador, y `filaCanonica` —la
  fila de un colaborador— lo trae en 1.

  **Y cada figura es alguien con nombre.** El motor arma `porEmpleado`, una
  fila por persona con su ficha —nombre, puesto, departamento, área— y **los
  mismos contadores que su departamento**, incrementados al lado de ellos en la
  pasada de respuestas. Cada fila de caché guarda además la lista de ids de su
  gente (`empleados`), y `window.genteDeLaFila(fila)` cambia esos ids por sus
  fichas —o devuelve las que la fila ya traiga puestas, que es el caso de un
  colaborador, donde la fila **es** una persona (`window.fichaDeColaborador`)—.
  Una caché nueva que quiera dibujarse aquí necesita esa lista, o su cuadro se
  quedará sin figuras que enseñar.

  **Lo que cada figura lleva llena es lo suyo**, no un trozo del promedio del
  grupo (`window.llenadoDeLaPersona`). Es lo que permite que el globo diga un
  nombre y un porcentaje sin contradecir al dibujo: la figura de Luis está
  llena hasta donde llega Luis. Van ordenadas de más llena a menos y se colocan
  de abajo arriba, así que el cuadro se sigue leyendo como el relleno liso —lo
  de arriba es lo que falta— pero ahora enseña **la distribución** y no sólo el
  promedio: se ve si el 64% del grupo es todo el mundo a medias o media
  plantilla al día y la otra media sin empezar.

  De ahí sale una diferencia que hay que conocer: el rótulo del cuadro dice el
  agregado del grupo —lo mismo que las barras y los cuadros— y las figuras
  dicen a cada quien. Coinciden cuando toda la gente del cuadro tiene el mismo
  número de encuestas asignadas, que es lo normal dentro de un puesto, y se
  separan un poco cuando no. No es un descuadre: son el promedio y su reparto.

  Aquí el criterio se mide **siempre en absoluto**, también prontitud, que en
  los cuadros y en las barras se estira con la escala del nivel
  (`escalaRelativa`). Esa escala existe para separar promedios de departamento
  que se parecen demasiado; entre personas no hace falta —varían de sobra— y
  encima aplastaría a media plantilla contra el 0 o el 100 según con quién le
  tocara compartir cuadro.

  **El globo de cada figura es un `<title>` dentro de su `<use>`**, como el
  resto de los globos de la aplicación, y lo arma `window.globoDePersona`. Para
  que el ratón lo alcance, `.stats-cuadro-cuerpo--personas` va con
  `pointer-events: none`: ese cuerpo cubre el cuadro entero por encima de las
  figuras y sin eso el globo no aparecía nunca. El toque sigue llegando al
  cuadro —el manejador está en el padre— y sólo la chapa del rótulo vuelve a
  atender, para que sobre el nombre salga el globo del cuadro y no el de la
  persona que quede detrás. En un teléfono no hay ratón, así que el detalle por
  persona es cosa del escritorio: el toque entra al nivel de abajo, como
  siempre.

  Por eso no es un gráfico aparte sino un valor más de `formaDesglose`
  (`window.FORMAS_DESGLOSE`), y **nadie lee esa variable a pelo**: se pregunta
  con `window.formaDesgloseActual()`, que devuelve cuadros ante cualquier cosa
  que no esté en la lista —`sessionStorage` puede traer la forma de una
  versión anterior—. Los tres niveles de dentro ya entran aquí solos, porque
  preguntan por `!== 'barras'`.

  ```js
  window.celdaDeTodosLosCuadros(cajas)                   // el tamaño común
  window.celdaQueCabe(ancho, alto, personas)             // el mayor que admite una caja
  window.rejillaDePersonas(ancho, alto, celda, personas) // el reparto, o null
  window.lienzoDeGente(rejilla, ancho, alto, gente, color)
  window.genteDeLaFila(fila)                             // las fichas de un nodo
  window.llenadoDeLaPersona(ficha)                       // cuánto lleva, de 0 a 1
  window.globoDePersona(ficha)                           // lo que dice su globo
  ```

  **En esta forma el cuadro mide la gente, no lo asignado.** Es lo único
  coherente con lo que se dibuja dentro: midiendo lo asignado, un departamento
  con muchas encuestas por cabeza salía enorme y medio vacío y el de al lado
  pequeño y a reventar. Midiendo la gente, todos salen igual de llenos y las
  figuras caben más grandes. Son dos repartos distintos y se nota al cambiar de
  forma: son dos gráficos que miden dos cosas, y lo asignado sigue en el globo.

  **Todas las figuras miden lo mismo**, y el tamaño se decide una vez para el
  lienzo entero: es el mayor al que **todos** los cuadros meten a su gente
  entera, o sea el que consiente el cuadro más apretado. Un cuadro que no la
  mete ni a `MIN_ALTO_PERSONA` **queda fuera del acuerdo** y cae al relleno
  liso de siempre —enseñar veinte figuras donde hay treinta personas sería
  mentir—; arrastrar a los demás con él dejaría el gráfico entero en figuras
  diminutas por culpa de uno. `MAX_ALTO_PERSONA` es alto a propósito: en el
  último nivel cada cuadro es una persona, así que el tamaño lo marca el cuadro
  más pequeño y no la cantidad de gente, y con un tope bajo esos cuadros salían
  con un monigote perdido en el centro.

  **El alto de la hoja de estilos es un techo, no una medida: el lienzo puede
  encoger.** Las otras dos formas viven con el alto que les toca; en personas
  no conviene, porque el reparto en cuadros depende de la proporción del lienzo
  y una proporción que no le sienta bien produce cuadros largos y estrechos
  donde la gente no cabe en filas enteras. Con un lienzo más bajo, el mismo
  reparto sale con otras formas y las figuras entran más grandes —o entran, a
  secas, en un cuadro que si no se quedaba con el relleno liso—. En un iPhone
  12 mini, bajar de 330 a 258px es la diferencia entre que un departamento se
  quede sin dibujar y que salgan los diez.

  `window.alturaDeLienzoPersonas` prueba de la más alta a la más baja y se
  queda con la mejor: manda que **nadie se quede sin figuras** y después que
  **las figuras salgan lo más grandes posible**. Como recorre de arriba abajo y
  sólo cambia de campeón ante una mejora clara, en un empate gana la altura
  mayor: encoger sin ganar nada sería quitarle sitio al gráfico por gusto. El
  resultado no es una función suave del alto —el reparto *squarify* salta— y
  por eso se prueba en vez de calcularse.

  **Antes de medir el lienzo hay que quitarle el alto que le puso el dibujo
  anterior** (`lienzo.style.height = ''`). Sin eso, cada repintado —girar el
  teléfono, cambiar de criterio— encogería un poco más sobre lo ya encogido
  hasta dejar el gráfico en nada.

  Para elegir la altura, el rótulo se **estima** (`window.altoRotuloEstimado`);
  para colocar a la gente se **mide**. Son decenas de repartos que todavía no
  existen en el documento y medir cada uno costaría un recálculo de maqueta por
  cada uno; como en personas el título y la cifra van a un renglón cada uno, la
  cuenta se queda muy cerca, y lo único en juego es cuál de dos alturas
  parecidas se elige. Las dos salen de `window.medidasDelRotulo`, que es el
  único sitio donde se decide de qué tamaño va ese rótulo.

  **Los `floor` de `rejillaDePersonas` van con una pizca de holgura**, y hace
  falta: el tamaño común es *exactamente* el que consiente el cuadro más
  apretado, así que ahí la división da 2.0000 y la coma flotante la deja en
  1.9999999. Sin la holgura, el único cuadro que se quedaba sin figuras era
  justamente el que había fijado el tamaño de todos los demás.

  **La figura no se estira, pero el hueco entre figuras sí.** Como el tamaño lo
  manda el cuadro más apretado, a los demás les sobra sitio por definición y
  amontonar la gente contra el suelo dejaba medio cuadro en blanco. El hueco no
  mide nada, así que puede crecer: `rejillaDePersonas` reparte la gente por la
  caja entera y elige el reparto **menos desproporcionado**, el que deja los
  huecos igual de anchos que de altos. Con 64 personas en 205×116, tres
  renglones dejan el doble de aire por arriba que por los lados y cuatro lo
  dejan parejo; los dos llenan la caja igual, pero uno se lee como una rejilla
  y el otro como tres tiras sueltas.

  **La figura a medias se hace con un recorte, nunca con un degradado sobre el
  `<use>`.** Un `<symbol>` con `viewBox` abre su propio sistema de coordenadas,
  así que dentro de él `userSpaceOnUse` se resuelve contra la caja del icono
  (`0 0 10 24`) y no contra la del lienzo: el degradado caía entero fuera de esa
  caja y **la figura salía toda gris pasara lo que pasara con la medida**, que
  es un fallo que no se ve —parece simplemente que a nadie le falta poco—. Lo
  que se hace es dibujar la figura gris entera y encima la de color envuelta en
  un `<g clip-path>`, que sí vive en las coordenadas del lienzo; las dos llevan
  el mismo `<title>`, porque según dónde caiga el cursor se toca una o la otra.
  Como el dibujo ya dice la fracción exacta, no hay que redondear a figuras
  enteras ni reservar los dos extremos como en `pctTexto`; lo único que se
  fuerza es `MINIMO_VISIBLE_PERSONA`, para que quien apenas ha empezado no se
  confunda con quien no ha hecho nada, ni quien va casi al día con quien ya
  terminó.

  La figura vive **una sola vez** en el documento, colgada de `<body>` en un
  `<symbol>` que monta `window.montarIconoPersona()`, y cada cuadro la reusa
  con `<use>`: son cientos por pantalla. Va en `<body>` y no dentro del
  desglose porque ese contenedor se reescribe entero con `innerHTML` a cada
  repintado y se la llevaría por delante.

  **El dibujo va en dos pasadas, y todas las lecturas van juntas antes de las
  escrituras.** La gente se reparte en el hueco que queda por debajo de la
  chapa del título, y esa chapa hay que medirla: la cifra cabe de un renglón en
  un cuadro ancho y de tres en uno estrecho, y por catorce píxeles de más la
  primera fila de figuras se quedaba escondida detrás. Además el tamaño común
  sale de la caja más apretada de todas, así que no se sabe hasta tener medida
  la última. La primera pasada monta todos los cuadros con su rótulo; la
  segunda lee **todos** los `offsetHeight`, decide el tamaño y sólo entonces
  dibuja. Así el navegador recalcula la maqueta una vez y no una por cuadro, y
  quien toque ese bucle tiene que mantener ese orden.

  **Dentro del cuadro el rótulo estorba, así que pesa lo menos posible**: el
  nombre va mucho más pequeño que en cuadros y de un solo renglón, con puntos
  suspensivos —el entero está en el globo—, y el renglón de la cifra la lleva
  **pelada, sin la palabra de detrás** (`window.cifraDesnudaDelCriterio`):
  «#1 · 96%», no «#1 · 96% contestadas». Al lado ya está el nombre del
  departamento y encima el título del gráfico dice qué se mide; en avance de
  revisión, además, el «798/800» de detrás partía el renglón en dos. Eso vale
  para los dos treemaps —cuadros también—; lo que se queda entero es «5.0
  días» y «sin contestar», que no son una palabra de adorno detrás de un
  número sino la medida completa. El encabezado del gráfico y el globo sí
  siguen diciéndolo todo: ahí hay sitio, y en avance de revisión el conteo es
  información y no adorno.

  Una sección que crece con el catálogo no se apila: va en `.stats-carrusel`,
  una fila que se arrastra con el dedo y engancha las tarjetas de una en una.
  El último elemento se recorta a propósito —asomar el siguiente es lo único
  que avisa de que hay más— y las tarjetas no se estiran entre sí. Lo que
  llevan dentro va plegado con `<details class="stats-plegable">`, que guarda
  su estado solo y no necesita ninguna función colgada de `window`; abierta,
  la lista se desplaza dentro de su tarjeta (`.stats-plegable-cuerpo`, tope de
  260px) en vez de estirar la fila. Así es la comparativa por áreas, que con
  todo el personal desplegado se llevaba nueve mil píxeles de la pantalla.
- **Una insignia por clasificación cumplida.** En el panel de información del
  usuario, debajo del radar, se gana un parche de mérito por cada clasificación
  cuyas encuestas están **todas** calificadas al mínimo o por encima. Es la
  misma regla del criterio «80% Líderes» de las estadísticas —no el promedio:
  un 100 y un 60 promedian 80 y ahí falta una—, mirada por clasificación en
  lugar de por persona.

  ```js
  window.insigniasGanadas(encuestas, respuestas, empleado, tieneEquipo)
  window.dibujarInsigniasClasificacion(insignias)   // en #insignias-clasificacion
  ```

  Vale de cada encuesta **la última respuesta calificada**, que es la primera
  que aparece por venir ordenadas de la más reciente. Una encuesta sin
  contestar, o contestada y aún sin calificar, deja la clasificación sin
  insignia: no se da por cumplido lo que nadie ha revisado. Y la que no exige
  mínimo (`requires_min_score` en false) cuenta en cuanto está calificada, que
  es lo que esa bandera significa.

  **A quién le toca cada encuesta lo decide `leTocaEstaEncuesta`**, no el
  `target_positions` a mano que mira el radar justo encima. Por eso la consulta
  de `cargarRadarGeneralDashboard` —de la que cuelgan las dos cosas, para no
  pedir lo mismo dos veces— se trae además `mode`, `target_departments`,
  `target_employees` y, con `camposConMinimo`, `requires_min_score`. Las
  insignias se dibujan **antes** que el radar: si no hay ejes que enseñar, o si
  Chart falla, ellas salen igual.

  El parche se dibuja entero en SVG (`window.svgInsignia`) y **no hay ninguna
  imagen que subir**: el aro festoneado son dieciséis círculos, y el color y el
  símbolo salen del nombre de la clasificación —`matizDeClasificacion` y
  `simboloDeClasificacion`, ambos sobre la misma semilla estable, así que una
  clasificación tiene siempre el mismo parche en todos los teléfonos—. Las
  habituales traen su símbolo en `window.SIMBOLOS_INSIGNIA` (seguridad 🛡️,
  calidad ⭐, 5S 🧹…) y a cualquier otra le toca uno fijo de
  `SIMBOLOS_INSIGNIA_SUELTOS`.

  **Debajo de la foto de perfil va una estrella amarilla por insignia**, que es
  el mismo dato dicho donde se mira primero: el parche dice de qué
  clasificación y la estrella sólo cuántas van. Las pone
  `window.dibujarEstrellasInsignias(cuantas)`, a la que llama la propia
  `dibujarInsigniasClasificacion`, así que las dos cosas no pueden discrepar.
  La estrella es un `<path>` y **no un emoji**: el emoji lo dibuja cada sistema
  a su manera —en iOS sale con relieve y borde— y aquí hacen falta cinco
  iguales en fila del mismo amarillo. Caben cinco en el ancho de la foto y las
  demás bajan a otro renglón.

  Para que caigan debajo de la foto, **el flotado se mudó de la foto a un
  envoltorio** que las contiene a las dos; el nombre y el puesto lo rodean
  igual que rodeaban a la foto sola. Las estrellas son **hermanas** del
  `#header-user-icon` y no van dentro: ese div se reescribe entero con
  `innerHTML` cada vez que se carga el avatar o se cambia la foto, y se las
  llevaría por delante.

  Sin ninguna ganada no se dibuja nada —`#insignias-clasificacion:empty` se
  esconde y las estrellas se vacían—: un hueco vacío en el panel no dice más
  que la ausencia del parche.

  **Las mismas estrellas salen junto a cada persona de las listas de gente**:
  el equipo del panel principal, el reporte de equipo y sus miembros, el
  expediente de alguien y su equipo a cargo, y el panel de todos los
  colaboradores. Va como el badge de pendientes: la lista se dibuja con el
  hueco puesto y el cálculo lo rellena cuando llega.

  ```js
  window.huecoDeEstrellas(empId, chico)   // el <div data-estrellas> del renglón
  window.calcularInsigniasBatch(ids)      // calcula lo que falte y pinta
  window.pintarEstrellasInsignias()       // rellena los huecos con lo ya sabido
  ```

  Lo calculado se guarda en `window.insigniasPorEmpleado` y **no se vuelve a
  pedir**: filtrar el panel de todos los colaboradores repinta la lista entera
  y las estrellas salen de la caché sin tocar la base. Las del propio usuario
  las deja puestas el panel de su perfil, que ya las tenía. La caché se vacía
  con `invalidarCacheDashboard`, porque una encuesta recién calificada puede
  haber ganado —o perdido— una estrella.

  El cálculo va **de cien personas en cien**, pintando lo que va saliendo, y
  las respuestas se piden **por páginas de mil filas**: PostgREST no devuelve
  más de mil por consulta y el panel de todos los colaboradores pide las de la
  plantilla entera. Las encuestas activas se piden una sola vez por sesión
  (`cargarEncuestasParaInsignias`, que guarda la promesa y no el resultado).

  El hueco de las listas reserva su alto aunque no haya estrellas
  (`.estrellas-insignias--chico`, `min-height`): sin eso, los nombres de una
  misma fila quedan a distinta altura según quién tenga insignias.

  **La fila se centra con los márgenes automáticos de la primera y la última,
  nunca con `justify-content: center`.** Centrando así, en cuanto la fila
  desborda —y desborda: crece con el catálogo de clasificaciones— el navegador
  recorta por la **izquierda** y las primeras insignias quedan fuera sin que se
  pueda llegar a ellas arrastrando. Los márgenes automáticos se van a cero
  cuando no sobra sitio, de modo que con pocas quedan centradas y con muchas se
  empieza por la primera.
- **Un selector por atributo `style` se rompe en cuanto se toca ese estilo.**
  `setGrade` buscaba la tarjeta de la pregunta con
  `closest('div[style*="border-radius:16px"]')` y le pintaba el borde. Al
  escribir `borderColor`, el navegador reescribe el atributo entero con su
  formato —`border-radius: 16px`, con espacio—, así que el selector dejaba de
  casar: la primera calificación funcionaba y de la segunda en adelante
  `closest` devolvía null y el `TypeError` abortaba el resto de la función sin
  aviso, dejando la insignia de la pregunta sin actualizar. Se busca por clase
  (`.pregunta-detalle`), y con guarda.
- **IDs duplicados o huérfanos.** Al ser archivos grandes con JS inline, es
  fácil dejar una función definida dos veces (la segunda gana en silencio) o
  un `getElementById` apuntando a un elemento ya eliminado, que revienta con
  `TypeError` y aborta el resto de la función sin aviso visible. Al tocar
  estos archivos conviene verificar que los IDs referenciados existan.

## Verificación

No hay suite de pruebas. Para validar cambios en las pantallas:

- Sintaxis del JS inline: extraer el bloque `<script>` y pasarle `node --check`.
- Comportamiento y aspecto: Playwright está disponible y Chromium viene
  preinstalado en `/opt/pw-browsers`. Sirve para abrir la página con un cliente
  Supabase simulado, ejercitar el flujo y tomar capturas a tamaño de teléfono
  (375×812 aproxima el iPhone que se usa en campo).
