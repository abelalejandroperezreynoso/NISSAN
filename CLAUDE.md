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
| `11-mapa-activos.html` | Mapa de activos |
| `estilos.css` | Estilos compartidos |

Las pantallas independientes (`10-refacciones.html`, `11-mapa-activos.html`)
cargan `1-config.js` por su cuenta y llevan su propio `<script>` inline.

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
- **Safe area del iPhone.** Las páginas llevan `viewport-fit=cover` en el meta
  viewport para que fondos y overlays lleguen al borde físico de la pantalla.
  Como contrapartida, el contenido debe apartarse de la barra de estado y del
  indicador de inicio con `env(safe-area-inset-*)`; las reglas viven al final
  de `estilos.css`. Si se añade una pantalla nueva a pantalla completa, hay
  que darle ese padding o su encabezado quedará bajo el reloj.
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
