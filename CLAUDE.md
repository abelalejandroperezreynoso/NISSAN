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

  Queda a pantalla completa, y a propósito, sólo el visor de imágenes
  (`#modal-visor`).

  Un observador en `1-config.js` marca `<html>` con la clase `modal-abierto`
  mientras haya algún overlay visible (id que empiece por `modal-` y
  `position:fixed`). Ya no sirve para atenuar nada —las hojas no atenúan—,
  pero sigue disponible si una pantalla necesita teñir esa franja: es lo que
  hace `10-refacciones.html`, cuyo fondo no es el del panel principal.
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
  esa caché, deja que el helper los consulte. El modo administrador es aparte y
  viaja en `sessionStorage.adminSostenido`, así que sigue valiendo al pasar de
  una pantalla a la otra.
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

  Todos los desgloses ordenan con `window.valorDeCriterio(fila)`, que mide la
  fila venga de la caché por departamento, por puesto o de las filas por
  colaborador —esas pasan por `window.filaCanonica()`, que traduce sus nombres
  de campo—. Antes cada uno de los cinco niveles repetía la misma cadena de
  ifs y añadir un criterio obligaba a tocar las cinco.

  El criterio antes era una leyenda de colores clicable que sólo ordenaba las
  barras. Ahora es un conmutador más y **manda también en los cuadros**: cada
  criterio de `CRITERIOS_STATS` trae su color y su `valor(fila)`, que es la
  proporción con la que se llena el cuadro. Participación conserva su segunda
  banda —contestado y, encima, lo ya revisado—; los demás criterios son una
  sola cosa y una sola banda. Un treemap coloca por tamaño y no por medida, así
  que con valores parecidos los rellenos se ven iguales y no hay forma de ver
  quién va peor: para eso cada cuadro lleva su puesto en la tabla (`#3 · 6.5
  días`) y el encabezado señala al peor del nivel
  (`window.extremoDelCriterio`), que en falsas y mal revisadas es el de más y
  en los demás el de menos.

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
