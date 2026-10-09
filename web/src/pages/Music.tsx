// Pagina Musica (/c/<id>/musica): video o playlist di YouTube dentro la dashboard.
// YouTube non si lascia incorporare per intero (niente home né ricerca dentro un iframe): si incolla il link
// di un video o di una playlist. Il lettore vive nella struttura del master (MusicPlayer in main.tsx),
// quindi la musica continua cambiando pagina: fuori da qui diventa una miniatura in basso a destra
// con avanti/indietro e play/pausa, trascinabile dove si vuole e riducibile alla sola riga dei comandi;
// il video della miniatura si usa direttamente (play/pausa, volume); il pulsante con le frecce torna qui.
// I brani si mettono in coda (con ripetizione del brano o di tutta la coda); ogni brano suonato finisce nella
// cronologia della campagna (documenti 'track'), catalogabile per categoria.
import {useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowUp, ChevronDown, ChevronUp, ExternalLink, GripVertical, ListPlus, Maximize2, Pause, Play, Repeat as RepeatIcon, Repeat1, RotateCcw, RotateCw, SkipBack, SkipForward, Trash2, X} from 'lucide-react';
import {useNavigate, useOutletContext} from 'react-router-dom';
import {Track, useStore} from '../api';
import {LOCALE, t, tj} from '../i18n';

/** Video e/o playlist da un link di YouTube (watch, youtu.be, shorts, live, embed, playlist), o null. */
export function parseYouTube(link: string): {video?: string, list?: string} | null {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null;
  const video = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || /^\/(?:shorts|live|embed)\/([\w-]+)/.exec(u.pathname)?.[1];
  const list = u.searchParams.get('list') || undefined;
  const ok = (s?: string | null) => s && /^[\w-]+$/.test(s) ? s : undefined;
  return ok(video) || ok(list) ? {video: ok(video), list: ok(list)} : null;
}

/** Link in forma unica (stesso brano = stesso link, senza ?si= e simili), o null se non è di YouTube. */
export function canonical(link: string) {
  const yt = parseYouTube(link);
  if (!yt) return null;
  return yt.video ? `https://www.youtube.com/watch?v=${yt.video}${yt.list ? '&list=' + yt.list : ''}` : `https://www.youtube.com/playlist?list=${yt.list}`;
}


export type Repeat = 'off' | 'one' | 'all';
/** Coda di riproduzione (link normalizzati), brano corrente (-1 = lettore chiuso) e ripetizione. */
type MusicState = {queue: string[], index: number, repeat: Repeat};

/**
 * Stato della musica del master, ricordato in questo browser per ogni campagna.
 * Fornisce il brano corrente e le azioni sulla coda; sta nella struttura del master e arriva alla pagina con l'Outlet.
 */
export function useMusic(cid: string) {
  const key = `pnp-music-${cid}`;
  const [s, setS] = useState<MusicState>(() => {
    try { return {queue: [], index: -1, repeat: 'off', ...JSON.parse(localStorage.getItem(key) || '{}')}; } catch { return {queue: [], index: -1, repeat: 'off'}; }
  });
  const set = (f: (s: MusicState) => MusicState) => setS(old => {
    const n = f(old);
    try { localStorage.setItem(key, JSON.stringify(n)); } catch {}
    return n;
  });
  return {
    ...s, link: s.queue[s.index] || '',
    /** Suona subito: se è già in coda salta lì, altrimenti lo inserisce dopo il brano corrente. */
    playNow: (l: string) => set(s => {
      const i = s.queue.indexOf(l);
      if (i >= 0) return {...s, index: i};
      const at = s.index + 1;
      return {...s, queue: [...s.queue.slice(0, at), l, ...s.queue.slice(at)], index: at};
    }),
    /** Aggiunge in fondo alla coda (se il lettore è chiuso parte subito). */
    enqueue: (l: string) => set(s => ({...s, queue: [...s.queue, l], index: s.index < 0 ? s.queue.length : s.index})),
    jump: (i: number) => set(s => ({...s, index: i})),
    /** Brano seguente; a fine coda ricomincia solo con "ripeti tutto", altrimenti si ferma. */
    next: () => set(s => ({...s, index: s.index + 1 < s.queue.length ? s.index + 1 : s.repeat === 'all' ? 0 : -1})),
    prev: () => set(s => ({...s, index: Math.max(0, s.index - 1)})),
    /** Toglie un brano dalla coda, tenendo fermo quello corrente. */
    drop: (i: number) => set(s => ({...s, queue: s.queue.filter((_, j) => j !== i), index: i < s.index ? s.index - 1 : i === s.index ? (i < s.queue.length - 1 ? i : -1) : s.index})),
    /** Sposta un brano di una posizione (d = -1 su, +1 giù). */
    move: (i: number, d: number) => set(s => {
      const j = i + d;
      if (j < 0 || j >= s.queue.length) return s;
      const q = [...s.queue];
      [q[i], q[j]] = [q[j], q[i]];
      return {...s, queue: q, index: s.index === i ? j : s.index === j ? i : s.index};
    }),
    clear: () => set(s => ({...s, queue: [], index: -1})),
    close: () => set(s => ({...s, index: -1})),
    cycleRepeat: () => set(s => ({...s, repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off'})),
  };
}
export type Music = ReturnType<typeof useMusic>;

const REPEAT_LABEL: Record<Repeat, string> = {off: 'Ripetizione spenta', all: 'Ripeti tutta la coda', one: 'Ripeti questo brano'};
/** Pulsante della ripetizione: spenta → tutta la coda → brano singolo. */
const RepeatButton = ({m}: {m: Music}) => (
  <button className={`btn-icon ${m.repeat !== 'off' ? 'on' : ''}`} onClick={m.cycleRepeat} title={t(REPEAT_LABEL[m.repeat])} aria-label={t(REPEAT_LABEL[m.repeat])}>
    {m.repeat === 'one' ? <Repeat1 /> : <RepeatIcon />}
  </button>
);

// API dei lettori di YouTube (https://developers.google.com/youtube/iframe_api_reference), caricata una volta
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
let ytApi: Promise<any> | undefined;
const loadYT = () => ytApi ||= new Promise(resolve => {
  window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
});

/**
 * Il lettore: grande nella pagina Musica, miniatura con i comandi altrove.
 * Quando un brano parte lo segna nella cronologia della campagna (con il titolo preso dal lettore);
 * quando finisce passa al seguente della coda, o lo ripete.
 */
export function MusicPlayer({m, full}: {m: Music, full: boolean}) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const navigate = useNavigate();
  const {track, save} = useStore();
  const link = m.link, yt = parseYouTube(link)!;
  // gli eventi del lettore leggono sempre i valori aggiornati
  const live = useRef({track, m});
  live.current = {track, m};

  useEffect(() => {
    let dead = false, logged = false;
    const el = document.createElement('div');
    box.current!.appendChild(el);
    loadYT().then(YT => {
      if (dead) return;
      player.current = new YT.Player(el, {
        host: 'https://www.youtube-nocookie.com',
        videoId: yt.video,
        playerVars: {autoplay: 1, playsinline: 1, ...(yt.list && {listType: 'playlist', list: yt.list})},
        events: {onStateChange: (e: any) => {
          const {track, m} = live.current;
          setPlaying(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING);
          if (e.data === YT.PlayerState.PLAYING && !logged) {
            logged = true;
            const old = track.find(x => x.link === link);
            save('track', {...old, link, title: old?.title || e.target.getVideoData?.().title || '', t: Date.now()});
          }
          if (e.data === YT.PlayerState.ENDED) {
            if (m.repeat === 'one' || (m.repeat === 'all' && m.queue.length === 1)) { e.target.seekTo(0, true); e.target.playVideo(); }
            else m.next();
          }
        }},
      });
    });
    return () => { dead = true; player.current?.destroy(); player.current = null; box.current?.replaceChildren(); };
  }, [link]); // limite: lo stesso link due volte di fila in coda non riparte, servirebbe un contatore di riproduzioni

  // miniatura: posizione (distanza dall'angolo in basso a destra) e "solo comandi", ricordate in questo browser
  const [mini, setMini] = useState<{x: number, y: number, compact: boolean}>(() => { try { return {x: 18, y: 18, compact: false, ...JSON.parse(localStorage.getItem('pnp-mini') || '{}')}; } catch { return {x: 18, y: 18, compact: false}; } });
  const setMiniSaved = (p: Partial<typeof mini>) => setMini(old => { const n = {...old, ...p}; try { localStorage.setItem('pnp-mini', JSON.stringify(n)); } catch {} return n; });
  const frame = useRef<HTMLDivElement>(null);
  /** Trascina la miniatura dalla maniglia, senza farla uscire dalla finestra. */
  const drag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget, r = frame.current!.getBoundingClientRect(), {x, y} = mini, cx = e.clientX, cy = e.clientY;
    el.setPointerCapture(e.pointerId);
    let pos = {x, y};
    const move = (ev: PointerEvent) => {
      pos = {x: Math.max(0, Math.min(innerWidth - r.width, x - (ev.clientX - cx))), y: Math.max(0, Math.min(innerHeight - r.height, y - (ev.clientY - cy)))};
      setMini(old => ({...old, ...pos}));
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); setMiniSaved(pos); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const seek = (s: number) => { const p = player.current; p?.seekTo(Math.max(0, p.getCurrentTime() + s), true); };
  const toggle = () => playing ? player.current?.pauseVideo() : player.current?.playVideo();
  return (
    <div ref={frame} className={`music-player ${full ? 'full' : `mini ${mini.compact ? 'compact' : ''}`}`}
      style={full ? undefined : {right: `min(${mini.x}px, calc(100vw - 100px))`, bottom: `min(${mini.y}px, calc(100vh - 50px))`}}>
      <div className="music-video">
        <div ref={box} className="music-frame" />
      </div>
      <div className="music-bar">
        {!full && <button className="music-grip" onPointerDown={drag} title={t('Trascina per spostare')} aria-label={t('Sposta')}><GripVertical /></button>}
        <button className="btn-icon" onClick={m.prev} disabled={m.index <= 0} title={t('Brano precedente')}><SkipBack /></button>
        {!full && <button className="btn-icon" onClick={() => seek(-10)} title={t('Indietro 10 secondi')}><RotateCcw /></button>}
        {!full && <button className="btn-icon" onClick={toggle} title={t(playing ? 'Pausa' : 'Riproduci')}>{playing ? <Pause /> : <Play />}</button>}
        {!full && <button className="btn-icon" onClick={() => seek(10)} title={t('Avanti 10 secondi')}><RotateCw /></button>}
        <button className="btn-icon" onClick={m.next} disabled={m.index >= m.queue.length - 1 && m.repeat !== 'all'} title={t('Brano seguente')}><SkipForward /></button>
        <RepeatButton m={m} />
        {!full && <button className="btn-icon" onClick={() => setMiniSaved({compact: !mini.compact, y: Math.min(mini.y, Math.max(0, innerHeight - frame.current!.offsetWidth * 9 / 16 - 60))})} title={t(mini.compact ? 'Mostra il video' : 'Solo comandi')}>{mini.compact ? <ChevronUp /> : <ChevronDown />}</button>}
        {!full && <button className="btn-icon" onClick={() => navigate('musica')} title={t('Apri la pagina Musica')}><Maximize2 /></button>}
        <button className="btn-icon" onClick={m.close} title={t('Chiudi lettore')}><X /></button>
      </div>
    </div>
  );
}

/** La pagina: link da incollare, coda e cronologia; il lettore grande lo disegna la struttura del master, dopo il link. */
export default function MusicPage() {
  const m = useOutletContext<Music>();
  const {track, save, remove} = useStore();
  const [draft, setDraft] = useState('');
  const [cat, setCat] = useState<string | null>(null); // null = tutte, '' = senza categoria
  const c = canonical(draft), bad = draft !== '' && !c;
  const titleOf = (l: string) => track.find(t => t.link === l)?.title || l;
  const cats = [...new Set(track.map(t => t.category || ''))].filter(Boolean).sort();
  const shown = track.filter(t => cat === null || (t.category || '') === cat).sort((a, b) => b.t - a.t);
  const add = (f: (l: string) => void) => { if (c) { f(c); setDraft(''); } };
  return (
    <div className="page music-page">
      <header className="page-head"><h1>{t('Musica')}</h1></header>
      <section className="panel">
        <form className="row gap-s wrap" onSubmit={e => { e.preventDefault(); add(m.playNow); }}>
          <input style={{flex: 1, minWidth: '14rem'}} value={draft} onChange={e => setDraft(e.target.value)} placeholder={t('Link di un video o di una playlist di YouTube')} />
          <button className="btn-primary" disabled={!c}><Play />{t('Riproduci')}</button>
          <button type="button" disabled={!c} onClick={() => add(m.enqueue)}><ListPlus />{t('In coda')}</button>
        </form>
        {bad && <p className="error small">{t('Non è un link di un video o di una playlist di YouTube.')}</p>}
        <p className="muted small">
          {tj('Cerca su {youtube}, copia il link e incollalo qui (YouTube non permette di aprire la ricerca dentro la dashboard). Cambiando pagina il video resta in un angolo.',
            {youtube: <a href="https://www.youtube.com/" target="_blank" rel="noopener">YouTube <ExternalLink className="nav-ext" /></a>})}
        </p>
      </section>
      <section className="panel music-queue">
        <div className="row between">
          <h2>{t('Coda')}</h2>
          <div className="row gap-xs"><RepeatButton m={m} />{m.queue.length > 0 && <button className="btn-s" onClick={m.clear}>{t('Svuota')}</button>}</div>
        </div>
        {m.queue.length ? <ol className="music-list">
          {m.queue.map((l, i) => <li key={i} className={i === m.index ? 'current' : ''}>
            <button className="btn-icon" onClick={() => m.jump(i)} title={t('Riproduci')}><Play /></button>
            <span className="music-title">{titleOf(l)}</span>
            <button className="btn-icon" onClick={() => m.move(i, -1)} disabled={i === 0} title={t('Su')}><ArrowUp /></button>
            <button className="btn-icon" onClick={() => m.move(i, 1)} disabled={i === m.queue.length - 1} title={t('Giù')}><ArrowDown /></button>
            <button className="btn-icon" onClick={() => m.drop(i)} title={t('Togli dalla coda')}><X /></button>
          </li>)}
        </ol> : <p className="muted small">{t('Vuota: aggiungi brani con "In coda", qui sopra o dalla cronologia.')}</p>}
      </section>
      <section className="panel music-history">
        <h2>{t('Cronologia')}</h2>
        {track.length ? <>
          <div className="row gap-xs wrap">
            <button className={`btn-s ${cat === null ? 'btn-primary' : ''}`} onClick={() => setCat(null)}>{t('Tutte')}</button>
            {cats.map(c => <button key={c} className={`btn-s ${cat === c ? 'btn-primary' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
            {track.some(t => !t.category) && <button className={`btn-s ${cat === '' ? 'btn-primary' : ''}`} onClick={() => setCat('')}>{t('Senza categoria')}</button>}
            {cat !== null && shown.length > 1 && <button className="btn-s" onClick={() => shown.forEach(t => m.enqueue(t.link))}><ListPlus />{t('Tutta la categoria in coda')}</button>}
          </div>
          <datalist id="music-cats">{cats.map(c => <option key={c} value={c} />)}</datalist>
          <ul className="music-list">
            {shown.map(t => <TrackRow key={`${t.id}-${t.title}-${t.category}`} t={t} current={t.link === m.link}
              onPlay={() => m.playNow(t.link)} onEnqueue={() => m.enqueue(t.link)}
              onChange={p => save('track', {...t, ...p})} onRemove={() => remove('track', t.id!)} />)}
          </ul>
        </> : <p className="muted small">{t('Ancora niente: i brani che riproduci compaiono qui, divisi per questa campagna.')}</p>}
      </section>
    </div>
  );
}

/** Una riga della cronologia: riproduci, metti in coda, titolo e categoria modificabili (salvati uscendo dal campo), elimina. */
function TrackRow({t: track, current, onPlay, onEnqueue, onChange, onRemove}: {
  t: Track, current: boolean, onPlay: () => void, onEnqueue: () => void, onChange: (p: Partial<Track>) => void, onRemove: () => void,
}) {
  const blur = (k: 'title' | 'category') => (e: React.FocusEvent<HTMLInputElement>) => { const v = e.target.value.trim(); if (v !== (track[k] || '')) onChange({[k]: v}); };
  return (
    <li className={current ? 'current' : ''}>
      <button className="btn-icon" onClick={onPlay} title={t('Riproduci')}><Play /></button>
      <button className="btn-icon" onClick={onEnqueue} title={t('Metti in coda')}><ListPlus /></button>
      <input className="music-title" defaultValue={track.title || ''} placeholder={track.link} onBlur={blur('title')} aria-label={t('Titolo')} />
      <input className="music-cat" defaultValue={track.category || ''} placeholder={t('Categoria')} list="music-cats" onBlur={blur('category')} aria-label={t('Categoria')} />
      <span className="muted small">{new Date(track.t).toLocaleDateString(LOCALE)}</span>
      <button className="btn-icon btn-danger" onClick={() => confirm(t('Togliere il brano dalla cronologia?')) && onRemove()} title={t('Elimina')}><Trash2 /></button>
    </li>
  );
}
