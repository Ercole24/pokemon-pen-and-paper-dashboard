// Editor delle mappe, in stile Tiled (pagina /c/<id>/mappe/<mappa>).
// - A sinistra: strumenti (pennello, gomma, riempi, rettangolo, contagocce, selezione, oggetti) e livelli.
// - Al centro: la mappa su un <canvas>, disegnata con drawMap (mapcore.ts); si sposta con spazio+trascina o tasto centrale.
// - A destra: la tavolozza del tileset (si sceglie un tile o un rettangolo di tile = "timbro") o il pannello dell'oggetto scelto.
// La mappa modificata è tenuta in memoria e salvata da sola 0,8 s dopo l'ultima modifica.
// Annulla/ripeti tengono fino a 60 "istantanee" della mappa.
import {useCallback, useEffect, useRef, useState} from 'react';
import {Pencil, Eraser, PaintBucket, Square, Pipette, SquareDashed, MapPin, ArrowLeft, Undo2, Redo2, Eye, EyeOff, ChevronUp, ChevronDown, Trash2} from 'lucide-react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {useStore, type MapDoc, type Tileset} from '../api';
import {useNpcImage} from './MapPlay';
import {exportMap} from '../mapfiles';
import {SpriteChooser} from '../components';
import {t} from '../i18n';
import {addTilesetToMap, download, drawMap, exportTmj, floodFill, resizeMap, tilesetImage, ZONE_COLORS} from '../mapcore';

/** Strumenti disponibili. */
type Tool = 'brush' | 'eraser' | 'fill' | 'rect' | 'picker' | 'select' | 'object';
/** Timbro: rettangolo di gid da dipingere (un solo tile = 1x1). */
type Stamp = {w: number, h: number, gids: number[]};
/** Rettangolo in caselle. */
type Rect = {x: number, y: number, w: number, h: number};

/** Strumenti: id, nome (da tradurre), tasto rapido. */
const TOOLS: [Tool, string, string][] = [
  ['brush', 'Pennello', 'B'], ['eraser', 'Gomma', 'E'], ['fill', 'Riempi', 'F'], ['rect', 'Rettangolo', 'R'],
  ['picker', 'Contagocce', 'I'], ['select', 'Selezione', 'S'], ['object', 'Oggetti', 'O'],
];
/** Icona di ogni strumento. */
const ICONS: Record<Tool, React.ReactNode> = {brush: <Pencil />, eraser: <Eraser />, fill: <PaintBucket />, rect: <Square />, picker: <Pipette />, select: <SquareDashed />, object: <MapPin />};

/** Rettangolo tra due caselle qualsiasi (in qualunque direzione si trascini). */
const normRect = (a: {x: number, y: number}, b: {x: number, y: number}): Rect =>
  ({x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1});

// key: cambiando mappa dall'editor si riparte da zero (storia, selezione, zoom)
export default function MapEditorRoute() {
  const {mid} = useParams();
  return <MapEditor key={mid} />;
}

/** Scelta di una mappa con ricerca: vuoto = tutte, scrivi «pallet» = solo quelle che lo contengono. */
export function MapPicker({maps, value, onPick, placeholder = t('Cerca una mappa…'), exclude}: {maps: MapDoc[], value?: string, onPick: (id: string) => void, placeholder?: string, exclude?: string}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const cur = maps.find(x => x.id === value);
  const ql = q.toLowerCase();
  const list = maps.filter(x => x.id !== exclude && (!q || `${x.name} ${x.group || ''}`.toLowerCase().includes(ql)))
    .sort((a, b) => +!a.name.toLowerCase().startsWith(ql) - +!b.name.toLowerCase().startsWith(ql)); // «pallet» → prima Pallet Town
  const pick = (id: string) => { onPick(id); setOpen(false); setQ(''); };
  return (
    <div className="map-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setQ(''); } }}>
      <input type="search" role="combobox" aria-expanded={open} placeholder={cur ? cur.name : placeholder} value={q}
        onFocus={() => { setOpen(true); setHi(0); }}
        onChange={e => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, list.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && list[hi]) { e.preventDefault(); pick(list[hi].id!); }
          else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); }
          e.stopPropagation(); // le scorciatoie dell'editor (B, E, F…) non devono scattare mentre scrivi
        }} />
      {open && <ul className="map-picker-list" role="listbox">
        {list.slice(0, 80).map((x, i) => (
          <li key={x.id} role="option" aria-selected={i === hi} tabIndex={-1} className={`${i === hi ? 'hi' : ''} ${x.id === value ? 'cur' : ''}`}
            onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(x.id!)}>
            <span>{x.name}</span>{x.group && <span className="muted small">{x.group}</span>}
          </li>
        ))}
        {!list.length && <li className="muted small">{t('Nessuna mappa con «{q}»', {q})}</li>}
        {list.length > 80 && <li className="muted small">{t('…altre {n}: scrivi per restringere', {n: list.length - 80})}</li>}
      </ul>}
    </div>
  );
}

/** Carica la mappa dall'archivio una volta; da lì in poi l'editor lavora su una copia locale. */
function MapEditor() {
  const {mid} = useParams();
  const {map: maps, tileset: tilesets, zone: zones, save, npcteam, campaign} = useStore();
  const stored = maps.find(x => x.id === mid);
  const [m, setM] = useState<MapDoc | null>(null);
  useEffect(() => { if (!m && stored) setM(stored); }, [stored]);
  if (!m) return <div className="page">{t(stored === undefined ? 'Mappa non trovata.' : 'Caricamento…')}</div>;
  return <Editor m={m} setM={setM as any} tilesets={tilesets} zones={zones} maps={maps} save={save} npcteam={npcteam} gen={campaign.gen} />;
}

/** L'editor vero e proprio (stato, disegno, mouse, tastiera, salvataggio, pannelli). */
function Editor({m, setM, tilesets, zones, maps, save, npcteam, gen}: {
  m: MapDoc, setM: (fn: MapDoc | ((p: MapDoc) => MapDoc)) => void, tilesets: Tileset[], zones: any[], maps: MapDoc[], save: any, npcteam: any[], gen: number,
}) {
  const npcImage = useNpcImage(npcteam, gen, () => force(n => n + 1));
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [layer, setLayer] = useState(0);
  const [zoom, setZoom] = useState(2);
  const [grid, setGrid] = useState(true);
  const [stamp, setStamp] = useState<Stamp>({w: 1, h: 1, gids: [0]});
  const [zoneValue, setZoneValue] = useState(1);
  const [paletteTs, setPaletteTs] = useState<string>(m.tilesets[0]?.id || tilesets[0]?.id || '');
  const [sel, setSel] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<{start: {x: number, y: number}, cur: {x: number, y: number}} | null>(null);
  const [hover, setHover] = useState<{x: number, y: number} | null>(null);
  const [objSel, setObjSel] = useState<string | null>(null);
  const [savedState, setSavedState] = useState<'saved' | 'dirty' | 'saving'>('saved');
  const savedStateRef = useRef(savedState);
  savedStateRef.current = savedState;
  const navigate = useNavigate();
  const [size, setSize] = useState({w: m.width, h: m.height});
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const painting = useRef(false);
  const panning = useRef<{x: number, y: number, sl: number, st: number} | null>(null);
  const space = useRef(false);
  const [tick, force] = useState(0); // immagini caricate: ridisegna
  const L = m.layers[layer];

  // --- disegno ---
  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const T = m.tileSize * zoom;
    if (c.width !== m.width * T) c.width = m.width * T;
    if (c.height !== m.height * T) c.height = m.height * T;
    const ctx = c.getContext('2d')!;
    drawMap(ctx, m, tilesets, {zoom, grid, collision: true, zones: true, objects: true, npcImage, highlightLayer: L?.type === 'tile' ? layer : undefined}, () => force(n => n + 1));
    const box = (r: Rect, color: string, dash = false) => {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; if (dash) ctx.setLineDash([6, 4]);
      ctx.strokeRect(r.x * T + 1, r.y * T + 1, r.w * T - 2, r.h * T - 2); ctx.restore();
    };
    if (sel) box(sel, '#2f7bff', true);
    if (drag && (tool === 'rect' || tool === 'select')) box(normRect(drag.start, drag.cur), tool === 'select' ? '#2f7bff' : '#ffb000', true);
    if (hover && !drag) {
      if (L?.type === 'tile' && (tool === 'brush')) {
        ctx.globalAlpha = .6;
        stamp.gids.forEach((gid, i) => {
          const x = hover.x + (i % stamp.w), y = hover.y + Math.floor(i / stamp.w);
          if (!gid || x >= m.width || y >= m.height) return;
          const r = tilesetOf(gid);
          if (!r) return;
          const img = tilesetImage(r.ts);
          const s = r.ts.tileSize;
          ctx.drawImage(img, (r.local % r.ts.columns) * s, Math.floor(r.local / r.ts.columns) * s, s, s, x * T, y * T, T, T);
        });
        ctx.globalAlpha = 1;
      }
      box({x: hover.x, y: hover.y, w: tool === 'brush' && L?.type === 'tile' ? stamp.w : 1, h: tool === 'brush' && L?.type === 'tile' ? stamp.h : 1}, 'rgba(0,0,0,.6)');
    }
    const o = m.objects.find(x => x.id === objSel);
    if (o) box({x: o.x, y: o.y, w: 1, h: 1}, '#ff2d55');
  }, [m, zoom, grid, sel, drag, hover, stamp, tool, layer, objSel, tilesets, tick]);
  useEffect(() => { draw(); }, [draw]);

  /** Tileset e indice locale di un gid (il tileset con il firstgid più alto che non supera il gid). */
  function tilesetOf(gid: number) {
    let best: {ts: Tileset, local: number} | null = null, bf = -1;
    for (const ref of m.tilesets) if (ref.firstgid <= gid && ref.firstgid > bf) {
      const ts = tilesets.find(t => t.id === ref.id);
      if (ts) { best = {ts, local: gid - ref.firstgid}; bf = ref.firstgid; }
    }
    return best;
  }

  // --- salvataggio automatico ---
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSavedState('dirty');
    const t = setTimeout(async () => { setSavedState('saving'); await save('map', m); setSavedState('saved'); }, 800);
    return () => clearTimeout(t);
  }, [m]);
  // uscendo (o passando a un'altra mappa) prima del salvataggio automatico, salva subito
  const latest = useRef(m);
  latest.current = m;
  useEffect(() => () => { if (savedStateRef.current !== 'saved') save('map', latest.current); }, []);

  // --- storia ---
  /** Annulla/ripeti: istantanea JSON delle parti modificabili della mappa. */
  const snapshot = () => JSON.stringify({layers: m.layers, objects: m.objects, zoneRefs: m.zoneRefs, tilesets: m.tilesets, width: m.width, height: m.height});
  /** Salva lo stato attuale prima di una modifica (e svuota i "ripeti"). */
  function pushUndo() { undo.current.push(snapshot()); if (undo.current.length > 60) undo.current.shift(); redo.current = []; }
  /** Torna a un'istantanea (annulla o ripeti), mettendo lo stato attuale nell'altra pila. */
  function restore(from: React.MutableRefObject<string[]>, to: React.MutableRefObject<string[]>) {
    const s = from.current.pop();
    if (!s) return;
    to.current.push(snapshot());
    const d = JSON.parse(s);
    setM(prev => ({...prev, ...d}));
    setSize({w: d.width, h: d.height});
  }

  // --- modifica dei dati ---
  /** Sostituisce i dati di un livello. */
  function setLayerData(li: number, data: number[]) {
    setM(prev => ({...prev, layers: prev.layers.map((l, i) => i === li ? {...l, data} : l)}));
  }
  /** Valore da scrivere in una casella secondo strumento e livello: tile del timbro (ripetuto), 1 = collisione, zona scelta, 0 = gomma. */
  function valueFor(t: Tool, x: number, y: number) {
    if (t === 'eraser') return 0;
    if (L.type === 'collision') return 1;
    if (L.type === 'zone') return zoneValue;
    return stamp.gids[((y % stamp.h + stamp.h) % stamp.h) * stamp.w + ((x % stamp.w + stamp.w) % stamp.w)];
  }
  /** Modifica i dati del livello attivo partendo sempre dallo stato più recente. */
  function editLayer(fn: (data: number[]) => void) {
    setM(prev => {
      const data = prev.layers[layer].data.slice();
      fn(data);
      return {...prev, layers: prev.layers.map((l, i) => i === layer ? {...l, data} : l)};
    });
  }
  /** Pennello/gomma su una casella (il pennello stampa tutto il timbro). */
  function paint(x: number, y: number, t: Tool) {
    editLayer(data => {
      if (L.type === 'tile' && t === 'brush') {
        stamp.gids.forEach((gid, i) => {
          const tx = x + (i % stamp.w), ty = y + Math.floor(i / stamp.w);
          if (tx < m.width && ty < m.height) data[ty * m.width + tx] = gid;
        });
      } else data[y * m.width + x] = valueFor(t, x, y);
    });
  }
  /** Riempie un rettangolo (strumento rettangolo, o cancella la selezione). */
  function fillRect(r: Rect, t: Tool) {
    editLayer(data => {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) data[y * m.width + x] = valueFor(t === 'rect' ? 'brush' : t, x - r.x, y - r.y);
    });
  }

  // --- mouse ---
  /** Casella sotto il puntatore. */
  const tileAt = (e: React.MouseEvent) => {
    // coordinate in pixel del canvas, indipendenti da zoom del browser e CSS
    const c = canvas.current!, r = c.getBoundingClientRect();
    const T = m.tileSize * zoom;
    const px = (e.clientX - r.left) * (c.width / r.width), py = (e.clientY - r.top) * (c.height / r.height);
    return {x: Math.max(0, Math.min(m.width - 1, Math.floor(px / T))), y: Math.max(0, Math.min(m.height - 1, Math.floor(py / T)))};
  };
  /**
   * Pressione del mouse: spostamento della vista, oggetti (seleziona o crea), contagocce, inizio rettangolo/selezione,
   * riempimento, o inizio pennellata.
   */
  function onDown(e: React.MouseEvent) {
    if (e.button === 1 || space.current) {
      panning.current = {x: e.clientX, y: e.clientY, sl: wrap.current!.scrollLeft, st: wrap.current!.scrollTop};
      return;
    }
    if (e.button !== 0) return;
    const p = tileAt(e);
    if (tool === 'object') {
      const hit = m.objects.find(o => o.x === p.x && o.y === p.y);
      if (hit) setObjSel(hit.id);
      else {
        pushUndo();
        const o = {id: crypto.randomUUID(), x: p.x, y: p.y, kind: 'marker' as const, label: t('Nuovo segnaposto')};
        setM(prev => ({...prev, objects: [...prev.objects, o]}));
        setObjSel(o.id);
      }
      return;
    }
    if (tool === 'picker') {
      const v = L.data[p.y * m.width + p.x];
      if (L.type === 'tile') setStamp({w: 1, h: 1, gids: [v]});
      if (L.type === 'zone' && v) setZoneValue(v);
      setTool('brush');
      return;
    }
    if (!L) return;
    if (tool === 'rect' || tool === 'select') { setDrag({start: p, cur: p}); if (tool === 'select') setSel(null); return; }
    pushUndo();
    if (tool === 'fill') { setLayerData(layer, floodFill(L.data, m.width, m.height, p.x, p.y, (x, y) => valueFor('brush', x, y))); return; }
    painting.current = true;
    paint(p.x, p.y, tool);
  }
  /** Movimento: sposta la vista, aggiorna l'anteprima, allarga il rettangolo o continua la pennellata. */
  function onMove(e: React.MouseEvent) {
    if (panning.current) {
      wrap.current!.scrollLeft = panning.current.sl - (e.clientX - panning.current.x);
      wrap.current!.scrollTop = panning.current.st - (e.clientY - panning.current.y);
      return;
    }
    const p = tileAt(e);
    if (hover?.x !== p.x || hover?.y !== p.y) setHover(p);
    if (drag) setDrag({...drag, cur: p});
    else if (painting.current && (tool === 'brush' || tool === 'eraser')) paint(p.x, p.y, tool);
  }
  /** Rilascio: applica il rettangolo o fissa la selezione. */
  function onUp() {
    panning.current = null;
    painting.current = false;
    if (drag) {
      const r = normRect(drag.start, drag.cur);
      if (tool === 'rect') { pushUndo(); fillRect(r, 'rect'); }
      else setSel(r);
      setDrag(null);
    }
  }

  // --- tastiera ---
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === ' ') { space.current = true; e.preventDefault(); }
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? restore(redo, undo) : restore(undo, redo); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); restore(redo, undo); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'c' && sel && L?.type === 'tile') {
        const gids: number[] = [];
        for (let y = sel.y; y < sel.y + sel.h; y++) for (let x = sel.x; x < sel.x + sel.w; x++) gids.push(L.data[y * m.width + x]);
        setStamp({w: sel.w, h: sel.h, gids}); setTool('brush'); return;
      }
      if ((k === 'delete' || k === 'backspace') && sel) { pushUndo(); fillRect(sel, 'eraser'); return; }
      if ((k === 'delete' || k === 'backspace') && objSel) { pushUndo(); setM(p => ({...p, objects: p.objects.filter(o => o.id !== objSel)})); setObjSel(null); return; }
      if (k === 'escape') { setSel(null); setObjSel(null); }
      if (k === '+' || k === '=') setZoom(z => Math.min(8, z + 1));
      if (k === '-') setZoom(z => Math.max(1, z - 1));
      if (k === 'g' && !e.ctrlKey) setGrid(g => !g);
      const shortcut = TOOLS.find(([, , key]) => key.toLowerCase() === k);
      if (shortcut && !e.ctrlKey && !e.metaKey) setTool(shortcut[0]);
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') space.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  // --- livelli ---
  /** Livelli: rinomina, mostra/nascondi, sposta su/giù. */
  const updateLayer = (i: number, p: Partial<MapDoc['layers'][0]>) => setM(prev => ({...prev, layers: prev.layers.map((l, j) => j === i ? {...l, ...p} : l)}));
  function moveLayer(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= m.layers.length) return;
    pushUndo();
    const layers = [...m.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    setM({...m, layers});
    setLayer(j);
  }

  const obj = m.objects.find(o => o.id === objSel);
  const setObj = (p: Partial<MapDoc['objects'][0]>) => setM(prev => ({...prev, objects: prev.objects.map(o => o.id === objSel ? {...o, ...p} : o)}));

  return (
    <div className="editor">
      <header className="editor-bar">
        <Link to=".." relative="path" className="btn-icon" aria-label={t('Indietro')}><ArrowLeft /></Link>
        <input className="title-input" value={m.name} onChange={e => setM({...m, name: e.target.value})} aria-label={t('Nome mappa')} />
        <MapPicker maps={maps} exclude={m.id} placeholder={t("Vai a un'altra mappa…")} onPick={id => navigate(`../${id}`, {relative: 'path'})} />
        <span className={`save-state ${savedState}`}>{t(savedState === 'saved' ? 'Salvata' : savedState === 'saving' ? 'Salvataggio…' : 'Modifiche non salvate')}</span>
        <div className="row gap-s">
          <button className="btn-icon" title={`${t('Annulla')} (Ctrl+Z)`} onClick={() => restore(undo, redo)} disabled={!undo.current.length} aria-label={t('Annulla')}><Undo2 /></button>
          <button className="btn-icon" title={`${t('Ripeti')} (Ctrl+Y)`} onClick={() => restore(redo, undo)} disabled={!redo.current.length} aria-label={t('Ripeti')}><Redo2 /></button>
          <button className="btn-icon" title="Zoom −" onClick={() => setZoom(z => Math.max(1, z - 1))}>−</button>
          <span className="small">{zoom * 100}%</span>
          <button className="btn-icon" title="Zoom +" onClick={() => setZoom(z => Math.min(8, z + 1))}>+</button>
          <label className="check small"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> {t('Griglia')}</label>
          <button onClick={() => exportMap(m, tilesets)} title={t("File da importare in un'altra campagna")}>{t('Esporta mappa')}</button>
          <button onClick={() => download(`${m.name}.tmj`, JSON.stringify(exportTmj(m, tilesets), null, 1))}>{t('Esporta Tiled')}</button>
          <button onClick={() => { const a = document.createElement('a'); a.href = canvas.current!.toDataURL('image/png'); a.download = `${m.name}.png`; a.click(); }}>PNG</button>
          <Link className="btn btn-primary" to="gioca">{t('Gioca')}</Link>
        </div>
      </header>

      <div className="editor-body">
        <aside className="editor-left">
          <div className="toolbox" role="toolbar" aria-label={t('Strumenti')}>
            {TOOLS.map(([id, label, key]) => (
              <button key={id} className={tool === id ? 'active' : ''} onClick={() => setTool(id)} title={`${t(label)} (${key})`} aria-label={t(label)}>
                <span className="tool-icon">{ICONS[id]}</span><span className="tool-label">{t(label)}</span>
              </button>
            ))}
          </div>

          <h3>{t('Livelli')}</h3>
          <ul className="layers">
            {m.layers.map((l, i) => (
              <li key={i} className={i === layer ? 'active' : ''} onClick={() => setLayer(i)}>
                <button className="btn-icon eye" aria-label={t(l.visible === false ? 'Mostra' : 'Nascondi')} onClick={e => { e.stopPropagation(); updateLayer(i, {visible: l.visible === false}); }}>{l.visible === false ? <EyeOff /> : <Eye />}</button>
                <input value={l.name} onChange={e => updateLayer(i, {name: e.target.value})} aria-label={t('Nome livello')} />
                <span className="layer-kind">{l.type === 'collision' ? 'COLL' : l.type === 'zone' ? 'ZONE' : ''}</span>
                <span className="layer-actions">
                  <button className="btn-icon" aria-label={t('Su')} onClick={e => { e.stopPropagation(); moveLayer(i, -1); }}><ChevronUp /></button>
                  <button className="btn-icon" aria-label={t('Giù')} onClick={e => { e.stopPropagation(); moveLayer(i, 1); }}><ChevronDown /></button>
                  {l.type === 'tile' && <button className="btn-icon" aria-label={t('Elimina livello')} onClick={e => {
                    e.stopPropagation();
                    if (!confirm(t('Eliminare il livello {name}?', {name: l.name}))) return;
                    pushUndo(); setM({...m, layers: m.layers.filter((_, j) => j !== i)}); setLayer(0);
                  }}><Trash2 /></button>}
                </span>
              </li>
            ))}
          </ul>
          <button className="btn-s" onClick={() => { pushUndo(); setM({...m, layers: [...m.layers.slice(0, layer + 1), {name: t('Livello {n}', {n: m.layers.length + 1}), type: 'tile', data: new Array(m.width * m.height).fill(0), visible: true}, ...m.layers.slice(layer + 1)]}); setLayer(layer + 1); }}>+ {t('Livello tile')}</button>

          <h3>{t('Dimensioni')}</h3>
          <div className="row gap-s">
            <input type="number" className="w-num" min={1} max={500} value={size.w} onChange={e => setSize({...size, w: +e.target.value})} aria-label={t('Larghezza')} />×
            <input type="number" className="w-num" min={1} max={500} value={size.h} onChange={e => setSize({...size, h: +e.target.value})} aria-label={t('Altezza')} />
            <button className="btn-s" disabled={size.w === m.width && size.h === m.height} onClick={() => { pushUndo(); setM(resizeMap(m, size.w, size.h)); }}>{t('Applica')}</button>
          </div>
          <p className="small muted">{hover ? `x ${hover.x}, y ${hover.y}` : ' '} · {t('Spazio+trascina o tasto centrale per spostarti · Ctrl+C copia la selezione come timbro')}</p>
        </aside>

        <div className="editor-canvas" ref={wrap} onMouseLeave={() => { setHover(null); onUp(); }}>
          <canvas ref={canvas} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onContextMenu={e => e.preventDefault()}
            style={{cursor: space.current ? 'grab' : tool === 'object' ? 'pointer' : 'crosshair'}} />
        </div>

        <aside className="editor-right">
          {tool === 'object' || obj ? (
            <ObjectPanel obj={obj} setObj={setObj} maps={maps} npcteam={npcteam} onDelete={() => { pushUndo(); setM({...m, objects: m.objects.filter(o => o.id !== objSel)}); setObjSel(null); }} />
          ) : L?.type === 'collision' ? (
            <div className="hint">
              <h3>{t('Collisioni')}</h3>
              <p className="small">{t('Pennello = blocca (rosso), Gomma = libera. Servono a ricordare al tavolo dove non si passa.')}</p>
            </div>
          ) : L?.type === 'zone' ? (
            <div>
              <h3>{t('Zone incontri')}</h3>
              <p className="small muted">{t("Dipingi le aree (erba alta, grotte…) e collegale a una zona. Al tavolo, un clic lì genera l'incontro.")}</p>
              <ul className="zone-refs">
                {m.zoneRefs.map((zid, i) => (
                  <li key={i} className={zoneValue === i + 1 ? 'active' : ''} onClick={() => setZoneValue(i + 1)}>
                    <span className="swatch" style={{background: ZONE_COLORS[i % ZONE_COLORS.length]}} />
                    <select value={zid} onChange={e => setM({...m, zoneRefs: m.zoneRefs.map((z, j) => j === i ? e.target.value : z)})}>
                      <option value="">— {t('nessuna')} —</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
              <button className="btn-s" onClick={() => { setM({...m, zoneRefs: [...m.zoneRefs, zones[0]?.id || '']}); setZoneValue(m.zoneRefs.length + 1); }}>+ {t('Area zona')}</button>
              {!zones.length && <p className="small error">{t('Crea prima le zone nella pagina “Zone e incontri”.')}</p>}
            </div>
          ) : (
            <Palette tilesets={tilesets} tsId={paletteTs} setTsId={setPaletteTs} map={m}
              onPick={(ts, r) => {
                let mm = m;
                if (!m.tilesets.some(x => x.id === ts.id)) { mm = addTilesetToMap(m, ts); setM(mm); }
                const fg = mm.tilesets.find(x => x.id === ts.id)!.firstgid;
                const gids: number[] = [];
                for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) gids.push(fg + y * ts.columns + x);
                setStamp({w: r.w, h: r.h, gids});
                if (tool !== 'fill' && tool !== 'rect') setTool('brush');
              }} />
          )}
        </aside>
      </div>
    </div>
  );
}

/** Tavolozza: mostra il tileset scelto; clic = un tile, trascina = rettangolo di tile come timbro. */
function Palette({tilesets, tsId, setTsId, onPick, map}: {tilesets: Tileset[], tsId: string, setTsId: (s: string) => void, onPick: (ts: Tileset, r: Rect) => void, map: MapDoc}) {
  const choices = tilesets;
  const ts = choices.find(t => t.id === tsId) || choices[0];
  const cv = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(2);
  const [drag, setDrag] = useState<{s: {x: number, y: number}, c: {x: number, y: number}} | null>(null);
  const [picked, setPicked] = useState<Rect | null>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const c = cv.current;
    if (!c || !ts) return;
    const img = tilesetImage(ts, () => force(n => n + 1));
    const T = ts.tileSize * scale;
    c.width = ts.columns * T; c.height = ts.rows * T;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#e9e6dc'; ctx.fillRect(0, 0, c.width, c.height);
    if (img.complete) ctx.drawImage(img, 0, 0, ts.columns * ts.tileSize, ts.rows * ts.tileSize, 0, 0, c.width, c.height);
    const r = drag ? normRect(drag.s, drag.c) : picked;
    if (r) { ctx.strokeStyle = '#2f7bff'; ctx.lineWidth = 3; ctx.strokeRect(r.x * T + 1.5, r.y * T + 1.5, r.w * T - 3, r.h * T - 3); }
  });
  if (!ts) return <div className="hint"><h3>Tileset</h3><p className="small">{t('Nessun tileset ancora: caricali (PNG) nella pagina Mappe, sezione Tileset.')}</p></div>;
  const at = (e: React.MouseEvent) => {
    const c = cv.current!, r = c.getBoundingClientRect(), T = ts.tileSize * scale;
    const px = (e.clientX - r.left) * (c.width / r.width), py = (e.clientY - r.top) * (c.height / r.height);
    return {x: Math.max(0, Math.min(ts.columns - 1, Math.floor(px / T))), y: Math.max(0, Math.min(ts.rows - 1, Math.floor(py / T)))};
  };
  return (
    <div className="palette">
      <div className="row gap-s">
        <select value={ts.id} onChange={e => setTsId(e.target.value)} aria-label="Tileset">
          {choices.map(ts => <option key={ts.id} value={ts.id}>{ts.name}{map.tilesets.some(x => x.id === ts.id) ? '' : ` (${t('nuovo')})`}</option>)}
        </select>
        <button className="btn-icon" onClick={() => setScale(s => Math.max(1, s - 1))} aria-label={t('Riduci')}>−</button>
        <button className="btn-icon" onClick={() => setScale(s => Math.min(4, s + 1))} aria-label={t('Ingrandisci')}>+</button>
      </div>
      <p className="small muted">{t('Trascina per scegliere più tile insieme.')}</p>
      <div className="palette-scroll">
        <canvas ref={cv} onMouseDown={e => { const p = at(e); setDrag({s: p, c: p}); }}
          onMouseMove={e => drag && setDrag({...drag, c: at(e)})}
          onMouseUp={() => { if (drag) { const r = normRect(drag.s, drag.c); setPicked(r); onPick(ts, r); setDrag(null); } }} />
      </div>
    </div>
  );
}

/**
 * Proprietà dell'oggetto selezionato: tipo (PNG, Poké Ball, porta, segnaposto), etichetta e campi del tipo
 * (squadra PNG o sprite e frase, strumento e nascosta, mappa e coordinate d'arrivo, colore).
 */
function ObjectPanel({obj, setObj, maps, npcteam, onDelete}: {obj?: MapDoc['objects'][0], setObj: (p: any) => void, maps: MapDoc[], npcteam: any[], onDelete: () => void}) {
  if (!obj) return <div className="hint"><h3>{t('Oggetti')}</h3><p className="small">{t("Clicca sulla mappa per aggiungere un segnaposto, un PNG o una porta verso un'altra mappa. Clicca su un oggetto per modificarlo.")}</p></div>;
  return (
    <div className="stack">
      <h3>{t('Oggetto')} ({obj.x}, {obj.y})</h3>
      <label>{t('Tipo')}<select value={obj.kind} onChange={e => setObj({kind: e.target.value})}>
        <option value="npc">{t('PNG / Allenatore')}</option><option value="item">{t('Oggetto (Poké Ball)')}</option><option value="warp">{t('Porta / passaggio')}</option><option value="marker">{t('Segnaposto')}</option>
      </select></label>
      {obj.kind === 'npc' && <label>{t('Allenatore')}<select value={obj.npcTeam || ''} onChange={e => { const team = npcteam.find(x => x.id === e.target.value); setObj({npcTeam: e.target.value, label: team ? `${team.trainerClass ? t(team.trainerClass) : ''} ${team.name}`.trim() : obj.label}); }}>
        <option value="">— {t('scegli tra le Squadre PNG')} —</option>
        {npcteam.map(team => { const where = maps.find(m => m.objects?.some(o => o.id !== obj.id && o.kind === 'npc' && o.npcTeam === team.id)); return <option key={team.id} value={team.id} disabled={!!where}>{team.trainerClass ? t(team.trainerClass) : ''} {team.name}{where ? ` — ${t('già in {name}', {name: where.name})}` : team.defeated ? ` — ${t('sconfitto')}` : ''}</option>; })}
      </select></label>}
      {obj.kind === 'npc' && !obj.npcTeam && <div className="stack"><span className="small muted">{t('…oppure solo uno sprite (abitante, commesso, mamma…)')}</span>
        <SpriteChooser value={obj.sprite || ''} placeholder={t('nessuno')} onChange={b => setObj({sprite: b})} /></div>}
      {obj.kind === 'npc' && <label>{t('Cosa dice')}<textarea rows={3} value={obj.text || ''} placeholder={t('Benvenuto a Giubilopoli!')} onChange={e => setObj({text: e.target.value})} /></label>}
      {obj.kind === 'item' && <>
        <label>{t('Strumento')}<input value={obj.item || ''} placeholder={t('es. Pozione, MT26, Caramella Rara')} onChange={e => setObj({item: e.target.value, label: e.target.value})} /></label>
        <label className="check"><input type="checkbox" checked={!!obj.hidden} onChange={e => setObj({hidden: e.target.checked})} /> {t('Nascosto (lo vede solo il Master)')}</label>
      </>}
      <label>{t('Etichetta')}<input value={obj.label} onChange={e => setObj({label: e.target.value})} /></label>
      {obj.kind === 'marker' && <label>{t('Colore')}<input type="color" value={obj.color || '#4f8fdf'} onChange={e => setObj({color: e.target.value})} /></label>}
      {obj.kind === 'warp' && <>
        <div className="stack"><span className="small muted">{t('Porta a')}{obj.toMap ? `: ${maps.find(mm => mm.id === obj.toMap)?.name || '?'}` : ''}</span>
          <MapPicker maps={maps} value={obj.toMap} placeholder={t('Cerca la mappa di arrivo…')} onPick={id => setObj({toMap: id})} />
        </div>
        <div className="row gap-s">
          <label>x<input type="number" className="w-num" value={obj.toX ?? 0} onChange={e => setObj({toX: +e.target.value})} /></label>
          <label>y<input type="number" className="w-num" value={obj.toY ?? 0} onChange={e => setObj({toY: +e.target.value})} /></label>
        </div>
      </>}
      <button className="btn-danger" onClick={onDelete}>{t('Elimina oggetto')}</button>
    </div>
  );
}
