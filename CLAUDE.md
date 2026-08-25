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
- **Una pregunta con opciones pide además el porqué.** Marcar una casilla no
  dice por qué se marcó, y en una encuesta de seguridad eso es justo lo que hay
  que saber: «no» a secas y «no, porque la máquina estaba en paro» son
  hallazgos distintos. Los tipos de `window.PREGUNTAS_CON_MOTIVO` —hoy
  `multiple`, `checklist` y `range`— llevan un campo de texto obligatorio
  debajo de las opciones, y `enviarRespuestasEval` no deja enviar sin él. Fuera
  quedan `text` —que ya es texto libre— y `list_match`, que es una lista de
  elementos y no una elección.

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
- **No toda encuesta se certifica.** La columna `requires_certification`
  decide si cuenta para certificar su clasificación; nula o `true` significa
  que sí, para que lo que ya existe se comporte igual. Una que dice que no
  desaparece del resumen entero: no suma al total, no sale como pendiente y no
  impide que el resto se dé por certificado. Sus respuestas se siguen
  contestando, calificando y contando en las estadísticas.

  ```js
  window.requiereCertificacion(ev)   // en 1-config.js
  ```

  El filtro se aplica en un solo sitio —la lista con la que arranca
  `estadoCertificacion`—, así que lo heredan el badge del usuario, el
  expediente y la pantalla de certificar por clasificación sin tocar ninguno.
  Lo que sí hay que recordar es traerse la columna: las dos pantallas del
  administrador piden columnas por nombre y usan
  `window.camposConCertificacion(campos)`.

  El script es `sql/certificacion-por-encuesta.sql`. Sin correrlo, todas las
  encuestas se consideran certificables —como hasta ahora— y la casilla se
  queda marcada y apagada avisando de qué falta.
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
  días`) y el encabezado señala al peor del nivel
  (`window.extremoDelCriterio`), que en falsas y mal revisadas es el de más y
  en los demás el de menos.

  Casi todos los criterios miden **sobre las asignadas**, que es lo que hace
  comparables las barras y los cuadros entre sí. Las dos excepciones son
  calificación, que ya viene en porcentaje, y **avance de revisión**, que se
  mide sobre las **contestadas**: dice qué parte de lo que ya entregaron lleva
  calificada quien revisa, y meter en el denominador una encuesta que nadie
  contestó volvería a medir participación en lugar del trabajo del revisor.
  Su cifra son las dos cosas —`60% · 12/20`—, porque un porcentaje sobre
  cuatro respuestas no dice lo mismo que sobre cuarenta. Quien no tiene ni una
  respuesta dice «sin contestar» y **queda fuera del renglón del peor**: no
  hay revisión atrasada que reprocharle. Lo que cuenta como revisado es
  cualquier veredicto —revisada, certificada, falsa o mal revisada—, que es lo
  que reúne `window.procesadasDe(fila)`.

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

  Una sección que crece con el catálogo no se apila: va en `.stats-carrusel`,
  una fila que se arrastra con el dedo y engancha las tarjetas de una en una.
  El último elemento se recorta a propósito —asomar el siguiente es lo único
  que avisa de que hay más— y las tarjetas no se estiran entre sí. Lo que
  llevan dentro va plegado con `<details class="stats-plegable">`, que guarda
  su estado solo y no necesita ninguna función colgada de `window`; abierta,
  la lista se desplaza dentro de su tarjeta (`.stats-plegable-cuerpo`, tope de
  260px) en vez de estirar la fila. Así es la comparativa por áreas, que con
  todo el personal desplegado se llevaba nueve mil píxeles de la pantalla.
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
