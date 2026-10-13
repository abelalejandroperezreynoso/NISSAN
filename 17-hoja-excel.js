// ==========================================
// MATERIAL DESDE UN EXCEL
// ==========================================
// Un libro de Excel se convierte en imágenes como un PDF o una presentación,
// y por el mismo embudo (`paginasDeArchivo`, en 1-config.js). Lo que cambia es
// que aquí **no hay librería que lo dibuje**: SheetJS lee los valores pero no
// las fotos ni las figuras, y el material típico de esta planta —el reporte
// FR1 de un incidente— es justamente fotos, círculos y cruces encima de una
// rejilla de celdas combinadas. Por eso el dibujo es nuestro: se lee el XML del
// libro y se pinta en un lienzo.
//
// De SheetJS se usan sólo dos cosas: `CFB`, que abre el zip, y `SSF`, que
// formatea un número con su formato de Excel. Es la misma librería que ya pide
// la descarga del Excel de una respuesta, así que no se carga nada nuevo.
//
// Lo que se dibuja:
//   - Las celdas con su valor formateado, su fuente, su relleno, sus bordes,
//     su alineación y su ajuste de texto, y las combinadas como una sola.
//   - Las imágenes insertadas, con su recorte.
//   - Las figuras: rectángulos, redondeados, elipses, anillos, cruces y
//     líneas, con su relleno, su contorno y su texto. Una figura que no se
//     conoce se dibuja como su rectángulo, que es preferible a perderla.
//
// Lo que no: gráficos, formato condicional, comentarios y figuras dentro de un
// grupo rotado. Por eso lo convertido se enseña antes de guardarlo, como el de
// una presentación, y el aviso dice que el camino exacto es exportar a PDF.
//
// La hoja se corta en páginas de proporción de hoja carta en vertical, por
// los bordes de fila y sin partir una foto por la mitad si se puede evitar:
// una hoja de Excel no tiene páginas, y entera saldría tan alargada que al
// encogerla a 1400 px de alto no se leería nada.

window.LIBRERIAS_CONVERSION.hoja = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

// Una página no pasa de este alto por cada unidad de ancho (≈ carta vertical).
window.PROPORCION_PAGINA_EXCEL = 1.35;

(() => {
    const EMU_POR_PX = 9525;
    const PX_POR_PT = 96 / 72;

    // --- El zip ---------------------------------------------------------------
    const leerArchivo = (cfb, ruta) => {
        const limpia = String(ruta).replace(/^\/+/, '');
        const e = window.XLSX.CFB.find(cfb, '/' + limpia) || window.XLSX.CFB.find(cfb, limpia);
        return e && e.content ? e.content : null;
    };
    const texto = (cfb, ruta) => {
        const c = leerArchivo(cfb, ruta);
        return c ? new TextDecoder('utf-8').decode(c) : null;
    };
    const xml = (cfb, ruta) => {
        const t = texto(cfb, ruta);
        return t ? new DOMParser().parseFromString(t, 'application/xml') : null;
    };
    // Los hijos con ese nombre local, sin mirar el prefijo: cada libro usa los
    // suyos y `getElementsByTagName` con prefijo no casa con todos.
    const hijos = (nodo, nombre) => nodo ? Array.from(nodo.children).filter(n => n.localName === nombre) : [];
    const hijo = (nodo, nombre) => hijos(nodo, nombre)[0] || null;
    const todos = (nodo, nombre) => nodo ? Array.from(nodo.getElementsByTagNameNS('*', nombre)) : [];
    const rId = (n) => n && (n.getAttribute('r:id') || n.getAttribute('r:embed') ||
        n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
        n.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed'));

    const resolverRuta = (base, destino) => {
        if (destino.startsWith('/')) return destino.slice(1);
        const partes = base.split('/'); partes.pop();
        destino.split('/').forEach(p => {
            if (p === '..') partes.pop();
            else if (p && p !== '.') partes.push(p);
        });
        return partes.join('/');
    };
    const relaciones = (cfb, ruta) => {
        const partes = ruta.split('/');
        const nombre = partes.pop();
        const doc = xml(cfb, [...partes, '_rels', nombre + '.rels'].join('/'));
        const mapa = {};
        todos(doc, 'Relationship').forEach(r => {
            if (r.getAttribute('TargetMode') === 'External') return;
            mapa[r.getAttribute('Id')] = resolverRuta(ruta, r.getAttribute('Target'));
        });
        return mapa;
    };

    // --- Colores --------------------------------------------------------------
    const INDEXADOS = ['000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF',
        '000000','FFFFFF','FF0000','00FF00','0000FF','FFFF00','FF00FF','00FFFF','800000','008000',
        '000080','808000','800080','008080','C0C0C0','808080','9999FF','993366','FFFFCC','CCFFFF',
        '660066','FF8080','0066CC','CCCCFF','000080','FF00FF','FFFF00','00FFFF','800080','800000',
        '008080','0000FF','00CCFF','CCFFFF','CCFFCC','FFFF99','99CCFF','FF99CC','CC99FF','FFCC99',
        '3366FF','33CCCC','99CC00','FFCC00','FF9900','FF6600','666699','969696','003366','339966',
        '003300','333300','993300','993366','333399','333333'];

    const aRgb = (hex) => [0, 2, 4].map(i => parseInt(hex.substr(i, 2), 16));
    const aHex = (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const aHsl = ([r, g, b]) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
        if (max === min) return [0, 0, l];
        const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return [h / 6, s, l];
    };
    const deHsl = ([h, s, l]) => {
        if (s === 0) return [l * 255, l * 255, l * 255];
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        const f = (t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
    };
    // El `tint` de una celda: hacia el blanco si es positivo, hacia el negro si
    // es negativo, sobre la luminosidad, que es como lo hace Excel.
    const conTinte = (hex, tinte) => {
        if (!tinte) return '#' + hex;
        const [h, s, l] = aHsl(aRgb(hex));
        const l2 = tinte < 0 ? l * (1 + tinte) : l * (1 - tinte) + tinte;
        return aHex(deHsl([h, s, l2]));
    };

    // --- El libro -------------------------------------------------------------
    const leerTema = (cfb, rutaTema) => {
        const doc = rutaTema ? xml(cfb, rutaTema) : null;
        const esquema = todos(doc, 'clrScheme')[0];
        const color = (nombre) => {
            const n = esquema && hijo(esquema, nombre);
            const c = n && n.firstElementChild;
            if (!c) return null;
            return (c.getAttribute('lastClr') || c.getAttribute('val') || '').toUpperCase() || null;
        };
        const nombres = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
        const porNombre = {};
        nombres.forEach(n => porNombre[n] = color(n));
        porNombre.dk1 = porNombre.dk1 || '000000';
        porNombre.lt1 = porNombre.lt1 || 'FFFFFF';
        const fuente = (tipo) => {
            const f = todos(doc, tipo)[0];
            const latin = f && hijo(f, 'latin');
            return latin ? latin.getAttribute('typeface') : '';
        };
        return {
            porNombre,
            // En las celdas, el índice 0 es el claro y el 1 el oscuro: al revés
            // que en el esquema.
            porIndice: [porNombre.lt1, porNombre.dk1, porNombre.lt2, porNombre.dk2,
                porNombre.accent1, porNombre.accent2, porNombre.accent3, porNombre.accent4,
                porNombre.accent5, porNombre.accent6, porNombre.hlink, porNombre.folHlink],
            fuenteMayor: fuente('majorFont'),
            fuenteMenor: fuente('minorFont')
        };
    };

    const colorDeCelda = (nodo, tema) => {
        if (!nodo) return null;
        if (nodo.getAttribute('auto') === '1') return null;
        const tinte = parseFloat(nodo.getAttribute('tint') || '0');
        const rgb = nodo.getAttribute('rgb');
        if (rgb) {
            if (rgb.length === 8 && rgb.startsWith('00') && rgb !== '00000000') return conTinte(rgb.slice(2), tinte);
            return conTinte(rgb.slice(-6), tinte);
        }
        if (nodo.hasAttribute('theme')) {
            const hex = tema.porIndice[parseInt(nodo.getAttribute('theme'), 10)];
            return hex ? conTinte(hex, tinte) : null;
        }
        if (nodo.hasAttribute('indexed')) {
            const i = parseInt(nodo.getAttribute('indexed'), 10);
            if (i === 64 || i === 65) return null;
            return INDEXADOS[i] ? conTinte(INDEXADOS[i], tinte) : null;
        }
        return null;
    };

    const leerEstilos = (cfb, ruta, tema) => {
        const doc = ruta ? xml(cfb, ruta) : null;
        const formatos = {};
        todos(doc, 'numFmt').forEach(n => formatos[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'));

        const fuentes = hijos(todos(doc, 'fonts')[0], 'font').map(f => {
            const val = (n) => { const h = hijo(f, n); return h ? (h.getAttribute('val') ?? '') : null; };
            return {
                tam: parseFloat(val('sz')) || 11,
                nombre: val('name') || 'Calibri',
                negrita: val('b') !== null && val('b') !== '0' && val('b') !== 'false',
                cursiva: val('i') !== null && val('i') !== '0' && val('i') !== 'false',
                subrayado: val('u') !== null && val('u') !== 'none',
                tachado: val('strike') !== null && val('strike') !== '0',
                color: colorDeCelda(hijo(f, 'color'), tema)
            };
        });

        const rellenos = hijos(todos(doc, 'fills')[0], 'fill').map(f => {
            const p = hijo(f, 'patternFill');
            if (p) {
                const tipo = p.getAttribute('patternType');
                if (!tipo || tipo === 'none') return null;
                // Un patrón que no es sólido se dibuja con su color de fondo
                // de patrón: es lo que más se le parece sin dibujar la trama.
                return colorDeCelda(hijo(p, 'fgColor'), tema) || colorDeCelda(hijo(p, 'bgColor'), tema);
            }
            const g = hijo(f, 'gradientFill');
            const stop = g && todos(g, 'stop')[0];
            return stop ? colorDeCelda(hijo(stop, 'color'), tema) : null;
        });

        const bordes = hijos(todos(doc, 'borders')[0], 'border').map(b => {
            const lado = (n) => {
                const l = hijo(b, n);
                const estilo = l && l.getAttribute('style');
                if (!estilo || estilo === 'none') return null;
                return { estilo, color: colorDeCelda(hijo(l, 'color'), tema) || '#000000' };
            };
            return { izq: lado('left') || lado('start'), der: lado('right') || lado('end'), arr: lado('top'), aba: lado('bottom') };
        });

        const xfs = hijos(todos(doc, 'cellXfs')[0], 'xf').map(x => {
            const a = hijo(x, 'alignment');
            return {
                numFmt: x.getAttribute('numFmtId') || '0',
                fuente: parseInt(x.getAttribute('fontId') || '0', 10),
                relleno: parseInt(x.getAttribute('fillId') || '0', 10),
                borde: parseInt(x.getAttribute('borderId') || '0', 10),
                horizontal: a ? (a.getAttribute('horizontal') || 'general') : 'general',
                vertical: a ? (a.getAttribute('vertical') || 'bottom') : 'bottom',
                ajustar: a ? a.getAttribute('wrapText') === '1' || a.getAttribute('wrapText') === 'true' : false,
                giro: a ? parseInt(a.getAttribute('textRotation') || '0', 10) : 0,
                sangria: a ? parseInt(a.getAttribute('indent') || '0', 10) : 0
            };
        });

        return { formatos, fuentes, rellenos, bordes, xfs };
    };

    const leerCadenas = (cfb, ruta) => {
        const doc = ruta ? xml(cfb, ruta) : null;
        return hijos(doc && doc.documentElement, 'si').map(si => todos(si, 't')
            .filter(t => t.parentNode.localName !== 'rPh')
            .map(t => t.textContent).join(''));
    };

    // --- Referencias ----------------------------------------------------------
    const colDeLetras = (letras) => {
        let n = 0;
        for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
        return n - 1;
    };
    const celdaDeRef = (ref) => {
        const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(String(ref).toUpperCase());
        return m ? { c: colDeLetras(m[1]), r: parseInt(m[2], 10) - 1 } : null;
    };

    // --- Formato de un valor --------------------------------------------------
    // Los formatos de fecha que Excel trae de serie salen en inglés de SheetJS
    // («12/9/25»); aquí se dicen como se leen en esta planta.
    const FORMATOS_LOCALES = { 14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 22: 'dd/mm/yyyy hh:mm' };
    const formatear = (valor, xf, estilos) => {
        if (typeof valor !== 'number') return String(valor);
        const id = parseInt(xf ? xf.numFmt : '0', 10);
        const formato = FORMATOS_LOCALES[id] || estilos.formatos[id] || id;
        try {
            const s = window.XLSX.SSF.format(formato, valor);
            return s === undefined || s === null ? String(valor) : String(s);
        } catch (e) {
            return String(Math.round(valor * 1e10) / 1e10);
        }
    };

    // --- Una hoja -------------------------------------------------------------
    const leerHoja = (cfb, ruta, libro) => {
        const doc = xml(cfb, ruta);
        if (!doc) return null;
        const raiz = doc.documentElement;
        const formato = todos(raiz, 'sheetFormatPr')[0];
        const anchoBase = formato && formato.getAttribute('defaultColWidth')
            ? parseFloat(formato.getAttribute('defaultColWidth'))
            : (formato && formato.getAttribute('baseColWidth') ? parseFloat(formato.getAttribute('baseColWidth')) + 0.71 : 8.43);
        const altoBase = formato && formato.getAttribute('defaultRowHeight') ? parseFloat(formato.getAttribute('defaultRowHeight')) : 15;

        // Ancho en caracteres a píxeles: el ancho del dígito de la fuente
        // normal, que para Arial 10 y Calibri 11 son 7 px.
        const pxDeAncho = (w) => Math.max(0, Math.round(w * 7));
        const columnas = {};
        todos(raiz, 'col').forEach(c => {
            const min = parseInt(c.getAttribute('min'), 10) - 1, max = parseInt(c.getAttribute('max'), 10) - 1;
            const oculta = c.getAttribute('hidden') === '1' || c.getAttribute('hidden') === 'true';
            const w = c.hasAttribute('width') ? parseFloat(c.getAttribute('width')) : anchoBase;
            for (let i = min; i <= Math.min(max, 16383); i++) columnas[i] = oculta ? 0 : pxDeAncho(w);
        });
        const anchoCol = (i) => (i in columnas ? columnas[i] : pxDeAncho(anchoBase));

        const filas = {};
        const celdas = [];
        todos(raiz, 'row').forEach(f => {
            const r = parseInt(f.getAttribute('r'), 10) - 1;
            const oculta = f.getAttribute('hidden') === '1' || f.getAttribute('hidden') === 'true';
            if (oculta) filas[r] = 0;
            else if (f.hasAttribute('ht')) filas[r] = parseFloat(f.getAttribute('ht')) * PX_POR_PT;
            let col = -1;
            hijos(f, 'c').forEach(c => {
                const pos = c.getAttribute('r') ? celdaDeRef(c.getAttribute('r')) : { c: col + 1, r };
                col = pos.c;
                const s = parseInt(c.getAttribute('s') || f.getAttribute('s') || '0', 10);
                const t = c.getAttribute('t') || 'n';
                const v = hijo(c, 'v');
                let valor = null;
                if (t === 's' && v) valor = libro.cadenas[parseInt(v.textContent, 10)] ?? '';
                else if (t === 'inlineStr') valor = todos(c, 't').map(x => x.textContent).join('');
                else if (t === 'b' && v) valor = v.textContent === '1' ? 'VERDADERO' : 'FALSO';
                else if ((t === 'str' || t === 'e') && v) valor = v.textContent;
                else if (v && v.textContent !== '') valor = parseFloat(v.textContent);
                celdas.push({ c: pos.c, r: pos.r, s, valor });
            });
        });
        const altoFila = (i) => (i in filas ? filas[i] : altoBase * PX_POR_PT);

        const combinadas = todos(raiz, 'mergeCell').map(m => {
            const [a, b] = m.getAttribute('ref').split(':');
            const ca = celdaDeRef(a), cb = celdaDeRef(b || a);
            return ca && cb ? { c1: ca.c, r1: ca.r, c2: cb.c, r2: cb.r } : null;
        }).filter(Boolean);

        const nodoDibujo = todos(raiz, 'drawing')[0];
        const rels = relaciones(cfb, ruta);
        const rutaDibujo = nodoDibujo ? rels[rId(nodoDibujo)] : null;

        return { ruta, anchoCol, altoFila, celdas, combinadas, rutaDibujo };
    };

    // --- Las figuras ----------------------------------------------------------
    const colorDeDibujo = (nodo, tema) => {
        if (!nodo) return null;
        const c = Array.from(nodo.children).find(n =>
            ['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr'].includes(n.localName));
        if (!c) return null;
        let hex = null;
        if (c.localName === 'srgbClr') hex = c.getAttribute('val');
        else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (c.getAttribute('val') === 'window' ? 'FFFFFF' : '000000');
        else if (c.localName === 'schemeClr') {
            const v = c.getAttribute('val');
            const alias = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2', phClr: 'accent1' };
            hex = tema.porNombre[alias[v] || v];
        } else if (c.localName === 'prstClr') {
            const p = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080' };
            hex = p[c.getAttribute('val')] || '000000';
        }
        if (!hex) return null;
        let [h, s, l] = aHsl(aRgb(hex.toUpperCase()));
        let alfa = 1;
        Array.from(c.children).forEach(m => {
            const val = parseInt(m.getAttribute('val') || '0', 10) / 100000;
            if (m.localName === 'lumMod') l *= val;
            else if (m.localName === 'lumOff') l += val;
            else if (m.localName === 'tint') l = l * val + (1 - val);
            else if (m.localName === 'shade') l *= val;
            else if (m.localName === 'satMod') s *= val;
            else if (m.localName === 'alpha') alfa = val;
        });
        l = Math.max(0, Math.min(1, l)); s = Math.max(0, Math.min(1, s));
        const rgb = deHsl([h, s, l]);
        return alfa < 1 ? `rgba(${rgb.map(Math.round).join(',')},${alfa})` : aHex(rgb);
    };

    const leerDibujo = (cfb, ruta, tema) => {
        const doc = xml(cfb, ruta);
        if (!doc) return [];
        const rels = relaciones(cfb, ruta);
        const pos = (n) => n ? {
            c: parseInt(hijo(n, 'col').textContent, 10), co: parseInt(hijo(n, 'colOff').textContent, 10) / EMU_POR_PX,
            r: parseInt(hijo(n, 'row').textContent, 10), ro: parseInt(hijo(n, 'rowOff').textContent, 10) / EMU_POR_PX
        } : null;

        const elementos = [];
        hijos(doc.documentElement, 'twoCellAnchor').concat(hijos(doc.documentElement, 'oneCellAnchor'), hijos(doc.documentElement, 'absoluteAnchor'))
            .forEach(ancla => {
                const desde = pos(hijo(ancla, 'from'));
                const hasta = pos(hijo(ancla, 'to'));
                const ext = hijo(ancla, 'ext');
                const absoluto = hijo(ancla, 'pos');
                const caja = { desde, hasta,
                    ancho: ext ? parseInt(ext.getAttribute('cx'), 10) / EMU_POR_PX : 0,
                    alto: ext ? parseInt(ext.getAttribute('cy'), 10) / EMU_POR_PX : 0,
                    x: absoluto ? parseInt(absoluto.getAttribute('x'), 10) / EMU_POR_PX : 0,
                    y: absoluto ? parseInt(absoluto.getAttribute('y'), 10) / EMU_POR_PX : 0 };
                Array.from(ancla.children).forEach(n => leerElemento(n, caja, null, elementos, rels, tema));
            });
        return elementos;
    };

    // `grupo` es la transformación de los grupos de fuera: de las coordenadas
    // de los hijos a las del grupo. Un grupo de primer nivel se coloca por su
    // ancla; los de dentro, por su `xfrm`.
    const leerElemento = (n, caja, grupo, salida, rels, tema) => {
        const nombre = n.localName;
        if (!['sp', 'pic', 'cxnSp', 'grpSp'].includes(nombre)) return;
        const nv = n.firstElementChild;
        const cNvPr = nv && hijo(nv, 'cNvPr');
        if (cNvPr && (cNvPr.getAttribute('hidden') === '1' || cNvPr.getAttribute('hidden') === 'true')) return;

        const spPr = hijo(n, nombre === 'grpSp' ? 'grpSpPr' : 'spPr');
        const xfrm = spPr && hijo(spPr, 'xfrm');
        const off = xfrm && hijo(xfrm, 'off'), ext = xfrm && hijo(xfrm, 'ext');
        const local = off && ext ? {
            x: parseInt(off.getAttribute('x'), 10) / EMU_POR_PX, y: parseInt(off.getAttribute('y'), 10) / EMU_POR_PX,
            w: parseInt(ext.getAttribute('cx'), 10) / EMU_POR_PX, h: parseInt(ext.getAttribute('cy'), 10) / EMU_POR_PX
        } : null;
        const comun = {
            caja, grupo, local,
            giro: xfrm ? parseInt(xfrm.getAttribute('rot') || '0', 10) / 60000 : 0,
            volteoH: xfrm ? xfrm.getAttribute('flipH') === '1' : false,
            volteoV: xfrm ? xfrm.getAttribute('flipV') === '1' : false
        };

        if (nombre === 'grpSp') {
            const chOff = xfrm && hijo(xfrm, 'chOff'), chExt = xfrm && hijo(xfrm, 'chExt');
            const sub = local && chOff && chExt ? {
                padre: grupo, local,
                ch: {
                    x: parseInt(chOff.getAttribute('x'), 10) / EMU_POR_PX, y: parseInt(chOff.getAttribute('y'), 10) / EMU_POR_PX,
                    w: parseInt(chExt.getAttribute('cx'), 10) / EMU_POR_PX || 1, h: parseInt(chExt.getAttribute('cy'), 10) / EMU_POR_PX || 1
                }
            } : grupo;
            Array.from(n.children).forEach(h => leerElemento(h, caja, sub, salida, rels, tema));
            return;
        }

        if (nombre === 'pic') {
            const blip = todos(n, 'blip')[0];
            const ruta = blip ? rels[rId(blip)] : null;
            const src = todos(n, 'srcRect')[0];
            const recorte = src ? ['l', 't', 'r', 'b'].reduce((o, k) => (o[k] = parseInt(src.getAttribute(k) || '0', 10) / 100000, o), {}) : null;
            salida.push({ ...comun, tipo: 'imagen', ruta, recorte });
            return;
        }

        const geom = spPr && hijo(spPr, 'prstGeom');
        const forma = geom ? geom.getAttribute('prst') : (nombre === 'cxnSp' ? 'line' : 'rect');
        const ajustes = {};
        if (geom) todos(geom, 'gd').forEach(g => {
            const m = /val\s+(-?\d+)/.exec(g.getAttribute('fmla') || '');
            if (m) ajustes[g.getAttribute('name')] = parseInt(m[1], 10);
        });

        // Relleno y contorno: lo explícito manda, y si no hay nada se toma del
        // estilo de la figura, que es lo que trae una figura recién insertada.
        const estilo = hijo(n, 'style');
        const deEstilo = (ref) => {
            const r = estilo && hijo(estilo, ref);
            if (!r || r.getAttribute('idx') === '0') return null;
            return colorDeDibujo(r, tema);
        };
        let relleno;
        if (spPr && hijo(spPr, 'noFill')) relleno = null;
        else if (spPr && hijo(spPr, 'solidFill')) relleno = colorDeDibujo(hijo(spPr, 'solidFill'), tema);
        else if (spPr && hijo(spPr, 'gradFill')) relleno = colorDeDibujo(todos(hijo(spPr, 'gradFill'), 'gs')[0], tema);
        else relleno = nombre === 'cxnSp' ? null : deEstilo('fillRef');

        const ln = spPr && hijo(spPr, 'ln');
        let contorno, grosor = 0.75 * PX_POR_PT;
        if (ln && ln.getAttribute('w')) grosor = parseInt(ln.getAttribute('w'), 10) / EMU_POR_PX;
        if (ln && hijo(ln, 'noFill')) contorno = null;
        else if (ln && hijo(ln, 'solidFill')) contorno = colorDeDibujo(hijo(ln, 'solidFill'), tema);
        else contorno = deEstilo('lnRef');
        const discontinuo = ln && hijo(ln, 'prstDash') && hijo(ln, 'prstDash').getAttribute('val') !== 'solid';

        // El texto, párrafo por párrafo.
        const txBody = hijo(n, 'txBody');
        let texto = null;
        if (txBody) {
            const bodyPr = hijo(txBody, 'bodyPr');
            const colorEstilo = (() => { const f = estilo && hijo(estilo, 'fontRef'); return f ? colorDeDibujo(f, tema) : null; })();
            const ins = (k, d) => bodyPr && bodyPr.hasAttribute(k) ? parseInt(bodyPr.getAttribute(k), 10) / EMU_POR_PX : d;
            const parrafos = hijos(txBody, 'p').map(p => {
                const pPr = hijo(p, 'pPr');
                const finP = hijo(p, 'endParaRPr');
                const corridas = Array.from(p.children).filter(x => x.localName === 'r' || x.localName === 'br' || x.localName === 'fld').map(r => {
                    if (r.localName === 'br') return { salto: true };
                    const rPr = hijo(r, 'rPr');
                    const t = hijo(r, 't');
                    return {
                        texto: t ? t.textContent : '',
                        tam: rPr && rPr.getAttribute('sz') ? parseInt(rPr.getAttribute('sz'), 10) / 100 : 11,
                        negrita: rPr ? rPr.getAttribute('b') === '1' : false,
                        cursiva: rPr ? rPr.getAttribute('i') === '1' : false,
                        color: (rPr && colorDeDibujo(hijo(rPr, 'solidFill'), tema)) || colorEstilo || '#000000',
                        fuente: (() => { const l = rPr && hijo(rPr, 'latin'); const f = l && l.getAttribute('typeface'); return f && !f.startsWith('+') ? f : tema.fuenteMenor; })()
                    };
                });
                return {
                    alineado: pPr ? (pPr.getAttribute('algn') || 'l') : 'l',
                    corridas,
                    tamVacio: finP && finP.getAttribute('sz') ? parseInt(finP.getAttribute('sz'), 10) / 100 : 11
                };
            });
            if (parrafos.some(p => p.corridas.some(c => c.texto))) {
                texto = {
                    parrafos,
                    anclado: bodyPr ? (bodyPr.getAttribute('anchor') || 't') : 't',
                    vertical: bodyPr ? (bodyPr.getAttribute('vert') || 'horz') : 'horz',
                    ajustar: !bodyPr || bodyPr.getAttribute('wrap') !== 'none',
                    derecho: !!bodyPr && bodyPr.getAttribute('upright') === '1',
                    margen: { l: ins('lIns', 9.6), r: ins('rIns', 9.6), t: ins('tIns', 4.8), b: ins('bIns', 4.8) }
                };
            }
        }

        salida.push({ ...comun, tipo: 'figura', forma, ajustes, relleno, contorno, grosor, discontinuo, texto,
            esLinea: nombre === 'cxnSp' || /line|Connector/i.test(forma) });
    };

    // --- La geometría de la hoja ---------------------------------------------
    // Dónde empieza cada columna y cada fila, en píxeles, a partir de las que
    // se dibujan. Se calculan una vez y se buscan por índice.
    const posiciones = (n, tam) => {
        const p = new Float64Array(n + 1);
        for (let i = 0; i < n; i++) p[i + 1] = p[i] + tam(i);
        return p;
    };

    const ponerEnGrupo = (rect, grupo) => {
        let r = rect;
        for (let g = grupo; g; g = g.padre) {
            const sx = g.local.w / g.ch.w, sy = g.local.h / g.ch.h;
            r = { x: g.local.x + (r.x - g.ch.x) * sx, y: g.local.y + (r.y - g.ch.y) * sy, w: r.w * sx, h: r.h * sy };
        }
        return r;
    };

    // --- Dibujar ---------------------------------------------------------------
    const FUENTES_DE_RESERVA = ', "Liberation Sans", Arial, Helvetica, sans-serif';
    const fuenteCss = (f, tam) => `${f.cursiva ? 'italic ' : ''}${f.negrita ? 'bold ' : ''}${tam}px "${f.nombre}"${FUENTES_DE_RESERVA}`;

    // Parte un texto en renglones que quepan en `ancho`, respetando los saltos
    // que trae. Una palabra más ancha que el renglón se corta por letras.
    const partirTexto = (ctx, texto, ancho, ajustar) => {
        const renglones = [];
        String(texto).split(/\r?\n/).forEach(parrafo => {
            if (!ajustar) { renglones.push(parrafo); return; }
            let actual = '';
            parrafo.split(/(\s+)/).forEach(trozo => {
                if (trozo === '') return;
                const prueba = actual + trozo;
                if (ctx.measureText(prueba).width <= ancho || actual.trim() === '') {
                    if (ctx.measureText(prueba).width > ancho && actual.trim() === '' && !/^\s+$/.test(trozo)) {
                        let palabra = '';
                        for (const ch of trozo) {
                            if (ctx.measureText(palabra + ch).width > ancho && palabra) { renglones.push(palabra); palabra = ''; }
                            palabra += ch;
                        }
                        actual = palabra;
                    } else actual = prueba;
                } else {
                    renglones.push(actual.trimEnd());
                    actual = /^\s+$/.test(trozo) ? '' : trozo;
                }
            });
            renglones.push(actual.trimEnd());
        });
        return renglones;
    };

    const trazoDeBorde = (estilo) => {
        const gruesos = { thin: 1, hair: 0.5, dotted: 1, dashed: 1, dashDot: 1, dashDotDot: 1, medium: 2, mediumDashed: 2,
            mediumDashDot: 2, mediumDashDotDot: 2, slantDashDot: 2, thick: 3, double: 3 };
        const rayas = { dotted: [1, 2], hair: [1, 1], dashed: [4, 2], mediumDashed: [6, 3], dashDot: [5, 2, 1, 2],
            dashDotDot: [5, 2, 1, 2, 1, 2], mediumDashDot: [6, 3, 2, 3], mediumDashDotDot: [6, 3, 2, 3, 2, 3], slantDashDot: [6, 3, 2, 3] };
        return { grosor: gruesos[estilo] || 1, raya: rayas[estilo] || [] };
    };

    const caminoDeForma = (ctx, forma, w, h, ajustes) => {
        ctx.beginPath();
        const redondeado = (radio) => {
            const r = Math.min(radio, w / 2, h / 2);
            ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
            ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
            ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
            ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0); ctx.closePath();
        };
        const m = Math.min(w, h);
        switch (forma) {
            case 'ellipse':
            case 'flowChartConnector':
                ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); break;
            case 'donut': {
                const grueso = m * ((ajustes.adj ?? 25000) / 100000);
                ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
                ctx.moveTo(w / 2 + Math.max(0, w / 2 - grueso), h / 2);
                ctx.ellipse(w / 2, h / 2, Math.max(0, w / 2 - grueso), Math.max(0, h / 2 - grueso), 0, 0, Math.PI * 2, true);
                break;
            }
            case 'roundRect':
                redondeado(m * ((ajustes.adj ?? 16667) / 100000)); break;
            case 'flowChartAlternateProcess':
                redondeado(m / 6); break;
            case 'triangle':
                ctx.moveTo(w * ((ajustes.adj ?? 50000) / 100000), 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); break;
            case 'rtTriangle':
                ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); break;
            case 'diamond':
            case 'flowChartDecision':
                ctx.moveTo(w / 2, 0); ctx.lineTo(w, h / 2); ctx.lineTo(w / 2, h); ctx.lineTo(0, h / 2); ctx.closePath(); break;
            case 'mathMultiply': {
                // La «✕» de Office: dos barras cruzadas del 23.5% del lado.
                const a = m * ((ajustes.adj1 ?? 23520) / 100000) / 2;
                const cx = w / 2, cy = h / 2, d = Math.min(w, h) * 0.38;
                const brazo = (ang) => {
                    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy * a, py = dx * a;
                    return [[cx - dx * d + px, cy - dy * d + py], [cx + dx * d + px, cy + dy * d + py],
                        [cx + dx * d - px, cy + dy * d - py], [cx - dx * d - px, cy - dy * d - py]];
                };
                [brazo(Math.PI / 4), brazo(-Math.PI / 4)].forEach(pts => {
                    ctx.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath();
                });
                break;
            }
            case 'mathPlus': {
                const a = m * ((ajustes.adj1 ?? 23520) / 100000) / 2, d = m * 0.38;
                ctx.rect(w / 2 - d, h / 2 - a, 2 * d, 2 * a); ctx.rect(w / 2 - a, h / 2 - d, 2 * a, 2 * d); break;
            }
            case 'rightArrow': {
                const cuerpo = h * ((ajustes.adj1 ?? 50000) / 100000), punta = m * ((ajustes.adj2 ?? 50000) / 100000);
                ctx.moveTo(0, (h - cuerpo) / 2); ctx.lineTo(w - punta, (h - cuerpo) / 2); ctx.lineTo(w - punta, 0);
                ctx.lineTo(w, h / 2); ctx.lineTo(w - punta, h); ctx.lineTo(w - punta, (h + cuerpo) / 2);
                ctx.lineTo(0, (h + cuerpo) / 2); ctx.closePath(); break;
            }
            case 'leftArrow': {
                const cuerpo = h * ((ajustes.adj1 ?? 50000) / 100000), punta = m * ((ajustes.adj2 ?? 50000) / 100000);
                ctx.moveTo(w, (h - cuerpo) / 2); ctx.lineTo(punta, (h - cuerpo) / 2); ctx.lineTo(punta, 0);
                ctx.lineTo(0, h / 2); ctx.lineTo(punta, h); ctx.lineTo(punta, (h + cuerpo) / 2);
                ctx.lineTo(w, (h + cuerpo) / 2); ctx.closePath(); break;
            }
            default:
                ctx.rect(0, 0, w, h);
        }
    };

    // Dibuja la hoja entera recortada al rectángulo [y0, y1) del lienzo.
    const pintarHoja = (ctx, hoja, libro, geo, recorte, escala, imagenes) => {
        const { xs, ys, c0, r0 } = geo;
        const X = (c) => xs[c - c0], Y = (r) => ys[r - r0];
        const dentro = (c, r) => c >= c0 && c < c0 + xs.length - 1 && r >= r0 && r < r0 + ys.length - 1;

        ctx.save();
        ctx.scale(escala, escala);
        ctx.translate(0, -recorte.y0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, recorte.y0, xs[xs.length - 1], recorte.y1 - recorte.y0);
        ctx.beginPath(); ctx.rect(0, recorte.y0, xs[xs.length - 1], recorte.y1 - recorte.y0); ctx.clip();

        // Las celdas combinadas se tratan como la de arriba a la izquierda.
        const tapadas = new Set();
        const combinadaDe = new Map();
        hoja.combinadas.forEach(m => {
            for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) {
                if (r !== m.r1 || c !== m.c1) tapadas.add(r * 20000 + c);
            }
            combinadaDe.set(m.r1 * 20000 + m.c1, m);
        });
        const ocupadas = new Set(hoja.celdas.filter(c => c.valor !== null && c.valor !== '').map(c => c.r * 20000 + c.c));

        const visible = (ya, yb) => yb >= recorte.y0 && ya <= recorte.y1;
        const rectDe = (cel) => {
            const m = combinadaDe.get(cel.r * 20000 + cel.c);
            const c2 = m ? m.c2 : cel.c, r2 = m ? m.r2 : cel.r;
            const cc1 = Math.max(cel.c, c0), rr1 = Math.max(cel.r, r0);
            const cc2 = Math.min(c2 + 1, c0 + xs.length - 1), rr2 = Math.min(r2 + 1, r0 + ys.length - 1);
            if (cc1 >= cc2 || rr1 >= rr2) return null;
            return { x: X(cc1), y: Y(rr1), w: X(cc2) - X(cc1), h: Y(rr2) - Y(rr1), c2, r2 };
        };

        // 1. Rellenos.
        hoja.celdas.forEach(cel => {
            if (tapadas.has(cel.r * 20000 + cel.c) || !dentro(cel.c, cel.r)) return;
            const xf = libro.estilos.xfs[cel.s];
            const color = xf && libro.estilos.rellenos[xf.relleno];
            if (!color) return;
            const r = rectDe(cel);
            if (!r || !visible(r.y, r.y + r.h)) return;
            ctx.fillStyle = color;
            ctx.fillRect(r.x, r.y, r.w, r.h);
        });

        // 2. Textos.
        hoja.celdas.forEach(cel => {
            if (cel.valor === null || cel.valor === '' || tapadas.has(cel.r * 20000 + cel.c) || !dentro(cel.c, cel.r)) return;
            const r = rectDe(cel);
            if (!r || !visible(r.y - 200, r.y + r.h + 200)) return;
            const xf = libro.estilos.xfs[cel.s] || { horizontal: 'general', vertical: 'bottom', fuente: 0, giro: 0, sangria: 0 };
            const f = libro.estilos.fuentes[xf.fuente] || libro.estilos.fuentes[0] || { tam: 11, nombre: 'Calibri' };
            const txt = formatear(cel.valor, xf, libro.estilos);
            if (!txt) return;
            const tam = f.tam * PX_POR_PT;
            ctx.font = fuenteCss(f, tam);
            ctx.fillStyle = f.color || '#000000';
            const pad = 2 + xf.sangria * 9;

            if (xf.giro === 90 || xf.giro === 180 || xf.giro === 255) {
                // Texto en vertical: se gira el lienzo y se dibuja como si
                // fuera horizontal en una caja de lados cambiados.
                ctx.save();
                ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
                ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
                ctx.rotate(xf.giro === 180 ? Math.PI / 2 : -Math.PI / 2);
                const renglones = partirTexto(ctx, txt, r.h - 4, xf.ajustar);
                const altoR = tam * 1.2;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                renglones.forEach((t, i) => ctx.fillText(t, 0, (i - (renglones.length - 1) / 2) * altoR));
                ctx.restore();
                return;
            }

            let horizontal = xf.horizontal;
            if (horizontal === 'general') horizontal = typeof cel.valor === 'number' ? 'right' : 'left';
            if (horizontal === 'centerContinuous' || horizontal === 'distributed' || horizontal === 'justify') horizontal = horizontal === 'centerContinuous' ? 'center' : 'left';
            if (horizontal === 'fill') horizontal = 'left';

            const ajustar = xf.ajustar || horizontal === 'justify';
            const renglones = partirTexto(ctx, txt, Math.max(4, r.w - 2 * pad), ajustar);
            const altoR = tam * 1.2;
            const altoTotal = renglones.length * altoR;
            let yInicio;
            if (xf.vertical === 'top') yInicio = r.y + 1;
            else if (xf.vertical === 'center' || xf.vertical === 'distributed' || xf.vertical === 'justify') yInicio = r.y + (r.h - altoTotal) / 2;
            else yInicio = r.y + r.h - altoTotal - 1;

            // El recorte: una celda sin ajustar y sin combinar se desborda
            // hacia las vacías de al lado, como en Excel.
            let x1 = r.x, x2 = r.x + r.w;
            if (!ajustar && !combinadaDe.has(cel.r * 20000 + cel.c)) {
                const finHoja = c0 + xs.length - 1;
                if (horizontal !== 'right') for (let c = cel.c + 1; c < finHoja && !ocupadas.has(cel.r * 20000 + c) && !tapadas.has(cel.r * 20000 + c); c++) x2 = X(c + 1);
                if (horizontal !== 'left') for (let c = cel.c - 1; c >= c0 && !ocupadas.has(cel.r * 20000 + c) && !tapadas.has(cel.r * 20000 + c); c--) x1 = X(c);
            }
            ctx.save();
            ctx.beginPath(); ctx.rect(x1, r.y, x2 - x1, r.h); ctx.clip();
            ctx.textBaseline = 'middle';
            renglones.forEach((t, i) => {
                const y = yInicio + altoR * (i + 0.5);
                let x;
                if (horizontal === 'center') { ctx.textAlign = 'center'; x = r.x + r.w / 2; }
                else if (horizontal === 'right') { ctx.textAlign = 'right'; x = r.x + r.w - pad; }
                else { ctx.textAlign = 'left'; x = r.x + pad; }
                ctx.fillText(t, x, y);
                if (f.subrayado || f.tachado) {
                    const ancho = ctx.measureText(t).width;
                    const xi = ctx.textAlign === 'center' ? x - ancho / 2 : ctx.textAlign === 'right' ? x - ancho : x;
                    const yl = f.subrayado ? y + tam * 0.45 : y;
                    ctx.fillRect(xi, yl, ancho, Math.max(1, tam / 14));
                }
            });
            ctx.restore();
        });

        // 3. Bordes. Cada celda dibuja los suyos; en una combinada, los de las
        // celdas del contorno.
        // Dentro de una combinada no hay líneas: Excel sólo dibuja su contorno,
        // aunque las celdas de dentro traigan bordes de cuando no lo estaban.
        const mergeDe = new Map();
        hoja.combinadas.forEach(m => {
            for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeDe.set(r * 20000 + c, m);
        });
        const lineas = [];
        hoja.celdas.forEach(cel => {
            if (!dentro(cel.c, cel.r)) return;
            const xf = libro.estilos.xfs[cel.s];
            const b = xf && libro.estilos.bordes[xf.borde];
            if (!b || !(b.izq || b.der || b.arr || b.aba)) return;
            const xa = X(cel.c), xb = X(cel.c + 1), ya = Y(cel.r), yb = Y(cel.r + 1);
            if (!visible(ya, yb)) return;
            const m = mergeDe.get(cel.r * 20000 + cel.c);
            if (b.arr && (!m || cel.r === m.r1)) lineas.push([xa, ya, xb, ya, b.arr]);
            if (b.aba && (!m || cel.r === m.r2)) lineas.push([xa, yb, xb, yb, b.aba]);
            if (b.izq && (!m || cel.c === m.c1)) lineas.push([xa, ya, xa, yb, b.izq]);
            if (b.der && (!m || cel.c === m.c2)) lineas.push([xb, ya, xb, yb, b.der]);
        });
        lineas.forEach(([xa, ya, xb, yb, lado]) => {
            const { grosor, raya } = trazoDeBorde(lado.estilo);
            ctx.strokeStyle = lado.color;
            ctx.lineWidth = grosor;
            ctx.setLineDash(raya);
            ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
        });
        ctx.setLineDash([]);

        // 4. Imágenes y figuras, en el orden en que están: el de abajo primero.
        geo.elementos.forEach(el => {
            const r = el.rect;
            if (!r || !visible(r.y - 4, r.y + r.h + 4)) return;
            ctx.save();
            ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
            if (el.giro) ctx.rotate(el.giro * Math.PI / 180);
            ctx.scale(el.volteoH ? -1 : 1, el.volteoV ? -1 : 1);
            ctx.translate(-r.w / 2, -r.h / 2);

            if (el.tipo === 'imagen') {
                const img = imagenes.get(el.ruta);
                if (img) {
                    const rc = el.recorte || { l: 0, t: 0, r: 0, b: 0 };
                    const iw = img.width, ih = img.height;
                    const sx = iw * rc.l, sy = ih * rc.t, sw = iw * (1 - rc.l - rc.r), sh = ih * (1 - rc.t - rc.b);
                    if (sw > 0 && sh > 0) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, r.w, r.h);
                } else {
                    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(0, 0, r.w, r.h);
                }
                ctx.restore();
                return;
            }

            if (el.esLinea) {
                if (el.contorno) {
                    ctx.strokeStyle = el.contorno; ctx.lineWidth = Math.max(0.75, el.grosor);
                    if (el.discontinuo) ctx.setLineDash([el.grosor * 4, el.grosor * 2]);
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r.w, r.h); ctx.stroke();
                }
                ctx.restore();
                return;
            }

            caminoDeForma(ctx, el.forma, r.w, r.h, el.ajustes);
            if (el.relleno) { ctx.fillStyle = el.relleno; ctx.fill(el.forma === 'donut' ? 'evenodd' : 'nonzero'); }
            if (el.contorno && el.grosor > 0) {
                ctx.strokeStyle = el.contorno; ctx.lineWidth = el.grosor;
                if (el.discontinuo) ctx.setLineDash([el.grosor * 4, el.grosor * 2]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (el.texto) {
                // El texto de una figura volteada no se lee al revés.
                ctx.scale(el.volteoH ? -1 : 1, el.volteoV ? -1 : 1);
                if (el.volteoH || el.volteoV) ctx.translate(el.volteoH ? -r.w : 0, el.volteoV ? -r.h : 0);
                // `upright` deja el texto derecho aunque la figura esté girada:
                // se deshace el giro y se escribe en la caja que se ve.
                let tw = r.w, th = r.h;
                if (el.texto.derecho && el.giro) {
                    const g = ((el.giro % 360) + 360) % 360;
                    const lado = (g >= 45 && g < 135) || (g >= 225 && g < 315);
                    if (lado) { tw = r.h; th = r.w; }
                    ctx.translate(r.w / 2, r.h / 2);
                    ctx.rotate(-el.giro * Math.PI / 180);
                    ctx.translate(-tw / 2, -th / 2);
                }
                pintarTextoDeFigura(ctx, el.texto, tw, th);
            }
            ctx.restore();
        });

        ctx.restore();
    };

    const pintarTextoDeFigura = (ctx, t, w, h) => {
        const vertical = t.vertical === 'vert' || t.vertical === 'eaVert' || t.vertical === 'vert270';
        ctx.save();
        let ancho = w, alto = h;
        if (vertical) {
            ctx.translate(w / 2, h / 2);
            ctx.rotate(t.vertical === 'vert270' ? -Math.PI / 2 : Math.PI / 2);
            ctx.translate(-h / 2, -w / 2);
            ancho = h; alto = w;
        }
        const util = Math.max(4, ancho - t.margen.l - t.margen.r);
        const renglones = [];
        t.parrafos.forEach(p => {
            // Los trozos de un párrafo se juntan en renglones; cada palabra
            // conserva la fuente de su trozo.
            const palabras = [];
            p.corridas.forEach(c => {
                if (c.salto) { palabras.push({ salto: true }); return; }
                c.texto.split(/(\s+)/).forEach(pal => { if (pal) palabras.push({ ...c, texto: pal }); });
            });
            let renglon = [], anchoR = 0;
            const cerrar = () => {
                const tamR = renglon.length ? Math.max(...renglon.map(x => x.tam)) : p.tamVacio;
                renglones.push({ piezas: renglon, ancho: anchoR, alto: tamR * PX_POR_PT * 1.2, alineado: p.alineado });
                renglon = []; anchoR = 0;
            };
            palabras.forEach(pal => {
                if (pal.salto) { cerrar(); return; }
                ctx.font = fuenteCss({ negrita: pal.negrita, cursiva: pal.cursiva, nombre: pal.fuente || 'Calibri' }, pal.tam * PX_POR_PT);
                const a = ctx.measureText(pal.texto).width;
                if (t.ajustar && anchoR + a > util && renglon.length && !/^\s+$/.test(pal.texto)) {
                    while (renglon.length && /^\s+$/.test(renglon[renglon.length - 1].texto)) anchoR -= renglon.pop().a;
                    cerrar();
                }
                if (!renglon.length && /^\s+$/.test(pal.texto)) return;
                renglon.push({ ...pal, a });
                anchoR += a;
            });
            cerrar();
        });
        const total = renglones.reduce((s, r) => s + r.alto, 0);
        let y = t.anclado === 'ctr' ? (alto - total) / 2 : t.anclado === 'b' ? alto - t.margen.b - total : t.margen.t;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        renglones.forEach(r => {
            let x = r.alineado === 'ctr' ? (ancho - r.ancho) / 2 : r.alineado === 'r' ? ancho - t.margen.r - r.ancho : t.margen.l;
            r.piezas.forEach(p => {
                ctx.font = fuenteCss({ negrita: p.negrita, cursiva: p.cursiva, nombre: p.fuente || 'Calibri' }, p.tam * PX_POR_PT);
                ctx.fillStyle = p.color;
                ctx.fillText(p.texto, x, y + r.alto / 2);
                x += p.a;
            });
            y += r.alto;
        });
        ctx.restore();
    };

    // --- Hasta dónde llega la hoja y por dónde se corta ------------------------
    const geometriaDeHoja = (hoja, libro, elementos) => {
        // Lo que de verdad dice algo —un valor, un color que no es blanco, una
        // figura— marca la hoja; los bordes y los rellenos blancos sólo la
        // ensanchan si están pegados a eso. Un formato FR1 arrastra celdas
        // sueltas con un borde punteado diez columnas a la derecha, y
        // contarlas encogería la página entera para dibujar una raya.
        let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1;
        const abarcar = (c, r) => { c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); };
        const blanco = (color) => !color || /^#?f{6}$/i.test(color);
        const accesorias = [];
        hoja.celdas.forEach(cel => {
            const xf = libro.estilos.xfs[cel.s];
            const b = xf && libro.estilos.bordes[xf.borde];
            const relleno = xf && libro.estilos.rellenos[xf.relleno];
            if ((cel.valor !== null && cel.valor !== '') || !blanco(relleno)) abarcar(cel.c, cel.r);
            else if (relleno || (b && (b.izq || b.der || b.arr || b.aba))) accesorias.push(cel);
        });
        elementos.forEach(el => {
            if (el.caja.desde) abarcar(el.caja.desde.c, el.caja.desde.r);
            if (el.caja.hasta) abarcar(el.caja.hasta.c, el.caja.hasta.r);
        });
        for (let vuelta = 0, crecio = true; crecio && vuelta < 50; vuelta++) {
            crecio = false;
            const antes = [c0, c1, r0, r1].join();
            hoja.combinadas.forEach(m => {
                if (m.c2 >= c0 - 1 && m.c1 <= c1 + 1 && m.r2 >= r0 - 1 && m.r1 <= r1 + 1) { abarcar(m.c1, m.r1); abarcar(m.c2, m.r2); }
            });
            accesorias.forEach(cel => {
                if (cel.c >= c0 - 1 && cel.c <= c1 + 1 && cel.r >= r0 - 1 && cel.r <= r1 + 1) abarcar(cel.c, cel.r);
            });
            crecio = antes !== [c0, c1, r0, r1].join();
        }
        if (c1 < 0) return null;
        c1 = Math.min(c1, c0 + 400); r1 = Math.min(r1, r0 + 5000);

        const xs = posiciones(c1 - c0 + 1, i => hoja.anchoCol(c0 + i));
        const ys = posiciones(r1 - r0 + 1, i => hoja.altoFila(r0 + i));
        const X = (c) => xs[Math.max(0, Math.min(xs.length - 1, c - c0))];
        const Y = (r) => ys[Math.max(0, Math.min(ys.length - 1, r - r0))];

        // Dónde cae cada figura, ya en píxeles de la hoja.
        const absolutoDe = (desde) => ({ x: X(desde.c) + desde.co, y: Y(desde.r) + desde.ro });
        elementos.forEach(el => {
            const k = el.caja;
            let caja;
            if (k.desde && k.hasta) {
                const a = absolutoDe(k.desde), b = absolutoDe(k.hasta);
                caja = { x: a.x, y: a.y, w: Math.max(0, b.x - a.x), h: Math.max(0, b.y - a.y) };
            } else if (k.desde) {
                const a = absolutoDe(k.desde);
                caja = { x: a.x, y: a.y, w: k.ancho, h: k.alto };
            } else caja = { x: k.x, y: k.y, w: k.ancho, h: k.alto };

            // Girada de lado, el ancla de Excel es la caja que se ve, no la de
            // la figura: se le cambian los lados alrededor del centro antes de
            // girarla, o la barra vertical de «Método» saldría acostada.
            const giro = ((el.giro % 360) + 360) % 360;
            if (!el.grupo && ((giro >= 45 && giro < 135) || (giro >= 225 && giro < 315))) {
                const cx = caja.x + caja.w / 2, cy = caja.y + caja.h / 2;
                caja = { x: cx - caja.h / 2, y: cy - caja.w / 2, w: caja.h, h: caja.w };
            }

            if (el.grupo) {
                // Dentro de un grupo: se lleva a las coordenadas del grupo de
                // fuera y de ahí a la caja del ancla.
                let raiz = el.grupo; while (raiz.padre) raiz = raiz.padre;
                const r = ponerEnGrupo(el.local || { x: 0, y: 0, w: 0, h: 0 }, el.grupo);
                const sx = raiz.local.w ? caja.w / raiz.local.w : 1, sy = raiz.local.h ? caja.h / raiz.local.h : 1;
                el.rect = { x: caja.x + (r.x - raiz.local.x) * sx, y: caja.y + (r.y - raiz.local.y) * sy, w: r.w * sx, h: r.h * sy };
            } else el.rect = caja;
        });

        return { c0, r0, xs, ys, elementos };
    };

    // Cortes por fila: ninguna página más alta que `alto`, y si se puede, sin
    // partir una imagen —una foto cortada por la mitad no se lee en ninguna de
    // las dos páginas—. Si una imagen no cabe entera se parte, que no queda
    // otra.
    const cortesDePagina = (geo, alto) => {
        const ys = geo.ys, total = ys[ys.length - 1];
        const fotos = geo.elementos.filter(e => e.rect && e.rect.h > 20).map(e => [e.rect.y, e.rect.y + e.rect.h]);
        const parte = (y) => fotos.some(([a, b]) => y > a + 1 && y < b - 1);
        const cortes = [0];
        let inicio = 0;
        while (total - inicio > alto) {
            let mejor = -1, libre = -1;
            for (let i = 1; i < ys.length; i++) {
                const y = ys[i];
                if (y <= inicio) continue;
                if (y - inicio > alto) break;
                mejor = y;
                if (y - inicio >= alto * 0.55 && !parte(y)) libre = y;
            }
            const corte = libre > 0 ? libre : (mejor > inicio ? mejor : inicio + alto);
            cortes.push(corte);
            inicio = corte;
        }
        cortes.push(total);
        return cortes;
    };

    const cargarImagen = (bytes, ruta) => new Promise((resolve) => {
        const ext = window.extensionDeArchivo(ruta);
        const tipos = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
        if (!tipos[ext]) return resolve(null);   // EMF/WMF: el navegador no los pinta
        const url = URL.createObjectURL(new Blob([bytes], { type: tipos[ext] }));
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });

    // --- La puerta ------------------------------------------------------------
    window.paginasDeHojaDeCalculo = async (file, decir) => {
        decir('Abriendo el Excel…');
        await window.cargarLibreria(window.LIBRERIAS_CONVERSION.hoja);
        if (!window.XLSX || !window.XLSX.CFB) throw new Error('El lector de Excel no quedó disponible. Recarga la aplicación e inténtalo de nuevo.');

        let cfb;
        try {
            cfb = window.XLSX.CFB.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
        } catch (e) {
            console.error(e);
            throw new Error('No se pudo abrir el Excel. Si está protegido con contraseña, quítasela y vuelve a subirlo.');
        }
        const rutaLibro = 'xl/workbook.xml';
        const docLibro = xml(cfb, rutaLibro);
        if (!docLibro) {
            throw new Error(window.extensionDeArchivo(file.name) === 'xls'
                ? 'Ese Excel es del formato antiguo (.xls). Ábrelo y guárdalo como .xlsx, o expórtalo a PDF.'
                : 'Ese archivo no es un libro de Excel que se pueda leer. Guárdalo como .xlsx, o expórtalo a PDF.');
        }

        const relsLibro = relaciones(cfb, rutaLibro);
        const docRels = xml(cfb, 'xl/_rels/workbook.xml.rels');
        const porTipo = (tipo) => {
            const r = todos(docRels, 'Relationship').find(x => (x.getAttribute('Type') || '').endsWith('/' + tipo));
            return r ? relsLibro[r.getAttribute('Id')] : null;
        };
        const tema = leerTema(cfb, porTipo('theme'));
        const libro = {
            tema,
            estilos: leerEstilos(cfb, porTipo('styles'), tema),
            cadenas: leerCadenas(cfb, porTipo('sharedStrings'))
        };

        const hojasDelLibro = todos(docLibro, 'sheet')
            .filter(s => !s.getAttribute('state') || s.getAttribute('state') === 'visible')
            .map(s => ({ nombre: s.getAttribute('name'), ruta: relsLibro[rId(s)] }))
            .filter(s => s.ruta);

        const paginas = [];
        let totalPaginas = 0;
        for (let h = 0; h < hojasDelLibro.length; h++) {
            const etiqueta = hojasDelLibro.length > 1 ? `la hoja «${hojasDelLibro[h].nombre}»` : 'la hoja';
            decir(`Leyendo ${etiqueta}…`);
            const hoja = leerHoja(cfb, hojasDelLibro[h].ruta, libro);
            if (!hoja) continue;
            const elementos = hoja.rutaDibujo ? leerDibujo(cfb, hoja.rutaDibujo, tema) : [];
            const geo = geometriaDeHoja(hoja, libro, elementos);
            if (!geo) continue;

            const imagenes = new Map();
            for (const el of elementos) {
                if (el.tipo !== 'imagen' || !el.ruta || imagenes.has(el.ruta)) continue;
                const bytes = leerArchivo(cfb, el.ruta);
                imagenes.set(el.ruta, bytes ? await cargarImagen(bytes, el.ruta) : null);
            }

            const ancho = geo.xs[geo.xs.length - 1];
            const cortes = cortesDePagina(geo, ancho * window.PROPORCION_PAGINA_EXCEL);
            // Al doble de lo que se va a guardar, como un PDF: el encogido deja
            // el texto pequeño limpio. Con un tope, que iOS no da lienzos de más
            // de ~16 millones de píxeles.
            for (let p = 0; p < cortes.length - 1; p++) {
                if (paginas.length >= window.MAX_PAGINAS_MATERIAL) { totalPaginas++; continue; }
                totalPaginas++;
                decir(`Convirtiendo ${etiqueta}, página ${p + 1} de ${cortes.length - 1}…`);
                const altoP = cortes[p + 1] - cortes[p];
                let escala = (window.MAX_LADO_MATERIAL * 2) / Math.max(ancho, altoP);
                escala = Math.min(escala, Math.sqrt(16e6 / (ancho * altoP)), 4);
                const lienzo = document.createElement('canvas');
                lienzo.width = Math.max(1, Math.round(ancho * escala));
                lienzo.height = Math.max(1, Math.round(altoP * escala));
                const ctx = lienzo.getContext('2d');
                pintarHoja(ctx, hoja, libro, geo, { y0: cortes[p], y1: cortes[p + 1] }, escala, imagenes);
                paginas.push(await window.comprimirDibujo(lienzo, {
                    maxLado: window.MAX_LADO_MATERIAL, maxBytes: window.MAX_BYTES_MATERIAL
                }));
                lienzo.width = lienzo.height = 0;
                // Un respiro entre páginas, que es lo que deja al aviso de
                // «página 3 de 5» llegar a pintarse.
                await new Promise(r => setTimeout(r, 0));
            }
        }

        if (paginas.length === 0) throw new Error('Ese Excel no tiene nada que convertir: sus hojas están vacías u ocultas.');
        paginas.recorte = totalPaginas > paginas.length ? totalPaginas : 0;
        return paginas;
    };
})();
