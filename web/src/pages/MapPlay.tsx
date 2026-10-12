// Mappa durante la partita.
// - Pagina del master (/c/<id>/mappe/<mappa>/gioca): tutta la mappa, segnalini trascinabili, posizionamento degli
//   Allenatori con un clic, clic su porte (cambia mappa) e zone (avvia un incontro), dialoghi dei PNG e sfida.
// - MapView è usata anche dal telefono (pagina Player) con gm=false: visuale limitata attorno al proprio Allenatore,
//   movimento solo verso le caselle raggiungibili.
// I segnalini si spostano mandando l'evento 'token' a socket.io: il server li salva nella mappa e li manda a tutti.
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, DoorOpen, Eye, EyeOff, Info, MessageSquare, Move, Plus, Sprout, Swords, Trash2, UserX, Crosshair, ZoomIn, ZoomOut} from 'lucide-react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {api, socket, spriteUrl, useMap, useSpecies, useStore, useTable, type MapDoc} from '../api';
import {drawMap, loadImage} from '../mapcore';
import {EncounterButtons, Modal, SpeciesInput, SpriteChooser, useBadges} from '../components';
import {LANG, t, tj} from '../i18n';
import {fieldNeed, fieldPass, hasBike, reachable} from '../../../server/src/field';
import {npcSprite, NpcTeamInfo} from './NpcTeams';
import {badgesOf, resolveTrainerSprite, spriteForTrainer, trainerSpriteUrl} from '../trainers';

/** Nome semplificato per confrontare mappa e zona (minuscole, senza parentesi né simboli). */
const zoneKey = (n: string) => n.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

/** Pagina del master: intestazione con cambio mappa e la mappa; segna la mappa come "attiva" (quella che vedono i telefoni). */
export default function MapPlay() {
  const {mid} = useParams();
  const {map, campaign, updateCampaign} = useStore();
  const nav = useNavigate();
  const current = useMap(mid);
  useEffect(() => { if (mid && campaign.activeMap !== mid) updateCampaign({activeMap: mid}); }, [mid]);
  // il gruppo ha votato di passare da una porta: il server ha cambiato la mappa attiva, il Master la segue
  // (solo ai cambi successivi: all'apertura comanda la mappa scelta dal Master)
  const lastActive = useRef(campaign.activeMap);
  useEffect(() => {
    const prev = lastActive.current;
    lastActive.current = campaign.activeMap;
    if (campaign.activeMap && prev && campaign.activeMap !== prev && campaign.activeMap !== mid) nav(`../../${campaign.activeMap}/gioca`, {relative: 'path'});
  }, [campaign.activeMap]);
  if (!current) return <div className="page">{current === null ? t('Caricamento…') : t('Mappa non trovata.')}</div>;
  return (
    <div className="play-page">
      <header className="editor-bar">
        <Link to="../.." relative="path" className="btn-icon" aria-label={t('Indietro')}><ArrowLeft /></Link>
        <h1 className="play-title">{current.name}</h1>
        <select value={mid} onChange={e => nav(`../../${e.target.value}/gioca`, {relative: 'path'})} aria-label={t('Cambia mappa')}>
          {[...map].sort((a, b) => +(b.id === mid) - +(a.id === mid) || a.name.localeCompare(b.name, 'it', {numeric: true})).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <Link className="btn" to=".." relative="path">{t('Modifica')}</Link>
      </header>
      <TableBar map={current} gm />
      <MapView map={current} gm onWarp={id => nav(`../../${id}/gioca`, {relative: 'path'})} />
    </div>
  );
}

/** Immagine dello sprite di un PNG sulla mappa (dalla sua squadra o dallo sprite scelto). */
export function useNpcImage(npcteam: any[], gen: number, redraw: () => void) {
  return (ob: {npcTeam?: string, sprite?: string}) => {
    const t = npcteam.find(x => x.id === ob.npcTeam);
    const name = t ? spriteForTrainer({sprite: npcSprite(t)}, gen) : ob.sprite ? spriteForTrainer({sprite: ob.sprite}, gen) : '';
    return name ? loadImage(trainerSpriteUrl(name), redraw) : null;
  };
}

/** Colore di ogni Allenatore (nome sulla mappa, frecce, laser, tiri dei dadi), nell'ordine in cui sono stati creati. */
const PLAYER_COLORS = ['#d83a2c', '#2f6fdf', '#2f9e4f', '#d98a00', '#9b4fd8', '#d6488a', '#1f9fa8', '#7a6a2a'];
export const playerColor = (trainers: {id?: string}[], id?: string) => {
  const i = trainers.findIndex(t => t.id === id);
  return i < 0 ? '#16213f' : PLAYER_COLORS[i % PLAYER_COLORS.length];
};
/** Punto del puntatore laser (in caselle, con decimali) e quando è arrivato. */
type LaserDot = {x: number, y: number, color: string, name: string, t: number};
const LASER_MS = 1500;

/** Segnalino sulla mappa: un Allenatore, oppure un Pokémon, PNG o trappola messo dal master (anche invisibile ai giocatori). */
type Tok = NonNullable<MapDoc['tokens']>[0];

/** Sprite degli Allenatori già caricati. */
const spriteImgs = new Map<string, HTMLImageElement>();
function spriteImg(url: string, onLoad: () => void) {
  let img = spriteImgs.get(url);
  if (!img) { img = new Image(); img.src = url; spriteImgs.set(url, img); }
  if (!img.complete) img.addEventListener('load', onLoad, {once: true});
  return img;
}

export {reachable};

/**
 * Mappa al tavolo.
 * Master: vede tutta la mappa, trascina qualsiasi segnalino, clic su zone e porte.
 * Giocatore: visuale attorno al proprio Allenatore; tocca il personaggio e poi una casella evidenziata per muoverti.
 */
/** Tiene il menu dentro lo schermo: vicino al bordo basso si apre verso l'alto, ai lati rientra. */
const fitPopover = (el: HTMLDivElement | null) => {
  if (!el) return;
  // misure senza transform (l'animazione d'entrata le falserebbe): il menu è centrato sul punto cliccato
  const x = parseFloat(el.style.left), y = parseFloat(el.style.top), w = el.offsetWidth, h = el.offsetHeight, pad = 8;
  const up = y + 10 + h > innerHeight - pad;
  const dx = Math.max(pad - (x - w / 2), Math.min(0, innerWidth - pad - (x + w / 2)));
  el.style.transform = `translate(calc(-50% + ${dx}px), ${up ? 'calc(-100% - 10px)' : '10px'})`;
};

/** La mappa interattiva (master o giocatore). */
export function MapView({map, gm, myToken, onWarp}: {map: MapDoc, gm?: boolean, myToken?: string, onWarp?: (mapId: string) => void}) {
  const {tileset, trainer, zone, campaign, npcteam, save, map: allMaps} = useStore();
  const nav = useNavigate();
  const npcImage = useNpcImage(npcteam, campaign.gen, () => force(n => n + 1));
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({w: 800, h: 600});
  const [zoomMul, setZoomMul] = useState(1);
  const [overlays, setOverlays] = useState(false);
  // segnalino preso dal master: start = casella di partenza (se non si sposta, il clic apre il suo menu)
  const [dragTok, setDragTok] = useState<{id: string, x: number, y: number, start: string} | null>(null);
  // PNG, oggetto o segnaposto preso dal master (si sposta senza aprire l'editor; senza spostamento il clic apre il suo menu)
  const [dragObj, setDragObj] = useState<{id: string, x: number, y: number, start: string} | null>(null);
  // passando con il mouse: nome e testo di quello che c'è sulla casella
  const [tip, setTip] = useState<{key: string, x: number, y: number, title: string, text?: string, gm?: string} | null>(null);
  const [selected, setSelected] = useState(false);
  const [menu, setMenu] = useState<{x: number, y: number, zoneId?: string, warp?: MapDoc['objects'][0], tokenId?: string, obj?: MapDoc['objects'][0]} | null>(null);
  // il menu si chiude toccando fuori (la mappa lo gestisce già in onDown) o con Esc
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const out = (e: PointerEvent) => { if (!pop.current?.contains(e.target as Node) && e.target !== cv.current) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc); };
  }, [menu]);
  const [talk, setTalk] = useState<MapDoc['objects'][0] | null>(null);
  // Master: scheda del PNG (note, ricompensa, sconfitto) aperta sopra la mappa
  const [npcInfo, setNpcInfo] = useState<string | null>(null);
  const challenge = (teamId: string) => { sessionStorage.setItem('pnp-team', teamId); nav(`/c/${campaign.id}/lotta`); };
  // master: «Posiziona allenatori» -> allenatore scelto da mettere con un clic (null = modalità spenta)
  const [placing, setPlacing] = useState<string | null>(null);
  // master: segnalino libero da creare (finestra aperta) e poi da mettere con un clic
  const [draft, setDraft] = useState<Tok | null>(null);
  const [placeDraft, setPlaceDraft] = useState(false);
  const species = useSpecies(campaign.gen);
  const [, force] = useState(0);
  // i giocatori non ricevono a schermo i segnalini nascosti (trappole, agguati…)
  const tokens: Tok[] = (map.tokens || []).filter(t => gm || !t.hidden);
  const me = tokens.find(t => t.id === myToken);
  // passi per turno (raddoppiati con la Bicicletta) e caselle da MN attraversabili (MN nello zaino + medaglia)
  const meTrainer = trainer.find(t => t.id === myToken);
  const badges = useBadges();
  const range = (campaign.moveRange ?? 8) * (hasBike(meTrainer?.bag) ? 2 : 1);
  const pass = fieldPass(meTrainer?.bag || '', badges.of(meTrainer), campaign.region);
  // caselle visibili in larghezza per il giocatore: come nel gioco la visuale non dipende dalla mappa
  // (una mappa piccola si vede intera con il nero attorno). Numero dispari: il personaggio resta al centro.
  // su schermi piccoli (telefono) caselle di almeno 36 px: meno caselle visibili al massimo indietro (sempre dispari)
  const fit = Math.floor(Math.max(box.w, box.h) / 36);
  const MIN_VIEW = 9, maxView = Math.max(MIN_VIEW, Math.min(31, fit % 2 ? fit : fit - 1));
  const [view, setView] = useState(() => { try { return +(localStorage.getItem('pnp-view2') || 19); } catch { return 19; } });
  const VIEW = Math.max(MIN_VIEW, Math.min(maxView, view));
  /** Giocatore: più o meno caselle visibili, ricordato nel browser. */
  const zoomView = (d: number) => { const v = Math.max(MIN_VIEW, Math.min(maxView, VIEW + d)); setView(v); try { localStorage.setItem('pnp-view2', String(v)); } catch {} };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({w: el.clientWidth, h: el.clientHeight}));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // scala: il Master adatta tutta la mappa; il giocatore vede sempre VIEW caselle sul lato lungo dello schermo,
  // qualunque sia la mappa: su un telefono in verticale il lato lungo è l'altezza, così non vede più mappa che dal PC
  const T = gm
    ? Math.max(4, Math.min(box.w / map.width, box.h / map.height) * zoomMul)
    : Math.max(8, Math.floor(Math.max(box.w, box.h) / VIEW));
  // sul lato corto quanto entra (dispari, per tenere il personaggio al centro)
  const viewW = gm ? map.width : Math.max(1, Math.min(VIEW, Math.floor(box.w / T)) | 1);
  const viewH = gm ? map.height : Math.max(1, Math.min(VIEW, Math.floor(box.h / T)) | 1);
  // la telecamera segue il personaggio sempre al centro, anche vicino ai bordi (fuori dalla mappa è nero)
  const cam = gm || !me ? {x: 0, y: 0} : {x: me.x - Math.floor(viewW / 2), y: me.y - Math.floor(viewH / 2)};
  const occupied = new Set(tokens.filter(t => t.id !== myToken).map(t => `${t.x},${t.y}`));
  // turni attivi: muove solo chi è di turno, contando i passi da dove ha iniziato il turno
  const {turns, vote} = useTable();
  const myTurn = !turns || turns.order[turns.current] === myToken;
  const allowed = useMemo(() => {
    if (gm || !me || !myTurn) return null;
    const from = turns?.start || me, r = reachable(map, from, range, occupied, pass);
    if (from.x !== me.x || from.y !== me.y) { r.add(`${from.x},${from.y}`); r.delete(`${me.x},${me.y}`); }
    return r;
  }, [map, me?.x, me?.y, myTurn, turns?.start?.x, turns?.start?.y, range, [...occupied].join(';'), [...pass].join()]);
  const moves = selected ? allowed : null;

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    c.width = Math.round(viewW * T); c.height = Math.round(viewH * T);
    const ctx = c.getContext('2d')!;
    const redraw = () => force(n => n + 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!gm) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); } // fuori dalla mappa: nero
    ctx.translate(-cam.x * T, -cam.y * T);
    const zoomTiles = T / map.tileSize;
    const above = new Set(map.layers.map((l, i) => /sopra|above/i.test(l.name) ? i : -1).filter(i => i >= 0)); // "Sopra i personaggi" / "Above characters"
    const shown = dragObj ? {...map, objects: map.objects.map(o => o.id === dragObj.id ? {...o, x: dragObj.x, y: dragObj.y} : o)} : map;
    drawMap(ctx, shown, tileset, {zoom: zoomTiles, collision: gm && overlays, zones: gm && overlays, objects: gm, playerObjects: !gm, hidden: above, noClear: true, npcImage}, redraw);
    if (moves) {
      ctx.fillStyle = 'rgba(242, 194, 48, .38)';
      ctx.strokeStyle = 'rgba(27, 32, 51, .55)';
      ctx.lineWidth = Math.max(1, T * .04);
      for (const k of moves) {
        const [x, y] = k.split(',').map(Number);
        ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
        ctx.beginPath(); ctx.arc((x + .5) * T, (y + .5) * T, T * .12, 0, Math.PI * 2); ctx.fillStyle = 'rgba(27, 32, 51, .55)'; ctx.fill(); ctx.fillStyle = 'rgba(242, 194, 48, .38)';
      }
    }
    // segnalini: sprite dell'Allenatore in piedi sulla casella, nome sotto
    const sorted = [...tokens].sort((a, b) => a.y - b.y);
    for (const t of sorted) {
      const p = dragTok?.id === t.id ? dragTok : t;
      const tr = trainer.find(x => x.id === t.id);
      const url = tr ? trainerSpriteUrl(spriteForTrainer(tr, campaign.gen))
        : t.kind === 'pokemon' ? spriteUrl(species.get(t.sprite || '')?.spriteid, campaign.gen)
        : t.kind === 'npc' && t.sprite ? trainerSpriteUrl(resolveTrainerSprite(t.sprite, campaign.gen)) : '';
      ctx.globalAlpha = t.hidden ? .45 : 1;
      const cx = (p.x + .5) * T, base = (p.y + 1) * T;
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(cx, base - T * .1, T * .38, T * .14, 0, 0, Math.PI * 2); ctx.fill();
      if (t.id === myToken && selected) {
        ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(2, T * .08);
        ctx.beginPath(); ctx.ellipse(cx, base - T * .1, T * .44, T * .18, 0, 0, Math.PI * 2); ctx.stroke();
      }
      const img = url ? spriteImg(url, redraw) : null;
      const S = T * 1.7;
      ctx.imageSmoothingEnabled = false;
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, cx - S / 2, base - S + T * .05, S, S);
      else {
        ctx.fillStyle = t.color || '#d83a2c';
        ctx.beginPath(); ctx.arc(cx, base - T / 2, T * .38, 0, Math.PI * 2); ctx.fill();
        if (t.kind === 'trap') { ctx.fillStyle = '#fff'; ctx.font = `bold ${T * .5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', cx, base - T / 2); }
      }
      ctx.globalAlpha = 1;
      // sul telefono si vedono i nomi degli Allenatori (non quelli dei segnalini del master: rovinerebbero la sorpresa)
      if (!gm && !tr) continue;
      const label = (tr?.name || t.label).toUpperCase();
      const fs = Math.max(8, Math.min(13, T * (t.id === myToken || gm ? .28 : .24)));
      ctx.font = `${fs}px PKPixel, monospace`;
      const w = ctx.measureText(label).width + fs;
      const lx = Math.max(cam.x * T + w / 2 + 2, Math.min((cam.x + viewW) * T - w / 2 - 2, cx)); // il nome resta dentro lo schermo
      ctx.fillStyle = tr ? playerColor(trainer, tr.id) : '#16213f';
      ctx.beginPath(); ctx.roundRect(lx - w / 2, base + 2, w, fs * 1.7, 4); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, base + 2 + fs * .9);
    }
    const all = new Set(map.layers.map((_, i) => i));
    above.forEach(i => all.delete(i));
    if (above.size) drawMap(ctx, map, tileset, {zoom: zoomTiles, hidden: all, noClear: true}, redraw);
    // sopra i PNG: 💬 = ha qualcosa da dire ai giocatori, ⚠️ = note per il master (solo il master)
    ctx.font = `${Math.max(10, T * .42)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    // porte: i giocatori le vedono (cornice dorata) per scegliere dove entrare; quelle scelte sono piene, col numero di chi le ha scelte sopra
    const groups = (vote?.queue || []).filter(g => g.mapId === map.id);
    for (const o of shown.objects) {
      if (o.kind !== 'warp' || !o.toMap) continue;
      const n = groups.find(g => g.warpId === o.id)?.trainers.length || 0, x = o.x * T, y = o.y * T;
      if (!gm || n) {
        ctx.fillStyle = n ? 'rgba(242,194,48,.45)' : 'rgba(242,194,48,.15)';
        ctx.strokeStyle = '#f2c230'; ctx.lineWidth = Math.max(2, T * .08);
        ctx.beginPath(); ctx.roundRect(x + T * .08, y + T * .08, T * .84, T * .84, T * .18); ctx.fill(); ctx.stroke();
      }
      if (n) {
        const fs = Math.max(9, T * .32), w = fs * 1.6;
        ctx.fillStyle = '#16213f'; ctx.beginPath(); ctx.roundRect(x + T / 2 - w / 2, y - fs * .9, w, fs * 1.3, fs * .65); ctx.fill();
        ctx.save(); ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = '#f2c230'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n), x + T / 2, y - fs * .25); ctx.restore();
      }
    }
    for (const o of shown.objects) {
      if (o.kind === 'warp' || (!gm && (o.hidden || o.kind !== 'npc'))) continue;
      const icons = (o.kind === 'npc' && o.text ? '💬' : '') + (gm && o.gmText ? '⚠️' : '') + (gm && o.npcTeam && npcteam.find(t => t.id === o.npcTeam)?.defeated ? '✅' : '');
      if (icons) ctx.fillText(icons, (o.x + .5) * T, (o.y - (o.kind === 'npc' ? .45 : 0)) * T);
    }
    // puntatore laser: scia che sfuma, con il nome di chi indica
    const now = performance.now();
    lasers.current = lasers.current.filter(l => now - l.t < LASER_MS);
    const lastBy = new Map(lasers.current.map(l => [l.name, l]));
    for (const l of lasers.current) {
      const a = 1 - (now - l.t) / LASER_MS, last = lastBy.get(l.name) === l;
      ctx.globalAlpha = a * (last ? 1 : .5);
      ctx.fillStyle = l.color; ctx.shadowColor = l.color; ctx.shadowBlur = T * .5;
      ctx.beginPath(); ctx.arc(l.x * T, l.y * T, T * (last ? .2 : .12), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (last) { ctx.font = `bold ${Math.max(9, T * .26)}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(l.name, l.x * T + T * .3, l.y * T - T * .3); }
    }
    ctx.globalAlpha = 1;
    // giocatore: frecce sul bordo verso gli altri Allenatori fuori dalla visuale, con la distanza (1 casella = 1 m)
    if (!gm && me) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const W = c.width, H = c.height, pad = Math.max(16, T * .45);
      for (const t of tokens) {
        const tr = trainer.find(x => x.id === t.id);
        if (!tr || t.id === myToken) continue;
        if (t.x >= cam.x && t.x < cam.x + viewW && t.y >= cam.y && t.y < cam.y + viewH) continue;
        const dx = (t.x + .5 - cam.x) * T - W / 2, dy = (t.y + .5 - cam.y) * T - H / 2;
        const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
        const ax = W / 2 + dx * k, ay = H / 2 + dy * k, ang = Math.atan2(dy, dx), col = playerColor(trainer, tr.id);
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(pad * .7, 0); ctx.lineTo(-pad * .45, -pad * .5); ctx.lineTo(-pad * .45, pad * .5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        const dist = Math.round(Math.hypot(t.x - me.x, t.y - me.y));
        const txt = `${tr.name} ${dist} m`, fs = Math.max(10, Math.min(13, T * .3));
        ctx.font = `bold ${fs}px sans-serif`;
        const tw = ctx.measureText(txt).width + 8;
        const tx = Math.max(2, Math.min(W - tw - 2, ax - Math.cos(ang) * pad * 1.6 - tw / 2)), ty = Math.max(fs, Math.min(H - fs, ay - Math.sin(ang) * pad * 1.4));
        ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(tx, ty - fs * .8, tw, fs * 1.6, 4); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, tx + 4, ty);
      }
    }
  });


  // laser degli altri (arrivano dal server) e animazione finché ci sono punti da sfumare
  const lasers = useRef<LaserDot[]>([]);
  const anim = useRef(0);
  const addLaser = (l: Omit<LaserDot, 't'>) => {
    lasers.current.push({...l, t: performance.now()});
    if (!anim.current) {
      const tick = () => { force(n => n + 1); anim.current = lasers.current.length ? requestAnimationFrame(tick) : 0; };
      anim.current = requestAnimationFrame(tick);
    }
  };
  useEffect(() => {
    const on = (l: LaserDot & {mapId: string}) => l.mapId === map.id && addLaser(l);
    socket.on('laser', on);
    return () => { socket.off('laser', on); cancelAnimationFrame(anim.current); anim.current = 0; };
  }, [map.id]);
  const [pointer, setPointer] = useState(false); // telefono: il dito diventa un puntatore laser
  const laserHeld = useRef(false), laserLast = useRef(0);
  /** Manda il punto del laser a tutti (al massimo ~25 al secondo) e lo disegna subito qui. */
  function sendLaser(e: React.PointerEvent) {
    const now = performance.now();
    if (now - laserLast.current < 40) return;
    laserLast.current = now;
    const c = cv.current!, r = c.getBoundingClientRect();
    const l = {x: (e.clientX - r.left) * (c.width / r.width) / T + cam.x, y: (e.clientY - r.top) * (c.height / r.height) / T + cam.y,
      color: gm ? '#ff2d55' : playerColor(trainer, myToken), name: gm ? 'Master' : meTrainer?.name || '?'};
    addLaser(l);
    socket.emit('laser', {cid: campaign.id, mapId: map.id, ...l});
  }

  // giocatore: WASD o frecce per muoversi di una casella (stesse regole del tocco: niente muri, PNG o altri segnalini)
  useEffect(() => {
    if (gm || !me) return;
    const DIRS: Record<string, [number, number]> = {w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0], arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0]};
    const onKey = (e: KeyboardEvent) => {
      const dir = DIRS[e.key.toLowerCase()];
      if (!dir || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      const x = me.x + dir[0], y = me.y + dir[1];
      if (allowed?.has(`${x},${y}`) && reachable(map, me, 1, occupied, pass).has(`${x},${y}`)) { emitMove(me, x, y); setSelected(false); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  /** Casella sotto il dito o il puntatore, tenendo conto della visuale (camera) del giocatore. */
  const at = (e: React.PointerEvent) => {
    const c = cv.current!, r = c.getBoundingClientRect();
    const px = (e.clientX - r.left) * (c.width / r.width), py = (e.clientY - r.top) * (c.height / r.height);
    const x = Math.floor(px / T) + cam.x, y = Math.floor(py / T) + cam.y;
    // out = tocco sul nero fuori dalla mappa (il giocatore non si muove lì)
    return {x: Math.max(0, Math.min(map.width - 1, x)), y: Math.max(0, Math.min(map.height - 1, y)), out: x < 0 || y < 0 || x >= map.width || y >= map.height};
  };
  /** Sposta (o mette) un segnalino: lo manda al server, che lo salva e lo inoltra a tutti. */
  const emitMove = (t: Tok, x: number, y: number) => socket.emit('token', {cid: campaign.id, mapId: map.id, token: {...t, x, y}});

  /**
   * Tocco/clic: dialogo di un PNG; giocatore: seleziona sé stesso o si muove; master: posiziona un Allenatore,
   * trascina un segnalino, oppure apre il menu di porta/zona.
   */
  function onDown(e: React.PointerEvent) {
    // tasto destro (o modalità Puntatore sul telefono): laser, finché si tiene premuto
    if (e.button === 2 || pointer) { laserHeld.current = true; laserLast.current = 0; sendLaser(e); (e.target as Element).setPointerCapture(e.pointerId); return; }
    const p = at(e);
    setMenu(null);
    // giocatore: toccare un PNG visibile apre il suo dialogo (il master invece ha il menu del PNG, più sotto)
    const npc = !gm && !p.out && map.objects.find(o => o.kind === 'npc' && !o.hidden && o.x === p.x && o.y === p.y);
    if (npc && !(me && me.x === p.x && me.y === p.y)) { setTalk(npc); setSelected(false); return; }
    setTalk(null);
    if (!gm) {
      if (!me || p.out) { setSelected(false); return; }
      // toccare una porta = scegliere di entrare lì (di nuovo = togliere la scelta); decide il Master
      const door = map.objects.find(o => o.kind === 'warp' && o.toMap && o.x === p.x && o.y === p.y);
      if (door) { setSelected(false); api(`/c/${campaign.id}/vote`, 'POST', {action: 'pick', trainerId: myToken, warpId: door.id}).catch(e => alert(e.message)); return; }
      if (p.x === me.x && p.y === me.y) { setSelected(s => !s); return; }
      if (moves?.has(`${p.x},${p.y}`)) { emitMove(me, p.x, p.y); setSelected(false); return; }
      const ft = fieldTip(p.x, p.y);
      if (ft && !pass.has(collAt(p.x, p.y))) setTip({key: `${p.x},${p.y}`, x: e.clientX, y: e.clientY, ...ft});
      setSelected(false);
      return;
    }
    if (placeDraft && draft) {
      emitMove({...draft, id: Math.random().toString(36).slice(2)}, p.x, p.y);
      return; // resta attivo per metterne altri uguali, fino a «Fine»
    }
    if (placing) {
      const coll = map.layers.find(l => l.type === 'collision');
      if (coll?.data[p.y * map.width + p.x] || tokens.some(t => t.x === p.x && t.y === p.y)) return; // casella bloccata o occupata
      const who = trainer.find(x => x.id === placing)!;
      emitMove({id: who.id!, label: who.name, color: '#d83a2c', x: 0, y: 0}, p.x, p.y);
      const next = unplaced.find(x => x.id !== placing);
      setPlacing(next?.id || null);
      return;
    }
    const tok = [...tokens].reverse().find(t => t.x === p.x && t.y === p.y);
    if (tok) { setDragTok({id: tok.id, ...p, start: `${p.x},${p.y}`}); (e.target as Element).setPointerCapture(e.pointerId); return; }
    const obj = map.objects.find(o => o.kind !== 'warp' && o.x === p.x && o.y === p.y);
    if (obj) { setTip(null); setDragObj({id: obj.id, ...p, start: `${p.x},${p.y}`}); (e.target as Element).setPointerCapture(e.pointerId); return; }
    const warp = map.objects.find(o => o.kind === 'warp' && o.x === p.x && o.y === p.y && o.toMap);
    const zl = map.layers.find(l => l.type === 'zone');
    const zv = zl?.data[p.y * map.width + p.x];
    // nessuna zona dipinta: vale la zona con lo stesso nome della mappa (solo esterni, gli interni hanno « · »)
    const named = !zl?.data.some(Boolean) && !map.name.includes(' · ') ? zone.find(z => zoneKey(z.name) === zoneKey(map.name))?.id : undefined;
    const zoneId = zv ? map.zoneRefs[zv - 1] : named;
    setMenu(warp || zoneId ? {x: e.clientX, y: e.clientY, zoneId, warp} : null);
  }
  /** Trascinamento di un segnalino (master). */
  function onMove(e: React.PointerEvent) {
    if (laserHeld.current) { sendLaser(e); return; }
    const p = at(e);
    if (dragObj) { if (p.x !== dragObj.x || p.y !== dragObj.y) setDragObj({...dragObj, ...p}); return; }
    if (!dragTok) { if (e.pointerType === 'mouse') hoverTip(p, e); return; }
    if (p.x !== dragTok.x || p.y !== dragTok.y) setDragTok({...dragTok, ...p});
  }
  /** Casella da MN (acqua, cascata nel livello collisioni; albero, masso, roccia come oggetti): cosa serve per passare. */
  const collAt = (x: number, y: number) => map.objects.find(o => o.kind === 'obstacle' && o.x === x && o.y === y)?.field
    || map.layers.find(l => l.type === 'collision')?.data[y * map.width + x] || 0;
  function fieldTip(x: number, y: number) {
    const need = fieldNeed(collAt(x, y), campaign.region, LANG);
    if (!need) return null;
    const badge = need.badge !== undefined ? badgesOf(campaign.region)?.[need.badge] : undefined;
    return {title: need.label, text: badge ? t('Serve la MN {move} e la Medaglia {badge}', {move: need.move, badge}) : t('Serve la MN {move}', {move: need.move})};
  }
  /** Tooltip della casella sotto il mouse: segnalini, PNG con il loro testo, e per il master anche oggetti, porte e note. */
  function hoverTip(p: {x: number, y: number}, e: React.PointerEvent) {
    const key = `${p.x},${p.y}`;
    if (tip?.key === key) return;
    const tk = tokens.find(k => k.x === p.x && k.y === p.y);
    const o = map.objects.find(o => o.x === p.x && o.y === p.y && o.kind !== 'obstacle' && (gm || (o.kind === 'npc' && !o.hidden)));
    const name = (o: MapDoc['objects'][0]) => npcteam.find(x => x.id === o.npcTeam)?.name || o.label || o.item || t('PNG');
    const next = tk ? {title: trainer.find(x => x.id === tk.id)?.name || tk.label, text: tk.hidden ? t('Invisibile ai giocatori') : undefined}
      : o?.kind === 'warp' ? {title: o.label || t('Porta'), text: o.toMap ? `→ ${allMaps.find(m => m.id === o.toMap)?.name || '?'}` : undefined}
      : o ? {title: name(o), text: o.kind === 'npc' ? o.text : o.kind === 'item' ? (o.hidden ? t('Oggetto nascosto') : t('Oggetto')) : undefined, gm: gm ? o.gmText : undefined}
      : fieldTip(p.x, p.y);
    setTip(next && (next.text || next.gm || tk || gm) ? {key, x: e.clientX, y: e.clientY, ...next} : null);
  }
  /** Fine trascinamento: salva la nuova posizione; senza spostamento è un clic e apre il menu dell'Allenatore. */
  function onUp(e: React.PointerEvent) {
    if (laserHeld.current) { laserHeld.current = false; return; }
    if (dragObj) {
      const o = map.objects.find(x => x.id === dragObj.id);
      if (o && `${dragObj.x},${dragObj.y}` === dragObj.start) setMenu({x: e.clientX, y: e.clientY, obj: o});
      else if (o) patchObj(o, {x: dragObj.x, y: dragObj.y});
      setDragObj(null);
      return;
    }
    if (!dragTok) return;
    if (`${dragTok.x},${dragTok.y}` === dragTok.start) setMenu({x: e.clientX, y: e.clientY, tokenId: dragTok.id});
    else emitMove(tokens.find(x => x.id === dragTok.id)!, dragTok.x, dragTok.y);
    setDragTok(null);
  }
  /** Toglie un Allenatore dalla mappa; con again lo rimette subito in "Posiziona allenatori". */
  function untoken(id: string, again = false) {
    socket.emit('untoken', {cid: campaign.id, mapId: map.id, id});
    setMenu(null);
    if (again) setPlacing(id);
  }

  /** Master: cambia o toglie un PNG/oggetto della mappa (salva la mappa intera, come l'editor). */
  const saveObjects = (objects: MapDoc['objects']) => { save('map', {...map, objects}); setMenu(null); };
  const patchObj = (o: MapDoc['objects'][0], p: Partial<MapDoc['objects'][0]>) => saveObjects(map.objects.map(x => x.id === o.id ? {...x, ...p} : x));
  const deleteObj = (o: MapDoc['objects'][0]) => confirm(t('Eliminare «{name}» dalla mappa?', {name: npcteam.find(x => x.id === o.npcTeam)?.name || o.label})) && saveObjects(map.objects.filter(x => x.id !== o.id));

  /** Mostra o nasconde ai giocatori un segnalino del master. */
  const toggleHidden = (tk: Tok) => { socket.emit('token', {cid: campaign.id, mapId: map.id, token: {...tk, hidden: !tk.hidden}}); setMenu(null); };

  /** Allenatori non ancora sulla mappa (per "Posiziona allenatori"). */
  const unplaced = trainer.filter(t => !tokens.some(k => k.id === t.id));

  /** Incontro in una zona: genera il selvatico e apre la pagina Lotta con il Pokémon pronto. */
  async function encounter(zoneId: string, method: string) {
    const r = await api(`/c/${campaign.id}/encounter`, 'POST', {zoneId, method});
    sessionStorage.setItem('pnp-wild', JSON.stringify(r.mon));
    nav(`/c/${campaign.id}/lotta`);
  }

  return (
    <div className={`mapview ${gm ? 'gm' : 'player-map'} ${placing ? 'placing' : ''}`}>
      {gm ? (
        <div className="mapview-tools row gap-s">
          {placeDraft && draft ? <>
            <span className="small">{tj('Clicca le caselle per mettere {name}', {name: <strong>{draft.label}</strong>})}{draft.hidden ? ` (${t('invisibile')})` : ''}</span>
            <button className="btn-s" onClick={() => { setPlaceDraft(false); setDraft(null); }}>{t('Fine')}</button>
          </> : placing ? <>
            <span className="small">{tj('Clicca una casella per {name}', {name: <strong>{trainer.find(x => x.id === placing)?.name}</strong>})}</span>
            {unplaced.map(tr => <button key={tr.id} className={`btn-s place-chip ${placing === tr.id ? 'active' : ''}`} onClick={() => setPlacing(tr.id!)} aria-pressed={placing === tr.id}>
              <img src={trainerSpriteUrl(spriteForTrainer(tr, campaign.gen))} alt="" />{tr.name}</button>)}
            <button className="btn-s" onClick={() => setPlacing(null)}>{t('Fine')}</button>
          </> : <button className="btn-s" disabled={!unplaced.length} title={unplaced.length ? '' : t('Tutti gli allenatori sono già sulla mappa')} onClick={() => setPlacing(unplaced[0]?.id || null)}>{t('Posiziona allenatori')}{unplaced.length ? ` (${unplaced.length})` : ''}</button>}
          {!placing && !placeDraft && <button className="btn-s" onClick={() => setDraft({id: '', x: 0, y: 0, label: '', color: '#7a4fd8', kind: 'pokemon', sprite: '', hidden: false})}><Plus /> {t('Segnalino')}</button>}
          <label className="check small"><input type="checkbox" checked={overlays} onChange={e => setOverlays(e.target.checked)} /> {t('Mostra collisioni e zone')}</label>
          <button className={`btn-icon ${pointer ? 'active' : ''}`} onClick={() => setPointer(p => !p)} aria-pressed={pointer} aria-label={t('Puntatore laser')} title={t('Puntatore laser (o tieni premuto il tasto destro)')}><Crosshair /></button>
          <button className="btn-icon" onClick={() => setZoomMul(z => z / 1.25)} aria-label={t('Riduci')}><ZoomOut /></button>
          <button className="btn-icon" onClick={() => setZoomMul(z => z * 1.25)} aria-label={t('Ingrandisci')}><ZoomIn /></button>
        </div>
      ) : me ? (
        <div className="map-hint">
          <span>{pointer ? t('Puntatore: tocca la mappa per indicare a tutti.') : selected ? t('Tocca una casella evidenziata (fino a {n} passi).', {n: range}) : t('Tocca il tuo personaggio per muoverti (o WASD).')}</span>
          <span className="row gap-xs">
            <button className={`btn-icon ${pointer ? 'active' : ''}`} onClick={() => setPointer(p => !p)} aria-pressed={pointer} aria-label={t('Puntatore laser')}><Crosshair /></button>
            <button className="btn-icon" onClick={() => zoomView(2)} disabled={VIEW >= maxView} aria-label={t('Vedi più mappa')}><ZoomOut /></button>
            <button className="btn-icon" onClick={() => zoomView(-2)} disabled={VIEW <= MIN_VIEW} aria-label={t('Avvicina')}><ZoomIn /></button>
          </span>
        </div>
      ) : null}
      <div className="mapview-canvas" ref={wrap}>
        {!gm && !me
          ? <p className="map-wait">{t('Il master ti sta per mettere sulla mappa…')}</p>
          : <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setTip(null)} onContextMenu={e => e.preventDefault()} style={{touchAction: 'none'}} />}
      </div>
      {tip && !menu && (
        <div className="map-tip" role="tooltip" style={{left: tip.x, top: tip.y,
          transform: `translate(${tip.x > innerWidth - 300 ? 'calc(-100% - 12px)' : '12px'}, ${tip.y > innerHeight * .6 ? 'calc(-100% - 12px)' : '12px'})`}}>
          <strong>{tip.title}</strong>
          {tip.text && <p>{tip.text}</p>}
          {tip.gm && <p className="gm-note">⚠️ {tip.gm}</p>}
        </div>
      )}
      {npcInfo && <NpcTeamInfo teamId={npcInfo} onClose={() => setNpcInfo(null)} onChallenge={() => challenge(npcInfo)} />}
      {talk && (
        <div className="dialog-box" onClick={() => setTalk(null)}>
          <strong>{npcteam.find(x => x.id === talk.npcTeam)?.name || talk.label}</strong>
          <p>{talk.text || '…'}</p>
          {gm && talk.gmText && <p className="gm-note">⚠️ {talk.gmText}</p>}
          {gm && talk.npcTeam && <button className="btn-primary" onClick={e => { e.stopPropagation(); sessionStorage.setItem('pnp-team', talk.npcTeam!); nav(`/c/${campaign.id}/lotta`); }}><Swords /> {t('Sfida')}</button>}
          <span className="dialog-arrow" aria-hidden />
        </div>
      )}
      {draft && !placeDraft && (
        <Modal title={t('Nuovo segnalino')} onClose={() => setDraft(null)}>
          <div className="stack">
            <div className="tabs">
              {([['pokemon', t('Pokémon')], ['npc', t('PNG')], ['trap', t('Trappola / segnaposto')]] as const).map(([k, l]) =>
                <button key={k} className={draft.kind === k ? 'active' : ''} onClick={() => setDraft({...draft, kind: k, sprite: ''})}>{l}</button>)}
            </div>
            {draft.kind === 'pokemon' && <label>{t('Specie')}<SpeciesInput gen={campaign.gen} value={draft.sprite || ''} onChange={v => setDraft({...draft, sprite: v})} /></label>}
            {draft.kind === 'npc' && <SpriteChooser value={draft.sprite || ''} placeholder={t('scegli')} onChange={b => setDraft({...draft, sprite: b})} />}
            <label>{t('Nome (lo vede il master)')}<input value={draft.label} placeholder={draft.kind === 'trap' ? t('Fossa, rete, Voltorb…') : draft.sprite || ''} onChange={e => setDraft({...draft, label: e.target.value})} /></label>
            {draft.kind === 'trap' && <label>{t('Colore')}<input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})} /></label>}
            <label className="check"><input type="checkbox" checked={!!draft.hidden} onChange={e => setDraft({...draft, hidden: e.target.checked})} /> {t('Invisibile ai giocatori (tu lo vedi semitrasparente)')}</label>
            <button className="btn-primary" disabled={draft.kind !== 'trap' && !draft.sprite}
              onClick={() => { setDraft({...draft, label: draft.label || draft.sprite || t('Trappola')}); setPlaceDraft(true); }}>{t('Metti sulla mappa')}</button>
          </div>
        </Modal>
      )}
      {menu && (
        <div className="popover" ref={el => { pop.current = el; fitPopover(el); }} style={{left: menu.x, top: menu.y}}>
          {menu.tokenId && (() => { const tk = tokens.find(x => x.id === menu.tokenId); return <><strong className="small">{tk?.label || t('Allenatore')}{tk?.hidden ? ` (${t('invisibile')})` : ''}</strong>
            <span className="small muted">{t('Trascinalo per spostarlo')}</span>
            {tk?.kind ? <button onClick={() => toggleHidden(tk)}>{tk.hidden ? <><Eye /> {t('Mostra ai giocatori')}</> : <><EyeOff /> {t('Nascondi ai giocatori')}</>}</button>
              : <button onClick={() => untoken(menu.tokenId!, true)}><Move /> {t('Riposiziona')}</button>}
            <button className="btn-danger" onClick={() => untoken(menu.tokenId!)}><UserX /> {t('Togli dalla mappa')}</button></>; })()}
          {menu.obj && (() => { const o = menu.obj; return <><strong className="small">{npcteam.find(x => x.id === o.npcTeam)?.name || o.label || (o.kind === 'item' ? o.item : t('PNG'))}{o.hidden ? ` (${t('nascosto')})` : ''}</strong>
            {o.gmText && <p className="gm-note small">⚠️ {o.gmText}</p>}
            <span className="small muted">{t('Trascinalo per spostarlo')}</span>
            {o.kind === 'npc' && o.text && <button onClick={() => { setMenu(null); setTalk(o); }}><MessageSquare /> {t('Dialogo (giocatori)')}</button>}
            {o.kind === 'npc' && o.npcTeam && <button onClick={() => { setMenu(null); setNpcInfo(o.npcTeam!); }}><Info /> {t('Info')}</button>}
            {o.kind === 'npc' && o.npcTeam && <button onClick={() => challenge(o.npcTeam!)}><Swords /> {t('Sfida')}</button>}
            {o.kind !== 'marker' && <button onClick={() => patchObj(o, {hidden: !o.hidden})}>{o.hidden ? <><Eye /> {t('Mostra ai giocatori')}</> : <><EyeOff /> {t('Nascondi ai giocatori')}</>}</button>}
            <button className="btn-danger" onClick={() => deleteObj(o)}><Trash2 /> {o.kind === 'item' ? t('Raccolto: togli dalla mappa') : t('Elimina dalla mappa')}</button></>; })()}
          {menu.zoneId && <><strong className="small">{zone.find(z => z.id === menu.zoneId)?.name || t('Zona')}</strong>
            <EncounterButtons zone={zone.find(z => z.id === menu.zoneId)} onPick={m => encounter(menu.zoneId!, m)} /></>}
          {menu.warp && <button onClick={() => { setMenu(null); onWarp?.(menu.warp!.toMap!); }}><DoorOpen /> {menu.warp.label || t('Porta')}</button>}
        </div>
      )}
    </div>
  );
}

/**
 * Barra del tavolo (Master e giocatori): voto per entrare da una porta e turni a rotazione.
 * I giocatori toccano una porta sulla mappa per scegliere dove entrare; il Master vede la coda (un gruppo per porta, nell'ordine
 * di scelta) e con un clic fa entrare un gruppo alla volta: la scena passa alla mappa d'arrivo e gli altri restano in coda.
 * Il Master avvia/ferma i turni.
 */
export function TableBar({map, gm, myId}: {map?: MapDoc | null, gm?: boolean, myId?: string}) {
  const {campaign, trainer, map: maps} = useStore();
  const {vote, turns} = useTable();
  const [err, setErr] = useState('');
  const [secs, setSecs] = useState(() => { try { return +(localStorage.getItem('pnp-turn-secs') || 60); } catch { return 60; } });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!turns?.endsAt) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [turns?.endsAt]);
  const call = (path: string, body: object) => { setErr(''); api(`/c/${campaign.id}/${path}`, 'POST', body).catch(e => setErr(e.message)); };
  const name = (id?: string) => trainer.find(t => t.id === id)?.name || '?';
  // coda delle porte scelte: un gruppo per porta (anche di mappe diverse, se il gruppo si è diviso), nell'ordine di scelta
  const queue = vote?.queue || [];
  const doorOf = (g: {mapId: string, warpId: string}) => maps.find(m => m.id === g.mapId)?.objects.find(o => o.id === g.warpId);
  const doorName = (g: {mapId: string, warpId: string}) => {
    const d = doorOf(g), to = maps.find(m => m.id === d?.toMap)?.name;
    return d?.label && to && d.label !== to ? `${d.label} → ${to}` : d?.label || to || t('Porta');
  };
  const mapName = (id: string) => maps.find(m => m.id === id)?.name || '?';
  const mine = myId ? queue.find(g => g.trainers.includes(myId)) : undefined;
  const whose = turns?.order[turns.current];
  const left = turns?.endsAt ? Math.max(0, Math.ceil((turns.endsAt - now) / 1000)) : null;
  if (!queue.length && !turns && !gm) return null;
  return (
    <div className="table-bar">
      {!gm && mine && <p className="small muted">{tj('Hai scelto di entrare in {door} (tocca di nuovo la porta per togliere la scelta).', {door: <b>{doorName(mine)}</b>})}</p>}
      {queue.length > 0 && <div className="callout stack gap-xs">
        <b>{gm && queue.length > 1 ? t('Porte scelte (il gruppo si divide: una scena alla volta):') : t('Porte scelte:')}</b>
        {queue.map((g, i) => <div key={g.mapId + g.warpId} className="row gap-s wrap small">
          <span>{i + 1}. <b>{g.trainers.map(name).join(', ')}</b> → {doorName(g)}{g.mapId !== map?.id && <span className="muted"> {t('(da {map})', {map: mapName(g.mapId)})}</span>}</span>
          {gm && <button className="btn-s btn-primary" onClick={() => call('vote', {action: 'go', index: i})}><DoorOpen /> {t('Fai entrare')}</button>}
        </div>)}
        {gm && <div><button className="btn-s" onClick={() => call('vote', {action: 'clear'})}>{t('Svuota la coda')}</button></div>}
      </div>}
      {turns ? <div className={`row gap-s wrap small turn-bar ${whose === myId ? 'my-turn' : ''}`}>
        <b>{whose === myId ? t('Tocca a te!') : t('Tocca a {name}', {name: name(whose)})}</b>{left !== null && <span>{left} s</span>}
        {(gm || whose === myId) && <button className="btn-s" onClick={() => call('turns', {action: 'next', trainerId: myId, gm})}>{gm ? t('Avanti') : t('Fine turno')}</button>}
        {gm && <button className="btn-s" onClick={() => call('turns', {action: 'off'})}>{t('Ferma i turni')}</button>}
      </div> : gm && <div className="row gap-xs small">
        <label className="row gap-xs">{t('Turni da')}<input type="number" min={0} max={600} value={secs} style={{width: '5em'}}
          onChange={e => { setSecs(+e.target.value); try { localStorage.setItem('pnp-turn-secs', e.target.value); } catch {} }} />{t('s (0 = senza tempo)')}</label>
        <button className="btn-s" onClick={() => call('turns', {action: 'on', seconds: secs})}>{t('Avvia i turni')}</button>
      </div>}
      {err && <span className="error small">{err}</span>}
    </div>
  );
}
