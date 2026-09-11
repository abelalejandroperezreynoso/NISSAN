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
| `12-almacenamiento.js` | Consumo de Supabase: archivos por bucket y peso de la base |
| `13-gestion.js` | Gestionar información: personal, departamentos, puestos, encargos, áreas, plantas y líneas, y la cadena de mando |
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
    window.actualizarYRecargar()                        // el botón del encabezado
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

    **Y hay un botón, a la derecha del título del panel**, para cuando alguien
    quiere quedarse al día sin esperar a nada: `window.actualizarYRecargar()`
    pregunta al servidor sin esperar al intervalo y recarga —a la URL con el
    `?v=` nuevo si lo hay, y a secas si ya se está al día, que es lo que se le
    pide a un botón de recargar—. No lleva el freno de `versionIntentada`, que
    existe para que un salto automático no se repita solo; sí el de la hoja
    abierta, sólo que aquí pregunta en vez de negarse: quien pulsó fue quien lo
    pidió. Va sin texto —con el `<svg>` dentro—, así que lo que hace lo cuentan
    su `title` y su `aria-label`, y mientras busca gira con la clase
    `esta-actualizando`: escribirle el estado con `innerText` borraría el
    `<svg>`. Vive en `.encabezado-acciones`, la fila de botones que va pegada a
    la derecha del título, y comparte con el «+» del panel de administración el
    tamaño y el negro de `.ios-boton-encabezado`; lo suyo es sólo el giro.

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

- **Cómo se llama cada frecuencia lo dice `1-config.js`.** `window.textoDeFrecuencia(frecuencia)`
  —sobre el mapa `window.NOMBRE_FRECUENCIA`— traduce `weekly` a «Semanal» y
  responde «Única vez» a `once`, a la frecuencia vacía y a cualquier valor que
  no conozca, que es lo que significa no tener ritmo. Había cinco copias de ese
  mapa repartidas por las pantallas y ya habían discrepado —unas decían «Cada 2
  años» y otras «Bienal»—, pero lo que se veía era otra cosa: **ninguna de las
  tres del panel de pendientes traducía `once`**, y como el fallback era el
  valor crudo de la base, la tarjeta de una encuesta de única vez enseñaba
  «⏱️ once». Toda pantalla que escriba una frecuencia pasa por el ayudante, sin
  excepciones: la última que quedaba era el mapa con emoji de
  `4-evaluaciones-base.js` («🈷️ Mensual»), que adornaba el subtítulo de la hoja
  de responder, y ese icono no decía nada que no dijera ya la palabra.

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

  **Y el fondo no se desplaza mientras hay una hoja abierta.** La hoja es
  `position:fixed` y hace su propio scroll interno, pero eso no impide que el
  dedo arrastre el documento de detrás: en iOS, en cuanto la lista de la hoja
  llega a su tope, el gesto sigue de largo y lo que se mueve es el panel —se
  sale de la encuesta a otra altura de la que se entró, y a veces con la hoja
  flotando sobre una pantalla que no es la suya—. `overflow:hidden` sobre el
  `<body>` **no basta en iOS**, así que el documento se ancla de verdad: el
  observador de `1-config.js` guarda `scrollY`, lo publica en
  `--desplazamiento-fondo` y marca `<html>` con **`fondo-anclado`**, que en
  `estilos.css` pone el `<body>` en `position:fixed` con ese desplazamiento en
  negativo. Al cerrarse la última hoja se quita la marca y se devuelve el
  scroll: sin guardarlo, cerrar la hoja dejaría el panel arriba del todo.

  La clase es **suya y no `modal-abierto`**: esa otra la llevan también las
  pantallas cuyo documento no se desplaza —refacciones y el mapa viven en un
  contenedor de altura completa— y ahí `position:fixed` sobre el `<body>` sería
  tocarles la maqueta a cambio de nada. Sólo la pone quien comprobó que hay algo
  que anclar (`scrollHeight - innerHeight > 1`).

  La complementa `overscroll-behavior: contain` en `.hoja-overlay`, que es la
  mitad moderna de lo mismo: las dos van juntas porque esa propiedad no la
  entienden todos los Safari en uso. Y el `anclarDocumento` del bloque del
  teclado se queda como red de seguridad: con el cuerpo anclado ya no llega a
  dispararse.

  **Una hoja se cierra deslizándola hacia abajo**, que es el gesto que el dedo
  ya espera en iOS. Vive en `1-config.js`, delegado en `document`, así que lo
  comparten los tres documentos y una hoja nueva lo trae puesto sin hacer nada.

  La regla que lo hace convivir con las listas de dentro: **sólo arranca si no
  hay nada que desplazar por encima**. Si el dedo cae sobre un contenedor que se
  puede desplazar y no está en su tope, el gesto es suyo y aquí no se toca nada;
  desde el encabezado de la hoja, en cambio, arrastra siempre. Cierra a partir
  de 110px, o de 45 si el gesto va rápido (más de 0.5 px/ms); por debajo, la
  hoja vuelve a su sitio con la misma curva con la que sube.

  Dos cosas que no son evidentes:

  - **Van eventos de toque, no de puntero.** Para arrastrar la hoja hay que
    cancelar el desplazamiento del navegador, y eso sólo se puede en un
    `touchmove` no pasivo: cuando llega un `pointermove`, iOS ya decidió que el
    gesto era un scroll y no deja pararlo. Los eventos de ratón están para poder
    probarlo en un escritorio.
  - **Al cerrar se pulsa la cruz de la hoja, no se le pone `display:none`.**
    Cada hoja limpia lo suyo al cerrarse —la de evaluaciones vacía su
    contenedor, la de refacciones olvida la foto a medio subir— y saltarse su
    función dejaría esa basura dentro. Cuando el botón del encabezado no es la
    cruz sino la flecha de volver, la hoja deja dicho cómo se cierra en
    `overlay.__cerrarHoja`: es lo que hace `montarHojaEvaluaciones`, porque
    deslizar hacia abajo cierra la hoja —lo que hace ese gesto en iOS— y no
    retrocede.

  Y la marca de «aquí hubo un arrastre», que existe para que soltar sobre un
  botón no lo dispare, **caduca a los 400 ms**: dejándola puesta hasta el
  siguiente click, un arrastre que no acabó en click se comía el toque de
  después, que puede llegar mucho más tarde y a otra cosa. El click con el que
  el propio gesto pulsa la cruz se hace con la marca ya levantada, o se lo
  tragaría a sí mismo.

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

  El panel de administración es otro caso. Se entra por el **«+» del
  encabezado**, a la izquierda del botón de recargar, que abre la hoja
  `#modal-admin` (`window.abrirPanelAdmin` y `window.cerrarPanelAdmin`, en
  `2a-core-nav.js`). Un botón nuevo se le añade al marcado de `index.html` y
  **no necesita nada más**: llama a su función de `window` desde el `onclick`,
  como el resto de la aplicación, y si abre otra hoja el observador de
  `1-config.js` aparta ésta al ver dos abiertas a la vez —los botones actuales
  llaman además a `cerrarPanelAdmin()` ellos mismos, que es lo que evita el
  fotograma con las dos a la vista, pero olvidarlo ya no rompe nada—.

  Ese «+» lo enseña y lo esconde **`window.pintarBotonAdmin()`**, y no hay
  ningún otro sitio que lo toque: lo llaman `mostrarDashboard` y el conmutador
  del título. Antes la entrada era una barra punteada (`#admin-toolbar`) metida
  entre las tarjetas del panel, que se llevaba una franja de pantalla para
  decir una palabra y que **cada vista tenía que acordarse de esconder y de
  volver a enseñar** —`3-incidentes.js` la reponía, `5-objetivos.js` y
  `6-calendario.js` la escondían—; el botón del encabezado está siempre donde
  se le dejó y sólo depende del modo. Con la barra se fueron sus reglas
  `.admin-toolbar`, `.admin-label` y `.admin-actions-group`; `.admin-btn` se
  queda, que es la de los botones de dentro de la hoja.

  Se esconde con el atributo `hidden` y por eso `estilos.css` lleva
  `.ios-boton-icono[hidden] { display: none }`: `.ios-boton-icono` es un flex y
  un `display` de autor le gana al `[hidden]` de la hoja del navegador, así que
  sin esa regla el «+» se vería también sin el modo encendido. Es la misma
  trampa de `.tipos-pregunta`, y la regla vale para todo botón de icono que se
  esconda —también el lápiz de la hoja de una encuesta—.

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

  **Y cada sección se pliega y dice en su renglón lo que hay elegido dentro.**
  Al editar una encuesta se entra a cambiar una cosa, y con las cinco tarjetas
  desplegadas encontrar la frecuencia era recorrer media pantalla de casillas;
  plegadas, la hoja entera cabe de un vistazo —478px de cuerpo en un iPhone de
  375— y se abre sólo lo que se va a tocar. Son `<details class="hoja-plegable
  grupo-eval">`, el mismo patrón que ya tenía «Escala de puntajes», que por eso
  se quedó como estaba y sólo ganó su resumen.

  ```js
  window.RESUMEN_DE_GRUPO        // { datos, destinatarios, revisores, opciones, escala, preguntas }
  window.pintarResumenGrupos()   // los rellena todos
  window.abrirGrupoEval(id)      // abre uno y lo lleva a la vista
  window.plegarGruposEval(editando)
  ```

  El resumen sale **de los propios campos** y no de la encuesta que se cargó:
  tiene que decir lo que hay puesto ahora mismo, incluido lo que se acaba de
  cambiar sin guardar. Se rehace con los tres eventos de la hoja —`input` para
  lo que se escribe, `change` para casillas y desplegables y **`click` para los
  selectores de personas**, que cambian su lista desde el `onclick` de un botón
  y no disparan ninguno de los otros dos—. Y a mano en los **tres** sitios que
  enseñan la hoja, porque `prepararEncabezadoEval` corre antes de que se escriba
  ningún campo y las preguntas llegan de una consulta posterior: sin ese último
  repintado el resumen diría «Ninguna todavía».

  La frecuencia y el modo se dicen **sin el emoji del desplegable** —«Mensual ·
  Autoevaluación», no «🈷️ 1 vez al mes · 👤 Autoevaluación»—, y la gente por su
  nombre de pila (`window.nombresCortos`): tres nombres completos se comen el
  renglón entero. Lo completo se sigue leyendo dentro de la sección.

  **Al editar arrancan todas plegadas; al crear se abren «Datos» y
  «Preguntas»**, que son las que hay que llenar sí o sí —una hoja nueva toda
  cerrada no dice por dónde se empieza—.

  Dos cosas que hay que mantener:

  - **El guardado abre la sección que impide guardar.** Con todo plegado,
    «Faltan datos» no dice dónde faltan: cada aviso llama antes a
    `abrirGrupoEval`, y por eso «Faltan datos» se partió en dos mensajes, uno
    para el título y otro para las preguntas.
  - **El modo restringido del revisor esconde el `<summary>`, no la sección.**
    `aplicarModoSoloDestinatarios` escondía `grupo-destinatarios` porque era
    sólo el rótulo; desde que ese id es el `<details>` entero, esconderlo
    dejaría la hoja en blanco. Se le quita el renglón —repetiría el título de
    la hoja— y se abre a mano, que sin renglón no queda quién la despliegue.

  El `<summary>` es un flex con `gap`, así que el título y su valor van
  envueltos en un solo `<span class="grupo-eval-titulo">` o el chevron se
  metería entre los dos: es la misma trampa de `.hoja-plegable-resumen` de
  siempre. El valor va de una línea y recortado con «…» —lo elegido puede ser
  largo y partirlo en tres renglones deja el encabezado más alto que la sección
  que resume—, y vacío no se dibuja.

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
  —la lista, la pantalla de una clasificación, la encuesta abierta, la
  revisión por empleado, el expediente y la certificación por
  clasificación—, así que el
  título de la hoja no puede ser fijo: se pone con
  `window.encabezadoHojaEvaluaciones(titulo, alVolver, idEncuesta, subtitulo)`,
  en `4-evaluaciones-base.js`. Sin argumentos vuelve a «Evaluaciones y
  encuestas» con la cruz, sin subtítulo y sin lápiz. **Toda pantalla que repinte ese contenedor tiene que llamarlo**,
  o se queda con el título de la anterior.

  Al abrir una encuesta el botón del encabezado deja de ser la cruz y pasa a
  ser la flecha de volver: dentro de una encuesta lo que busca el dedo es
  retroceder, no cerrarlo todo. Como la cruz la dibuja `.ios-boton-cerrar` con
  pseudoelementos, cambiar de icono es quitar esa clase y meter el `<svg>`
  dentro —y al revés, vaciarlo y devolvérsela—.

  **Pero sólo si se llegó por la lista.** A la hoja de una encuesta se entra por
  dos caminos, y desde el panel de inicio se entra derecho
  (`abrirEncuestaDesdeInicio`, que ya no monta la lista): ahí la flecha llevaba a
  una pantalla por la que nadie había pasado, así que se queda la cruz. Lo decide
  el camino y no la pantalla que se dibuja, de modo que la marca la pone cada
  puerta de entrada y la leen las demás:

  ```js
  window.vengoDeLaListaDeEncuestas        // la pone la lista al dibujarse; el inicio la quita
  window.grupoDeLaListaAbierto            // el grupo cuya pantalla se está mirando, o null
  window.volverALaListaDeEncuestas()      // el «volver», o null si no hay a dónde
  ```

  Hoy son **tres** caminos, no dos: el tercero es la pantalla de una
  clasificación de la propia lista, y de ahí el segundo marcador —se explica
  más abajo, con esa pantalla—. El ayudante los mira en orden de lo más
  cercano a lo más lejano, así que quien entró por una clasificación vuelve a
  ella y no a la lista.

  `abrirHistorialEvaluacion` —la de `4-evaluaciones-admin.js`, que es la que
  manda— pasa lo que devuelva ese ayudante, así que hereda el camino sin saber
  cuál fue: cualquier cosa que vuelva a abrir la encuesta desde dentro de la
  hoja conserva el botón que ya tenía.

  **En modo administrador va además el lápiz de editar la encuesta**, a la
  izquierda de ese botón y agrupado con él en `.hoja-acciones`, como cualquier
  encabezado de hoja con más de un control. Hace lo mismo que el lápiz de la
  tarjeta de la lista —`cerrarModalEvaluaciones()` y `editarEvaluacion(id)`—,
  sólo que sin bajar a buscarla: se llega a la encuesta desde el inicio y desde
  la lista, y desde el inicio la tarjeta ni siquiera existe.

  Es el **tercer argumento** de `encabezadoHojaEvaluaciones(titulo, alVolver,
  idEncuesta)`, y va así porque el lápiz necesita saber **cuál** editar: sólo la
  pantalla de una encuesta lo sabe. Las otras cinco llaman sin él y ahí el lápiz
  se esconde, que es lo que evita que se quede el de la encuesta anterior. El
  `onclick` se engancha desde JavaScript y no desde el marcado, que ahí el id
  cambia con cada encuesta.

  Ojo con esconderlo: se hace con el atributo `hidden`, y `.ios-boton-icono` es
  un flex, así que hace falta la regla `.ios-boton-icono[hidden] { display:
  none }` de `estilos.css` —la misma que ya tapaba el «+» del encabezado del
  panel, generalizada— o el lápiz se vería siempre. Es la trampa de
  `.tipos-pregunta`.

  **Y debajo del título va la frecuencia**, en el `.hoja-subtitulo` del
  encabezado —**cuarto** argumento, `subtitulo`—: es de la encuesta entera y de
  las que se leen de un vistazo, así que ahí se dice sin gastar un recuadro. Va
  **sin la palabra «Frecuencia»**, que al lado del nombre de la encuesta no
  añade nada: «Semanal» ya es una frecuencia. Antes encabezaba el recuadro gris
  de información del cuerpo, y **ese recuadro ya no se dibuja si se queda
  vacío** —la frecuencia era lo único que siempre traía, así que sin ella la
  condición pasó a mirar lo que de verdad le queda dentro: descripción, «✨
  Opcional», «📍 Mide por Área» y quién la revisa—.

  El subtítulo **se escribe siempre, aunque sea para vaciarlo**, igual que el
  título y por lo mismo: es del título que tiene encima, y heredar el de la
  pantalla anterior sería peor que no tener ninguno. Vacío no se dibuja
  (`#subtitulo-hoja-evaluaciones:empty`), que si no su margen separaría el
  título de la línea del encabezado sin decir nada.

  **La pantalla de una encuesta va sin emoji y sin adornos**, y eso se fue
  quitando a propósito:

  - **No pregunta «¿Deseas registrar una nueva respuesta para esta
    evaluación?»**. Debajo estaba el botón que lo dice —«Volver a Responder»,
    «Responder Encuesta», «Evaluar a un Colaborador…»—, así que era el rótulo
    del botón contado dos veces y en forma de pregunta.
  - **«Tu último resultado» no lleva la etiqueta del estado** («⭐ Certificada»,
    «✓ Revisada», «⚠️ Mal revisada»…), que era una chapa de color por encima de
    una cifra que ya va coloreada con `getColorScore`. Con ella se fue el mapa
    `estados`. Lo que se pierde es la explicación del «—» de una respuesta
    todavía sin calificar; el estado se sigue diciendo en su renglón de la
    lista de respuestas y al abrirla.
  - **Ningún emoji**: ni en los tres botones, ni en el aviso de «Te toca
    revisar esta encuesta», ni en el recuadro de información («Encuesta
    Opcional», «Mide resultados por Área»), ni en el rótulo «Respuestas (N)» ni
    en su buscador. La flecha de «entra aquí» que llevaban las filas es hoy un
    «›» gris claro, que es lo que hace ese trabajo en iOS. El texto de cada
    estado se queda —«Certificada», «Mal Revisada»—: lo que se quitó fue el
    dibujo de delante.

  **Y administrando, esa pantalla tampoco es la de quien inició sesión.**
  «Tu último resultado» ponía ahí el 100% del administrador como si fuera el de
  la encuesta, y el botón de responder salía en **todas** —ese `if` llevaba un
  `window.modoAdminActivo ||` delante de `leTocaEstaEncuesta`—, o sea invitaba a
  contestar por alguien a quien no le tocaba. Con el modo encendido:

  - El recuadro de arriba dice **«Resultado de la empresa»**, con la misma cifra
    de la tarjeta del panel y sacada de la misma función
    (`resumenDeEncuestaAdmin`), que si no las dos pantallas discreparían: el
    promedio repartido sobre el padrón —**más quien contestó y ya no está en
    él**, que es lo que impide un «126/95 respuestas · 104%»— y, debajo, «23/40
    respuestas · este mes». Una de «única vez» no lleva esa última palabra —`periodoDeEncuesta` la
    resuelve como «alguna vez», que ahí no se lee, y el subtítulo del encabezado
    ya lo dice—. No es pulsable: la lista de respuestas está justo debajo.
  - **El botón de responder se decide con la regla de siempre.** Al
    administrador al que la encuesta sí le toca le sale igual; al que no, ya no.

  Sin la ficha de la encuesta (`evalData` en null) el recuadro **no se dibuja**
  en lugar de caer al resultado personal, que es lo que se vino a quitar.

  **Y debajo del recuadro va la línea de cómo se ha comportado.** El recuadro
  dice dónde está hoy y la gráfica, si va a mejor: es la misma `graficaDeLinea`
  de la tarjeta del panel con el mismo `historialDeRevision` que la alimenta
  —`{ filas: [{ ev }] }` y `{ sobrePadron: true }`—, así que el último punto es,
  por construcción, la cifra que se lee encima. Tocar un punto abre su globo y
  nada más: aquí no hay una lista debajo que cambiar, que es lo que hace el
  segundo argumento de `graficaDeLinea` en la tarjeta.

  **El eje es el de esta encuesta, y el de meses cuando no tiene ninguno**
  (`window.ritmoDelEjeDeEncuesta`). En la tarjeta se mezclan trece frecuencias y
  por eso se fuerza a meses; aquí hay una sola, así que una semanal se lee por
  semanas y una trimestral por trimestres.

  **Y una de «única vez» también se dibuja**, aunque no tenga periodos que
  recorrer. Se probó a dejarla sin gráfica —da un solo punto, y con menos de dos
  no se dibuja nada— con el argumento de que esa encuesta no tiene tendencia, y
  es falso: se contesta a lo largo de meses, y cada mes dice cuánta gente la
  llevaba contestada, así que la línea sube según la va contestando la plantilla.
  Lo que hace que cada punto cuente sólo hasta su fecha es el tope de «nada de lo
  enviado después del instante que se mira», que ya estaba puesto para esto
  mismo en la tarjeta. En este proyecto casi todas las respuestas son de
  encuestas de «única vez», así que sin ese ritmo prestado la mayoría de las
  pantallas se quedaba sin gráfica —«Autoevaluación 5RGSM SV», con 321
  respuestas repartidas en meses, no enseñaba ninguna—.

  El ritmo se decide **una sola vez** y va a los dos sitios: a la consulta y a
  `historialDeRevision`. Si el eje y el `gte` no hablaran del mismo tramo de
  tiempo, los puntos de atrás saldrían a medias.

  **Y salen de su propia consulta, que alimenta también el recuadro.** Las
  respuestas que esta pantalla ya tiene a mano se piden con un `select('*')` sin
  acotar, así que PostgREST las corta en mil: de una encuesta con casi tres mil
  respuestas al mes el recuadro decía «1000/3237» mientras la tarjeta del panel
  decía «2887/3237» de la misma. Hoy las dos salen de
  `respuestasDelPeriodoDeTodos([ev], ahora, ritmoDelEje)`, acotada y paginada, y
  **no se dibuja la gráfica si llegó al tope** —las respuestas vienen de la más
  nueva, así que lo que falta son los periodos de atrás y la línea subiría desde
  un suelo falso—, que es la regla de la tarjeta.

  Ese **tercer argumento es nuevo**: es el ritmo del eje que se va a dibujar y
  no el de las encuestas. La tarjeta no lo pasa —su eje va en meses a la
  fuerza—, pero sin él una trimestral traía seis meses para un eje de seis
  trimestres y los cuatro puntos de atrás salían vacíos o a medias.

  Dos cosas que hay que mantener:

  - **La consulta se lanza arriba y se espera abajo.** Esta pantalla se pinta
    entera al final, así que en serie sería una espera más antes del primer
    fotograma; lanzada en cuanto se sabe la encuesta, corre en paralelo con el
    material y con las respuestas y no cuesta nada. Lleva su `.catch(() => null)`
    **desde el lanzamiento**: una promesa que pasa un rato sin nadie que la
    atienda se lleva por delante la pantalla entera si la red falla ahí, y sin
    ella esa hoja se dibujaba igual. Al caer, el recuadro vuelve a las
    respuestas que la pantalla ya tiene, que es lo de antes.
  - **La plantilla se carga también en modo administrador.** De ella sale el
    padrón sobre el que se reparten el recuadro y cada punto; sin ella el divisor
    es cero, el recuadro cae a promediar sólo lo calificado y la línea no se
    dibuja. Antes sólo se pedía si la encuesta pasaba lista.

  **Quién la revisa se enseña con `window.filaDeRevisores`**, la misma fila de
  caras con el nombre de pila debajo que la hoja de detalle de una
  clasificación. Era un renglón de texto dentro del recuadro gris —«La revisa
  Pérez Reynoso Abel Alejandro»— y es el mismo dato: leerlo de dos maneras en
  dos pantallas de la misma aplicación no lo hacía más claro, una cara se
  reconoce antes que un nombre completo y tres revisores se comían tres
  renglones. El ayudante habla de un grupo de encuestas, así que aquí se le pasa
  el grupo de una sola (`{ filas: [{ ev }] }`) y su `title` dice «revisa esta
  encuesta».

  Debajo de las caras estuvo un renglón que contaba que con destinatarios
  asignados cada revisor califica a los suyos, y se quitó: eran dos líneas de
  letra pequeña explicando un reparto que quien revisa ya ve —le salen unas
  respuestas y no otras—, y las caras de encima no lo necesitan para leerse. Con
  él se fue el segundo argumento que se le había añadido al ayudante, que vuelve
  a recibir sólo el grupo.

  Y con los revisores fuera del recuadro gris, ése **puede quedarse sin nada que
  decir**: la condición que lo dibuja mira ya sólo la descripción, «Opcional» y
  «Mide por Área».

  La lista de respuestas de una encuesta va plegada en un
  `<details class="hoja-plegable">`, y se abre sola sólo si hay algo esperando
  la calificación de quien mira. Arriba, en cambio, sale siempre el último
  resultado propio, que es a lo que entra la mayoría. Ojo con
  `.hoja-plegable-resumen`, que es un flex con `gap`: cada nodo suelto del
  `<summary>` cuenta como elemento, así que el rótulo y su contador van
  envueltos en un solo `<span>` o el «(3)» se separa del texto.
- **La hoja de responder no explica lo que ya se ve.** Encima de las preguntas
  hubo dos renglones —«Responde las siguientes preguntas.» y «Todas las
  preguntas son obligatorias.»— y los dos se quitaron: debajo estaban las
  preguntas y el botón de enviar, así que el primero decía en voz alta lo que
  se está viendo, y el segundo una regla que **se cumple sola** —el envío no
  deja mandar nada en blanco, lo dice todo junto y señala en rojo lo que
  falta—. Del bloque de arriba queda sólo lo que escribió quien creó la
  encuesta (`description`) y, en modo jefe, el renglón que dice cuál se está
  contestando: ahí el título de la hoja es la persona a la que se evalúa.

  Ese bloque **no se dibuja si se queda vacío** (`introHtml`): sin descripción
  y sin área dejaba un hueco de 25px por encima de la primera pregunta. Es la
  misma regla que el recuadro gris de la pantalla de una encuesta.

  Y el subtítulo del encabezado va **sin emoji**, por `textoDeFrecuencia`: ahí
  vivía la última copia del mapa de frecuencias adornadas (ver más arriba).

- **El área que se evalúa es una fila de ajustes de iOS, no una chapa.** Una
  encuesta `evaluates_area` dice arriba a cuál se refiere y deja cambiarla ahí
  mismo. Era una chapa rosa con un 📍, el nombre subrayado y un lápiz al lado
  —un enlace disfrazado, con un `<select>` de 0.8rem que además hacía **zoom al
  enfocarlo** en Safari—. Hoy es lo que el dedo espera en iOS: rótulo gris a la
  izquierda, el área a la derecha en negrita y el chevron que dice que se toca.
  Las clases están en `estilos.css` (`.area-eval`, `.area-eval-fila`,
  `.area-eval-valor`, `.area-eval-editor`…) y no se estilan a mano.

  ```js
  window.abrirSelectorDeArea()        // la fila abre y cierra el desplegable
  window.pintarAreaElegida(nombre)    // la deja puesta, en un solo sitio
  ```

  Cinco cosas que hay que mantener:

  - **La fila entera es el blanco del dedo**, con los 44px que pide iOS, y
    **vuelve a cerrar** al tocarla otra vez: por eso no hay botón de cancelar
    —era otro blanco fácil al lado del que sí importa—.
  - **El desplegable sale dentro de la misma tarjeta**, debajo de la fila.
    Apilar una hoja por un solo campo deja dos tiradores a la vista, que es la
    razón de la lista de tipos de pregunta y de la de clasificaciones.
  - **16px clavados en el `<select>`**: por debajo de eso Safari en iOS hace
    zoom al enfocar, y ése era el defecto de la chapa vieja.
  - **Se esconde con `hidden`**, así que `.area-eval-editor` y
    `.area-eval-estado` llevan su propia regla `[hidden] { display: none }`:
    tienen `display` de autor y eso le gana al `[hidden]` del navegador. Es la
    trampa de `.tipos-pregunta`.
  - **Sin área elegida la fila lo pide en rojo** («Selecciona un área», con
    `.area-eval--falta`) y sin emoji; el envío sigue plantándose igual, que es
    quien de verdad lo exige.

  Los ids se quedaron como estaban —`area-badge-container`,
  `area-display-text`, `area-edit-container`, `eval-inline-area-select`,
  `area-save-indicator`—, que son los que busca `guardarAreaEnEvaluacion`; lo
  que cambió es que esa función ya no escribe estilos a mano ni le pega un
  lápiz al nombre: llama a `pintarAreaElegida`, y el «Guardando el área…» va en
  su renglón de estado con el desplegable apagado mientras tanto.

- **La lista de encuestas de la hoja va como la tarjeta del panel de inicio:
  una clasificación por renglón, plegada, y sus encuestas dentro.** Era una
  rejilla de cuadros de 64px con el título recortado a dos renglones debajo
  —un menú de aplicaciones de iOS—, y ahí cada encuesta se veía por un cuadro
  gris idéntico al de al lado: lo único que la distinguía eran tres palabras
  de título, y no decía **ni cómo va la propia, ni qué sacó, ni qué le falta**.
  Eso vivía dos toques más adentro, en la pantalla de cada encuesta, mientras
  el panel de inicio ya lo enseñaba de un vistazo en el mismo teléfono.

  Comparte con esa tarjeta todo lo que se puede compartir: el
  `<details class="grupo-asignadas">` con su `<summary>`, el icono de estado
  (`iconoDeAsignada`), el pie con la cuenta y el promedio, y la sangría de los
  renglones de dentro. Lo que cambia es de qué habla, porque esta lista **no
  es sólo de quien mira**: trae también las encuestas que sólo revisa y, en
  modo administrador, las de todo el mundo.

  ```js
  window.estadoDeEncuestaEnLista(ev, { leToca, revisor, respuestas, porCalificar })
  // → { estado, pendiente, peso }
  ```

  Ese ayudante **no decide nada**: sólo elige cuál de las dos reglas de siempre
  habla de cada renglón —`esEvaluacionPendiente` contado con
  `estadoDeAsignada` si la encuesta le toca, `estadoDeRevision` si no le toca
  pero la revisa— y devuelve además el `peso` con el que se ordena. Así la
  lista no puede discrepar del badge del panel ni del panel de pendientes, que
  es lo mismo que promete la tarjeta del inicio.

  Sus dos estados propios son los que allí no existen, y los dos son el
  **neutro** —un círculo a rayas, que se distingue por la forma y no sólo por
  el gris—:

  - **La encuesta que no es de quien mira**, que es lo que ve el administrador
    de casi todas: una palomita verde diría que está «al día» de algo que no le
    toca, y un círculo rojo, peor. Va al final de su clasificación.
  - **La encuesta apagada**, que sólo llega hasta ahí en modo administrador:
    `esEvaluacionPendiente` no sabe de `active` —lo filtran quienes la llaman—,
    así que sin esto una encuesta retirada pedía «Sin contestar» en rojo, o sea
    reclamaba una respuesta que ya no se puede dar. Que está apagada lo sigue
    diciendo su etiqueta «INACTIVA», y su renglón se va al final del grupo.

  Cinco cosas que hay que mantener:

  - **Se piden antes las ventanas de asistencia.** Cada renglón dice ahora en
    qué estado está, y `esEvaluacionPendiente` consulta la ventana de las
    encuestas que pasan lista **sin poder esperar**: por eso
    `cargarVistaEvaluaciones` llama a `cargarVentanasDeAsistencia()` con las
    otras dos cachés. Sin ella no hay ventana y todo se comporta como antes.
  - **El grupo se agrupa por la clasificación normalizada**
    (`normalizarClasificacion`), que es quien decide si dos nombres son el
    mismo: por el texto crudo, «Seguridad» y «seguridad » se dibujaban como dos
    clasificaciones, cada una con su propia insignia de certificación.
  - **Lo que espera calificación va en el globo rojo de la derecha, no en el
    pie.** Es la misma cuenta que llevaba el globo sobre el cuadro de la
    rejilla, y ahora está en los dos renglones —el de la encuesta y el de su
    clasificación—. En el pie era un cuarto trozo y lo partía en dos líneas,
    dejando el encabezado de la clasificación más alto que sus encuestas.

    **Y no se dibuja en modo administrador**, ni él ni su «N por calificar» del
    renglón de resumen: ahí la lista es la de todo el mundo y un globo rojo por
    encuesta se lee como una bandeja de trabajo que no es la suya. Lo que el
    administrador tiene que calificar le sale igual en su panel de inicio y en
    «Revisar por Empleado», que es la pantalla que habla de eso.

    De paso se quitó lo que inflaba esa cuenta: el mapa se armaba con
    `window.modoAdminActivo || leTocaRevisar(…)`, así que en ese modo contaba
    las respuestas sin calificar de la empresa entera —51 en una pantalla donde
    ninguna era suya— mientras su propio `title` decía «esperan **tu**
    calificación». Con la cuenta inflada, además, una encuesta que no le toca ni
    revisa se dibujaba con el icono de «por calificar» en vez del neutro que
    promete `estadoDeEncuestaEnLista`. Hoy la cuenta significa lo mismo para
    todos.
  - **La insignia de certificación va en su propio renglón** del encabezado
    (`.grupo-eval-chapa`) y no al lado del nombre: «📉 1 por debajo de 80%» no
    cabe en lo que queda del ancho de un teléfono.
  - **El renglón del administrador no lleva ningún botón.** Hubo tres, y los
    tres se fueron a la hoja de editar la encuesta, que está a un toque del
    renglón —se abre con el lápiz del encabezado de su pantalla—: el lápiz de
    **editar** repetía ese mismo lápiz, el bote de basura de **eliminar** es hoy
    el del encabezado de esa hoja (más abajo) y **encender y apagar** ya era la
    casilla «Activa» de su grupo «Opciones», así que el botón del renglón era el
    mismo interruptor por otra puerta. Que una encuesta está apagada lo sigue
    diciendo su etiqueta «INACTIVA», que es lo que hay que ver desde una lista.

    Con ellos se fue la regla que los mandaba a su propia fila en un teléfono
    (`.encuesta-acciones` con `flex: 1 1 100%`), que existía porque tres se
    llevaban la mitad del ancho y dejaban el título en una columna de dos
    palabras. `.encuesta-fila-texto` sigue necesitando `min-width: 0` o no
    encoge por debajo de su palabra más larga.

    El lápiz del revisor —«Editar a quién va dirigida», que no es el mismo
    botón— se queda: esa hoja restringida es lo único que puede abrir desde la
    lista quien no es administrador.

  - **Eliminar una encuesta vive en el encabezado de la hoja de edición**
    (`#btn-borrar-eval`, con `window.borrarEvaluacionEditada`), no en su
    renglón: se lleva por delante lo que contestó todo el mundo, y ése no es un
    botón que deba estar a un toque de distancia en una lista, al lado de otros
    dos y del que abre la encuesta. Lo enseña y lo esconde
    `prepararEncabezadoEval` —sólo al editar una que ya existe: al crear no hay
    nada que borrar, una copia todavía no es ninguna fila y el revisor que
    corrige a quién va dirigida no puede eliminar nada—, con `hidden` y la regla
    `.ios-boton-icono[hidden]` de siempre.

    `window.borrarEvaluacion(id)` **dice cuántas respuestas se van con ella**
    —con `head` y `count`, así que no viaja ninguna fila— y pregunta dos veces
    cuando hay algo que perder, como el borrado de un empleado y por lo mismo.
    **Cuenta las filas del `.select()`**: PostgREST responde con éxito a un
    delete que las políticas de RLS rechazan y la pantalla decía «Evaluación
    eliminada» mientras la encuesta seguía ahí. Y si la base se planta con un
    23503 —sus respuestas o sus preguntas la tienen declarada sin borrado en
    cascada— el aviso manda a **desmarcar «Activa»** en el grupo «Opciones» de
    esa misma hoja, que es la salida que conserva lo contestado.

  **Y encima de la lista ya no hay ninguna fila de botones para el usuario.**
  Ahí estuvo «🗂️ Ver Historial Global (Todas)», lo único de esa fila que veía
  todo el mundo, y se quitó con su `window.abrirHistorialGlobal`: mezclaba en
  un solo listado las respuestas de todas las encuestas —de la plantilla
  entera en modo administrador— cuando el historial de una se lee entrando en
  ella, que es donde tiene contexto y donde además está su gráfica. La fila
  **sólo se dibuja en modo administrador**, con «Revisar por Empleado» y
  «Certificar por Clasificación»: vacía se llevaba sus 20px de margen por
  encima de la lista.

  **Las dos que quedan son dos filas de ajustes de iOS**, en la misma
  `.lista-ios` que usa la hoja de gestión: cada una abre una pantalla, así que
  es exactamente lo que hace una fila con su icono, su renglón de qué es y su
  chevron. Eran dos pastillas de colores con emoji —«🔎 Revisar por Empleado»,
  «⭐ Certificar por Clasificación»— de antes de que la aplicación tuviera ese
  lenguaje.

  El icono va en un cuadrado redondeado del color de la acción con el glifo en
  blanco (`.fila-ios-icono--tinta`), que es el ajuste de iOS de hoy, y es un
  `<svg>` y no un emoji: cada sistema dibuja el suyo a su manera y aquí hacen
  falta dos que se vean del mismo tamaño y del mismo trazo. El renglón de debajo
  del título **se deja envolver** aquí (`.fila-ios-detalle--envuelve`), que en
  una fila de acción es una frase y no un dato corto: recortar «Resuelve juntas
  las evaluaciones de una persona» a mitad de palabra no dice nada.

  Y con ellas **se fue la chapa de «⚙️ Modo Admin Activo»**: que el modo está
  encendido lo dicen el título del panel en rojo y el «+» de su encabezado, así
  que ahí era un rótulo de color que no llevaba a ningún sitio, justo al lado de
  los dos que sí.

  Con la pantalla se fue la marca `window.isGlobalHistory`, que sólo servía
  para que cada renglón de `renderizarListaRespuestas` dijera además de qué
  encuesta era la respuesta. Esa función se queda —la usa la lista de
  «Respuestas (N)» de cada encuesta, con los mismos ids
  (`buscador-historial`, `lista-respuestas-historial`, `contador-respuestas`)—
  y ahí el nombre de la encuesta lo dice el encabezado de la hoja.

  El grupo **nace abierto si hay algo esperando a quien mira** —lo suyo
  pendiente, o algo que le toque calificar—, como la lista de respuestas de una
  encuesta y por lo mismo. En modo administrador no: ahí se listan las
  encuestas de todo el mundo y casi todas tienen algo pendiente de alguien, así
  que abrirlas todas es no plegar nada.

  **Y el renglón de una clasificación hace las mismas dos cosas que en el
  inicio**: tocarlo abre la **pantalla de la clasificación** —cómo va, su
  gráfica de periodos, quién la revisa y sus encuestas— y la flecha de la
  derecha despliega ahí mismo la lista de sus encuestas. Las dos no caben en el
  mismo toque, así que la flecha es un botón suyo (`alternarGrupoAsignadas`,
  con su `stopPropagation` y su `preventDefault`) y el `<summary>` hace
  `preventDefault` para que el navegador no despliegue por su cuenta lo que ya
  decide el botón.

  ```js
  window.clasificacionesDeLaLista   // los grupos ya calculados, por índice
  window.respuestasDeLaLista        // las respuestas enteras, para la gráfica
  window.abrirClasificacionDeLaLista(indice)
  ```

  **Esa pantalla va dentro de la hoja, no como una hoja encima.** Es la
  séptima que se dibuja en `#contenido-modal-evaluaciones`, con la flecha de
  volver a la lista en el encabezado. Apilar `#modal-detalle-clasificacion`
  sobre la hoja de evaluaciones dejaría dos tiradores a la vista y esconderría
  la de abajo —lo que esta aplicación no hace en ningún sitio, y lo que el
  observador de `1-config.js` sólo desdobla para el panel de administración—;
  y como las dos llevan el mismo z-index y la de evaluaciones se inserta al
  final del `<body>`, taparía a la otra. Aquí ya hay una hoja abierta, así que
  lo que toca es cambiar de pantalla, como al abrir una encuesta.

  **El cuerpo es el mismo que el de la hoja del inicio, y por eso se extrajo**
  a `window.cuerpoDetalleClasificacion(grupo, respuestas, abridor)` (en
  `2b-core-dashboard.js`): el resultado del último periodo, la línea de los
  anteriores, la fila de quién revisa y las encuestas con su fecha y su
  puntaje. `abrirDetalleClasificacion` —la hoja del panel— pasa por ahí
  también, así que las dos pantallas no pueden divergir. Lo que cambia es lo
  que cada una escribe alrededor:

  - **El `abridor`**, que es lo que se llama al tocar una encuesta. Desde el
    panel hay que cerrar esa hoja antes de entrar
    (`cerrarDetalleClasificacion(); abrirEncuestaDesdeInicio`); desde la lista
    es `abrirHistorialEvaluacion` a secas, que dibuja la encuesta en la misma
    hoja y conserva la flecha de volver.
  - **El título y el subtítulo**, que no dicen lo mismo: en el panel, «N
    encuestas asignadas»; en la lista, la cuenta con lo pendiente y lo que
    espera calificación —y en texto pelado, que lo escribe `innerText` y el
    pie del renglón lleva el promedio con su color—.
  - **Las respuestas**, que son de cada pantalla: `historialDeClasificacion`
    admite un tercer argumento en vez de leer sólo `respuestasAsignadas`.
  - **Los dos botones del encabezado** —el ojo y el «+»—, que son los mismos
    (`botonesDeClasificacion`) con **otros ids y otro cierre**: la hoja de
    evaluaciones tiene los suyos (`btn-revisores-hoja-eval`,
    `btn-nueva-encuesta-hoja-eval`) y cierra ella misma antes de abrir la que
    ellos abren. Los esconde `encabezadoHojaEvaluaciones`, como al lápiz y por
    lo mismo, así que la pantalla de la clasificación los repone **después** de
    llamarlo.

  **Y el «volver» de una encuesta sabe por dónde se entró.** A la pantalla de
  una encuesta se llega ya por tres caminos, y el botón del encabezado no puede
  llevar a una pantalla por la que nadie pasó: además de
  `vengoDeLaListaDeEncuestas` está `window.grupoDeLaListaAbierto`, el índice
  del grupo cuya pantalla se está mirando —o null—. Lo pone
  `abrirClasificacionDeLaLista` y lo quitan las otras dos puertas: la lista, que
  vuelve a ella misma, y `abrirEncuestaDesdeInicio`, que se queda con la cruz.
  `volverALaListaDeEncuestas()` mira primero esa marca, de modo que desde una
  encuesta abierta en la pantalla de su clasificación se vuelve a ella y no dos
  pasos atrás.
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
  encabezado de la ficha —la de «Gestionar información» del panel y la de
  «Editar empleado» de `10-refacciones.html`, que son la misma cosa desde dos
  pantallas— borra la ficha y todo lo que esa persona dejó registrado, sin
  papelera ni vuelta atrás.

  La base no lo hace sola. Las firmas, las respuestas de encuestas, los
  objetivos, los hallazgos, las encuestas programadas y las solicitudes de
  refacciones guardan a la persona por su número —unas veces el `id` numérico
  de la fila y otras el `employee_id` de texto, según la antigüedad del
  registro— y esas columnas no son llaves foráneas: borrar la ficha no borra
  en cascada ni se queja, dejaba el registro apuntando a alguien que ya no
  existe y un alta futura con ese mismo número lo heredaba. El barrido lo hace
  `window.eliminarEmpleadoConHistorial(emp, avisar)`, tabla por tabla, según la
  lista `window.RASTROS_DEL_EMPLEADO`. **Las dos viven en `1-config.js`**, que
  es lo único que comparten los dos documentos que borran gente: dos copias de
  esa lista dejarían historial sin dueño en cuanto una se quedara atrás. Lo que
  pone cada pantalla es sólo a quién se está editando, cómo cuenta en qué va
  —`avisar`, que le escribe el subtítulo de su encabezado— y qué recargar
  después.

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

  El encogido y el bucket son los de `window.subirFotoEvaluacion(blob,
  prefijo)`, y la URL acaba bajo el id de su pregunta, que es donde va la
  respuesta de cualquier otra. **Esta pregunta es la que sustituyó a la foto
  del área** de las encuestas `evaluates_area`, que era un recuadro aparte y
  obligatorio: ver más abajo.
- **El registro de asistencia no se contesta: se confirma.** Es para pasar
  lista de una junta o una capacitación. La encuesta se dirige a quien tenía
  que ir, el enunciado dice a qué —«Capacitación de seguridad del 4 de
  septiembre»— y quien la recibe sólo marca «Sí, asistí». **Quien no asistió no
  la contesta**, y le sigue saliendo como pendiente: no hay opción de «no fui»
  porque la ausencia ya se ve sola en la lista de quién falta.

  ```js
  window.TIPO_PREGUNTA_ASISTENCIA         // 'attendance'
  window.esPreguntaDeAsistencia(pregunta)
  window.TEXTO_ASISTENCIA                 // 'Asistí', lo que se guarda
  ```

  **Se califica sola al enviarla**, como la escala y las opciones marcadas:
  `enviarRespuestasEval` le escribe su `grades_json` —`status: 'correct'`, con
  `auto: true`— y suma a `autoGradedCount`, así que una encuesta que sólo pasa
  lista se guarda ya `'Revisado'`. Tenía que ser así: dejarla sin calificar le
  crearía a alguien un pendiente de revisión donde no hay nada que decidir, y
  dejarla **sin nota ninguna** —como la evidencia en modo jefe— sería peor,
  porque entonces `calcularScoreRespuesta` daría 0 sobre cero preguntas y la
  clasificación no se certificaría nunca sin apagarle el puntaje mínimo a mano.

  Por eso **no entra en `TIPOS_EN_MODO_JEFE`** aunque cumpla el requisito de
  puntuarse sola: ahí el puntaje es el veredicto del jefe sobre la persona, y
  un 100 regalado por haber asistido lo diluye. Es la misma razón por la que la
  evidencia fotográfica no puntúa en ese modo.

  No lleva opciones, ni respuesta modelo, ni motivo, y **`guardarNuevaEvaluacion`
  le vacía `correct_answer_text` a propósito**: el campo de «Respuesta Modelo»
  sigue en el marcado aunque esté escondido, así que sin vaciarlo se guardaría
  lo que hubiera quedado escrito antes de cambiar el tipo.

  Al calificar se enseña «🙋 Asistencia registrada · 4 de septiembre de 2026» y
  la insignia dice **REGISTRADA** o **SIN REGISTRAR**, no «CORRECTO»: ahí no se
  acertó nada. **Ni en modo administrador aparece un campo para editarla** —lo
  que se corregiría sería que alguien fue o no fue, y eso se resuelve borrando
  la respuesta—; el valor sobrevive porque `guardarCalificacionAdmin` parte de
  una copia de `answers_json`. La fecha sale de `submitted_at`, así que la
  pregunta no guarda ninguna hora suya.

  **Una asistencia lleva la fecha y la hora del evento, y sólo se registra en
  su hora.** Pasar lista sin hora no sirve de mucho: quien no fue se registra al
  día siguiente. Con fecha, el pendiente **no aparece antes del evento** —no ha
  pasado todavía nada que confirmar— y hay
  `window.MINUTOS_PARA_REGISTRAR_ASISTENCIA` (60) para hacerlo; pasados, ya no
  se puede y **no haberla contestado es la inasistencia**, que es como esta
  aplicación cuenta a quien falta desde siempre.

  ```js
  window.PLAZA_FECHA_EVENTO              // 0: la primera posición de `options`
  window.fechaDelEvento(pregunta)        // Date, o null
  window.ventanaDeLaPregunta(pregunta)   // { inicio, fin }
  window.estadoDeAsistencia(pregunta, ahora)  // 'sin-fecha' | 'antes' | 'abierta' | 'cerrada'
  window.avisoDeAsistencia(pregunta)     // lo que se le dice a quien la mira
  ```

  Viaja en la **primera posición de `options`**, que para este tipo no guardaba
  nada, así que no hay columna nueva ni script que correr: es la misma idea que
  la guía de una escala en la cuarta. Se guarda en **ISO** y no como la hora
  local que da el `datetime-local`, para que el teléfono de quien la conteste
  lea el mismo instante aunque esté en otro huso; `window.valorLocalDeFecha`
  hace el camino de vuelta para el campo, porque `toISOString()` ahí enseñaría
  UTC.

  **La fecha es opcional**: sin ella la pregunta se comporta como antes
  —siempre registrable—, que es lo que deja en pie a las que ya estaban
  creadas.

  **El pendiente es de la encuesta, pero la hora es de la pregunta**, y las
  pantallas que deciden el pendiente —`esEvaluacionPendiente` y el badge del
  panel— parten de `evaluations` y no traen las preguntas. Por eso las ventanas
  se piden **una sola vez por sesión** y se guardan en una caché, como las
  clasificaciones que se certifican, y quien pregunta lo hace sin poder
  esperar:

  ```js
  await window.cargarVentanasDeAsistencia()      // la llena; `true` la rehace
  window.ventanaDeAsistencia(evaluationId)
  window.asistenciaFueraDeHora(evaluationId, ahora)
  ```

  La consulta trae **sólo** las preguntas de asistencia, que son pocas. La
  piden `cargarVistaPendientes` y `calcularPendientesBatch` antes de decidir
  nada, y `guardarNuevaEvaluacion` la rehace al guardar —ahí es donde se
  escriben las preguntas, así que puede haber una asistencia nueva o con la
  hora movida—. **Mientras la caché no esté cargada no hay ventana y todo se
  comporta como antes**: es preferible enseñar un pendiente de más que
  esconderle a la plantilla entera los suyos porque una consulta no respondió.

  Si una encuesta tuviera varias asistencias con fechas distintas —no es para
  lo que está pensada: una encuesta de asistencia es de un evento— la ventana
  de la encuesta va de la primera a la última, para que ninguna se quede sin
  poder registrarse. **Cada pregunta sigue exigiendo la suya al contestarla**,
  que es donde se decide de verdad.

  **Fuera de plazo la casilla se enseña igual, apagada y diciendo por qué**
  (`.asistencia-registro.esta-cerrado`). Esconderla dejaría el enunciado con
  nada debajo, que es exactamente lo que no se distingue de un teléfono con el
  JavaScript viejo.

  Y **el envío lo vuelve a comprobar**, no sólo el formulario: la hoja pudo
  quedarse abierta desde antes del evento, o pasarse la hora con ella abierta, y
  el reloj corre igual. Ese aviso va **antes** que el de lo que falta y por
  separado: no es un descuido de quien la llena, así que decirle «falta
  contestar» sería mentirle.

  Lo que **no** mira la ventana es el calendario: una encuesta programada a una
  persona concreta en `scheduled_evaluations` sigue apareciendo en su día. Es la
  misma excepción que ya tenía con `active`, y por lo mismo — esa programación
  es una asignación explícita.

  **El enunciado de cada tipo lo dice el catálogo** (`enunciado` en
  `TIPOS_DE_PREGUNTA`, leído con `window.enunciadoDeTipo`): casi todos piden
  «Escribe la pregunta», pero una asistencia pide «A qué se asistió…» y una
  evidencia «Qué hay que fotografiar…», que no son preguntas. Se repone en
  `toggleTipoPregunta` y no sólo al montar la tarjeta, que es donde estaba
  antes: al cambiar de tipo, el campo seguía pidiendo una pregunta donde ya no
  se preguntaba nada.

  Es un tipo nuevo, así que **cae de lleno en la trampa del teléfono con el
  JavaScript viejo** (la primera de esta lista): ese código no conoce
  `attendance`, no entra en ninguna rama del `if` que dibuja los controles y
  enseña el enunciado con nada debajo. Por eso la versión se sube en el mismo
  cambio.

  **Y la hoja de la encuesta dice cuántos de cuántos fueron.** «Asistí» se
  guarda una vez por persona, así que la lista de asistencia no está en ninguna
  tabla: hay que armarla cruzando quién registró contra a quién iba dirigida la
  encuesta. Sin eso, saber cómo salió la junta era abrir la lista de respuestas
  y contarlas a mano contra un padrón que no se enseñaba en ningún sitio.

  ```js
  window.padronDeLaEncuesta(ev)                 // a quién le toca, sólo activos
  window.pasoDeLista(ev, pregunta, respuestas)  // { presentes, ausentes, ajenos, cuantos, total, proporcion }
  window.bloqueDePaseDeLista(ev, preguntas, respuestas, verNombres)
  window.listaDePaseDeLista(rotulo, gente, clase)
  ```

  El denominador sale de **`leTocaEstaEncuesta`**, la misma regla que decide a
  quién le toca, y no de otra copia: así el «de 25» no puede discrepar de lo que
  cada quien ve en su panel. `padronDeLaEncuesta` saca de una pasada quiénes
  tienen equipo en vez de preguntárselo a `tieneEquipoDirecto` por cada persona,
  que recorre la plantilla entera y dejaría el padrón en un recorrido al
  cuadrado.

  Cuatro reglas que lo sostienen:

  - **Cuenta sólo la vuelta en curso** (`respuestasTrasRelanzar`). Una encuesta
    que se relanzó en su día nombra otro evento, así que los registros de la
    vuelta anterior son de otra junta. Ya no se relanza ninguna —se copian, más
    abajo—, pero las que lo llevan puesto se siguen respetando.
  - **Cuenta gente, no respuestas**: quien contestó dos veces asistió una.
  - **Quien registró y hoy ya no está en el padrón sigue contando como
    presente** —se dio de baja, o le quitaron la encuesta después del evento—:
    fue, y borrarlo del acta sería falsearla. Por eso el total puede superar al
    padrón de hoy, y esa gente va aparte en `ajenos`.
  - **Antes del evento no se dice «0 de 25»**, que se leería como que no fue
    nadie: se dice que todavía no hay registros. El resto de estados los nombra
    `estadoDeAsistencia`, pero el texto se escribe aquí y no con
    `avisoDeAsistencia`, que está en segunda persona —«Tienes hasta las…»— y
    aquí se habla del evento, no de lo que le toca a nadie.

  **La cifra la ve cualquiera; los nombres, sólo quien la imparte.** Cuánta
  gente fue a la junta no es de nadie en particular, pero la lista de quién
  faltó es el acta: va para el administrador y para quien revisa la encuesta,
  los mismos que pueden corregir a quién va dirigida
  (`puedeEditarDestinatarios`). Y se cuenta sobre **todas** las respuestas y no
  sobre las filtradas por a quién le toca calificar cada una: un pase de lista a
  medias no es un pase de lista.

  El padrón necesita `todosLosEmpleadosData`, y a esta hoja se llega también
  desde el inicio con la plantilla sin cargar: se pide **sólo si la encuesta
  tiene alguna pregunta de asistencia**, para no cobrarle la consulta a quien
  abre una que no pasa lista. Si aun así no hay plantilla, el recuadro no se
  dibuja: un «0 de 0» diría que no fue nadie.

  **Y sin las columnas de destinatarios, `padronDeLaEncuesta` no da padrón.**
  `leTocaEstaEncuesta` lee una columna `undefined` como «no acota nada», que es
  lo correcto para decidir un pendiente —de más antes que de menos—, pero un
  denominador es otra cosa: diría «4 de 455» de una encuesta dirigida a doce
  personas, y eso se lee y se cree. La consulta ya las trae; la guarda está para
  que ningún número salga mal si mañana llega por otra puerta.

  La barra va **de un solo color**: la aplicación no fija ningún mínimo de
  asistencia, así que pintar de rojo un 60% sería inventarse un umbral que nadie
  definió. Las clases (`.pase-tarjeta`, `.pase-cifra`, `.pase-plegable`…) están
  en `estilos.css`, y el `<summary>` de cada lista es un flex con `gap`: el
  rótulo y su contador van envueltos en un solo `<span>` o el «(10)» se separa
  del texto, que es la trampa de `.hoja-plegable-resumen` de siempre.

  **Y quien la imparte pasa lista a mano.** La casilla que enseña la encuesta es
  de quien asiste y sólo vale dentro de su hora: pasado el plazo, un registro
  que faltó ya no lo arregla nadie, y quien fue sin tener la encuesta asignada
  nunca tuvo dónde apuntarse. El botón «Pasar lista» del recuadro abre
  `#modal-pase-lista`, donde cada persona es una fila que se marca y se
  desmarca.

  ```js
  window.paseDeLista               // { ev, preguntas, respuestas, verNombres, pregunta, huboCambios }
  window.abrirPaseDeLista(idPregunta)
  window.pintarHojaPaseDeLista()
  window.alternarAsistencia(idEmpleado)
  window.apuntarAsistencia(q, emp, respuestaExistente)
  window.borrarAsistencia(q, respuestas)
  ```

  **El plazo no se comprueba aquí, y es a propósito**: existe para que nadie se
  registre solo al día siguiente, no para atarle las manos a quien pasa lista.
  Justo después de cerrarse es cuando hay que corregir el registro.

  Marcar y desmarcar es escribir y borrar la respuesta de esa persona, que es
  donde vive «Asistí»: no hay otra tabla que diga quién fue. Cuatro cosas que
  hay que mantener:

  - **Sólo se toca la llave de esta pregunta.** Una encuesta puede llevar más, y
    borrar la fila entera se llevaría por delante lo que esa persona contestó.
    La fila se borra únicamente cuando lo de asistencia era lo único que tenía,
    y eso se decide mirando si queda alguna llave numérica en `answers_json`:
    las reservadas —`__comentarios`, `__foto_area`— no cuentan como algo
    contestado.
  - **La hora del registro es la del evento, no la de ahora**
    (`fechaDelEvento`): es cuando esa persona asistió, y es lo que deja la
    respuesta en el periodo que le toca. Sin fecha en la pregunta no hay otra
    que el momento en que se apunta.
  - **Las cuatro escrituras cuentan las filas del `.select()`.** Aquí escribe
    alguien que no es administrador y una política de RLS que lo rechace no da
    error, sólo afecta a cero filas; y las políticas van por operación, así que
    una tabla puede dejar actualizar y no borrar.
  - **El estado se corrige en memoria y no se vuelve a consultar**: la tarjeta y
    la hoja dibujan lo mismo desde `window.paseDeLista`. Al cerrar la hoja, si
    hubo cambios, se rehace la hoja de la encuesta entera —la lista de
    «Respuestas (N)» y el último resultado hablan de otra cosa ahora— y se tira
    la caché del panel con `invalidarCacheDashboard`, porque una asistencia
    recién apuntada cierra el pendiente de esa persona.

  **La lista y la asistencia son dos cosas, y se tocan por separado.** Estar en
  la lista es que la encuesta va dirigida a esa persona; haber asistido es otra
  cosa, y por eso se agrega a quien tenía que ir **haya ido o no**. En la
  sección «A quién va dirigida», la fila marca la asistencia y la «×» del final
  saca a esa persona de los destinatarios; en «Otras personas» la fila hace una
  sola cosa, agregar, y su círculo lleva un «+» en vez del hueco de la palomita.

  ```js
  window.agregarAlPadron(idEmpleado)
  window.quitarDelPadron(idEmpleado)
  window.guardarPadron(lista, agregado)   // la escritura de las dos
  window.destinatariosConcretos(ev)       // en 1-config.js: los ids, o null
  window.conApunteDeAsignacion(ev, empleadoId, revisorId)
  ```

  Agregar y quitar es escribir `evaluations.target_employees`, la misma columna
  de «Editar a quién va dirigida»: son dos puertas al mismo dato, y por eso
  **quien agrega se queda con la revisión de esa persona** —`conApunteDeAsignacion`
  aplica las tres reglas de `apuntarQuienAsigno`: no se pisa un apunte anterior,
  nadie se asigna a sí mismo y sólo se queda con él quien sea revisor— y por eso
  el mapa se poda con `asignacionesVigentes`, igual que al guardar la hoja.

  Tres cosas que hay que mantener:

  - **Una encuesta dirigida por puesto o departamento se avisa antes de
    congelarla.** `target_employees` con nombres **manda sobre todo lo demás**,
    así que agregar a una persona concreta a una encuesta de «todo PRODUCCION»
    la convertiría en una lista fija y en silencio: quien cambiara de puesto
    dejaría de tenerla. Se pregunta, diciendo en cuántas personas queda, y sólo
    se escribe si se acepta —es la misma trampa que congelar los revisores
    heredados al guardar—. La «×» de quitar, por lo mismo, **sólo sale cuando la
    encuesta va dirigida por nombre**: si va por puesto, no hay lista de la que
    quitar a nadie.
  - **No se quita al último.** Dejar `target_employees` vacío no acota nada, y
    entonces la encuesta le tocaría a todo el mundo, que es lo contrario de lo
    que pide quien quita a una persona.
  - **La fila lleva dos botones hermanos, no uno dentro de otro** —eso no vale
    en HTML—: `.pase-fila` es el contenedor, `.pase-fila-principal` el blanco
    grande del dedo y `.pase-quitar` la «×».

  Quitar de la lista a alguien que sí asistió **no le borra la asistencia**:
  pasa a ser un `ajeno` de `pasoDeLista` y se sigue contando como presente. Fue,
  y el acta no cambia porque se corrija a quién iba dirigida la encuesta.

  Y **desmarcar la asistencia sigue haciendo dos cosas según quién sea**: a un
  destinatario lo pasa a «Faltaron» —la encuesta le sigue tocando—, y a alguien
  de fuera lo quita de la lista del todo, que es como se elimina a un asistente
  apuntado por error.

  El buscador vive **fuera** del cuerpo que se repinta, como el de la pantalla
  de certificación y por lo mismo: dentro, cada letra se llevaría el foco por
  delante. Y la fila entera es el blanco del dedo —una casilla de 20px no se
  acierta—, con el círculo de la marca a la derecha: lo que distingue a quien
  asistió no puede ser sólo el color del renglón.

- **Una foto se encoge antes de subirla, y ya no hay ninguna foto del área.**
  Las encuestas con `evaluates_area` pidieron un tiempo **una fotografía del
  área**, en un recuadro propio encima de las preguntas y obligatoria como el
  área misma. Se quitó cuando la **evidencia fotográfica** pasó a ser un tipo
  de pregunta más: hace lo mismo y mejor —lo que hay que fotografiar lo dice su
  enunciado, se ordena, se edita, se borra y se califica como las demás, y se
  pueden pedir varias—, así que una encuesta por área que necesite foto agrega
  su pregunta de evidencia y ya. Con el recuadro se fueron
  `window.fotoAreaLista`, `window.mostrarFotoArea`, la validación del envío que
  se plantaba sin foto y la subida bajo `__foto_area`.

  **El área sigue igual**: `evaluates_area` no se toca, la chapa «📍 Área a
  evaluar» sigue arriba y elegirla sigue siendo obligatorio para enviar.

  Lo que se queda de aquello, y no se puede quitar:

  ```js
  window.LLAVE_FOTO_AREA   // '__foto_area', sólo para leer lo ya guardado
  window.fotoDeArea(respuesta)
  ```

  Las respuestas de antes traen su foto puesta, y la **pantalla de calificar la
  sigue enseñando** arriba del todo: es la constancia de cómo estaba el área
  ese día, y sin foto ese recuadro no se dibuja. Es la misma idea que
  `fechaDeRelanzamiento` y por lo mismo. La llave importa además porque
  `borrarAsistencia` cuenta como «algo contestado» sólo las llaves numéricas de
  `answers_json`: las que empiezan por `__` son las reservadas.

  **Con ella se fue la foto de las estadísticas.** «Comparativa de desempeño
  por áreas» encabezaba cada tarjeta con la última foto de esa área y su fecha,
  con su propia consulta —`.not('answers_json->>__foto_area', 'is', null)`,
  ordenada de la más reciente y con tope de 400 filas—. No se puede quedar: no
  se va a tomar ninguna foto de área más, así que ese encabezado se habría
  clavado en la última de antes del cambio y se enseñaría durante años como si
  fuera el estado de hoy. Las que ya se subieron siguen en el bucket y en
  `answers_json`; se ven abriendo su respuesta. Con la foto se fueron la quinta
  consulta de `cargarStatsEncuestasGlobales`, el mapa `fotosPorArea` de
  `window.encuestasRawData` y el segundo argumento de `renderAreaStats`.

  **El encogido y el bucket se quedan, que son de la evidencia también.** La
  cuenta de Supabase es gratuita y una foto de teléfono son varios MB, así que
  **ninguna se sube tal cual**: `window.optimizarImagen(file, { maxLado,
  maxBytes })` en `1-config.js` la reescala por su lado más largo y la comprime
  —WebP, y JPEG si el navegador no lo da— hasta caber. Por dentro es
  `window.comprimirDibujo`, que es el mismo motor con el que se comprimen las
  páginas del material de una encuesta (más abajo): ahí se cuenta. Las de evaluación van a
  `window.MAX_LADO_FOTO_EVAL` (600px) y 300 KB de tope; medido con una imagen
  de ruido de 2400×1800 y 4.2 MB, que es el peor caso posible para comprimir,
  salen 600×450 y 66 KB. El ayudante estaba en `10-refacciones.html` y se mudó
  aquí en cuanto lo necesitaron dos documentos.

  Se encoge **al elegirla, no al enviar**: así se ve el tamaño real de lo que
  se va a subir y el envío no se queda pensando. Los blobs esperan en
  `window.fotosPreguntaListas`, por id de pregunta.

  Se suben **después** de validar toda la encuesta, o cada arrepentimiento
  dejaría un archivo huérfano en el bucket. La URL se guarda dentro de
  `answers_json`, bajo el id de su pregunta. El bucket es
  `fotos-evaluaciones` y su script, `sql/fotos-evaluaciones.sql`; sin correrlo
  la foto se toma y se encoge igual pero el envío avisa de que falta. Ese
  script no da permiso de borrado a propósito.

  El campo se abre con un `<label for>` y no con un `.click()` sobre el input
  escondido: en iOS ese click programático es indistinguible del toque fantasma
  de las ruedas (ver más arriba).

  El área de una respuesta se agrupa por nombre normalizado con
  `window.claveDeArea()`: la respuesta guarda el nombre que tenía el empleado
  ese día y la pantalla agrupa por el de su ficha, así que «Planta 1» y
  « planta 1 » tienen que caer en el mismo sitio.
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

  **El campo se llama «Comentario»**, al contestar y al calificar. Se llamó
  «¿Por qué?», y una pregunta encima de la que se acaba de contestar se lee
  como otra pregunta más; en una escala, además, el tope no pide explicación
  —ver más abajo— y ahí «¿Por qué?» reclamaba el porqué de algo que está bien.
  Lo que se espera sigue diciéndolo el marcador de obligatorio y el
  `placeholder` («Explica el motivo de tu calificación…»). En la pantalla de
  calificar es el mismo rótulo con su 💬.

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
- **Una escala explica qué significa cada valor, y se escribe recuadro a
  recuadro.** «¿Existe un estándar de 5S?» del 0 al 3 no se contesta igual si
  nadie dice qué es un 2, y dos personas calificando lo mismo ponen números
  distintos. Por eso cada pregunta de tipo `range` lleva su propia guía: **un
  recuadro por cada valor que ofrece la escala** —0, 0.5, 1… hasta el máximo—
  más una nota general para lo que no es de ningún valor en concreto. Sale
  **plegada** entre el enunciado y los círculos, al contestarla y al
  calificarla, que el criterio tiene que ser el mismo para los dos.

  **Al contestar, la guía es además el control.** Cada renglón lleva a la
  izquierda el círculo del valor que explica, así que se elige mientras se lee:
  con explicaciones de un párrafo, leerlas todas, cerrar la guía y buscar el
  número abajo es perder el hilo. Y con la guía abierta **los círculos de abajo
  se esconden** —serían lo mismo dos veces—; cerrada vuelven a salir, que es
  como se contesta rápido una escala que ya se conoce. Lo hace `estilos.css`
  con `.guia-escala--elegible[open] + .range-circulos`, y por eso el contenedor
  de los círculos tiene clase en vez de un `style` en línea: una regla de la
  hoja no le ganaría a un estilo en el atributo.

  Eso es el segundo argumento de `bloqueGuiaEscala(pregunta, elegible)`, que
  pasa sólo la pantalla de contestar; la de calificar la enseña para leerla,
  que allí el control es otro. Lleva un renglón **cada valor que ofrece la
  escala**, también los que nadie explicó: con la guía abierta, si no, no
  habría manera de elegirlos. Los dos sitios comparten el
  `name` del grupo de radios, así que sólo uno puede quedar marcado y el envío
  sigue leyendo un `input[name="range-N"]:checked`; lo que **no** se puede es
  pintar por `checked`, porque marcar el círculo de un sitio desmarca al gemelo
  del otro: `updateRangeVisual` compara por **valor** y repinta los dos.

  **Un medio punto no es un valor sin descripción: es el de arriba cumplido a
  medias.** Nadie escribe una explicación para el 3.5 —lo que significa es que
  lo del 4 se cumple en parte—, así que ese renglón lo dice con esas palabras
  («Se cumple en parte lo del 4») y **se pega al valor que explica**: sin la
  línea que separa un valor del siguiente y con el hueco de la rejilla
  recogido, de modo que 3.5 y 4 se leen como un solo bloque. Antes decía «Sin
  descripción», que en la mitad de los renglones de una escala con medios
  puntos se leía como que a la guía le faltaba la mitad de las explicaciones.
  La marca es `.guia-escala-fila--parcial`, y la regla que le quita el
  separador al renglón de debajo va **después** de la del separador en
  `estilos.css`: las dos tienen la misma especificidad.

  Ese texto sólo sale mientras haya un valor explicado **por encima**: al 4 de
  una escala cuyo último explicado es el 3 no le queda nada que cumplir a
  medias, así que ahí sí se dice «Sin descripción». Y no alcanza a la pantalla
  de calificar, que lista sólo los valores explicados.

  Cuántos recuadros hay lo dicen el «Puntaje máximo» y la casilla de puntos
  medios, que son **de la encuesta entera**: cambiar cualquiera de los dos
  redibuja los de todas las preguntas de escala a la vez
  (`window.renderGuiasDeEscala`). Lo escrito en un recuadro que desaparece al
  bajar el máximo **no se pierde mientras la hoja siga abierta** —se guarda en
  la propia tarjeta, en `wrapper._guiaEscala`, y vuelve al subirlo—, pero
  guardar la encuesta escribe sólo los valores que la escala ofrece en ese
  momento.

  ```js
  window.valoresDeEscala(min, max, paso)     // [0, 0.5, 1 …], redondeados a un decimal
  window.guiaPorValor(pregunta)              // { '0': '…', '2.5': '…' }
  window.textoGuiaDeValor(pregunta, valor)   // lo que dice de un valor
  window.guiaDeEscala(pregunta)              // la nota general, '' si no hay
  window.bloqueGuiaEscala(pregunta)          // el <details>, o '' si no hay nada que decir
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

  Esa cuarta posición tiene **dos formas, y las dos se leen**: el objeto de hoy
  —`{ '0': '…', '2.5': '…', __nota: '…' }`, con la nota bajo
  `window.LLAVE_NOTA_GUIA`— y el texto libre de antes, que es lo que hay
  guardado en las encuestas viejas. Al abrir una de ésas para editarla,
  `window.guiaDesdeTextoLibre` reparte en recuadros los renglones que empiezan
  por un número y un separador («0 = no existe», «1: a medias») y deja el resto
  en la nota general: sin eso, el texto se quedaría en un campo que ya no
  existe y se perdería al guardar. Las llaves se normalizan a un decimal
  (`window.claveDeValorEscala`), que es como las nombra `valoresDeEscala`, o un
  '1.0' guardado a mano no casaría con ningún círculo.

  Los recuadros están en la tarjeta de la pregunta, dentro del bloque que ya
  sólo salía para las escalas (`.range-info-container`), así que aparecen y
  desaparecen al cambiar el tipo como el resto de los campos —y se redibujan al
  volver a `range`, por si el máximo cambió mientras estaban escondidos—.
  Cambiar una pregunta de escala a otro tipo **pierde la guía**, igual que se
  pierden las opciones: `guardarNuevaEvaluacion` rearma `options` desde cero
  según el tipo.

  **El «Puntaje máximo» de la hoja sale de las preguntas, no sólo de las
  etiquetas.** `range_labels` es opcional, así que al editar una encuesta del 0
  al 8 sin etiquetas el campo se quedaba en 5 y guardar la encogía sin avisar
  —y ahora, además, dejaría fuera los recuadros de los valores perdidos—.
  `editarEvaluacion` lo toma de `options[1]` de la primera pregunta de escala y
  lo pone con `window.ajustarMaximoDeEscala`, que devuelve a su sitio las
  etiquetas ya escritas: `renderConfiguracionEscala` rehace esos campos vacíos.

- **Quién califica una respuesta.** Tampoco lo dice ninguna tabla por defecto:
  la califica el **jefe inmediato** de quien contestó, y esa regla la sostiene
  el código. Una encuesta puede en cambio nombrar a sus propios revisores en
  `reviewer_employees`, y entonces deja de ser cosa del jefe. La regla vive en
  `1-config.js` porque la usan cinco pantallas —la lista de encuestas, el
  historial, el detalle de una respuesta, los pendientes y el badge del panel—
  y cinco copias acabarían discrepando:

  ```js
  window.leTocaRevisar(ev, empleadoQueContesto, revisorId)
  window.revisoresDeEncuesta(ev)        // los efectivos: propios, o los de su clasificación
  window.revisoresPropiosDeEncuesta(ev) // sólo lo que dice `reviewer_employees`
  window.encuestasQueRevisa(encuestas, revisorId)
  ```

  **Y los revisores se pueden nombrar de una clasificación entera.** Hacerlo
  encuesta por encuesta obliga a repetir la misma lista en todas las de
  «Seguridad» y a acordarse de ponerla en la siguiente que se cree; quien
  imparte una clasificación la imparte entera. La precedencia va de lo
  particular a lo general y es la que ya suponía el resto del código: **los
  revisores propios de la encuesta mandan**, después los de su clasificación, y
  sin unos ni otros el jefe inmediato.

  ```js
  await window.cargarRevisoresDeClasificaciones()   // llena la caché; `true` la rehace
  window.revisoresDeClasificacion(nombre)           // sin esperar a nadie
  await window.guardarRevisoresDeClasificacion(nombre, ids)
  ```

  Viven en la tabla `clasificaciones_revisores`, con el nombre normalizado por
  llave, y el script es `sql/clasificaciones-revisores.sql`, que se corre a
  mano. Es el mismo molde que `clasificaciones_certificacion`, y por lo mismo:
  `revisoresDeEncuesta` se llama **sin poder esperar** desde el badge del panel
  y desde los pendientes, así que la caché se llena una vez por sesión —se
  guarda la promesa, no el resultado— antes de que nadie pregunte.
  **Mientras no esté cargada no hay revisores heredados y todo se comporta como
  antes**: equivocarse hacia el jefe inmediato es preferible a esconderle el
  pendiente a quien sí le toca. La piden `cargarVistaEvaluaciones`,
  `encuestaDeLaRespuesta`, `cargarVistaPendientes`, `calcularPendientesBatch` y
  `cargarEncuestasQueReviso`.

  **Y hay que traerse `category` en la consulta**, que es de donde sale la
  herencia: una columna que no se pidió llega `undefined` y la encuesta vuelve
  al jefe inmediato sin decir nada. Es la trampa de `requires_min_score`, otra
  vez. La piden las tres consultas que deciden un pendiente de revisión.

  Se configuran desde **«Revisores por clasificación»** del panel de
  administración, una hoja con dos pantallas —la lista de clasificaciones y el
  editor de una— que comparten cuerpo, como la de evaluaciones. La lista sale
  de las clasificaciones que hay en `evaluations`, más las que tienen revisores
  guardados y ya no tienen encuestas: si no, esa fila se quedaría sin manera de
  verla ni de vaciarla. El selector de personas es el mismo de la hoja de crear
  encuesta —un tercer juego de ids en `window.SELECTORES_PERSONAS`,
  `revisoresClasif`—, y sus ids viven en el cuerpo que se arma con `innerHTML`,
  así que existen sólo mientras la hoja está a la vista.

  **Al editor se entra por dos caminos**, y como en la hoja de evaluaciones lo
  que decide el botón del encabezado es el camino y no la pantalla que se
  dibuja: por la lista de esta misma hoja, y entonces va la flecha de volver; o
  derecho a una clasificación desde el **ojo del detalle de la clasificación**
  del panel de inicio, y entonces se queda la cruz, que por ahí no se pasó por
  ninguna lista.

  ```js
  window.vengoDeLaListaDeClasificaciones   // la pone la lista al dibujarse; la entrada directa la quita
  window.volverAListaDeRevisores()         // el «volver», o null si no hay a dónde
  window.abrirRevisoresDeClasificacion(nombre, encuestas)   // la entrada directa
  window.pintarEditorRevisoresClasif(c)    // la pantalla, común a los dos
  ```

  Por eso **guardar hace dos cosas distintas**: con lista detrás vuelve a ella
  con lo nuevo ya puesto —la caché se corrigió sola, no se vuelve a preguntar—,
  y sin ella cierra la hoja, que lo que se venía a hacer ya está hecho. La
  entrada directa **no monta la lista**, así que ni la consulta: se le pasa el
  nombre de la clasificación y cuántas encuestas tiene, que es todo lo que el
  editor enseña.

  **Ojo con la hoja de crear y editar una encuesta: ahí van los revisores
  propios, no los efectivos.** `editarEvaluacion` llena el selector con
  `revisoresPropiosDeEncuesta`, y tiene que seguir haciéndolo: con los
  efectivos, abrir una encuesta que heredaba y guardarla le escribiría en su
  columna los de la clasificación, congelándolos —dejaría de seguirla sin que
  nadie lo pidiera—. Lo que sí se le dice a quien mira es de quién hereda, en
  el `#nota-revisores-clasificacion` del bloque de revisores
  (`window.pintarNotaRevisoresClasificacion`, que se repinta con la casilla y
  con cada letra de la clasificación): sin eso, la hoja diría «la revisa el
  jefe inmediato» mientras la califica otro.

  **Y entre varios revisores, la respuesta es de quien asignó a esa persona.**
  Con dos o tres revisores nombrados, la respuesta de cualquier destinatario le
  aparecía como pendiente a todos a la vez, y ninguno sabía si le tocaba a él o
  ya la había calificado otro. Como esos mismos revisores son quienes corrigen
  a quién va dirigida —más abajo—, la aplicación apunta **quién dirigió la
  encuesta a cada persona** y le deja a él la revisión: a los demás deja de
  salirles el pendiente.

  ```js
  window.asignacionesDeEncuesta(ev)     // { idEmpleado: idRevisor }
  window.revisorQueAsigno(ev, empId)    // '' si no hay apunte
  window.asignacionesVigentes(mapa, targetEmployees, revisores)  // la poda al guardar
  ```

  El apunte vive en `evaluations.assigned_by`, una columna nueva cuyo script se
  corre a mano (`sql/asignador-por-encuesta.sql`); sin ella todo se comporta
  como antes —el pendiente se reparte entre todos los revisores— y la hoja lo
  avisa. Como `leTocaRevisar` mira las dos columnas, **viajan juntas**:
  `window.camposConRevisores` encadena `camposConAsignador`, de modo que
  ninguna consulta puede traerse la lista de revisores y olvidarse del apunte,
  que es justo lo que volvería a repartir el pendiente entre todos.

  Un apunte que deja de tener sentido **se cae solo**, sin limpiar nada: si
  quien asignó ya no es revisor de la encuesta, o resulta ser quien contestó,
  se vuelve al reparto entre todos. Dejar la respuesta sin nadie que pueda
  calificarla sería peor que repartirla de más.

  Se sella **al agregar a la persona en la hoja**, no al guardar: al guardar no
  hay forma de saber cuál de los destinatarios acaba de poner quien está
  mirando, y se quedarían todos a su nombre —incluidos los que puso otro
  revisor, o el administrador que creó la encuesta—. Sólo se queda con ellos
  quien sea revisor de esa encuesta (`window.apuntarQuienAsigno`), así que un
  administrador que no lo sea sigue repartiendo como siempre; y nadie se asigna
  a sí mismo. La ficha del destinatario lo dice —«· 👁️ Ana»
  (`window.selloDeAsignacion`)—, y quitarlo y volver a agregarlo desde una
  cuenta que no sea revisora es cómo se devuelve al reparto común.

  Al guardar, `asignacionesVigentes` poda: se van los que ya no están entre los
  destinatarios, los que asignó alguien que ya no revisa y todo el mapa si se
  marcó «todos los colaboradores», que ahí no hay a quién apuntar.

  Los dos conteos del panel que contaban **de un plumazo** —el badge de
  `calcularPendientesBatch` y la tarjeta de `cargarEncuestasQueReviso`— ya no
  pueden: se traen `employee_id` y pasan respuesta por respuesta por
  `leTocaRevisar`, como hacía el panel de pendientes. Lo que sí sigue viéndolo
  todo es el historial de la encuesta: un revisor tiene que poder mirar cómo va
  la que imparte aunque no le toque calificar cada respuesta.

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

  **Quien revisa una clasificación puede además crear encuestas en ella**, que
  es la otra mitad de lo mismo: quien imparte «Seguridad» es quien sabe qué
  falta por medir, y tener que pedírselo al administrador cada vez es lo que
  hace que no se cree. Sólo en las suyas.

  ```js
  window.puedeCrearEnClasificacion(clasificacion, empleadoId, encuestas)
  ```

  Cuenta ser revisor **de la clasificación entera** y también **de alguna de
  sus encuestas**: en los dos casos le sale en «Encuestas que revisas», que es
  desde donde se crea. Por eso el ayudante admite la lista de encuestas del
  grupo, que es lo que la hoja tiene a mano.

  Es el mismo **«+»** del encabezado de la hoja de detalle
  (`window.botonesDeClasificacion`), y el **ojo de al lado se queda sólo para
  el administrador**: nombrar revisores es repartir quién califica a quién —un
  revisor podría quitarse a sí mismo o quedarse con la clasificación entera—,
  mientras que crear una encuesta sólo se añade trabajo a sí mismo.

  **Y la clasificación queda fijada**, o el permiso sería decorativo: la hoja
  de crear llega con el campo bloqueado y diciendo por qué
  (`#nota-clasificacion-fija`). La marca es `window.clasificacionFijaParaCrear`,
  la pone `abrirNuevaEvaluacion(categoria, fijar)` —la única puerta que crea— y
  la quita `editarEvaluacion` al abrir una encuesta que ya existe; **una copia
  la conserva**, que copiar también es crear. Un `disabled` se quita desde la
  consola, así que **quien decide de verdad es `guardarNuevaEvaluacion`**, que
  compara la clasificación escrita con la fijada —normalizadas— antes de tocar
  la base.

  El resto de la hoja va entero: un revisor que crea puede nombrar revisores,
  y si no se pone a sí mismo ni la clasificación se los da, la encuesta acabará
  volviendo al jefe inmediato de cada quien. La nota de herencia del bloque de
  revisores dice quién va a calificarla, que es donde se ve.

  **Quien revisa una encuesta puede además corregir a quién va dirigida**, sin
  ser administrador y sin tocar nada más: es el instructor que la imparte y es
  quien sabe a quién le falta tomarla. Se entra por dos sitios: el lápiz de la
  tarjeta en la lista —el mismo que tiene el administrador— y el botón
  «Editar a quién va dirigida» de la pantalla de la encuesta, debajo del de
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
  jefe inmediato—, y abre la encuesta con `window.abrirEncuestaQueReviso`. Sin
  encuestas que revisar la tarjeta no se dibuja: quien no sea revisor no ve
  nada nuevo en su inicio.

  **Va agrupada por clasificación y con hoja de detalle, como la de las
  asignadas**, y comparte con ella todo lo que se puede compartir: el
  `<details class="grupo-asignadas">` y su botón (`alternarGrupoAsignadas`), el
  icono de estado (`iconoDeAsignada`, al que
  `window.estadoDeRevision(porCalificar)` le da la misma forma que
  `estadoDeAsignada`: la palomita cuando no hay nada esperando y el círculo
  abierto cuando sí), la fila de quién revisa (`filaDeRevisores`), los dos
  botones de administrador del encabezado (`window.botonesDeClasificacion`) y
  la misma hoja `#modal-detalle-clasificacion`, que es la de evaluaciones otra
  vez: **dos pantallas en un solo overlay**, `abrirDetalleClasificacion` para
  las que le tocan a uno y `window.abrirDetalleClasificacionRevision` para las
  que revisa.

  Lo que cambia es de qué habla cada una: ahí, cómo va uno; aquí, cómo va la
  gente a la que uno califica —el promedio de **todas** las respuestas del
  periodo, no la de uno (`window.historialDeRevision`)— y qué le queda por
  calificar, que va en el tercer renglón del recuadro del resultado porque es
  lo único de ese bloque que es suyo.

  **Y ésta sí consulta**, al revés que la de las asignadas. La tarjeta de
  revisión sólo se trae la cuenta de lo que espera calificación, así que el
  historial no lo dejó calculado nadie; traérselo en cada carga del panel sería
  cobrárselo a todo el que revise algo por una hoja que puede no abrir. Lo pide
  `window.cargarRespuestasQueReviso()` **una sola vez por sesión** —la promesa,
  no el resultado—, acotado con un `gte` al inicio del periodo más antiguo que
  la gráfica va a enseñar y filtrado con `leTocaRevisar`, que es la misma regla
  que cuenta los pendientes. `invalidarCacheDashboard` lo tira: una respuesta
  recién calificada mueve el promedio de su periodo.

  Por eso la hoja **se dibuja en dos tiempos** —el encabezado, la fila de
  revisores y las encuestas en el primer fotograma; el resultado y la gráfica
  cuando llegan— y comprueba que el hueco siga siendo el suyo antes de
  escribir: la hoja pudo cerrarse, o abrirse otra clasificación, mientras la
  consulta iba de camino.

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
- **Una encuesta puede llevar material, y el material son imágenes.** Una que
  imparte una capacitación —un dojo de mantenimiento, una junta de seguridad— no
  se entiende sola: quien la contesta necesita antes lo que se dio. Eso viajaba
  por WhatsApp y no quedaba pegado a la encuesta, así que quien la abría un mes
  después no tenía de dónde sacarlo.

  Va en un recuadro de la hoja de la encuesta, entre los botones y el pase de
  lista: se mira antes de contestar, pero la acción sigue siendo el botón azul.

  **Nada se guarda como PDF ni como presentación.** Se guardó un tiempo —el
  archivo tal cual, hasta 25 MB— y eso se llevaba el bucket por delante: la
  cuenta de Supabase es gratuita y da **1 GB para toda la aplicación**, así que
  tres presentaciones con fotos y un par de manuales escaneados y ya no cabe la
  siguiente firma. Hoy el archivo se convierte **en el teléfono, página a
  página**, y lo que sube son imágenes que han pasado por el mismo encogido que
  las fotos: el mismo manual que ocupaba 8 MB ocupa 300 KB.

  De paso se lee mejor donde se lee: un `.pptx` en un iPhone abre otra
  aplicación —y sólo si está instalada—, mientras que unas imágenes se ven
  dentro de la encuesta, en el visor a pantalla completa y una debajo de otra,
  sin salir de ella.

  **Son tres puertas y un solo camino** (`window.paginasDeArchivo`):

  - **Imágenes**, que ya son lo que se guarda: se comprimen y ya.
  - **PDF**, que se abre con **pdf.js** y se pinta página por página.
  - **PowerPoint `.pptx`**, que se dibuja con **pptx-preview** y se rasteriza
    con **html2canvas**, diapositiva por diapositiva.

  ```js
  window.BUCKET_MATERIALES      // 'materiales-evaluaciones'
  window.MAX_MB_MATERIAL        // 25, lo que se admite LEER del teléfono
  window.MAX_LADO_MATERIAL      // 1400px, y MAX_BYTES_MATERIAL 400 KB por página
  window.MAX_PAGINAS_MATERIAL   // 60
  window.TIPOS_DE_MATERIAL      // [{ ext, icono, nombre, via }, …]
  window.puertaDeMaterial(nombre)   // 'imagen' | 'pdf' | 'presentacion' | ''

  window.cargarLibreria(url)                  // el CDN, una sola vez y cuando hace falta
  window.paginasDeArchivo(file, avisar)       // → [blob, …] ya comprimidos
  window.paginasDePdf(file, decir)  window.paginasDePresentacion(file, decir)

  window.carpetaDeMaterial(evaluationId, nombre)   window.rutaDePagina(carpeta, i, ext)
  window.documentoDeRuta(archivo)  window.numeroDePagina(archivo)
  window.subirPaginaMaterial(blob, ruta)      // → { archivo, url }

  window.documentosDeMaterial(materiales)     // las filas, agrupadas en documentos
  window.materialPorGuardar                   // lo convertido y todavía sin subir
  window.bloqueDeConversion()  window.guardarMaterialPendiente()
  window.descartarMaterialPendiente()  window.quitarPaginaPendiente(i)
  window.abrirDocumentoMaterial(clave)  window.quitarMaterial(clave)
  ```

  **Una fila de `materiales_encuesta` es una página, no un archivo**, y las
  páginas de un mismo documento se agrupan **por su carpeta en el bucket**
  (`<encuesta>/<documento-y-la-hora>/001.webp`). De ahí sale la agrupación de la
  pantalla, así que **no hizo falta ninguna columna nueva** ni volver a correr
  ningún script: el número va con ceros delante para que el orden alfabético sea
  el orden de lectura. La tabla y el bucket siguen siendo los de
  `sql/materiales-encuesta.sql`, y sin correrlo el recuadro no se dibuja.

  **Lo que se subió antes de esto se queda como estaba**: son archivos sueltos,
  sin carpeta, y `documentoDeRuta` los reconoce por eso —dos tramos en la ruta y
  no tres—. Cada uno es su propio documento y se sigue enseñando como el enlace
  con `target="_blank"` que era; ni se convierten solos ni se borran solos. Ahí
  se ve de un vistazo de qué iba todo esto: «Manual de la prensa.pdf · 8.0 MB»
  encima de «procedimiento.pdf · 3 páginas · 30 KB».

  **Subir y quitar es de quien la imparte** —el administrador y quien la revisa,
  el mismo `puedeEditarDestinatarios` que decide los nombres del pase de lista—;
  **leerlo lo puede cualquiera** que abra la encuesta, que es para lo que está.

  **Y entre elegir el archivo y guardarlo hay un paso**, que no es un adorno:
  lo convertido se enseña en el propio recuadro —las páginas en miniatura, con
  su número y su peso total— y no se sube nada hasta que se pulsa «Guardar». Son
  tres razones y las tres pasan:

  - Una presentación se dibuja **de manera aproximada** (ver más abajo), así que
    quien la sube tiene que ver cómo quedó antes de que sea lo que lea la
    plantilla entera.
  - Un PDF de veinte páginas son veinte imágenes: aquí se dice cuánto va a
    ocupar **antes** de ocuparlo, que es de lo que iba todo esto.
  - Y se puede quitar la portada en blanco, la diapositiva de «Gracias» o la
    página que no venía al caso.

  Va **dentro del recuadro y no en otra hoja**, que apilar una hoja sobre la de
  la encuesta dejaría dos tiradores a la vista. Las miniaturas son
  `URL.createObjectURL` de los blobs ya comprimidos —lo que se ve es exactamente
  lo que se va a subir— y se sueltan con `revokeObjectURL` al guardar, al
  descartar y al abrir otra encuesta (`cargarMaterialesEncuesta`, que es por
  donde se pasa siempre).

  Ocho cosas que hay que mantener:

  - **El encogido es uno solo.** `window.comprimirDibujo(fuente, { maxLado,
    maxBytes })` en `1-config.js` comprime lo mismo la `<img>` de una foto que
    el `<canvas>` donde se acaba de pintar una página: las dos se dibujan con
    `drawImage` y las dos dicen su ancho y su alto. `optimizarImagen` es hoy
    leer el archivo a una `<img>` y llamarlo, así que **no hay dos maneras de
    comprimir en la aplicación** y lo que se ajuste aquí vale para las fotos de
    evaluación, las de refacciones y el material. Cada intento se dibuja **desde
    el original**: encoger lo ya encogido acumula pérdida, y en el texto pequeño
    de una diapositiva eso se lee.
  - **Las librerías se piden cuando hacen falta.** Son 1.5 MB entre las dos, así
    que no van en el `<head>`: `cargarLibreria` las cuelga del `<body>` la
    primera vez que alguien sube un PDF o una presentación, guardando **la
    promesa** —dos archivos seguidos no la piden dos veces— y **sin `?v=`**,
    como todo lo de un CDN. Un fallo **no** se guarda: sin red la primera vez,
    la segunda puede funcionar. De pdf.js va la versión **`legacy`**, que es la
    que trae UMD (`window.pdfjsLib`) y aguanta los Safari viejos; de la 4 en
    adelante sólo hay módulos ES, que aquí no se pueden cargar sin un paso de
    compilación.
  - **El PDF se pinta al doble y se encoge después.** Rasterizar justo al tamaño
    final deja el texto pequeño sucio; pintar al doble sólo cuesta memoria un
    instante. Y el lienzo de cada página **se suelta** (`width = height = 0`)
    antes de pintar la siguiente, o un PDF largo tumba el navegador del teléfono
    a media conversión.
  - **Una presentación queda aproximada, y se dice donde se está mirando.** La
    librería coloca el texto y las imágenes, pero no es PowerPoint: las fuentes
    de la empresa se sustituyen, las tablas pierden sus líneas y un gráfico o un
    SmartArt pueden salir a medias. El recuadro de revisión lo avisa en ámbar y
    manda a **exportar a PDF desde PowerPoint**, que es el camino que sale
    exacto. El `.ppt` de hace veinte años no lo lee ninguna librería del
    navegador y su aviso lo dice aparte.
  - **La presentación se dibuja fuera de la pantalla, pero dentro del
    documento.** html2canvas mide lo que hay en la maqueta, así que no vale
    `display:none`: el taller va en un `position:fixed` a −20000px que se quita
    en el `finally`. Y hay una espera de 400 ms antes de rasterizar, porque la
    librería termina de colocar sus imágenes un instante después de resolver.
  - **Se puede cancelar a media conversión, y se cancela por el avisador.** El
    botón deja `materialPorGuardar` en null, y la función que escribe «página 3
    de 20» —que la conversión llama antes de cada página— revienta a propósito
    con un error marcado `cancelada`, que el `catch` se traga sin decir nada. Es
    la única manera de parar el bucle sin meterle una bandera a cada conversor.
  - **Al subir van primero los archivos y después las filas**; al quitar,
    primero las filas y después los archivos, que es el orden de lo que no tiene
    vuelta atrás —el mismo de `eliminarEmpleado`—. Se quita el **documento
    entero**: todas las filas de su carpeta y todos sus archivos. Las escrituras
    cuentan las filas del `.select()`, que aquí escribe alguien que no es
    administrador. Un archivo que se quede sin ficha se retira desde
    **«Consumo»**, que reconoce a los huérfanos de este bucket comparando rutas
    completas.
  - **El campo se abre con un `<label for>`**, nunca con un `.click()` sobre el
    input escondido: en iOS ese click programático es indistinguible del toque
    fantasma de las ruedas. El estado de la conversión va en la nota de debajo y
    no en el rótulo del `<label>`: escribirle dentro se llevaría por delante su
    `for`, que es lo que lo hace pulsable. Y con algo esperando a guardarse la
    puerta se cierra —un solo `materialPorGuardar` no puede con dos documentos a
    la vez, y convertir es lento—.

  **Un documento es una tarjeta con su primera página de portada a todo lo ancho
  y el pie debajo**, que es como se enseña un documento compartido en cualquier
  aplicación de mensajería. Era un renglón con una miniatura de 34px al lado del
  nombre, y ahí la portada no llegaba a decir de qué iba: a ese tamaño una
  diapositiva es un cuadrito gris y todo el peso de reconocer el documento se lo
  llevaba su nombre de archivo, que es justo lo que menos se lee de él.

  Tocarla abre el visor (`window.abrirVisorImagenes`, en `3-incidentes.js`, que
  es el de los incidentes generalizado a una lista de urls): las páginas una
  debajo de otra, a pantalla completa, que es como se lee un documento y lo único
  de esta aplicación que va a pantalla completa a propósito.

  Cuatro cosas que hay que mantener:

  - **La proporción de la portada es 16:9 y no otra.** Casi todo el material de
    aquí es una presentación, que es exactamente 16:9: así una diapositiva entra
    entera y no se le recortan los lados —a 16:10, el título de la plática de
    seguridad perdía la primera palabra—. Va con `object-fit: cover` y proporción
    fija porque sin eso una diapositiva apaisada y una página vertical dan dos
    tarjetas de alturas muy distintas y la lista deja de leerse; lo que se
    recorta de una página vertical es su pie, que es por lo que se ancla
    **arriba** (`object-position: center top`): el título es lo que la hace
    reconocible.
  - **La «✕» va encima de la portada**, en su esquina y sobre un disco oscuro:
    es el único sitio donde no le quita ancho al nombre, y debajo puede haber
    cualquier cosa —un ✕ gris sobre una diapositiva clara no se ve—. Sigue
    siendo **hermana** del enlace y no va dentro, que un botón dentro de un
    enlace no vale en HTML.
  - **Sin portada que enseñar se vuelve al renglón compacto**, con la clase
    `sin-portada`: lo subido antes de que el material se convirtiera en imágenes
    son archivos sueltos y no tienen página, y ahí una caja de proporción fija
    con un emoji centrado dentro no se lee como nada. A esa misma clase cae
    `window.portadaRota` cuando la imagen no carga —sin red, o borrada desde
    Storage—, que además cambia la portada por el emoji de siempre.
  - **El nombre se deja llegar a dos renglones** en la tarjeta y se queda en uno
    en el renglón compacto: debajo de la portada hay ancho de sobra y
    «Presentación dojo de mantenimiento línea E3.pptx» cabe entero, que es lo que
    se perdía recortándolo siempre a una línea.

  Un formato nuevo se agrega a `TIPOS_DE_MATERIAL` con su `via`, que es lo único
  que decide por qué puerta entra. Un Excel o un Word no entran por ninguna: se
  exportan a PDF y se suben así, y el aviso lo dice con esas palabras.

- **Cuánto ocupa todo esto en Supabase.** La cuenta es gratuita y tiene un tope
  —1 GB de archivos y 500 MB de base—, y hasta ahora no había manera de saber
  por dónde iba sin entrar al panel de Supabase, que es justo lo que no se hace
  hasta que algo deja de subir. Se entra por **«💾 Consumo»** del panel de
  administración y vive en `12-almacenamiento.js`, en la hoja
  `#modal-almacenamiento`.

  ```js
  window.BUCKETS_DE_LA_APP        // en 1-config.js: [{ id, nombre, borrable }, …]
  window.CUOTA_ARCHIVOS  window.CUOTA_BASE
  window.archivosDelBucket(bucket, tope)
  window.pedirALaBase(funcion)    // una rpc que puede no existir; null si no está
  window.falloDeLaBase            // { funcion: por qué no respondió }
  window.notaDeFallo(funcion)     // lo que se le dice a quien mira
  window.medirAlmacenamiento()    // llena window.consumoAlmacenamiento
  window.abrirConsumoAlmacenamiento()  window.cerrarConsumoAlmacenamiento()
  window.pintarConsumo(html)      // sin argumento, la pantalla que toque
  window.abrirBucket(i)  window.volverAConsumo()
  window.limpiarHuerfanos()
  ```

  **Lo que se enseña es lo que cobra Supabase, y por eso se lo pregunta a la
  base.** La primera versión medía los archivos listándolos desde el cliente y
  la base sumando las tablas de `public`, y las dos cifras discrepaban de la
  página de uso de Supabase —decía 58 MB de base donde Supabase decía 366, y 425
  MB de archivos donde Supabase decía cero—. Una pantalla de consumo que no
  coincide con la factura no sirve para lo que está: para saber cuánto queda.

  Lo dan las cuatro funciones de `sql/consumo-almacenamiento.sql`, todas
  `security definer`, con el `search_path` fijado y de sólo lectura:

  ```
  tamano_base()       pg_database_size: el proyecto entero
  tamano_esquemas()   dónde está ese peso: public, storage, auth, realtime…
  tamano_tablas()     las tablas de public, una por una
  tamano_buckets()    los archivos, contados sobre storage.objects
  ```

  **La base no es la suma de sus tablas.** Supabase cobra el archivo de base
  entero: los esquemas de sistema —`storage`, `auth`, `realtime`—, los catálogos
  y el espacio que las filas borradas dejan sin devolver, que en un proyecto con
  mucha escritura es la mayor parte. Sumar `public` daba una fracción y se leía
  como el total. Hoy la cifra es `pg_database_size` y **debajo va el desglose por
  esquema**, que es lo que explica que `public` sea una parte: sin él, ver un
  número cuatro veces mayor que la suma de las tablas parece un error.

  **Y los archivos se cuentan sobre `storage.objects`**, que es la fila de la que
  sale el `metadata.size` que devuelve la API al listar y la misma que suma
  Supabase. Es además una consulta en lugar de nueve vueltas de listado, y
  resuelve lo que desde el cliente no tiene arreglo: **un bucket cuya política no
  deje listarlo devuelve una lista vacía sin error**, indistinguible de un bucket
  vacío, así que salía en cero y se llevaba su peso del total sin decirlo. Desde
  la base sí se ve, y la pantalla de ese bucket dice que no lo puede listar en
  lugar de enseñar una lista vacía. **Si las dos cuentas no cuadran, manda ésta.**

  Un bucket que la base conozca y que no esté en `BUCKETS_DE_LA_APP` **entra
  igual en el total**, con su id por nombre: uno que nadie agregó a la lista
  seguiría ocupando sitio y quedándose fuera. La lista se sigue escribiendo a
  mano —`listBuckets()` no siempre está al alcance de la clave `anon`— pero ya
  no es lo que decide qué se cuenta, sólo cómo se llama cada uno.

  **Sin el script todo sigue en pie**: los archivos se listan desde el cliente
  como antes —el camino de `archivosDelBucket`— y la mitad de la base dice qué
  falta. El pie de la tarjeta de archivos **dice siempre de dónde salió la
  cifra**, que no es un adorno: es la diferencia entre un total corto y un total
  corto que además se cree.

  **Y contando desde el cliente el total se dibuja como un suelo**, con un
  **«Al menos»** en ámbar encima de la cifra (`.consumo-incierto`). Aquí es donde
  pasó de verdad: la pantalla decía «425.1 MB · 42% de 1.00 GB» con toda
  confianza mientras el bucket `signatures` —148.475 firmas, 343 MB— salía en
  cero porque su política no deja listarlo desde la aplicación. La cuota real iba
  por el **75%**. El aviso estaba en el pie desde el principio y no sirvió de
  nada, porque **lo que se lee es el número gordo**: la duda tiene que ir pegada a
  la cifra o no está en ningún sitio. Con la base contando, la tarjeta vuelve a ir
  a secas.

  Va en **su propio renglón y no dentro de la cifra**: el primer intento le metía
  un «≥» al número y un «al menos» al porcentaje, y en un iPhone de 375 partía a
  los dos en dos renglones —la cifra va a 1.9rem y en esa fila no sobra ancho—.
  Medido con «1000.0 MB · 100% de 1.00 GB», que es el peor caso, ninguno de los
  dos se parte; la tarjeta crece 12px, que es lo que ocupa el renglón.

  **Y dice el porqué, no «corre el script».** Ese consejo es correcto cuando el
  script no se ha corrido y una mentira cuando sí: pasó con `tamano_buckets`, que
  existía y fallaba por otra cosa, y la pantalla mandaba a correr un script ya
  corrido mientras las otras tres funciones respondían al lado —con el desglose
  por esquema dibujado justo debajo—. `pedirALaBase` se queda con el mensaje de
  la base en `window.falloDeLaBase` y `notaDeFallo` lo reparte en dos consejos,
  que es lo que son: **falta la función** —PostgREST lo dice con su propio código,
  «could not find … in the schema cache»— se arregla corriendo el script;
  cualquier otra cosa —una política que no deja leer `storage.objects`, un valor
  que no convierte— no, y decirlo así ahorra la vuelta entera.

  **Dos trampas de las funciones mismas**, las dos aprendidas del mismo par de
  capturas:

  - **`pg_total_relation_size` de una tabla ya incluye sus índices y su TOAST**,
    así que darle además su propio renglón a cada índice (`i`) y a cada tabla
    toast (`t`) los cuenta dos veces. `tamano_esquemas` lo hacía y su suma daba
    **527 MB dentro de una base de 334.8** —un desglose cuya suma pasa del total
    no es un desglose, y `public` decía 70.3 MB mientras sus propias tablas
    sumaban 58.2, que es exactamente el hueco de sus índices—. Hoy mira sólo
    `r`, `p` y `m`; con eso desaparece de la lista el esquema `pg_toast`, que
    nunca fue un sitio aparte donde se guarde nada.
  - **Un `::bigint` sobre un jsonb libre no se lleva por delante esa fila sino la
    consulta entera.** `metadata->>'size'` viene de Storage y basta un valor que
    no sea un entero para que `tamano_buckets` falle del todo y la pantalla se
    quede sin la cifra de **todos** los buckets por culpa de un archivo. Se
    comprueba con `~ '^[0-9]+$'` antes de convertir y lo que no lo sea cuenta
    como sin medida, que es lo que de verdad es.

  **Y `tamano_buckets` se cancela por tiempo agotado**, que no es ni un permiso
  ni un script que falte: PostgREST le pone plazo a cada consulta y recorrer
  `storage.objects` entero no cabe en él. `notaDeFallo` reconoce el caso y manda
  a mirar cuántas filas tiene esa tabla en la lista de abajo. Mientras tanto la
  pantalla cae al listado desde el cliente, que en este proyecto sí funciona.

  **Ese mensaje culpó primero al hinchado, y era falso.** La sospecha venía de
  que `storage` se lleva 264 MB de una base de 334.8; pero en cuanto la lista de
  tablas enseñó las filas, salió que `objects` tiene **150.210** y que eso son
  1.80 KB por fila, que es lo que pesa una fila de `storage.objects` —ruta,
  `metadata` jsonb, los tokens del camino—. La tabla no está hinchada: es que de
  verdad tiene ciento cincuenta mil filas, y por eso no cabe en el plazo. El
  aviso de hinchazón **no** salió, que es exactamente lo que su umbral promete.

  Es la lección de la investigación entera: **la pantalla dice el dato y quien
  mira saca la conclusión**. Un mensaje que aventura la causa manda a buscar un
  problema que puede no existir, así que hoy dice cuántas filas hay y dónde
  mirarlas, y nada más.

  **Y de dónde salían esas 150 mil filas:** 148.475 son del bucket `signatures`
  —una imagen de 2.4 KB por firma, 343 MB—, que es justo el bucket que la
  aplicación no puede listar. Así que las dos mitades del problema eran la misma:
  la consulta que podía ver ese bucket se cancelaba **por el tamaño de ese
  bucket**. Por eso el `case` de `tamano_buckets` pasó del regex a
  `jsonb_typeof`, que mira la etiqueta que el jsonb ya lleva en vez de convertir a
  texto y recorrerlo: no garantiza que quepa —el recorrido es el que es— pero es
  lo que se puede abaratar sin dejar de comprobar nada. Si aun así se cancela,
  queda subirle el plazo al rol `anon`, que es cosa de la cuenta y no del código.

  **Y las tablas son todas, no sólo las de `public`.** Ahí estaba el resto del
  problema: la pantalla enseñaba 58.5 MB de tablas debajo de una base de 334.8
  sin decir dónde estaban los otros 276. Los tres cuartos del peso de este
  proyecto viven en `storage`, que es de Supabase y no aparecía en ninguna lista;
  el desglose por esquema decía cuál, pero no qué tabla. `tamano_tablas` mira hoy
  todos los esquemas y cada fila dice **de dónde es y cuántas filas tiene**, que
  hacen falta las dos: sin el esquema no se sabe que `objects` no es de esta
  aplicación, y sin las filas un número grande no dice si es mucho. «264 MB ·
  1735 filas» se lee solo.

  ```js
  window.MIN_BYTES_HINCHAZON  window.MIN_MUERTAS
  window.estaHinchada(tabla)        // ¿más filas muertas que vivas?
  window.avisoDeHinchazon(tablas)   // el recuadro, o '' si no hay ninguna
  ```

  **Una tabla hinchada es la que tiene más filas muertas que vivas**, y eso lo
  dicen `n_live_tup` y `n_dead_tup` del recolector de estadísticas, que no
  cuestan ningún recorrido. Es lo que separa una tabla grande de una que sobra:
  una fila borrada no devuelve su sitio hasta que alguien lo recoge y el archivo
  de la tabla no encoge solo, así que se puede acabar con cientos de MB para
  describir unos miles de registros —y con una consulta que ya no cabe en su
  plazo, que es de donde salió todo esto—.

  **El umbral es conservador a propósito**: tiene que pesar de verdad y las
  muertas tienen que ser muchas y ganarle a las vivas. Este aviso manda a alguien
  a correr un `VACUUM FULL`, que bloquea la tabla mientras corre, así que **no
  puede equivocarse**. Por eso se compara con las filas vivas y no con el peso
  por fila, que es justo lo que habría fallado aquí: `objects` pesa 264 MB y
  parecía el caso de libro, y son 150.210 filas legítimas. En este proyecto **no
  se señala ninguna tabla**, y está bien: `incident_signatures` son 145.355 filas
  de 361 bytes —una fila de cruce por empleado y registro, 455 × 319, sin ninguna
  imagen dentro— y `lineas` con doce filas y nueve mil muertas no es un problema
  de nadie.

  `sql/diagnostico-storage.sql` se queda para mirarlo desde el editor SQL con más
  detalle —datos contra índices, la última vez que pasó el autovacuum—, y **sólo
  mira**.

  **Cada función se borra antes de crearse, y hace falta.** `create or replace`
  sólo sirve mientras la función no cambie de forma: en cuanto se le añade una
  columna al `returns table`, Postgres responde «42P13: cannot change return type
  of existing function» y **el script entero se queda sin correr**, porque el
  editor de Supabase lo envuelve en una transacción. Pasó al añadirle el esquema
  y las filas a `tamano_tablas`, y con un `drop … if exists` delante da igual
  cuántas veces se corra y cuánto haya cambiado. Los `grant` van al final por lo
  mismo: un `drop` se lleva los permisos por delante.

  `archivosDelBucket` se queda, porque los archivos de un bucket se siguen
  listando **al entrar a él** —con la cuenta ya hecha por la base, traerse mil
  setecientos nombres para dibujar cincuenta es cobrarle a todo el mundo lo que
  mira uno—, y hace las dos cosas que `list()` no hace solo: **pagina de mil en
  mil** —el tope de PostgREST, y fotos de refacciones lo pasa de largo— y **baja
  a las subcarpetas**, que llegan como entradas sin `id` y sin metadata; el
  material vive bajo el id de su encuesta, así que sin recorrerlas ese bucket
  parecería vacío. El `.emptyFolderPlaceholder` que Supabase deja en una carpeta
  vacía no cuenta. Va **bucket por bucket y no en paralelo** cuando le toca medir
  entero: son seis listados de hasta miles de filas, y desde un teléfono en 4G
  lanzarlos a la vez es la manera de que alguno se caiga por tiempo. Lo listado
  se queda en el nodo del bucket, así que volver a entrar no lo vuelve a pedir.

  **Es de consulta, con una sola excepción: los huérfanos del material.** Un
  huérfano es un archivo que está en `materiales-evaluaciones` y que ninguna fila
  de `materiales_encuesta` nombra —los deja el camino de error de la subida, que
  sube las páginas antes de guardar sus fichas a propósito—, así que no lo enseña
  ninguna encuesta y sólo ocupa sitio. Ésos sí se retiran desde aquí.

  Todo lo demás **no se borra desde esta pantalla**, y no por timidez: una foto
  de evaluación es la constancia de cómo estaba un área y su bucket ni siquiera
  da permiso de borrado; un material se quita **desde su encuesta**, que además
  se lleva su ficha —borrarlo aquí dejaría la fila apuntando al vacío—. La
  pantalla dice dónde está el peso; quitarlo se hace donde vive.

  Aquí **sí hay umbrales de color** —verde hasta el 70%, ámbar hasta el 90, rojo
  de ahí—, al revés que la barra del pase de lista: una cuota es un tope de
  verdad, y pintar de rojo el 60% de asistencia sería inventarse uno que nadie
  definió.

  Son **dos pantallas en un solo overlay**, como la hoja de evaluaciones: el
  resumen y los archivos de un bucket, con el botón de volver del encabezado
  escondido en la primera —con `hidden`, así que depende de la regla
  `.ios-boton-icono[hidden]` de `estilos.css`—. La lista de un bucket enseña los
  **cincuenta más pesados**: de ahí para abajo lo que queda no mueve la aguja, y
  dibujar mil doscientas filas sí se nota.

- **Toda la información de la plantilla se gestiona desde el panel.** El
  personal, los departamentos, los puestos, los encargos, las áreas, las plantas
  con sus líneas y la cadena de mando: todo eso decide a quién le toca una
  encuesta, quién la califica y quién firma un registro, y hasta ahora sólo se
  editaba —cuando se podía— desde el panel de refacciones, que es otro
  documento. Un departamento mal escrito partía en dos las estadísticas y la
  única salida era el editor SQL de Supabase. Se entra por **«👥 Gestionar
  información»** del panel de administración y vive en `13-gestion.js`, en la
  hoja `#modal-gestion`.

  ```js
  window.gestionDatos        // { empleados, areas, plantas, lineas }, se lee sin consultar
  window.rutaGestion         // la pila de pantallas; la última es la que se ve
  window.PANTALLAS_GESTION   // { menu, personal, ficha, catalogo, valor, areas, area,
                             //   lineas, planta, linea, supervisores, equipo }
  window.irAGestion(p)  window.volverEnGestion()  window.pintarGestion(html)
  window.escribirGestion(consulta, queEs)   // cuenta las filas del .select()
  window.hacerEnGestion(queEs, trabajo)     // apaga botones, recarga y vuelve
  ```

  **Son once pantallas en un solo overlay**, como la hoja de evaluaciones y la
  de consumo: apilar hojas dejaría dos tiradores a la vista. Todas se dibujan en
  `#cuerpo-gestion` con `innerHTML`, así que los ids de dentro existen sólo
  mientras la que los usa está a la vista. Por dónde se pasó lo lleva la pila
  `rutaGestion`, y de ahí sale la flecha de volver del encabezado; una pantalla
  nueva se añade a `PANTALLAS_GESTION` y devuelve `{ titulo, subtitulo, html,
  buscar, contador, mas, guardar, borrar }` —los tres últimos son los botones
  del encabezado, que se enganchan desde JavaScript porque cambian con la
  pantalla—.

  Siete cosas que hay que mantener:

  - **Lo compartido con refacciones vive en `1-config.js`.** Aquella pantalla
    tuvo la primera ficha de empleado y ésta es otro documento, así que
    `consultarEmpleados`, `COLUMNAS_OPCIONALES_EMPLEADO`, `normalizarIdsLineas`,
    `RASTROS_DEL_EMPLEADO` y el borrado entero
    (`window.eliminarEmpleadoConHistorial(emp, avisar)`) se mudaron allí. Dos
    copias de esa lista de rastros es lo que dejaría historial sin dueño en
    cuanto una se quedara atrás: **toda tabla nueva que guarde a una persona por
    su número se añade a la de `1-config.js` y a ninguna otra**.
  - **Toda escritura cuenta las filas del `.select()`**, con
    `window.escribirGestion`: PostgREST responde con éxito a un update o un
    delete que las políticas de RLS rechazan —afecta a cero filas— y sin ese
    conteo la pantalla diría «guardado» mientras el cambio nunca llegó.
  - **Los chips se repintan solos, no la ficha entera.** Los encargos y las
    líneas son listas y viven en `window.fichaGestion` mientras la ficha está a
    la vista (`pintarEncargosFicha`, `pintarLineasFicha`): rehacer el formulario
    a cada toque se llevaría por delante lo escrito y sin guardar. Y a una ficha
    se puede volver desde más adentro —su equipo, y de ahí la ficha de otro—,
    así que `pintarGestion` repone ese estado si es de otra persona.
  - **El buscador vive fuera del cuerpo que se repinta**, como el de la pantalla
    de certificación y por lo mismo: dentro, cada letra se llevaría el foco por
    delante.
  - **La fila de esta hoja no es suya: es `.lista-ios` / `.fila-ios`**, la
    tarjeta blanca con sus renglones, su icono, su detalle y su chevron. Se
    llamaba `.gestion-*` mientras la usó sólo aquí; desde que las dos acciones
    del administrador de la hoja de evaluaciones se dibujan igual, el nombre no
    es de ninguna pantalla. Una lista nueva la reusa en vez de copiarla.
  - **Los catálogos de texto libre no tienen tabla detrás.** El departamento, el
    puesto y el encargo viajan en la ficha de cada persona, así que renombrar
    uno es reescribir todas las que lo llevan —los encargos, uno a uno, que son
    una lista dentro de la fila— y sólo salen los que alguien lleva puestos. La
    aplicación los compara **letra por letra**, así que al renombrar se avisa de
    los dos casos: si el nombre nuevo ya existe clavado, los dos quedan
    fusionados; si sólo se escribe **casi** igual —«PRODUCCION» y «Producción»—,
    quedarán como dos, que es justo lo que parte en dos las estadísticas.
  - **Lo que tiene tabla se apaga antes que borrarse.** Un área con gente dentro
    no ofrece el bote de basura —se apaga, y así deja de ofrecerse sin tocar de
    dónde salió cada respuesta—; una planta con líneas y una línea con gente,
    tampoco. Lo que no lleva a nadie sí se borra.
  - **La cadena de mando no se muerde la cola.** `supervisor_id` guarda el
    `employee_id` de texto, y al guardar la ficha se comprueba que el jefe
    elegido no dependa ya de esa persona: media aplicación recorre esa cadena.
    La pantalla de supervisores avisa además de lo que ya está torcido —ciclos,
    jefes de baja con gente a cargo y fichas que apuntan a un número que no está
    en la plantilla—.

  El área que se escribe a mano en una ficha **se da de alta antes de guardarla**:
  la columna guarda su id y no su nombre. Y al terminar cualquier escritura se
  rehace la caché del panel de detrás (`cargarDatosEmpleados`,
  `invalidarCacheDashboard` y `empleadosLoginCache` vacío): la plantilla decide
  quién ve qué, y dejarla vieja es enseñar el organigrama de antes hasta la
  próxima recarga.

- **Ya no se relanza ninguna encuesta, pero lo relanzado sigue contando como se
  relanzó.** Hubo una hoja —«Relanzar encuesta», en el panel de detalles— que
  volvía a pedir una encuesta a todo el que la tuviera asignada sellando el
  instante en `evaluations.relaunched_at`: toda respuesta anterior dejaba de
  cerrar el pendiente sin dejar de existir. Se quitó cuando el **«+» del detalle
  de una clasificación** aprendió a crear una encuesta **copiando otra** —con la
  fecha de hoy en el título—, que es mejor manera de repetir una junta o una
  auditoría: cada vuelta queda con su propia lista, su propio pase de lista y su
  propio historial, en vez de mezclar dos eventos en una encuesta. Con la hoja
  se fueron `window.puedeRelanzarEncuesta`, `#modal-relanzar-encuesta` y las
  tres funciones que la abrían, la llenaban y la guardaban.

  **Lo que se queda es la lectura**, en `1-config.js`, y no se puede quitar:

  ```js
  window.fechaDeRelanzamiento(ev)            // Date, o null
  window.respuestaTrasRelanzar(ev, resp)     // ¿esta respuesta todavía cuenta?
  window.respuestasTrasRelanzar(ev, respuestas)
  window.camposConRelanzamiento(campos)      // la columna, en las consultas
  ```

  Las encuestas que ya se relanzaron llevan su instante puesto en la base, y
  dejar de mirarlo **cerraría de golpe los pendientes que ese relanzamiento
  abrió**. Lo siguen mirando `esEvaluacionPendiente` —de donde lo heredan la
  pantalla de pendientes, el badge del panel y las tarjetas del equipo— y el
  pase de lista, que por eso cuenta sólo la vuelta en curso. Las consultas que
  deciden un pendiente siguen encadenando `camposConRelanzamiento`
  (`7-pendientes.js` y `2b-core-dashboard.js`): sin la columna todo se comporta
  como si nunca se hubiera relanzado nada, que es lo de siempre.

  Su script, `sql/relanzar-encuesta.sql`, se queda por lo mismo: documenta una
  columna que se sigue leyendo.

  **La rama `'relanzada'` de `esEvaluacionPendiente` también se queda**, y sigue
  haciendo dos cosas. A quien ya la había contestado no le dice «Nunca
  contestada» —sería mentirle: la contestó, y la racha de periodos omitidos no
  es suya— y le apaga la etiqueta roja de «cuándo apareció el pendiente», que
  diría «⌛ Hoy» en el rojo de lo urgente. No puede desaparecer aunque haga tan
  poco: sin ella el pendiente cae al `else` que anuncia el vencimiento, y una
  encuesta de «única vez» no tiene periodo, así que diría «Vence en 0 días».

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

  **Y el plazo no sobrevive a su periodo.** Ir por encima del periodo significa
  que mientras corre **esconde** al del periodo que toque, y eso sólo vale
  dentro del suyo: una mensual reprobada en agosto se seguía pidiendo en
  septiembre —y tapaba la de septiembre—, cuando lo que quedaba por hacer ya no
  era reponer aquélla sino contestar la de este mes, que es la misma encuesta
  otra vez y ya con las contramedidas puestas. Por eso `reintentoDeRespuesta`
  mira además si la respuesta sigue siendo del periodo vigente de la encuesta
  (`periodoDeEncuesta`) y, si no, devuelve null: el plazo **se apaga solo** al
  cambiar el periodo y el pendiente vuelve a ser el del periodo, sin nada que
  limpiar ni ninguna fecha que sellar. Lo que sacó aquella respuesta se sigue
  leyendo en su historial.

  Las de **«única vez» no tienen periodo siguiente** que lo sustituya, y
  `periodoDeEncuesta` las resuelve como «alguna vez» —desde el origen del
  tiempo—, así que ahí el plazo corre hasta agotarse, que es lo de siempre. Lo
  decide `ev.frequency`, y es la trampa de la columna que no se pidió: llega
  `undefined`, la encuesta se lee como de «única vez» y el plazo vuelve a
  sobrevivir al periodo. Las tres consultas que deciden un pendiente ya la
  traen —es de donde sale el tercer argumento de `esEvaluacionPendiente`—, y
  ahí se degrada igual que el periodo, que sin frecuencia tampoco se calcula.

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

  **`encuestaDeLaRespuesta` se traía cuatro columnas y ninguna de ésas**, y es
  la trampa de siempre: una columna que no se pidió llega `undefined`, y
  `leTocaEstaEncuesta` lo lee como «no acota nada». Con la encuesta traída por
  ahí, una dirigida a doce personas le tocaba a la plantilla entera: el pase de
  lista de su hoja decía «4 de 455» y el botón de «Responder Encuesta» le salía
  a cualquiera que la abriera. **Por la lista no se notaba** —`evalCache` se
  trae la fila entera con `select('*')`—, así que fallaba o no según por dónde
  se hubiera entrado, que es lo que lo hacía parecer cosa de la pantalla.

  **Y le faltaba `frequency`, que es de donde sale el periodo.** Sin ella,
  `periodoDeEncuesta` resuelve la encuesta como de «única vez» —«alguna vez»,
  desde el origen del tiempo—, y esa pantalla se quedaba diciendo tres cosas
  distintas de la misma encuesta: el subtítulo del encabezado ponía «Única vez»
  mientras su renglón de la lista decía «Mensual»; el recuadro de la empresa
  contaba **todas** las respuestas que ha tenido nunca —«126/126 · 78%» donde el
  mes en curso iba por «44/95 · 36%»—, y de paso inflaba el divisor con los
  `ajenos`, que en una encuesta de «alguna vez» son todos los que contestaron
  alguna vez y ya no están en el padrón; y cada punto de su gráfica salía
  acumulado en vez de ser el de su periodo, o sea una línea que sólo puede
  subir. `created_at` va con ella —es lo que decide si la encuesta ya existía en
  el periodo de cada punto—, y `description` y `evaluates_area` van porque son
  el recuadro gris de esa misma pantalla, que sin pedirlas no enseñaba la
  descripción ni decía que mide por área.

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

  **Se apaga y se enciende en un solo sitio: la casilla «Activa» del grupo
  «Opciones» de la hoja de crear y editar**, que `guardarNuevaEvaluacion`
  escribe con el resto del formulario y `editarEvaluacion` carga con
  `encuestaActiva`. Plegado, el renglón del grupo lo dice —«Obligatoria · Exige
  80% · Inactiva»—, así que no hay que abrirlo para saberlo.

  Su renglón de la lista tuvo un botón que lo cambiaba de un toque
  (`alternarEncuestaActiva`), y se quitó: era el mismo interruptor por otra
  puerta, y en cuanto se quedó solo en la fila —fuera el lápiz, fuera el bote de
  basura— pasó a leerse como el de eliminar, primero siendo un 🚫 y después un
  ojo tachado. Con él se fueron sus dos iconos y la regla `.encuesta-boton svg`.
  La contrapartida es que apagarla ya no es un toque sino guardar la hoja; a
  cambio, el único sitio donde se decide quién ve una encuesta es el mismo donde
  se decide todo lo demás de ella.

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
- **Desde cuándo aplica una encuesta se puede corregir a mano.** La aplicación
  la hacía empezar el día que se dio de alta, y eso no siempre es verdad. La
  auditoría de septiembre se crea **copiando** la de agosto, así que su
  `created_at` es de hoy aunque la auditoría lleve un año haciéndose: la gráfica
  del panel la desvanecía en todos los periodos de atrás —«Todavía no existía»—
  y el resumen la dejaba fuera, cuando lo que había pasado es que se dio de alta
  tarde. Al revés pasa lo mismo: una encuesta que se prepara en septiembre para
  empezar en octubre ya se está pidiendo el día que se guarda.

  Es el campo **«Aplica desde»** del grupo «Opciones» de la hoja de crear y
  editar, y la columna es `evaluations.vigente_desde`, cuyo script
  (`sql/vigencia-de-encuesta.sql`) se corre a mano.

  ```js
  window.inicioDeEncuesta(ev)        // desde cuándo cuenta: la puesta, o el alta
  window.diaDeInicioDeEncuesta(ev)   // lo mismo en 'YYYY-MM-DD'
  window.hayColumnaVigencia()  window.camposConVigencia(campos)
  ```

  **Nadie vuelve a leer `created_at` para preguntar desde cuándo cuenta una
  encuesta**: se pasa por `inicioDeEncuesta`, que prefiere la fecha puesta a
  mano y se cae en el alta cuando no la hay. Son cuatro sitios, y los cuatro
  decían algo distinto de la misma encuesta:

  - **`encuestaExistiaEn`**, que es lo que decide si un periodo de atrás le
    cobra su padrón o la desvanece —la gráfica de la tarjeta del panel, su
    resumen y la de la pantalla de una encuesta—. Es a lo que se vino.
  - **La racha de «N periodos sin contestar»** de un pendiente nunca contestado,
    que con el alta de una copia empezaba a contar desde cero.
  - **Los días que se tardó en contestarla** (`origenDelPendiente`), donde una
    respuesta anterior al alta daba días negativos.
  - **La fecha con la que sale su tarjeta** en el panel de pendientes.

  **Y una fecha por delante hace lo que dice: hasta que llegue, la encuesta no
  le sale a nadie como pendiente.** Es la misma idea que la ventana de una
  pregunta de asistencia —antes del evento no hay nada que confirmar— y el freno
  vive en `esEvaluacionPendiente`, justo detrás de aquél. Sólo puede saltar con
  una fecha escrita a mano: un `created_at` nunca está en el futuro, así que
  para todo lo que ya existe no cambia nada.

  Cuatro cosas que hay que mantener:

  - **Toda consulta que vaya a decidir un pendiente o a dibujar un periodo
    encadena `camposConVigencia`.** Es la trampa de `requires_min_score` otra
    vez: una columna que no se pidió llega `undefined`, `inicioDeEncuesta` se
    cae al alta y la encuesta vuelve a desvanecerse en los periodos de atrás. La
    encadenan `cargarEncuestasAsignadas` y `calcularPendientesBatch`
    (`2b-core-dashboard.js`), `cargarVistaPendientes` (`7-pendientes.js`) y
    `encuestaDeLaRespuesta` (`4-evaluaciones-admin.js`). Las que van con
    `select('*')` —`evalCache` y las estadísticas— ya la traen.
  - **Una copia no hereda la fecha.** Es lo mismo que hace con el título: la
    copia es la vuelta de este mes, no la del año pasado, así que arrastrarle
    aquella fecha la metería en periodos que no son suyos. Vacía vuelve a
    significar «desde que se cree», que para una copia es hoy.
  - **Se guarda en ISO y no como el `'YYYY-MM-DD'` del campo**, que la columna es
    `timestamptz`: la hoja manda la medianoche local de quien la escribe —con
    `fechaDeRegistro`, porque `new Date('2026-03-01')` se lee en UTC y la zona
    horaria lo corre un día— y `valorLocalDeFecha` hace el camino de vuelta.
  - **Sin la columna, el campo se queda vacío y apagado** diciendo qué script
    falta (`avisarSiFaltaColumnaVigencia`), y todo se comporta como antes: manda
    `created_at`. Es el mismo molde que el umbral y los revisores.
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

  **Y la tarjeta dice qué hay que hacer, no qué clase de cosa es.** Llevaba
  encima tres cosas que no decían nada que no estuviera ya escrito al lado, y
  las tres se fueron:

  - **El recuadro con el emoji** (`.thumb-container` con un ✍️, un 👑, un ⚠️…),
    que se llevaba 60px de los 329 de ancho de un teléfono —la columna del
    texto vive de lo que le dejen— para repetir con un dibujo lo que dice el
    borde de color de la izquierda. Se fue de las **seis** tarjetas virtuales;
    el de la tarjeta de un incidente se queda, que ahí no es un emoji sino la
    imagen del registro (`Incidente.png` / `Difusion.png`).
  - **La chapa del tipo** («Encuesta», en azul sobre una tarjeta azul con el
    botón «Responder» debajo).
  - **La frase de estado** («¡Actualiza tu registro!», «¡Vencida!», «¡Por
    vencer!», «¡Vuelve a contestarla!»), que era la etiqueta de tiempo de al
    lado dicha otra vez y con signos de admiración: «📅 Falta este mes» ya es
    el estado, y va con su color. Con ella se fueron `txtEstado` y
    `colorEstado`, que no las leía nadie más.

  Las otras cinco tarjetas conservan su chapa y su frase: ahí no nombran el
  tipo sino lo que pasa —«Falta Contestar», «Pendiente de tu Jefe», «Mal
  Revisada»—, y quitarlas dejaría el pendiente sin decir por qué está ahí.
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
- **El tipo de pregunta se elige de una lista que explica cada tipo.** Nadie
  adivina en qué se diferencian «Checklist» y «Recall» leyendo dos palabras, y
  equivocarse ahí no se arregla después: cambiar el tipo de una pregunta ya
  contestada parte su historial (más abajo). El desplegable nativo de iOS no
  daba dónde decirlo —enseña una línea por opción y recorta lo que no cabe—,
  así que ya no se usa.

  El catálogo vive en `1-config.js`, con el nombre, el icono y el `detalle` de
  cada tipo:

  ```js
  window.TIPOS_DE_PREGUNTA      // [{ valor, icono, nombre, detalle }, …]
  window.tipoDePregunta(valor)  // null si no está
  ```

  Está ahí y no en el marcado porque la hoja lo dibuja **dos veces** —el botón
  que dice el tipo elegido y la lista donde se elige— y dos copias acabarían
  diciendo cosas distintas. El `detalle` cuenta las dos cosas que el nombre no
  dice: **cómo se contesta** y **quién la califica**.

  **El `<select>` sigue siendo la verdad, sólo que escondido.** Lo leen el
  guardado, `editarEvaluacion`, `actualizarMarcasCorrectas` y las restricciones
  del modo jefe, y ninguno tuvo que enterarse del cambio. Lo que se ve es un
  botón (`.tipo-pregunta-boton`) que despliega `.tipos-pregunta` dentro de la
  propia tarjeta.

  ```js
  window.pintarBotonTipo(wrapper)     // el botón dice lo que valga el <select>
  window.listaDeTiposHTML(wrapper)    // las filas, con lo que el modo permita
  window.alternarTiposPregunta(btn)
  window.elegirTipoPregunta(el, valor)
  ```

  **Poner `.value` a mano no dispara el `onchange`**, así que `elegirTipoPregunta`
  llama a `toggleTipoPregunta` ella misma. Y `toggleTipoPregunta` es el embudo
  donde se repinta el botón: por ahí pasan los dos caminos que cambian el tipo
  —la elección de la lista y el «vuelve a escala» que impone
  `verificarRestriccionesModo` en modo jefe—, así que el botón no puede quedarse
  diciendo el tipo anterior.

  **Qué tipos valen no se vuelve a decidir aquí**: la lista mira el `disabled`
  que `verificarRestriccionesModo` ya le puso a cada `<option>`, y por eso se
  rehace cada vez que se abre —el modo se puede haber cambiado desde que se
  montó la tarjeta—. El porqué se dice **una sola vez arriba** y no en cada fila
  apagada: la misma frase cuatro veces tapaba las dos opciones que sí valen.

  **Va desplegada dentro de la tarjeta, no en otra hoja.** Apilar una hoja sobre
  `#modal-crear-eval` deja dos tiradores a la vista, y lo que se elige aquí es
  un campo del formulario que ya está abierto. De paso desaparece una rueda de
  las que descolocan la hoja al cerrarse (ver `TIPOS_SIN_TECLADO`).

  El botón lleva **su propio renglón**, debajo del número y las flechas: ahí
  dentro le quedaban 91px en un iPhone de 375 y «Rango Numérico» se leía «Rango
  N…». Es además el control que manda en la tarjeta —de él dependen todos los
  campos de abajo—, así que ser el más ancho es lo que le toca.

  Ojo con `.tipos-pregunta`, que es un flex y se esconde con el atributo
  `hidden`: un `display` de autor le gana al `[hidden]` de la hoja del
  navegador, así que necesita su propia regla `[hidden] { display: none }` o se
  queda desplegada para siempre.

  Un tipo nuevo se añade al catálogo y aparece solo en la hoja; lo que sí hay
  que tocar aparte es qué campos enseña (`toggleTipoPregunta`) y cómo se
  contesta y se califica.

- **La clasificación se escribe, pero se ven las que ya existen.** No hay
  catálogo —es texto libre, y de ahí que todo lo que la compare pase por
  `normalizarClasificacion`—, así que el campo sigue siendo un `input`. Lo que
  hacía falta es poder mirar las que ya hay antes de escribir: poner «Juntas»
  donde el resto de la empresa puso «Junta» parte el grupo en dos, y ni las
  actas de certificación, ni los revisores heredados, ni el historial de la
  clasificación se enteran.

  Lo enseñaba un `datalist`, que es justo lo que no se ve en el teléfono con el
  que se usa esto: Safari en iOS lo despacha con una tira minúscula sobre el
  teclado, cuando la enseña. Hoy es un botón al lado del campo que despliega la
  lista **dentro del propio formulario**, como la de tipos de pregunta y por lo
  mismo: apilar una hoja sobre `#modal-crear-eval` deja dos tiradores a la
  vista.

  ```js
  window.clasificacionesExistentes   // [{ nombre, cuantas }], por nombre
  window.listaDeClasificacionesHTML()
  window.alternarClasificaciones(abrir)   // sin argumento, la que no esté
  window.pintarListaClasificaciones()     // la rehace si está abierta
  window.elegirClasificacion(boton)
  ```

  Cada una dice **cuántas encuestas lleva**, que es lo que separa la
  clasificación de la casa del error de dedo que alguien dejó una vez. Se
  cuentan por el nombre normalizado —quien decide si dos son la misma— y se
  enseña el de la primera que aparece.

  Tres cosas que hay que mantener:

  - **Se filtra por lo que se teclea, no por lo que hay en el campo.** Al crear
    una encuesta el campo llega con «General» puesto, y eso es una elección y
    no una búsqueda: filtrando por ella, abrir la lista enseñaba una fila o
    ninguna. La marca es `window.filtroClasificaciones`, que se pone en `null`
    al abrir y se llena con la primera letra que se escriba. La búsqueda sí
    ignora acentos —nadie los teclea en un buscador—, y por eso tiene su propia
    `claveDeBusqueda` en vez de `normalizarClasificacion`, que es la que compara
    y no debe quitarlos.
  - **Sin coincidencias no se deja el hueco en blanco**: se dice que ninguna de
    las que hay se llama así y que al guardar se creará como nueva. Es
    exactamente el caso que hay que ver antes de crear un duplicado.
  - **Con la clasificación fijada el botón se esconde.** Quien crea sin ser
    administrador sólo puede hacerlo en la que revisa, y elegir otra de la lista
    sería el mismo permiso decorativo por otra puerta. Se esconde con `hidden`,
    así que depende de la regla `.clasificacion-boton[hidden] { display: none }`
    de `estilos.css`: es un flex y la trampa de `.tipos-pregunta` otra vez.

  Poner el `.value` a mano no dispara ningún evento, así que `elegirClasificacion`
  llama a `pintarNotaRevisoresClasificacion` —de este campo cuelga de quién se
  heredan los revisores—; el renglón del grupo «Datos» sí se rehace solo,
  porque el `click` del botón burbuja hasta el oyente de la hoja.

- **La hoja de edición enseña la encuesta antes de publicarla.** Una encuesta se
  escribe en una hoja de campos y se contesta en una pantalla que no se parece
  en nada, así que hasta publicarla no había manera de saber si la guía de la
  escala se lee, si el enunciado de una evidencia dice qué fotografiar o si una
  pregunta pide comentario. Enterarse después es corregirla cuando ya la
  contestó alguien, y **editarla parte su historial en dos** (justo aquí abajo).
  El ojo del encabezado (`#btn-vista-previa-eval`) la abre tal y como la verá
  quien la conteste.

  ```js
  window.preguntasDeLaHoja()      // el cuestionario que se está escribiendo
  window.vistaPreviaEncuesta()    // el ojo del encabezado
  window.cerrarVistaPrevia()      // la cruz, el botón del pie y el gesto
  ```

  **Sale de los campos de la hoja y no de la base**, que es lo único que sirve:
  lo que se quiere ver es lo que se acaba de escribir y todavía no se ha
  guardado —una encuesta nueva ni siquiera es una fila—. Por eso el cuestionario
  lo lee **`window.preguntasDeLaHoja`**, que es la **misma** lectura con la que
  guarda `guardarNuevaEvaluacion` —se extrajo de ahí, no se copió—: dos lecturas
  distintas dejarían la previa enseñando una encuesta que no es la que se va a
  publicar, que es justo lo contrario de para lo que está.

  **Y se dibuja con `prepararRespuesta`, la pantalla de contestar de verdad**,
  que gana un octavo argumento (`{ vistaPrevia: true }`). Un dibujo propio se
  quedaría atrás en cuanto se tocara un tipo de pregunta, y entonces la previa
  diría que la escala se ve de una manera cuando se ve de otra.

  Cinco cosas que hay que mantener:

  - **La hoja de edición se aparta, no se queda debajo.** Dos hojas apiladas
    dejan dos tiradores a la vista, que es lo que esta aplicación no hace en
    ningún sitio. Se esconde con `display:none` —los campos siguen en el
    documento con lo escrito— y `cerrarVistaPrevia` la devuelve; por dónde iba
    su cuerpo se guarda en `window.desplazamientoHojaEval`, o volver de la
    previa dejaría el formulario arriba del todo.
  - **En la previa no hay nada que enviar.** El botón se queda —el hueco de la
    acción principal es parte de lo que se viene a ver— pero apagado, con su
    renglón diciéndolo y el de volver debajo. No es sólo cosmética: sin botón,
    `enviarRespuestasEval` no tiene desde dónde dispararse.
  - **El área no se guarda.** Una encuesta `evaluates_area` enseña su fila, pero
    sin el desplegable: `guardarAreaEnEvaluacion` le escribiría el área a quien
    esté mirando, y una previa no cambia nada de nadie.
  - **Las preguntas nuevas llevan un id de mentira** (`previa-0`, `previa-1`…).
    La pantalla de contestar usa el id para el `name` de cada grupo de opciones
    y para el id de cada tarjeta, así que sin él dos preguntas nuevas
    compartirían controles. Nunca llegan a la base, y `cerrarVistaPrevia` vacía
    `preguntasCacheActual` para que ese cuestionario no le sobreviva.
  - **La cruz no es `cancelarRespuesta`**, que devuelve el panel de encuestas: de
    aquí se vino de la hoja de edición. El gesto de deslizar hacia abajo pulsa
    esa misma cruz, así que cierra igual.

  El ojo sale al crear, al editar y al copiar —al crear es cuando más falta
  hace— y **no en el modo restringido del revisor**, donde el cuestionario ni se
  le pide a la base y no habría preguntas que enseñar. Se esconde con `hidden`,
  así que depende de la regla `.ios-boton-icono[hidden]` de siempre.

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

  Los cortes comparten un solo bloque, «Desglose», con tres conmutadores en su
  encabezado: por dónde se corta —`dimensionDesglose`—, con qué forma se dibuja
  —`formaDesglose`— y qué se mide —`currentStatsSortCriterion`, de la lista
  `window.CRITERIOS_STATS`—. Las tres elecciones viven en `sessionStorage` y las
  pinta `window.pintarDesglose()`, que es también lo que llaman los botones
  «Volver» para no salirse del modo, y que de paso devuelve el radar a la vista
  general.

  **Por dónde se corta lo dice `window.DIMENSIONES_DESGLOSE`**, y son cuatro:
  departamento, puesto, área y encargos extra. Cada uno trae su etiqueta, el
  nombre de su caché, la función que abre su nivel de dentro y —lo que de verdad
  lo define— `valores(empleado)`, la lista de filas a las que esa persona suma:

  ```js
  window.DIMENSIONES_DESGLOSE   // [{ clave, etiqueta, cache, alTocar, valores, varias }]
  window.dimensionStats()       // el corte elegido; cualquier cosa rara es departamento
  window.dimensionStatsPor(clave)
  window.filaVaciaStats()       // los contadores de una fila, todos a cero
  window.deptDeEmpleado(e)  window.supDeEmpleado(e)  window.puestoDeEmpleado(e)
  window.areaDeEmpleado(e)  window.encargosDeEmpleado(e)
  ```

  Un corte nuevo se añade a esa lista y **no hay que tocar el motor**: cada
  persona se resuelve una vez en `filasDeGrupo[empId]` —su departamento, su
  supervisor, su puesto, su área, cada uno de sus encargos y el universo— y
  todos los contadores se incrementan recorriendo esa lista. Antes eran cuartetos
  de `if`s repetidos diez veces —uno por contador—, y añadir un corte era tocar
  los diez sin que nada avisara del que se olvidara. Por lo mismo, los
  contadores de una fila salen de `filaVaciaStats()` y no de un literal copiado,
  y los cinco ayudantes de arriba sustituyen a las tres copias que había de
  `getPuesto` y de `getArea`.

  **Los encargos son el primer corte donde una persona cae en varias filas**
  —quien lleva «Seguridad» y «Capacitación» suma sus encuestas en las dos, que es
  lo que se está preguntando—, y eso tiene dos consecuencias que hay que
  mantener:

  - **La cifra del encabezado no se saca sumando las filas.** Sumarlas contaría
    dos veces a quien lleva dos encargos, así que ahí se pasa `universo`, la fila
    que cuenta a cada quien una sola vez (segundo argumento de
    `encabezadoDelGrafico`). En los demás cortes la suma de las filas **es** el
    universo y no hace falta.
  - **Y se dice en su renglón** (`.stats-nota-dimension`), porque los cuadros
    suman más gente que la plantilla a propósito: sin decirlo, el gráfico se lee
    como si sobrara personal.

  Área y encargos **no tienen supervisores debajo**, como el puesto: los tres
  entran a `window.verStatsDetalleGrupo(clave, nombre)`, que filtra la plantilla
  con el `valores` de su corte. El departamento sigue teniendo su propia función,
  que es la única con un nivel intermedio. Los tres desgloses
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

  **Y cada cuadro y cada columna dicen además los suyos**: bajo su cifra, el cuadro
  de un departamento lleva «67% · 2/3 grupos» y la columna de barras, que mide
  78px en un teléfono, la forma corta «2/3 grupos» —el porcentaje de arriba ya
  es el de las personas—. Es lo que separa al departamento donde cumple mucha
  gente de un mismo grupo del que reparte a uno por grupo, que en el porcentaje
  de personas se ven igual. Lo cuenta `window.gruposDeLaFila(fila)`, que es
  `contarGrupos` sobre la gente de esa fila y **calla cuando el cuadro es un
  solo grupo**: «1/1 grupos» no compara nada, y si su gente cumple o no ya lo
  dice el relleno. Por eso el nivel de los supervisores no lo lleva, y el de
  los colaboradores tampoco —ahí las fichas ni siquiera dicen de qué grupo
  son—. Los cuatro sitios que lo escriben pasan por `window.textoGrupos`,
  `window.textoGruposCorto` y `window.lineaGrupos` (la del globo), o acabarían
  diciendo lo mismo de cuatro maneras.

  Dentro de un cuadro es el tercer renglón, así que es el primero que sobra:
  `medidasDelRotulo` lo da por cabido con bastante más sitio que la cifra
  (`hayGrupos`) y en la forma de personas pide además 84px de ancho, porque ahí
  cada renglón de la chapa es una fila de figuras menos. Y como en personas el
  alto del rótulo se **estima** para elegir la altura del lienzo,
  `altoRotuloEstimado` tiene que saber si ese renglón va: se le pasa desde
  `balanceDeReparto`, que lo consulta con `window.gruposDelCuadro(n)` —el mismo
  conteo, guardado en el nodo junto al criterio con el que salió, porque ahí se
  pregunta una vez por cada altura que se prueba—.

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
- **La pantalla de inicio dice qué encuestas le tocan a esta persona y cómo va
  con ellas**, en la tarjeta que llena `window.cargarEncuestasAsignadas(userId)`
  (`2b-core-dashboard.js`) dentro de `#container-encuestas-asignadas`, justo
  debajo del botón de pendientes. El botón dice cuántas faltan pero no cuáles,
  y la lista de encuestas está dos toques más adentro.

  **Lo que se ve son las clasificaciones, y las encuestas de una salen al
  tocarla.** Se certifica de una clasificación entera y no de una encuesta
  suelta, así que la clasificación es la unidad que se mira; con siete encuestas
  desplegadas la tarjeta se llevaba media pantalla para decir siete veces lo
  mismo. Cada clasificación es un `<details class="grupo-asignadas">`, así que
  abrir y cerrar lo hace el navegador solo —ninguna función colgada de
  `window`, como en los plegables de las hojas y de estadísticas— y **nace
  cerrada**.

  Su renglón dice lo suyo sin abrirla: el icono es el de **la encuesta que peor
  está** —basta una para que la clasificación no esté al día, y por eso se toma
  del primero de sus renglones, que vienen ordenados por lo que urge— y el pie,
  cuántas faltan y el promedio de lo ya calificado. Dentro, cada encuesta lleva
  su puntaje del periodo con el color de `getColorScore`. El encabezado de la
  tarjeta repite la cuenta y el promedio de todo. Sin nada calificado no se
  enseña promedio: un 0% ahí se leería como haberlo hecho mal en vez de no haber
  empezado.

  El renglón de la clasificación llevó un tiempo la insignia de
  `insigniaCertificacion` —«✅ Lista para certificar», «📉 1 por debajo de
  80%»—, la que enseñan el expediente y el panel de certificación, y aquí
  sobraba: eran chapas de colores por encima de unos renglones que ya dicen, uno
  a uno, lo que a esa clasificación le falta. La insignia sigue en su sitio,
  donde se decide certificar; esta tarjeta ya no consulta `estadoCertificacion`
  ni necesita la caché de `cargarCertificacionDeClasificaciones()`.

  Salen **todas las suyas, también las que ya contestó**: una lista donde todo
  dice «Al día» es lo que deja tranquilo, y una lista vacía no distinguiría
  entre no deber nada y no tener nada asignado. Sin ninguna asignada la tarjeta
  no se dibuja.

  **En modo administrador habla de otra cosa** —de todas las encuestas de la
  empresa y de cómo va cada una—, y se cuenta más abajo, con la tarjeta del
  administrador.

  **No decide nada por su cuenta**, que es lo único importante de esta sección:
  a quién le toca cada encuesta lo dice `leTocaEstaEncuesta` y en qué estado
  está, `esEvaluacionPendiente` —las mismas dos reglas del badge del panel y
  del panel de pendientes—, así que no puede discrepar de lo que ellos digan.
  Lo suyo es sólo cómo se llama cada estado (`window.estadoDeAsignada`, que
  traduce el `tipoAviso` a «Sin contestar», «Vencida», «Mal revisada»,
  «Repetir», «Vence en N días» o «Al día») y el orden: dentro del grupo, lo
  vencido primero, lo que aún tiene plazo después y lo que está al día al final;
  entre grupos, el que peor está, y con el mismo estado por nombre —o la tarjeta
  bailaría de una carga a otra—.

  **El estado va como icono a la izquierda del renglón, no como etiqueta a la
  derecha** (`window.iconoDeAsignada`): con siete encuestas al día, siete «Al
  día» en fila son siete veces la misma palabra ocupando la mitad del ancho, y
  lo que se busca de un vistazo es la que **no** lo tiene. Una palomita se lee
  sin leerla. Lo que falta se distingue además **por la forma** —un círculo
  abierto con su admiración— y no sólo por el color, que es lo que hay que hacer
  para no depender de distinguir el verde del rojo. Lo que decía la etiqueta no
  se pierde: va al renglón de abajo en las que faltan —donde no hay puntaje que
  enseñar— y al `title` de la fila siempre.

  Y **la tarjeta no lleva título**: lo que es se ve —clasificaciones con sus
  encuestas—, y en ese sitio el renglón del resumen dice más.

  Por lo mismo **arma sus columnas como el badge** —`camposConRelanzamiento`
  sobre `camposConMinimo` sobre `camposConReintento`, más `mode`,
  `is_obligatory` y los tres destinatarios— y pide antes
  `cargarVentanasDeAsistencia()`: `esEvaluacionPendiente` consulta la ventana de
  las encuestas que pasan lista sin poder esperar. Una columna que no se pida
  llega `undefined`, y eso no es `false`.

  **El renglón de una clasificación hace dos cosas, y por eso la flecha es un
  botón.** Tocar el renglón abre la **hoja de detalle** de esa clasificación
  (`#modal-detalle-clasificacion`, en `index.html`); la flecha de la derecha
  —`.grupo-asignadas-boton`, con `window.alternarGrupoAsignadas`— despliega ahí
  mismo la lista de sus encuestas, que es lo que hacía el renglón entero. Las
  dos acciones no cabían en el mismo toque.

  El `<details>` se queda —de él salen el `[open]` que gira la flecha y el
  esconder y enseñar la lista—, pero **ya no lo abre el navegador**: el
  `onclick` del `<summary>` hace `preventDefault()` y el botón lo abre a mano.
  El botón necesita **las dos cosas**: `stopPropagation` para que no salte
  además el `onclick` del renglón, y `preventDefault` para que el navegador no
  lo despliegue por su cuenta encima de lo que ya hizo el botón.

  **La hoja no consulta nada.** `cargarEncuestasAsignadas` deja en
  `window.clasificacionesAsignadas` los grupos ya calculados y en
  `window.respuestasAsignadas` las respuestas **enteras** —no sólo las del
  periodo que corre, que es de donde sale la gráfica—; la hoja las lee al
  abrirse. Se le pasa **el índice del grupo** y no su nombre, que así no hay que
  escapar la clasificación en un atributo. El cuerpo se arma con `innerHTML` al
  abrirla y se vacía al cerrarla, así que los ids de dentro existen sólo
  mientras está a la vista, y cada fila lleva a su encuesta cerrando antes esta
  hoja: el observador de `1-config.js` apartaría ésta al ver dos abiertas, pero
  así no hay ni el fotograma con las dos a la vista.

  **El encabezado lleva dos botones** a la izquierda de la cruz, agrupados con
  ella en `.hoja-acciones`: el **ojo**, que abre quién revisa las encuestas de
  esta clasificación —la misma hoja de «Revisores por clasificación» del panel
  de administración, entrando derecho a ésta y sin pasar por su lista—, y el
  **«+»**, que crea una encuesta **de esa clasificación**. Los dos se enganchan
  igual, en `window.botonesDeClasificacion`: `hidden` si no hay permiso, el
  `onclick` y la etiqueta desde JavaScript —el nombre cambia con cada
  clasificación— y cerrando ésta antes de abrir la suya. **El ojo es sólo del
  administrador; el «+» lo tiene además quien revisa esa clasificación**, y ahí
  la clasificación va fijada (ver más arriba). La hoja
  de crear nace ya con ella puesta —`abrirNuevaEvaluacion(categoria)` la lleva
  hasta `abrirModalCrearEval`, que es quien llama a `prepararInputCategorias`;
  sin argumento sigue siendo «General», que es lo de siempre—, y ésta se cierra
  antes, como hace todo el que abre otra hoja. El `onclick` se engancha desde
  JavaScript porque el nombre cambia con cada clasificación, y lo mismo su
  `title` y su `aria-label`, que dicen en cuál se va a crear. Se esconde con
  `hidden`, así que depende de la regla `.ios-boton-icono[hidden]` de
  `estilos.css`.

  **Una encuesta nueva sale de dos sitios: de cero o de otra que ya existe.**
  Antes de la hoja de crear se pregunta cuál, en `#modal-origen-encuesta`
  (`window.abrirOrigenDeEncuesta`), y la lista que ofrece es la de la
  clasificación con la que se entró —todas si se entró sin ninguna, que es el
  caso del botón del panel de administración—. Copiar es lo normal en cuanto una
  clasificación ya tiene su forma —la misma escala, las mismas preguntas, la
  misma gente—: volver a escribirla entera es donde se cuelan las diferencias
  que después no cuadran al comparar periodos.

  **Sin ninguna que copiar la hoja se salta ella sola** y se entra derecho a
  crear: dos caminos con uno solo transitable son un toque de más. Las apagadas
  sí entran en la lista —copiar una encuesta retirada es de las razones para
  tenerla guardada— y el filtro por clasificación se hace **aquí y no en la
  consulta**, con `normalizarClasificacion`, que es quien decide si dos nombres
  son el mismo. La clasificación viaja en `window.categoriaParaNuevaEncuesta` y
  no escapada en un atributo: es texto libre y puede traer comillas.

  Copiar es **el tercer argumento de `editarEvaluacion(id, soloDestinatarios,
  comoCopia)`**: llena la hoja con todo lo de la encuesta base pero la deja sin
  estar editando ninguna. Dos cosas lo sostienen y **las dos tienen que ir
  juntas**:

  - `idEditandoEval` se queda en **null**, que es lo que hace que
    `guardarNuevaEvaluacion` inserte en vez de actualizar.
  - **Las preguntas se montan sin su `data-id`**, que es lo que decide lo mismo
    para cada una. Y no es sólo eso: una tarjeta con id lleva el botón «🗑️
    Eliminar», que borra esa pregunta **de la base** —o sea, de la encuesta
    original—. En una copia eso sería destruir lo que se está copiando.

  **El título nace con la fecha de hoy entre paréntesis** —«Junta de seguridad
  (08/09/26)», con `window.tituloDeCopia(titulo, fecha)`—: dos encuestas con el
  mismo nombre en la misma clasificación no hay quien las distinga en ninguna
  lista. Decía «(copia)» y no servía para eso: la auditoría se repite cada mes y
  todas se llamarían igual, y al año siguiente la lista tiene cuatro «(copia)»
  sin decir de cuándo es cada una.

  Si el título ya traía una fecha suya —copiar una copia es lo normal aquí— se
  **sustituye** en vez de encadenarse, o acabaría en «Junta (08/09/26)
  (09/10/26)»; el mismo recorte se lleva el «(copia)» de las que ya se crearon
  así. Otros paréntesis no se tocan: «Encuesta (parte 2)» conserva el suyo.

  **Y entre el resultado y la lista va quién las revisa**, con la miniatura de
  la foto de cada uno (`window.filaDeRevisores`). No es cosa del administrador:
  a quien contesta le sirve saber quién va a calificarle, y una cara se
  reconoce antes que un nombre. Sin foto va el 👤 sobre el mismo azul de las
  listas de gente —`window.miniaturaDeEmpleado(emp, lado)`, que también apaga
  al que esté dado de baja—, y **sin revisores nombrados no se dibuja nada**:
  ahí califica el jefe inmediato de cada quien, que es lo de siempre y no hace
  falta repetirlo en cada clasificación.

  Son la **unión de los efectivos** de sus encuestas —lo que devuelve
  `revisoresDeEncuesta`, que ya resuelve la precedencia— y no sólo los de la
  clasificación: una encuesta que nombra a los suyos también los tiene, y
  esconderlos sería enseñar a quien no califica (`window.revisoresDelGrupo`).

  **Van en una sola fila, la cara con una palabra debajo** —el primer nombre,
  con `split(' ')[0]`, como bajo los avatares del equipo del panel— y la fila se
  arrastra si no caben. Con el nombre completo al lado, cada revisor se llevaba
  un renglón entero y cuatro empujaban la lista de encuestas fuera de la
  pantalla; así el bloque mide lo mismo haya dos o haya seis. Se alinea a la
  izquierda y **nunca centrada**: centrando con `justify-content: center`, en
  cuanto desborda el navegador recorta por la izquierda y a los primeros no se
  llega arrastrando.

  Lo que no cabe se dice en el **`title`**: el nombre completo y de cuántas
  encuestas del grupo es revisor. Quien no las revisa todas lleva además un
  **punto** en su miniatura, que es lo único que separa al revisor de la
  clasificación entera del que lleva una encuesta suelta sin gastar el renglón
  que se acaba de ahorrar.

  Por eso `cargarEncuestasAsignadas` **encadena `camposConRevisores`** y pide
  antes `cargarRevisoresDeClasificaciones()`: sin la columna, una encuesta con
  revisores propios enseñaría los heredados de su clasificación —la trampa de
  `requires_min_score`—, y sin la caché no habría herencia que enseñar.

  **Lo que enseña es cómo va, no cuánto falta**: el resultado del último periodo
  que dejó alguno y la línea de los anteriores. Cuántas hay pendientes y cuántas
  al día ya lo dice el renglón de la tarjeta del panel, y ahí abajo lo dice cada
  encuesta con su estado, su ritmo, la fecha de la respuesta que cuenta en el
  periodo —o la de la última vez— y su puntaje; los tres contadores que hubo
  arriba lo decían por tercera vez.

  ```js
  window.puntajeDeRespuesta(resp)             // el puntaje, o null si no está calificada
  window.historialDeClasificacion(grupo)      // un punto por periodo, del más viejo al más nuevo
  window.graficaDeLinea(puntos)               // el SVG, o '' con menos de dos puntos
  ```

  El historial se apoya en `periodosDeClasificacion` —los periodos los marca la
  encuesta **más frecuente** del grupo, que una clasificación puede mezclar
  frecuencias— y dentro de cada uno mira cada encuesta en el suyo con
  `respuestaDelPeriodo` y la fecha de referencia del periodo. Un periodo sin
  nada calificado devuelve `promedio: null` —no un cero, que se leería como
  haberlo hecho mal— y la gráfica se lo salta: por eso hay periodos sin punto.
  El titular es **el último periodo con resultado y lleva su nombre**, que puede
  no ser el que corre; sin ninguno dice «Todavía sin resultados».

  **La gráfica se dibuja a mano en SVG y no con Chart**, aunque el panel ya lo
  cargue: Chart mide el lienzo al dibujarlo y aquí la hoja está en
  `display:none` hasta el instante anterior, que es la misma trampa del radar
  del panel plegado. Lleva la referencia del 0, el 50 y el 100 y, aparte y a
  trazos, el mínimo de `UMBRAL_CERTIFICACION`, que es contra lo que se lee cada
  punto. Con menos de dos periodos con resultado no se dibuja nada —una línea de
  un punto no es una tendencia—.

  **Se lleva todo el ancho de su contenedor, y lo que se topa es la escala del
  trazo.** Un SVG con `viewBox` no mide nada: se estira con su contenedor y **lo
  escala todo en bloque**, así que el mismo dibujo que en un teléfono sale a 1:1
  —340px de tarjeta contra 320 de lienzo— en la tarjeta del panel de una laptop
  se escalaba 2,7× y con él la letra de 8px, los puntos de radio 4 y los 150px de
  alto: el eje salía con «abr» a 22px y la gráfica se llevaba media pantalla al
  lado de unos renglones de clasificación que seguían a su tamaño de siempre.

  Eso se atajó un tiempo con un **tope de ancho de 520px** sobre la caja, y el
  remedio tenía su propio defecto: por encima de esos 520 la gráfica dejaba de
  crecer pero la tarjeta no, así que en una laptop —donde `.main-container` deja
  890px de lienzo— se quedaba arrinconada a la izquierda con 350px muertos al
  lado, que se lee como un fallo de maqueta.

  Hoy la caja va a lo ancho y lo que se topa es **cuánto crece la tinta**:

  ```js
  window.ANCHO_BASE_GRAFICA   // 320, la talla de un teléfono
  window.MAX_ESCALA_GRAFICA   // 1.6, hasta dónde se deja crecer el trazo
  window.unidadesDeGrafica(anchoCaja)   // cuántas unidades de viewBox caben
  window.dibujoDeGraficaDeLinea(puntos, alElegir, A)   // el <svg>, en A unidades
  ```

  `unidadesDeGrafica` reparte el ancho medido a escala tope y devuelve las
  unidades de `viewBox` que caben dentro: con 890px de caja salen 556 unidades
  dibujadas a 1,6×, así que **la letra, los puntos y el alto miden en pantalla
  exactamente lo que medían con el tope de 520** —el dibujo entero era ahí 1,6×
  la talla de un teléfono— y lo único que crece es lo que tenía que crecer, el
  tramo de eje entre un periodo y el siguiente. Por debajo de 320 no se encoge
  nada: en un teléfono la caja no llega a esa talla y el dibujo se ve
  exactamente igual que siempre.

  **La contrapartida es que ahora sí hay que medir, y por tanto redibujar.**
  `graficaDeLinea` dibuja a la talla base —al devolver la cadena no hay todavía
  nada en el documento que medir—, se apunta en `window.graficasDeLinea` con su
  número en `data-grafica` y pide un barrido:

  ```js
  window.programarAjusteDeGraficas()   // uno por fotograma, no uno por gráfica
  window.ajustarGraficasDeLinea()      // el barrido: pone al día y vigila
  window.ajustarGraficaDeLinea(caja)   // una sola, si cambió de talla
  ```

  El barrido corre en el `requestAnimationFrame` siguiente —los tres sitios que
  la dibujan insertan el HTML en la misma tanda—, deja cada caja vigilada por un
  `ResizeObserver` y tira del registro las que ya no están en el documento, que
  cada repintado crea una caja nueva. De ahí en adelante es el observador quien
  avisa: al girar el teléfono, al cambiar el tamaño de la ventana y **al abrirse
  la hoja que la traía**, que es el caso de las otras dos gráficas —mientras el
  overlay está en `display:none` la caja mide cero y ahí no se toca nada—. El
  `resize` con su temporizador se queda como red de seguridad para los Safari sin
  `ResizeObserver`.

  Tres cosas que hay que mantener:

  - **Se mide el SVG, no la caja.** Va a `width:100%`, así que lo que ocupa es
    justo el hueco disponible, ya descontado el relleno de la caja.
  - **Si la talla sale la misma no se toca nada**, y eso es lo que corta el
    bucle del observador: redibujar cambia el alto, el alto vuelve a avisar al
    observador y ahí se sale.
  - **El globo abierto sobrevive al redibujado.** En la tarjeta del panel no es
    un detalle que se abre y se cierra sino la marca de qué periodo se está
    mirando, y perderlo al girar el teléfono dejaría la lista hablando de un
    periodo sin decir cuál.

  **Va alineada a la izquierda, no centrada.** Hoy ocupa el ancho entero y no se
  nota, pero la regla se queda: una caja más estrecha que su contenedor centrada
  queda flotando con un hueco muerto a cada lado, que se lee como un fallo de
  maqueta; a la izquierda cae a plomo con el renglón del resumen y con los de
  cada clasificación, o sea dentro de la columna de texto a la que pertenece.

  **El eje rotula todos los periodos, y en una sola talla.**
  `window.etiquetasDeEje(inicio, frecuencia)` da dos: la `corta` («ago», «T3»,
  «2ª ago», «23 ago») y la `minima` para cuando no cabe —la inicial del mes, o
  **el día** en las semanales, que si no las doce semanas de un mes se rotularían
  todas «A»—. Se elige **una para el eje entero** midiendo la más larga contra
  el hueco entre puntos: mezclarlas dejaría un eje que dice «ago» en un sitio y
  «S» en el de al lado. El nombre largo con su año sigue en el titular y en el
  globo. Un periodo **sin resultado se rotula igual y más apagado**: el eje es
  la línea del tiempo, y ahí se ve que ese periodo pasó sin nada.

  Los meses en corto salen de `window.MESES_CORTOS`, en `1-config.js`, que es de
  donde los toma también `etiquetaDePeriodo`: dos copias de ese arreglo
  acabarían discrepando.

  **Al tocar un punto sale su globo** (`window.marcarPuntoGrafica`), con el
  periodo y el resultado; volver a tocarlo lo quita y tocar otro cambia, que
  **sólo hay uno abierto a la vez** —en un teléfono dos globos se tapan—. Tres
  cosas que hacen falta ahí:

  - **El blanco del dedo no es el punto.** Un círculo de radio 4 no se acierta,
    así que quien escucha el toque es otro transparente y mucho más ancho,
    debajo.
  - **Los globos van los últimos del SVG y fuera de sus puntos**, emparejados
    por índice con `data-punto` / `data-globo`: dentro del grupo de su punto, el
    globo de uno quedaba por debajo del punto siguiente.
  - **Se esconden con `style.display` y no con el atributo `hidden`**: ese
    atributo lo entiende la hoja de estilos del navegador para el marcado HTML,
    y esto es un SVG. Es la otra cara de la trampa de `.ios-boton-icono[hidden]`.

  El toque de una encuesta lleva al **detalle de la encuesta** (`window.abrirEncuestaDesdeInicio`,
  que es la función que la tarjeta de revisión ya usaba con el nombre
  `abrirEncuestaQueReviso`, hoy un alias suyo) y no a contestar directamente:
  así es la propia pantalla la que decide qué botón toca —responder, elegir a
  qué colaborador se evalúa en una encuesta de modo jefe, o corregir a quién va
  dirigida—.

  **Y va derecho a esa hoja, sin pasar por la lista.** Antes montaba la lista
  entera y encima pintaba el detalle: dos consultas y un fotograma —a veces más—
  de una lista que nadie había pedido. `abrirHistorialEvaluacion` no la
  necesita, y lo dice su propio código: se trae las preguntas y las respuestas
  de esa encuesta, y `encuestaDeLaRespuesta` consulta la ficha cuando no está en
  caché, precisamente porque «a este panel se llega también desde el inicio». Lo
  único que hacía falta de la lista era la hoja donde dibujar, y eso es
  **`window.montarHojaEvaluaciones()`**, que la monta —su marcado vive ahí, en un
  solo sitio— y la enseña sin traer nada. El encabezado se pone antes de la
  consulta, con el título de la encuesta, así que el primer fotograma ya dice a
  dónde se entró. Y con la cruz, no con la flecha de volver: por aquí no se pasó
  por la lista, y esa flecha llevaba a una pantalla que nadie había pedido —de
  eso va `window.vengoDeLaListaDeEncuestas`, más arriba—.

  La ficha del empleado sale de `window.todosLosEmpleadosData` y no de
  `usuarioLogueado`: la sesión dura treinta días y un cambio de puesto o de
  departamento posterior no aparecería ahí, y de esos dos campos depende qué
  encuestas le tocan.

- **En modo administrador la tarjeta de arriba es otra.** Con el modo
  encendido no se está mirando el panel de nadie en particular —se
  administra—, así que la tarjeta de identidad deja de ser la de quien entró:
  seguir enseñando su foto, su nombre, su badge de pendientes y su radar se lee
  como si encender el modo no hubiera cambiado nada.

  ```js
  window.tarjetaDeAdministrador()        // el marcado
  window.pintarTarjetaAdmin(userHeader)  // lo pone y quita `esta-contraido`
  ```

  Es un escudo en el rojo del título, «Administrador» y un renglón que dice que
  el modo está activo y **cómo se sale** —tocando el título—, que es lo único
  que hace falta saber ahí. No lleva chevron ni `.panel-usuario-detalle`: lo
  que se plegaba era el radar, y el radar es de una persona. Tampoco es
  pulsable, que el modo se apaga donde se encendió. El icono mide los 60px de
  la foto, así que el panel no pega un salto al encender el modo.

  Se dibuja en **los dos sitios** donde `mostrarDashboard` escribe ese
  encabezado —el esqueleto de carga y la tarjeta de después—, y por lo mismo:
  el esqueleto del perfil enseñaría un instante el hueco de la foto y, cien
  milisegundos después, el nombre de quien entró.

  **Lo demás del panel se queda**: sus pendientes, las encuestas que revisa y
  su equipo siguen ahí. Lo único que además no se hace es **pedir el radar**
  (`cargarRadarGeneralDashboard`), que son dos consultas de una persona para un
  lienzo que ya no existe. La tarjeta de las encuestas asignadas sí cambia de
  qué habla, y se cuenta justo aquí abajo.

- **Administrando, la tarjeta de las encuestas es la de la empresa entera.**
  `cargarEncuestasAsignadas` enseña con el modo encendido **todas las encuestas
  activas** —no las que le tocan a quien mira— y los tres renglones dicen lo
  mismo con la misma forma: **cuánta gente la contestó este periodo y cómo va la
  empresa con ella**. «Mensual · 23/40 respuestas · 49%» la encuesta,
  «35/80 respuestas · 35%» su clasificación y «4 encuestas · 53/160 respuestas ·
  25%» la tarjeta entera. Era la misma lista que ve cualquiera, así que el
  administrador tenía delante sus tres encuestas y ninguna manera de saber cómo
  iba la plantilla sin bajar a certificación o a estadísticas.

  ```js
  window.MAX_PAGINAS_RESPUESTAS            // 6, o sea 6000 filas
  await window.respuestasDelPeriodoDeTodos(encuestas, ahora, frecuencia)  // { respuestas, tope }
  window.resumenDeEncuestaAdmin(ev, respuestas, ahora)
  // → { contestaron, calificadas, padron, suma, promedio, promedioContestadas }
  window.promedioSobrePadron(suma, calificadas, padron)
  window.totalDeEncuestasAdmin(filas)      // el de un grupo: pondera por padrón
  window.promedioDeClasificaciones(filas)  // el de la tarjeta: cada clasificación pesa igual
  window.textoDeRespuestasAdmin(resumen)   // «23/40 respuestas»
  window.encuestaExistiaEn(ev, referencia) // ¿existía ya en ese periodo?
  window.ritmoDelEjeDeEncuesta(ev)         // el suyo, o meses si no tiene periodos
  window.TEXTO_SIN_EXISTIR                 // «Todavía no existía»
  ```

  **Quien no contestó cuenta como cero**, que es lo que separa «cómo les fue a
  los que la hicieron» de «cómo va la empresa con esta encuesta»: con 23 de 40
  al 86%, el 86% dice que va bien algo que lleva diecisiete personas sin hacer.
  Por eso el divisor es el **padrón** y no las respuestas que llegaron, y por eso
  **la participación va pegada a la cifra en los tres renglones**: un 49% sin el
  «23/40» de al lado no dice si es media plantilla al 100 o la plantilla entera a
  la mitad. Lo que sacaron quienes sí contestaron no se pierde —va en el `title`
  del renglón—, y **el promedio de un periodo recién empezado es 0%**, que es lo
  que significa que todavía no lo ha hecho nadie; se lee bien porque al lado va
  «0/40 respuestas».

  Siete cosas que hay que mantener:

  - **El periodo es el de cada encuesta, no uno común.** Una clasificación
    mezcla frecuencias, así que el resumen de cada una se saca con
    `periodoDeEncuesta(ev, ahora)`: la mensual habla de septiembre y la semanal
    de esta semana. Es la misma regla que decide el pendiente y la que usa
    `estadoCertificacion`, así que las dos pantallas no pueden discrepar.
  - **Cuenta gente, no respuestas**, como el pase de lista: quien contestó dos
    veces cuenta una, y su puntaje es el de la **última** —promediar las dos la
    pondera el doble—.
  - **El denominador es `padronDeLaEncuesta` más quien contestó y ya no está en
    él.** El padrón sale de `leTocaEstaEncuesta` y de los empleados activos, así
    que el «de 40» no puede discrepar de lo que cada quien ve en su panel; pero
    es el de **hoy**, y las respuestas pueden ser de gente que se dio de baja o
    que cambió de puesto —y una de «única vez» cuenta las de todos los años, así
    que ahí ese desfase es lo normal—. Sumándolos sólo arriba, la pantalla decía
    **«126/95 respuestas · 104%»**. Se suman también al divisor
    (`resumen.ajenos`, `resumen.total`), que es exactamente lo que hace
    `pasoDeLista` y por lo mismo: contestó, y borrarlo del acta sería falsearla.
    Con eso la fracción no puede pasar de uno ni el promedio de 100.

    Sin las columnas de destinatarios no hay padrón, y entonces se dice sólo
    cuántas respuestas hay y se promedia lo calificado, que es lo de antes —un
    «de 0» se leería como que no le toca a nadie—.
  - **El periodo lo pone `periodoDeEncuesta`, y una de «única vez» no tiene.**
    La mensual habla de septiembre y la semanal de esta semana; la de «única
    vez» se resuelve como «alguna vez» —desde el origen del tiempo—, así que ahí
    se cuentan **todas** las respuestas que ha tenido nunca. Es lo correcto —esa
    encuesta se contesta una vez y ya— y es de donde salía el «126/95».
  - **Dentro de una clasificación se suman puntajes y padrones; no se
    promedian promedios.** Una encuesta de cuarenta personas y otra de tres no
    pesan igual, y promediar sus dos cifras las iguala. Lo hace
    `totalDeEncuestasAdmin`, que es de donde sale el pie de cada clasificación
    y el de su hoja de detalle.
  - **Pero la cifra de la empresa pesa por clasificación, no por padrón**
    (`promedioDeClasificaciones`). Ponderando también ahí, el número de la
    tarjeta acababa siendo el de la clasificación más grande disfrazado de
    número de la empresa: en abril, LÍDER 5 REGLAS se llevaba 3237 de los 3426
    del padrón —el **94%**—, así que el 65% de arriba era su 67% y AUDITORIA al
    33% y DIAGNOSIS al 29% no movían un punto. La línea salía plana en 65%
    durante seis meses sin decir nada de las otras dos, que son justo las que
    van mal. Con cada clasificación pesando igual, (33+29+67)/3 = **43%**.

    No es una incoherencia con el punto de arriba: **son dos niveles distintos**.
    Dentro de una clasificación sus encuestas miden lo mismo sobre gente
    comparable, así que el tamaño manda; entre clasificaciones, cada una es un
    programa distinto y el indicador de la empresa dice cómo va el programa
    entero, no cómo va su parte más numerosa.

    Una clasificación sin nada calificado —o que en aquel periodo todavía no
    existía— no entra en la media: su promedio es null y un cero ahí se leería
    como haberlo hecho mal en vez de no haber empezado.

    **Lo que no cambia son las cuentas de respuestas.** «2993/3426» son
    personas, y ahí cada una cuenta una vez se pondere como se pondere: ese
    trozo del renglón lo sigue dando `totalDeEncuestasAdmin`. Lo único que sale
    de la media es el porcentaje.
  - **La consulta se acota o se trae el historial de la empresa.** Va con un
    `gte` al inicio del periodo **más temprano** de las encuestas en juego, y
    pagina de mil en mil, que es el tope de PostgREST. El tope de páginas existe
    porque una encuesta anual arrastra ese `gte` hasta enero y con ella el año
    entero; quien lo alcanza **lo dice en pantalla** —«sobre las respuestas más
    recientes»— en vez de enseñar un promedio corto como si fuera el bueno.
  - **El icono es el neutro**, el círculo a rayas de
    `estadoDeEncuestaEnLista`: una palomita verde diría que el administrador
    está «al día» de algo que no le toca, y un círculo rojo, peor.
  - **El renglón de arriba va sin la palabra «activas»**, que es lo que son —las
    apagadas no se listan—: con ella, «13 encuestas activas · 128/455 respuestas
    · 100%» se parte en dos y deja el porcentaje solo en el segundo renglón.
    Medido a 375px, ése es el peor caso y sin la palabra cabe de una línea. Lo
    que decía va en el `title`, que ahí sí cabe.

  **Y debajo del resumen va la línea de cómo vamos.** El renglón dice dónde
  estamos y la gráfica, si vamos a mejor. Es la misma `graficaDeLinea` de la
  hoja de una clasificación y el mismo `historialDeRevision` que la alimenta
  ahí, con las filas de la tarjeta entera en vez de las de un grupo: así el
  último punto es, por construcción, el número que se lee encima. **No se dibuja
  si la consulta llegó al tope** —las respuestas vienen ordenadas de la más
  nueva, así que lo que se queda fuera son los periodos de atrás y la línea
  saldría subiendo desde un suelo falso—, ni con menos de dos periodos con
  resultado, que una línea de un punto no es una tendencia.

  **Y cada punto se calcula con la misma regla que el renglón** —de eso va la
  opción `porClasificacion` de `historialDeRevision`, que sólo pasa esta
  tarjeta—: el último punto **es** la cifra que se lee encima, así que si el
  renglón pesa por clasificación y la gráfica por padrón, el globo diría 43%
  sobre un renglón que dice 65%. La hoja de detalle de una clasificación la
  llama **sin** esa opción, y tiene que ser así: ahí sólo hay una clasificación
  y lo que se compara son sus encuestas entre sí.

  **El eje va en meses y a la fuerza** (`window.RITMO_GRAFICA_EMPRESA`). El
  ritmo de una clasificación lo marca su encuesta más frecuente, pero la tarjeta
  habla de las trece de la empresa a la vez y ahí ese criterio no vale: con una
  semanal dentro, el eje salía en semanas y las cuatro de un mes repetían el
  mismo dato —el `periodoDeEncuesta` de una mensual es el mes entero, se
  pregunte con la semana que se pregunte—, o sea cuatro puntos idénticos. Es el
  **tercer argumento** de `historialDeRevision`, que pasó de ser `sobrePadron` a
  un objeto de opciones (`{ sobrePadron, frecuencia }`); un `true` suelto se
  sigue leyendo como `{ sobrePadron: true }`.

  Y **la consulta tiene que cubrir lo que la gráfica enseña**:
  `respuestasDelPeriodoDeTodos` lleva su `gte` al inicio del periodo más viejo
  del eje y no al del periodo vigente, o con todas las encuestas periódicas
  `desde` sería el día 1 de este mes y la línea tendría un solo punto. Es el
  mismo `gte` acotado de `cargarRespuestasQueReviso`.

  **Y cada punto se toca para ver aquel periodo.** El renglón del resumen y los
  renglones de cada clasificación pasan a decir cuánta gente había contestado
  entonces y cómo iba la empresa; el globo del punto queda abierto como marca de
  qué se está mirando.

  ```js
  window.verPeriodoDeLaTarjeta(indice)   // null, o el último punto, vuelve a hoy
  window.cuerpoTarjetaEncuestas(filas, esAdmin, topeRespuestas)  // { resumen, bloques }
  window.periodosDeLaTarjeta  window.filasDeLaTarjeta  window.padronesDeLaTarjeta
  window.periodoElegidoTarjeta   // el índice elegido, o null
  ```

  **No consulta nada**: las respuestas de los seis periodos ya vinieron en la
  misma consulta, así que elegir un periodo es volver a preguntarle a
  `resumenDeEncuestaAdmin` con otra fecha. Y se le pasa **la `referencia` del
  propio punto** —el instante con el que se dibujó, que por eso lo devuelve
  `historialDeRevision`—, de modo que la lista dice exactamente la cifra del
  globo y no una parecida.

  **Y lo que en aquel periodo todavía no existía no vale cero.** Es la misma
  regla que la gráfica ya aplicaba a sus puntos (`encuestaExistiaEn`, extraída
  de ahí para que no haya dos), sólo que la lista no la aplicaba: repartía el
  padrón entero de una encuesta creada en julio entre gente que en abril no
  podía contestarla, así que salía en «0/9 respuestas · 0%» —que se lee como que
  la empresa lo hizo mal, no como que aquello no se preguntaba todavía— y de
  paso **las dos cifras no cuadraban**: el punto de abril se dibujaba sin esas
  encuestas y el renglón de debajo las contaba, de modo que el globo decía 65%
  encima de un resumen que decía 63%.

  Hoy esa encuesta se queda sin resumen y sin puntaje, se va al final de su
  grupo —no tiene nada que decir de aquel periodo— y **el resumen cuenta las que
  había entonces** —«9 encuestas», no las trece de hoy—, que es lo que hace que
  diga la misma cifra que el punto.

  **Y se dice desvaneciéndola, no con palabras.** Llevó un tiempo un «Todavía no
  existía» en el renglón y se quitó: gastaba el sitio donde las demás ponen su
  cifra y metía un texto largo donde el resto de la lista tiene números, así que
  se leía como el dato más importante de la tarjeta siendo el que menos dice. Es
  la clase `.sin-existir` de `estilos.css`, y va en los **tres** sitios: el
  renglón de la encuesta, el `<summary>` de su clasificación —cuando ninguna de
  las suyas existía— y su fila de la hoja de detalle.

  **No se distingue sólo por lo apagado**, que sería pedirle a la vista lo que
  esta aplicación no le pide en ningún otro sitio —es la regla del icono de
  estado, que se distingue por la forma y no sólo por el color—: al renglón le
  faltan además **los números**, y ahí queda su ritmo a secas frente al «0/9
  respuestas · 0%» de una que sí existía. El renglón de la clasificación dice
  **cuántas encuestas tiene** —lo único suyo que no depende del periodo; «0
  respuestas», que es lo que daría `totalDeEncuestasAdmin` sin filas que sumar,
  diría que nadie contestó algo que no se había creado—. Y lo que pasó se dice
  con todas las letras en el `title`, que es donde esta tarjeta pone siempre lo
  que no cabe en un renglón: de eso sigue viviendo `TEXTO_SIN_EXISTIR`.

  **Se compara contra el instante que se mira, que es el fin del periodo que se
  dibuja**: una creada a mitad de agosto existió en agosto, aunque no el día 1.
  Es además el mismo tope con el que `resumenDeEncuestaAdmin` le cuenta las
  respuestas —nada de lo enviado después de esa fecha—, así que las dos mitades
  miran lo mismo: si no se le cuenta ninguna respuesta posterior, tampoco se le
  puede cobrar el padrón de antes de existir.

  **Y el periodo que manda es el del eje, no el de la encuesta.** Esto miraba el
  fin del periodo *de la encuesta* (`periodoDeEncuesta`), y con eso el tope se
  iba más allá del punto que se estaba dibujando en cuanto la encuesta era más
  lenta que el eje. El eje de la tarjeta va en meses a la fuerza, así que al
  preguntarle por agosto a una **semanal** el fin era el domingo 7 de septiembre
  y a una **anual**, el 1 de enero siguiente: una que empieza el 1 de septiembre
  seguía saliendo en agosto con su «0/64 respuestas · 0%», y con ella el punto de
  la gráfica. Sólo cuadraba cuando encuesta y eje iban al mismo ritmo, que es por
  qué pasó desapercibido: las mensuales salían bien.

  El instante que se mira ya **es** el fin del periodo dibujado —lo pasan así los
  dos que preguntan—, de modo que no hay nada que calcular: `alta <= referencia`
  y se acabó. Lo de «única vez» —que no tiene fin de periodo y por eso caía en
  esa rama ya entonces— resultó ser la regla de todas.

  Sin fecha de alta se cuenta. Y un 0% de una encuesta que sí existía se queda
  como está: ahí el cero significa que no la contestó nadie, que es justo lo que
  hay que ver.

  **Y el alta no es la última palabra.** Desde cuándo cuenta la encuesta lo dice
  `window.inicioDeEncuesta`, que prefiere la fecha escrita a mano en «Aplica
  desde» —la copia de una auditoría nace hoy aunque la auditoría lleve un año, y
  sin corregirlo se desvanece en todos los periodos de atrás—. Se cuenta más
  arriba, con las trampas de `active`.

  Seis cosas que hay que mantener:

  - **La tarjeta no se entera sola de lo que se escribe desde la hoja de una
    encuesta.** `cargarEncuestasAsignadas` sólo corre desde `mostrarDashboard`, y
    cerrar la hoja se limita a esconderla: se cambiaba el título, la
    clasificación, «Activa» o la fecha desde la que aplica, se volvía al inicio y
    todo seguía diciendo lo de antes —y al tocar un punto de la gráfica, que no
    consulta nada, lo de antes otra vez— hasta la siguiente recarga. Guardar una
    encuesta, corregir a quién va dirigida y eliminarla llaman hoy a
    **`window.refrescarTarjetaDeEncuestas()`**, que la rehace con lo que hay en la
    base y devuelve el periodo elegido a hoy. Toda escritura nueva sobre
    `evaluations` tiene que llamarla, como llama a `invalidarCacheDashboard`.
  - **El cuerpo de la tarjeta vive fuera de `cargarEncuestasAsignadas`**
    (`cuerpoTarjetaEncuestas`) porque se repinta sin volver a cargar nada, y
    **sólo se repintan el resumen y los bloques** —de ahí sus dos ids—: la
    gráfica es la misma para todos los periodos y redibujarla borraría la marca
    del punto que se acaba de tocar.
  - **El último punto es el periodo que corre**, así que elegirlo es volver a
    hoy: no hay dos maneras de estar al día.
  - **El globo se fuerza abierto**, no se alterna (`marcarPuntoGrafica(nodo,
    siempre)`): aquí no es un detalle que se abre y se cierra sino la marca de
    qué se está mirando, y cerrarlo dejando la lista en junio sería peor que no
    marcarlo. Quién elige lo dice el segundo argumento de `graficaDeLinea`
    (`alElegir`, el nombre de la función); sin él —las gráficas de una
    clasificación— tocar un punto sólo abre su globo, como siempre.
  - **El periodo elegido va en su propio renglón, encima del resumen**, con el
    botón «Hoy». Medido a 375px, «jun 2026 · 13 encuestas · 3350/3587 respuestas
    · 73%» con el botón detrás se parte en dos **siempre**, no sólo en el peor
    caso, y ahí el periodo y su cifra acaban en líneas distintas. Aparte se lee
    además como lo que es: un aviso de que no se está mirando hoy.
  - **Se reescribe sobre las mismas filas** que guarda `clasificacionesAsignadas`,
    así que la hoja de detalle —que las lee al abrirse— habla del mismo periodo
    que la lista. Por lo mismo, `cuerpoDetalleClasificacion` toma su titular del
    punto elegido y no del último: un titular de septiembre encima de unas filas
    de junio es peor que no tener titular. El eje de su gráfica sigue enseñando
    los seis, que es lo que es.

  Dos topes que hacen falta y no son evidentes:

  - **Nada de lo enviado después del instante que se mira.** Con `ahora` en el
    presente no quita nada, pero la gráfica pregunta por periodos de atrás y una
    encuesta de «única vez» **no tiene `fin`**: sin ese tope, su punto de abril
    incluía lo contestado en septiembre y los seis periodos salían iguales. En
    un proyecto donde casi todas las respuestas son de encuestas de «única vez»
    eso es una línea plana en la cifra de hoy; con él, cada punto trae sólo lo
    contestado hasta entonces y la línea sube según la va contestando la gente,
    que es lo que se quiere ver.
  - **El periodo que corre se pregunta con la hora de ahora**, no con su último
    instante, que todavía no ha llegado. Sólo importa cuando el eje va más
    grueso que alguna encuesta: preguntándole a una semanal por el 30 de
    septiembre, su periodo es la semana del 28 —que aún no empieza— y su punto
    salía vacío, de modo que el último punto de la línea no coincidía con el
    renglón de encima.

  **Y la hoja de detalle mide igual, o las dos pantallas darían cifras distintas
  del mismo periodo.** `cuerpoDetalleClasificacion` escoge `historialDeRevision`
  cuando el modo está encendido —en vez de `historialDeClasificacion`, que toma
  una respuesta por periodo y enseñaría la de una persona cualquiera como el
  resultado de la empresa— y le pasa `{ sobrePadron: true }`, que reparte cada
  periodo entre toda la gente a la que le tocaba; el eje ahí **sí** sale de su
  encuesta más frecuente, que es la que marca su ritmo de revisión. La tarjeta
  de revisión lo sigue llamando **sin** opciones: ahí se habla de la gente a la
  que uno califica y el padrón es otra pregunta.

  Tres cosas de esa gráfica:

  - **Cada periodo pasa por `resumenDeEncuestaAdmin`**, la misma función que la
    tarjeta y la hoja de una encuesta, con el padrón ya calculado en su cuarto
    argumento —`padronDeLaEncuesta` recorre la plantilla entera y aquí se
    preguntaría doce veces por encuesta—. Calcularlo aquí aparte es lo que
    dejaría el punto del periodo que corre discrepando del número que se lee
    arriba: así cuenta gente y no respuestas y suma los ajenos al divisor sin
    tener que acordarse de hacerlo. De ahí salen `total` —que sin `sobrePadron`
    son respuestas entregadas y con él, gente que contestó— y `divisor`.
  - **Una encuesta que todavía no existía no vale cero en aquel periodo.** Sin
    la guarda de `created_at`, una creada hace tres meses dibujaría nueve puntos
    clavados en el 0 antes de su primer resultado. Un periodo que se queda sin
    divisor no tiene promedio y la gráfica se lo salta, que es lo que ya hacía
    cuando no había nada calificado.
  - **El padrón es el de hoy también para los periodos de atrás**, que es lo
    único que sabe `padronDeLaEncuesta`: quien se dio de baja desde entonces
    entra como ajeno en su propio periodo en vez de como destinatario.

- **El panel del usuario se pliega, y de entrada está contraído.** Contraído
  se ve sólo quién es —la foto y el nombre—, que es lo que se mira de pasada; el
  radar sale al tocar la tarjeta. En un
  iPhone 12 mini esa tarjeta medía 413px abiertos contra 128 cerrados, media
  pantalla del panel todos los días para algo que se consulta de vez en cuando
  y que empujaba abajo los pendientes y los accesos directos, que es a lo que
  se entra.

  ```js
  window.panelUsuarioAbierto()        // lo que dejó elegido quien lo usa
  window.aplicarPanelUsuario(abierto) // pone la clase y el rótulo de la flecha
  window.alternarPanelUsuario()       // lo que llaman la tarjeta y la flecha
  ```

  Lo contrae la clase `esta-contraido` en `#main-user-header`, que esconde
  `.panel-usuario-detalle` —el radar— y quita el hueco de debajo del nombre; la flecha de `.panel-usuario-chevron` gira al abrirse. El
  estado se recuerda en `localStorage.panelUsuarioAbierto`: a quien le guste
  ver su radar no tiene que abrirlo en cada recarga, y con el botón de
  actualizar del encabezado recargar es cosa de todos los días. Un navegador
  que no deje escribir ahí se comporta como contraído, que es el estado de
  entrada.

  **Chart mide el lienzo al dibujarlo, y contraído mide cero.** El radar se
  crea al cargar el panel aunque esté plegado, así que nace con 0×0 y al abrirse
  habría salido en blanco.
  Por eso `aplicarPanelUsuario` le pide un `resize()` a
  `window.dashboardRadarInstance` cuando abre. Cualquier gráfica nueva que se
  meta ahí dentro necesita lo mismo.

  **La fila entera abre y cierra, así que lo que tenga acción propia corta la
  propagación**: la foto (`event.stopPropagation()` antes de
  `abrirStatsEmpleado`) y la propia flecha, que si no alternaría dos veces y se
  quedaría como estaba. Y **el esqueleto se pliega igual** que el panel de
  verdad —los dos llaman a `aplicarPanelUsuario` después de escribir su
  `innerHTML`—, o la tarjeta se abriría sola durante la carga para cerrarse de
  golpe al llegar los datos.

- **Un selector por atributo `style` se rompe en cuanto se toca ese estilo.**
  `setGrade` buscaba la tarjeta de la pregunta con
  `closest('div[style*="border-radius:16px"]')` y le pintaba el borde. Al
  escribir `borderColor`, el navegador reescribe el atributo entero con su
  formato —`border-radius: 16px`, con espacio—, así que el selector dejaba de
  casar: la primera calificación funcionaba y de la segunda en adelante
  `closest` devolvía null y el `TypeError` abortaba el resto de la función sin
  aviso, dejando la insignia de la pregunta sin actualizar. Se busca por clase
  (`.pregunta-detalle`), y con guarda.
- **Un envoltorio que no devuelve la promesa del original rompe a quien la
  espera, y sólo a veces.** `6-calendario.js` envuelve tres funciones
  (`cargarVistaEvaluaciones`, `cancelarRespuesta`, `mostrarDashboard`) para
  desviarlas cuando se viene del calendario. El de `cargarVistaEvaluaciones`
  llamaba al original **sin devolver lo que devuelve**, así que quien hacía
  `await window.cargarVistaEvaluaciones()` seguía de largo con la lista aún sin
  dibujar.

  Se notaba en `window.abrirEncuestaDesdeInicio`, que monta la lista y **encima**
  pinta el detalle de una encuesta: el detalle se pintaba primero y la lista
  aterrizaba después, encima, de modo que tocar una encuesta desde el panel
  abría **la lista con el título de la encuesta en el encabezado**. Es una
  carrera, así que no fallaba siempre —con `evalCache` caliente la lista llega
  antes y gana el detalle—, y eso es lo que lo hacía parecer cosa de la pantalla
  y no del envoltorio. Se reprodujo poniéndole 250 ms de retraso a las consultas
  del cliente simulado.

  Todo envoltorio de una función `async` **devuelve lo que devuelve la
  original**, también en sus ramas propias —ahí, `Promise.resolve()`—. El de
  `mostrarDashboard` ya lo hacía (es `async` y hace `await`); el de
  `cancelarRespuesta` envuelve una función síncrona y nadie la espera.

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
