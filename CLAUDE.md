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
| `11-mapa-activos.html` | Mapa de activos: treemap de refacciones por planta → línea → equipo |
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
  escritura y contar las filas que devuelve, que es lo que hace la unión de
  altas repetidas del mapa de activos. Las políticas van por operación, así
  que una tabla puede dejar actualizar y no borrar.
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
