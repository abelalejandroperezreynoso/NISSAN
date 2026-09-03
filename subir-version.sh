#!/usr/bin/env bash
# Sube la versión de la aplicación.
#
# No es un paso de compilación: los archivos se siguen sirviendo tal cual y se
# editan a mano como siempre. Lo único que hace esto es cambiar la versión en
# los cuatro sitios donde vive, que es justo lo que se olvida:
#
#   - version.json            lo que el navegador pregunta con `no-store`
#   - 1-config.js             window.VERSION_APP, lo que el dispositivo cree ser
#   - las tres pantallas      el `?v=` de cada `.js` y `.css` propio
#
# Si las dos primeras no coinciden, la aplicación avisa de una versión nueva
# que ya tiene y no deja contestar encuestas; si falta el `?v=`, el navegador
# puede servir el JavaScript viejo aunque el HTML sea nuevo. Van juntas.
#
# Uso:  ./subir-version.sh            # AAAA-MM-DD-N, con N según lo que haya
#       ./subir-version.sh 2026-09-04-2
set -eu

cd "$(dirname "$0")"

PAGINAS=(index.html 10-refacciones.html 11-mapa-activos.html)

# Sin anclar el final: `1-config.js` va con saltos de línea de Windows y el
# `\r` se quedaría dentro de la versión.
actual=$(sed -n "s/^window\.VERSION_APP = '\([^']*\)';.*/\1/p" 1-config.js)

if [ $# -ge 1 ]; then
    nueva="$1"
else
    hoy=$(date +%Y-%m-%d)
    n=1
    case "$actual" in
        "$hoy"-*) n=$(( ${actual##*-} + 1 )) ;;
    esac
    nueva="$hoy-$n"
fi

printf '{\n    "version": "%s"\n}\n' "$nueva" > version.json

sed -i "s/^\(window\.VERSION_APP = \)'[^']*';/\1'$nueva';/" 1-config.js

# Sólo los archivos propios: los de un CDN llevan `:` y `/` en la ruta y el
# patrón los deja fuera a propósito.
for pagina in "${PAGINAS[@]}"; do
    sed -i -E "s@(src|href)=\"([^\":/?]*\.(js|css))(\?v=[^\"]*)?\"@\1=\"\2?v=$nueva\"@g" "$pagina"
done

echo "Versión: ${actual:-(ninguna)} → $nueva"
echo "Falta hacer commit y desplegar los archivos juntos."
