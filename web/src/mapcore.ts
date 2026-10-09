// Logica condivisa delle mappe (editor, gioco del master, mappa sul telefono): niente React, solo funzioni.
// Concetti:
// - una mappa è una griglia width x height di caselle da tileSize pixel, con più livelli sovrapposti;
// - i tile si indicano con un "gid" (id globale): ogni tileset usato dalla mappa ha un firstgid,
//   e gid - firstgid = indice del tile nell'immagine del tileset (riga per riga). È lo stesso schema di Tiled;
// - il disegno usa un <canvas> 2D: zoom = pixel sullo schermo per pixel del tile.
import type {MapDoc, MapLayer, Tileset} from './api';
import {t} from './i18n';

/** Immagini dei tileset già caricate (una per tileset). */
const images = new Map<string, HTMLImageElement>();
/** Immagine di un tileset; onLoad viene chiamato quando finisce di caricare (per ridisegnare). */
export function tilesetImage(ts: Tileset, onLoad?: () => void): HTMLImageElement {
  let img = images.get(ts.id!);
  if (!img || img.src !== ts.dataUrl) {
    img = new Image();
    img.src = ts.dataUrl;
    images.set(ts.id!, img);
  }
  if (!img.complete && onLoad) img.addEventListener('load', onLoad, {once: true});
  return img;
}

/** Quanti tile contiene un tileset. */
export const tileCount = (ts: Tileset) => ts.columns * ts.rows;

/** Mappa vuota con i cinque livelli standard (Terreno, Decorazioni, Sopra i personaggi, Collisioni, Zone). */
export function newMap(name: string, width = 30, height = 20, tileSize = 16): MapDoc {
  const layer = (n: string, type: MapLayer['type'] = 'tile'): MapLayer => ({name: n, type, data: new Array(width * height).fill(0), visible: true});
  return {
    name, width, height, tileSize, tilesets: [],
    // nomi nella lingua scelta; MapPlay riconosce "Sopra i personaggi" / "Above characters" dal nome
    layers: [layer(t('Terreno')), layer(t('Decorazioni')), layer(t('Sopra i personaggi')), layer(t('Collisioni'), 'collision'), layer(t('Zone incontri'), 'zone')],
    zoneRefs: [], objects: [], tokens: [],
  };
}

/** Trova tileset e indice locale di un gid. */
export function resolveGid(map: MapDoc, tilesets: Tileset[], gid: number) {
  let best: {ts: Tileset, local: number} | null = null;
  let bestFirst = -1;
  for (const ref of map.tilesets) {
    if (ref.firstgid <= gid && ref.firstgid > bestFirst) {
      const ts = tilesets.find(t => t.id === ref.id);
      if (ts) { best = {ts, local: gid - ref.firstgid}; bestFirst = ref.firstgid; }
    }
  }
  return best;
}

/** Aggiunge un tileset alla mappa assegnandogli il prossimo firstgid libero. */
export function addTilesetToMap(map: MapDoc, ts: Tileset): MapDoc {
  if (map.tilesets.some(r => r.id === ts.id)) return map;
  const next = map.tilesets.reduce((mx, r) => {
    return Math.max(mx, r.firstgid + 65536); // limite: slot fisso di 65536 gid per tileset, stabile anche se il tileset cambia
  }, 1);
  return {...map, tilesets: [...map.tilesets, {id: ts.id!, firstgid: next}]};
}

/** Colori con cui si mostrano le zone d'incontro (una per indice). */
export const ZONE_COLORS = ['#ff3df0', '#e0a020', '#4f8fdf', '#3fbf5f', '#e05040', '#40c0c0', '#a0a040', '#9060e0'];

/** Cosa disegnare: zoom, griglia, collisioni, zone, oggetti (master) o solo quelli visibili ai giocatori, livelli nascosti… */
export type DrawOpts = {
  zoom: number, grid?: boolean, collision?: boolean, zones?: boolean, objects?: boolean,
  hidden?: Set<number>, highlightLayer?: number, noClear?: boolean,
  /** sprite da disegnare per un PNG (immagine già caricata) */
  npcImage?: (ob: MapDoc['objects'][0]) => HTMLImageElement | null,
  /** vista giocatore: solo PNG e oggetti visibili */
  playerObjects?: boolean,
};

/**
 * Disegna la mappa sul canvas: livelli di tile (con trasparenza per evidenziare quello attivo), collisioni in rosso,
 * zone colorate, poi oggetti (Poké Ball, PNG con sprite e ombra, porte e segnaposto) e la griglia.
 * I tile delle immagini non ancora caricate vengono saltati: redraw verrà chiamato al caricamento.
 */
export function drawMap(ctx: CanvasRenderingContext2D, map: MapDoc, tilesets: Tileset[], o: DrawOpts, redraw?: () => void) {
  const T = map.tileSize * o.zoom;
  ctx.imageSmoothingEnabled = false;
  if (!o.noClear) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  map.layers.forEach((layer, li) => {
    if (o.hidden?.has(li) || layer.visible === false) return;
    if (layer.type === 'tile') {
      ctx.globalAlpha = o.highlightLayer !== undefined && o.highlightLayer !== li ? 0.55 : 1;
      for (let i = 0; i < layer.data.length; i++) {
        const gid = layer.data[i];
        if (!gid) continue;
        const r = resolveGid(map, tilesets, gid);
        if (!r) continue;
        const img = tilesetImage(r.ts, redraw);
        if (!img.complete) continue;
        const s = r.ts.tileSize;
        ctx.drawImage(img, (r.local % r.ts.columns) * s, Math.floor(r.local / r.ts.columns) * s, s, s,
          (i % map.width) * T, Math.floor(i / map.width) * T, T, T);
      }
      ctx.globalAlpha = 1;
    } else if (layer.type === 'collision' && o.collision) {
      ctx.fillStyle = 'rgba(220,40,40,.38)';
      layer.data.forEach((v, i) => v && ctx.fillRect((i % map.width) * T, Math.floor(i / map.width) * T, T, T));
    } else if (layer.type === 'zone' && o.zones) {
      layer.data.forEach((v, i) => {
        if (!v) return;
        ctx.fillStyle = ZONE_COLORS[(v - 1) % ZONE_COLORS.length] + '66';
        ctx.fillRect((i % map.width) * T, Math.floor(i / map.width) * T, T, T);
      });
    }
  });
  if (o.objects || o.playerObjects) {
    for (const ob of [...map.objects].sort((a, b) => a.y - b.y)) {
      const x = ob.x * T, y = ob.y * T;
      if (ob.kind === 'item') {
        if (ob.hidden && !o.objects) continue;
        drawPokeball(ctx, x + T / 2, y + T / 2, T * .32, !!ob.hidden);
        continue;
      }
      if (ob.kind === 'npc') {
        const img = o.npcImage?.(ob);
        if (img?.complete && img.naturalWidth) {
          const S = T * 1.7;
          ctx.fillStyle = 'rgba(0,0,0,.28)';
          ctx.beginPath(); ctx.ellipse(x + T / 2, y + T * .9, T * .38, T * .14, 0, 0, Math.PI * 2); ctx.fill();
          ctx.drawImage(img, x + T / 2 - S / 2, y + T - S + T * .05, S, S);
          continue;
        }
      }
      if (!o.objects) continue; // porte e segnaposto solo per il Master
      ctx.fillStyle = ob.kind === 'warp' ? '#ffd23f' : ob.kind === 'npc' ? '#ff6f59' : (ob.color || '#4f8fdf');
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(1, o.zoom);
      ctx.beginPath();
      if (ob.kind === 'warp') ctx.rect(x + T * .15, y + T * .15, T * .7, T * .7);
      else ctx.arc(x + T / 2, y + T / 2, T * .35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }
  if (o.grid && T >= 8) {
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= map.width; x++) { ctx.moveTo(x * T + .5, 0); ctx.lineTo(x * T + .5, map.height * T); }
    for (let y = 0; y <= map.height; y++) { ctx.moveTo(0, y * T + .5); ctx.lineTo(map.width * T, y * T + .5); }
    ctx.stroke();
  }
}

/** Cambia le dimensioni della mappa tenendo il contenuto in alto a sinistra (il resto viene tagliato o riempito di vuoto). */
export function resizeMap(map: MapDoc, width: number, height: number): MapDoc {
  const layers = map.layers.map(l => {
    const data = new Array(width * height).fill(0);
    for (let y = 0; y < Math.min(height, map.height); y++)
      for (let x = 0; x < Math.min(width, map.width); x++) data[y * width + x] = l.data[y * map.width + x];
    return {...l, data};
  });
  return {...map, width, height, layers, objects: map.objects.filter(o => o.x < width && o.y < height)};
}

/** Riempimento a macchia d'olio sul livello. */
export function floodFill(data: number[], w: number, h: number, sx: number, sy: number, value: (x: number, y: number) => number) {
  const target = data[sy * w + sx];
  const out = data.slice();
  const seen = new Uint8Array(w * h);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (seen[i] || data[i] !== target) continue;
    seen[i] = 1;
    out[i] = value(x, y);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return out;
}

// --- formato Tiled ---
/** Tiled usa i 3 bit alti del gid per i tile capovolti: qui li ignoriamo. */
const FLIP_MASK = 0x1fffffff;

/**
 * Esporta in formato Tiled (.tmj, JSON). Collisioni e zone diventano livelli con la proprietà "pnp"
 * per poterli reimportare; le immagini dei tileset sono incluse.
 */
export function exportTmj(map: MapDoc, tilesets: Tileset[]) {
  let id = 1;
  return {
    type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: map.width, height: map.height, tilewidth: map.tileSize, tileheight: map.tileSize, nextobjectid: map.objects.length + 1,
    layers: [
      ...map.layers.map(l => ({
        id: id++, name: l.name, type: 'tilelayer', x: 0, y: 0, width: map.width, height: map.height, opacity: 1, visible: l.visible !== false,
        data: l.type === 'tile' ? l.data : l.data.map(v => v ? 1 : 0),
        properties: l.type !== 'tile' ? [{name: 'pnp', type: 'string', value: l.type}, ...(l.type === 'zone' ? [{name: 'zoneRefs', type: 'string', value: JSON.stringify(map.zoneRefs)}] : [])] : undefined,
        // nota: collisioni e zone esportate come livelli marcati con proprietà "pnp"
      })),
      {
        id: id++, name: t('Oggetti'), type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown',
        objects: map.objects.map((o, i) => ({
          id: i + 1, name: o.label, type: o.kind, x: o.x * map.tileSize, y: o.y * map.tileSize, width: map.tileSize, height: map.tileSize, rotation: 0, visible: true,
          properties: o.kind === 'warp' ? [{name: 'toMap', type: 'string', value: o.toMap || ''}, {name: 'toX', type: 'int', value: o.toX || 0}, {name: 'toY', type: 'int', value: o.toY || 0}] : undefined,
        })),
      },
    ],
    nextlayerid: id,
    tilesets: map.tilesets.map(ref => {
      const ts = tilesets.find(t => t.id === ref.id)!;
      return ts && {
        firstgid: ref.firstgid, name: ts.name, image: `${ts.name}.png`, imagewidth: ts.columns * ts.tileSize, imageheight: ts.rows * ts.tileSize,
        tilewidth: ts.tileSize, tileheight: ts.tileSize, columns: ts.columns, tilecount: tileCount(ts), margin: 0, spacing: 0,
      };
    }).filter(Boolean),
  };
}

/**
 * Importa una mappa Tiled: abbina i tileset per nome a quelli della campagna (missing = quelli non trovati),
 * ricrea livelli di tile, collisioni e zone.
 */
export function importTmj(json: any, name: string, tilesets: Tileset[]): {map: MapDoc, missing: string[]} {
  if (json.orientation && json.orientation !== 'orthogonal') throw new Error(t('Solo mappe ortogonali'));
  if (json.infinite) throw new Error(t('Le mappe "infinite" di Tiled non sono supportate: disattiva Infinite in Tiled'));
  const map = newMap(name, json.width, json.height, json.tilewidth);
  map.layers = [];
  const missing: string[] = [];
  const remap = new Map<number, number>(); // firstgid Tiled -> firstgid nostro
  for (const tj of json.tilesets || []) {
    if (tj.source) { missing.push(`${tj.source} (${t('tileset esterno: incorporalo in Tiled con "Embed tileset"')})`); continue; }
    const base = (tj.image || '').split('/').pop()!.replace(/\.\w+$/, '');
    const ts = tilesets.find(x => x.name === tj.name || x.name === base);
    if (!ts) { missing.push(tj.name || base); continue; }
    const before = map.tilesets.length;
    Object.assign(map, addTilesetToMap(map, ts));
    if (map.tilesets.length > before) remap.set(tj.firstgid, map.tilesets.at(-1)!.firstgid);
  }
  const firsts = [...remap.keys()].sort((a, b) => b - a);
  const convert = (raw: number) => {
    const gid = raw & FLIP_MASK;
    if (!gid) return 0;
    const f = firsts.find(fg => fg <= gid);
    return f === undefined ? 0 : remap.get(f)! + (gid - f);
  };
  for (const l of json.layers || []) {
    if (l.type === 'tilelayer' && Array.isArray(l.data)) {
      const pnp = l.properties?.find((p: any) => p.name === 'pnp')?.value;
      if (pnp === 'collision') map.layers.push({name: l.name, type: 'collision', data: l.data.map((v: number) => v ? 1 : 0), visible: true});
      else if (pnp === 'zone') {
        map.layers.push({name: l.name, type: 'zone', data: l.data, visible: true});
        try { map.zoneRefs = JSON.parse(l.properties.find((p: any) => p.name === 'zoneRefs')?.value || '[]'); } catch {}
      } else map.layers.push({name: l.name, type: 'tile', data: l.data.map(convert), visible: l.visible !== false});
    } else if (l.type === 'objectgroup') {
      for (const o of l.objects || []) {
        const prop = (n: string) => o.properties?.find((p: any) => p.name === n)?.value;
        map.objects.push({
          id: crypto.randomUUID(), x: Math.floor(o.x / json.tilewidth), y: Math.floor(o.y / json.tileheight),
          kind: ['warp', 'npc'].includes(o.type || o.class) ? (o.type || o.class) : 'marker', label: o.name || '',
          toMap: prop('toMap'), toX: prop('toX'), toY: prop('toY'),
        });
      }
    }
  }
  if (!map.layers.some(l => l.type === 'collision')) map.layers.push({name: t('Collisioni'), type: 'collision', data: new Array(map.width * map.height).fill(0), visible: true});
  if (!map.layers.some(l => l.type === 'zone')) map.layers.push({name: t('Zone incontri'), type: 'zone', data: new Array(map.width * map.height).fill(0), visible: true});
  return {map, missing};
}

/** Fa scaricare un file di testo al browser. */
export function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Poké Ball disegnata sulla casella; le nascoste (solo Master) sono trasparenti con bordo tratteggiato. */
export function drawPokeball(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hidden = false) {
  ctx.save();
  ctx.globalAlpha = hidden ? .55 : 1;
  ctx.lineWidth = Math.max(1, r * .16);
  ctx.strokeStyle = '#1b2033';
  ctx.fillStyle = '#d83a2c';
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#fdfcf8';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
  ctx.fillStyle = '#fdfcf8';
  ctx.beginPath(); ctx.arc(cx, cy, r * .32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (hidden) {
    ctx.globalAlpha = 1; ctx.setLineDash([r * .35, r * .25]); ctx.strokeStyle = '#f2c230';
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Immagini caricate da URL (sprite dei PNG), una sola volta ciascuna. */
const urlImages = new Map<string, HTMLImageElement>();
/** Immagine da URL, null finché non è pronta; onLoad per ridisegnare quando arriva. */
export function loadImage(url: string, onLoad?: () => void) {
  let img = urlImages.get(url);
  if (!img) { img = new Image(); img.src = url; urlImages.set(url, img); }
  if (!img.complete && onLoad) img.addEventListener('load', onLoad, {once: true});
  return img;
}
