// Componenti React condivisi tra le pagine del master e la vista giocatore.
// Un "componente" è una funzione che riceve delle props (parametri) e restituisce l'HTML (JSX) da mostrare;
// gli "hook" (useQualcosa) sono funzioni che leggono stato o dati e fanno ridisegnare il componente quando cambiano.
// Contiene: sprite e tipi, finestre (Modal), tessera e editor dei Pokémon, statistiche, dadi, medaglie,
// scheda per i giocatori, calcolatore dei tipi, scelta degli sprite, squadra riordinabile, pulsanti d'incontro.
import {useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {ChevronLeft, ChevronRight, Dices, Fish, GripVertical, Pickaxe, Sparkles, Sprout, TreeDeciduous, Waves, X} from 'lucide-react';
import {METHODS, methodOf} from '../../server/src/methods';
import {api, cached, d, natureName, RollerCtx, socket, spriteUrl, STAT_NAMES, typeName, useCached, useRolls, useShareRoll, useSpecies, useStore, type Mon, type Roll, type SpeciesInfo, type Stats, type Trainer, type Zone} from './api';
import {fudgeOutcome, rollFace, type Face} from '../../server/src/rules';
import {LOCALE, t, tj} from './i18n';
import {badgesOf, badgeUrl, BASE_SPRITES, CLASS_SPRITES, NPC_CLASSES, resolveTrainerSprite, spriteForTrainer, trainerSpriteUrl} from './trainers';

/** Sprite di una specie nello stile della generazione; se manca, ripiega sulla Gen 5. */
export function Sprite({species, shiny, size = 96}: {species: string, shiny?: boolean, size?: number}) {
  const {campaign} = useStore();
  const sp = useSpecies(campaign.gen).get(species);
  const [fallback, setFallback] = useState(false);
  if (!sp) return <div className="sprite sprite-empty" style={{width: size, height: size}} />;
  const src = spriteUrl(sp.spriteid, fallback ? 5 : campaign.gen, shiny);
  return <img className="sprite" src={src} width={size} height={size} alt={species} loading="lazy" onError={() => setFallback(true)} />;
}

/** Etichetta colorata di un tipo, con il nome nella lingua scelta. */
export function TypeBadge({type}: {type: string}) {
  return <span className={`type type-${type.toLowerCase()}`}>{typeName(type)}</span>;
}

/** Finestra sopra la pagina, con titolo e chiusura (pulsante, clic fuori o tasto Esc). */
export function Modal({title, onClose, children, wide}: {title: string, onClose: () => void, children: ReactNode, wide?: boolean}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title}>
        <header className="modal-head"><h2>{title}</h2><button className="btn-icon" onClick={onClose} aria-label={t('Chiudi')}><X /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Simbolo del sesso. */
const genderSym = (g: string) => g === 'M' ? '♂' : g === 'F' ? '♀' : '';

/** Colore di ogni tipo, usato per tingere le tessere. */
const TYPE_HEX: Record<string, string> = {
  Normal: '#a8a878', Fire: '#f08030', Water: '#6890f0', Electric: '#f8d030', Grass: '#78c850', Ice: '#98d8d8', Fighting: '#c03028',
  Poison: '#a040a0', Ground: '#e0c068', Flying: '#a890f0', Psychic: '#f85888', Bug: '#a8b820', Rock: '#b8a038', Ghost: '#705898',
  Dragon: '#7038f8', Dark: '#705848', Steel: '#b8b8d0', Fairy: '#ee99ac',
};

/** Stati alterati (testo italiano, tradotto con t() quando si mostra). */
export const STATUS_IT: Record<string, string> = {slp: 'Sonno', par: 'Paralisi', frz: 'Congelato', psn: 'Avvelenato', tox: 'Iperavvelenato', brn: 'Scottato'};
/** Nome di uno stato alterato nella lingua scelta (sigla di Showdown se sconosciuto). */
export const statusName = (s: string) => STATUS_IT[s] ? t(STATUS_IT[s]) : s;

/** PS attuali e massimi di un Pokémon (hp assente = pieni). */
export function hpOf(sp: SpeciesInfo | undefined, mon: Mon) {
  const max = calcStats(sp, mon)?.hp || 0;
  return {cur: Math.min(max, mon.hp ?? max), max};
}
/** Barra dei PS con numeri, stato e KO. */
export function MonHp({mon, sp}: {mon: Mon, sp?: SpeciesInfo}) {
  const {cur, max} = hpOf(sp, mon);
  if (!max) return null;
  const pct = cur / max * 100;
  return (
    <div className="mon-hp">
      <div className="hpbar"><div className={`hpbar-fill ${pct <= 20 ? 'red' : pct <= 50 ? 'yellow' : ''}`} style={{transform: `scaleX(${pct / 100})`}} /></div>
      <span className="small">{cur ? `${cur}/${max} ${t('PS')}` : <b className="ko">KO</b>}{mon.status && cur > 0 && <span className={`status st-${mon.status}`}>{statusName(mon.status)}</span>}</span>
    </div>
  );
}

/** Tessera Pokémon: ritratto tinto per tipo con riflesso olografico e targhetta fissa. */
export function MonCard({mon, onClick, actions, compact}: {mon: Mon, onClick?: () => void, actions?: ReactNode, compact?: boolean}) {
  const {campaign} = useStore();
  const natures = useCached<Record<string, string>>('/dex/natures');
  const sp = useSpecies(campaign.gen).get(mon.species);
  const tint = TYPE_HEX[sp?.types[0] || 'Normal'];
  return (
    <div className={`mon-card ${onClick ? 'clickable' : ''} ${compact ? 'compact' : ''} ${mon.hp === 0 ? 'fainted' : ''}`} style={{'--t': tint} as React.CSSProperties} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}>
      <div className="mon-port"><Sprite species={mon.species} shiny={mon.shiny} size={compact ? 72 : 128} /></div>
      <div className="mon-plate">
        <div className="nm">
          <span>{mon.nickname || mon.species}</span>
          <span className={`gender g-${mon.gender}`}>{genderSym(mon.gender)}</span>
          {mon.shiny && <span className="shiny" title={t('Cromatico')}><Sparkles /></span>}
        </div>
        <div className="ln"><span>{mon.nickname ? mon.species : (mon.nature ? natureName(mon.nature, natures) : '')}</span><span className="lv">LV {mon.level}</span></div>
        {!compact && <div className="types">{sp?.types.map(ty => <TypeBadge key={ty} type={ty} />)}</div>}
        {!compact && mon.nickname && mon.nature && <div className="ln"><span>{natureName(mon.nature, natures)}</span></div>}
        {(mon.place === 'party' || mon.place === 'pc') && <MonHp mon={mon} sp={sp} />}
      </div>
      {actions && <div className="mon-card-actions" onClick={e => e.stopPropagation()}>{actions}</div>}
    </div>
  );
}

/** Campo di testo con suggerimenti delle specie della generazione (datalist del browser). */
export function SpeciesInput({value, onChange, gen, placeholder = t('Specie…'), id}: {value: string, onChange: (v: string) => void, gen: number, placeholder?: string, id?: string}) {
  const {list} = useSpecies(gen);
  const listId = `species-${gen}`;
  return (
    <>
      <input id={id} list={listId} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {!document.getElementById(listId) && <datalist id={listId}>{list.map(s => <option key={s.id} value={s.name}>#{s.num}</option>)}</datalist>}
    </>
  );
}

/** Effetto delle nature: [statistica +10%, statistica -10%], null = neutra. */
const NATURE_MODS: Record<string, [string, string] | null> = {
  Hardy: null, Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'],
  Bold: ['def', 'atk'], Docile: null, Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'],
  Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Serious: null, Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'],
  Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Bashful: null, Rash: ['spa', 'spd'],
  Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'], Quirky: null,
};

/** Statistiche reali con la formula dei giochi (Gen 3+): base, IV, EV, livello e natura. PS a parte (Shedinja = 1). */
export function calcStats(sp: SpeciesInfo | undefined, mon: Mon): Stats | null {
  if (!sp) return null;
  const out: any = {};
  const mod = NATURE_MODS[mon.nature];
  for (const st of Object.keys(sp.baseStats) as (keyof Stats)[]) {
    const core = Math.floor((2 * sp.baseStats[st] + (mon.ivs?.[st] ?? 31) + Math.floor((mon.evs?.[st] ?? 0) / 4)) * mon.level / 100);
    if (st === 'hp') out.hp = sp.baseStats.hp === 1 ? 1 : core + mon.level + 10;
    else out[st] = Math.floor((core + 5) * (mod?.[0] === st ? 1.1 : mod?.[1] === st ? 0.9 : 1));
  }
  return out;
}

/** "Decisa (+Att −AttSp)": natura nella lingua scelta con il suo effetto. */
export function natureLabel(n: string, natures?: Record<string, string>) {
  if (!n) return '—';
  const m = NATURE_MODS[n];
  return `${natureName(n, natures)}${m ? ` (+${STAT_NAMES[m[0]]} −${STAT_NAMES[m[1]]})` : ` (${t('neutra')})`}`;
}

/** Editor completo di un Pokémon. Salva tramite onSave; con onDelete mostra il pulsante elimina. */
export function MonEditor({initial, onSave, onDelete, onClose, title = 'Pokémon', saveLabel = t('Salva')}: {
  initial: Mon, onSave: (m: Mon) => unknown, onDelete?: () => void, onClose: () => void, title?: string, saveLabel?: string,
}) {
  const {campaign, trainer} = useStore();
  const gen = campaign.gen;
  const [m, setM] = useState<Mon>(initial);
  const [err, setErr] = useState('');
  const [lvlInfo, setLvlInfo] = useState<any>(null);
  const species = useSpecies(gen);
  const sp = species.get(m.species);
  const natures = useCached<Record<string, string>>('/dex/natures');
  const learn = useCached<{levelUp: {move: string, level: number}[], all: string[]}>(sp ? `/dex/${gen}/learnset/${sp.id}` : null);
  const stats = calcStats(sp, m);
  const set = (patch: Partial<Mon>) => setM(prev => ({...prev, ...patch}));

  /** Rigenera il Pokémon (sesso, natura, IV, abilità, mosse) tenendo specie e livello. */
  async function regenerate() {
    if (!sp) return setErr(t('Scegli prima una specie valida'));
    const g = await api<Mon>(`/dex/${gen}/generate`, 'POST', {species: sp.name, level: m.level, cid: campaign.id});
    setM(prev => ({...prev, ...g}));
  }
  /** Sale di livello e mostra nuove mosse ed evoluzioni possibili. */
  async function levelUp(by: number) {
    const to = Math.min(100, m.level + by);
    if (!sp || to === m.level) return;
    setLvlInfo(await api(`/dex/${gen}/levelup`, 'POST', {species: sp.name, from: m.level, to}));
    set({level: to});
  }
  /** Salva (con il nome ufficiale della specie) e chiude; gli errori restano visibili nella finestra. */
  async function submit() {
    if (!sp) return setErr(t('Specie non valida per questa generazione'));
    setErr('');
    try { await onSave({...m, species: sp.name}); onClose(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="mon-editor">
        <div className="mon-editor-side">
          <Sprite species={m.species} shiny={m.shiny} size={128} />
          <div className="types">{sp?.types.map(t => <TypeBadge key={t} type={t} />)}</div>
          {stats && (
            <table className="stat-table">
              <tbody>{Object.entries(stats).map(([k, v]) => (
                <tr key={k}><th>{STAT_NAMES[k]}</th><td>{v}</td><td className="muted">{t('base')} {sp!.baseStats[k as keyof Stats]}</td></tr>
              ))}</tbody>
            </table>
          )}
          {sp && (m.place === 'party' || m.place === 'pc') && <HpControls mon={m} sp={sp} onChange={set} />}
          <div className="row gap-s">
            <button onClick={() => levelUp(1)}>+1 LV</button>
            <button onClick={() => levelUp(4)}>{t('+d4 man.')}</button>
          </div>
          {lvlInfo && (lvlInfo.newMoves.length > 0 || lvlInfo.evolutions.some((e: any) => e.ready)) && (
            <div className="callout">
              {lvlInfo.newMoves.map((nm: any) => <div key={nm.move}>{tj('Può imparare {move} (LV {level})', {move: <b>{nm.move}</b>, level: nm.level})}</div>)}
              {lvlInfo.evolutions.filter((e: any) => e.ready).map((e: any) => (
                <div key={e.name}>{tj('Può evolversi in {name}!', {name: <b>{e.name}</b>})} <button className="btn-s" onClick={() => set({species: e.name})}>{t('Evolvi')}</button></div>
              ))}
            </div>
          )}
          {sp && sp.evos.length > 0 && (
            <div className="muted small">{t('Evoluzioni')}: {sp.evos.map(e => {
              const ev = species.get(e);
              return `${e}${ev?.evoLevel ? ` (LV ${ev.evoLevel})` : ev?.evoItem ? ` (${ev.evoItem})` : ev?.evoType ? ` (${ev.evoType})` : ''}`;
            }).join(', ')}</div>
          )}
        </div>
        <div className="mon-editor-main">
          <div className="grid-2">
            <label>{t('Specie')}<SpeciesInput value={m.species} gen={gen} onChange={v => set({species: v})} /></label>
            <label>{t('Soprannome')}<input value={m.nickname || ''} onChange={e => set({nickname: e.target.value})} /></label>
            <label>{t('Livello')}<input type="number" min={1} max={100} value={m.level} onChange={e => set({level: +e.target.value})} /></label>
            <label>{t('Sesso')}
              <select value={m.gender} onChange={e => set({gender: e.target.value})}>
                <option value="M">♂ {t('Maschio')}</option><option value="F">♀ {t('Femmina')}</option><option value="N">— {t('Nessuno')}</option>
              </select>
            </label>
            {gen >= 3 && <label>{t('Natura')}
              <select value={m.nature} onChange={e => set({nature: e.target.value})}>
                {Object.keys(NATURE_MODS).map(n => <option key={n} value={n}>{natureLabel(n, natures)}</option>)}
              </select>
            </label>}
            {gen >= 3 && <label>{t('Abilità')}
              <select value={m.ability} onChange={e => set({ability: e.target.value})}>
                {sp && Object.entries(sp.abilities).filter(([k]) => gen >= 5 || k !== 'H').map(([k, a]) => <option key={k} value={a}>{a}{k === 'H' ? ` (${t('nascosta')})` : ''}</option>)}
                {m.ability && !Object.values(sp?.abilities || {}).includes(m.ability) && <option value={m.ability}>{m.ability}</option>}
              </select>
            </label>}
            {gen >= 2 && <label>{t('Strumento tenuto')}<input value={m.item || ''} onChange={e => set({item: e.target.value})} placeholder={t('es. Oran Berry')} /></label>}
            {gen >= 2 && <label className="check"><input type="checkbox" checked={m.shiny} onChange={e => set({shiny: e.target.checked})} /> {t('Cromatico')}</label>}
            <label>{t('Posizione')}
              <select value={m.place || 'party'} onChange={e => set({place: e.target.value as any})}>
                <option value="party">{t('Squadra')}</option><option value="pc">{t('PC di Bill')}</option>
              </select>
            </label>
            <label>{t('Stato')}
              <select value={m.status || ''} onChange={e => set({status: e.target.value})}>
                <option value="">{t('Nessuno')}</option>{Object.entries(STATUS_IT).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
            </label>
            <label>{t('Allenatore')}
              <select value={m.owner || ''} onChange={e => set({owner: e.target.value})}>
                <option value="">{campaign.teamMode === 'own' ? `— ${t('Nessuno')} —` : `— ${t('Condiviso')} —`}</option>
                {trainer.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>

          <h3>{t('Mosse')}</h3>
          <div className="grid-2">
            {[0, 1, 2, 3].map(i => (
              <input key={i} list="learnable" value={m.moves[i] || ''} placeholder={t('Mossa {n}', {n: i + 1})}
                onChange={e => { const mv = [...m.moves]; mv[i] = e.target.value; set({moves: mv}); }} />
            ))}
            <datalist id="learnable">{learn?.all.map(mv => <option key={mv} value={mv} />)}</datalist>
          </div>
          {learn && <details className="small"><summary>{t('Mosse per livello')}</summary>
            <div className="chips">{learn.levelUp.map(l => (
              <button key={l.move + l.level} className={`chip ${l.level <= m.level ? '' : 'chip-off'}`}
                onClick={() => { if (!m.moves.includes(l.move)) { const mv = m.moves.filter(Boolean); mv.length >= 4 ? mv[3] = l.move : mv.push(l.move); set({moves: mv}); } }}>
                {l.level} · {l.move}
              </button>
            ))}</div>
          </details>}

          <details className="small">
            <summary>IV / EV</summary>
            <table className="iv-table">
              <thead><tr><th></th>{Object.values(STAT_NAMES).map(s => <th key={s}>{s}</th>)}</tr></thead>
              <tbody>
                {(['ivs', 'evs'] as const).map(kind => (
                  <tr key={kind}><th>{kind === 'ivs' ? 'IV' : 'EV'}</th>
                    {Object.keys(STAT_NAMES).map(st => (
                      <td key={st}><input type="number" min={0} max={kind === 'ivs' ? 31 : 252} value={m[kind]?.[st as keyof Stats] ?? 0}
                        onChange={e => set({[kind]: {...m[kind], [st]: +e.target.value}} as any)} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <label>{t('Note')}<textarea rows={2} value={m.notes || ''} onChange={e => set({notes: e.target.value})} /></label>
          {err && <p className="error">{err}</p>}
          <div className="row gap-s end">
            <button onClick={regenerate} title={t('Nuovi sesso, natura, IV, abilità e mosse')}><Dices /> {t('Rigenera casuale')}</button>
            {onDelete && <button className="btn-danger" onClick={() => { if (confirm(t('Eliminare questo Pokémon?'))) { onDelete(); onClose(); } }}>{t('Elimina')}</button>}
            <button className="btn-primary" onClick={submit}>{saveLabel}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Pokémon vuoto da compilare (IV al massimo, EV a zero). */
export function newMon(species = '', level = 5): Mon {
  const z = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
  return {species, level, gender: 'M', nature: 'Hardy', ability: '', ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31}, evs: z, moves: [], shiny: false, place: 'party'};
}

/** Tiro dei 2 dadi Fudge: digitale o inserendo le facce dei dadi fisici. */
export function FudgeRoller({modifier = 0, onResult, extraDie}: {modifier?: number, onResult?: (r: ReturnType<typeof fudgeOutcome>) => void, extraDie?: boolean}) {
  const n = extraDie ? 3 : 2;
  const [faces, setFaces] = useState<Face[]>(Array(n).fill(' '));
  const [result, setResult] = useState<ReturnType<typeof fudgeOutcome> | null>(null);
  const [rolling, setRolling] = useState(false);
  useEffect(() => { setFaces(Array(n).fill(' ')); setResult(null); }, [n]);
  const share = useShareRoll();
  const finish = (f: Face[], digital = false) => {
    const r = fudgeOutcome(f, modifier); setResult(r); onResult?.(r);
    if (digital) share(`${n}dF ${f.map(x => x === ' ' ? '□' : x === '+' ? '+' : '−').join(' ')}${modifier ? ` (mod ${modifier > 0 ? '+' : ''}${modifier})` : ''} → ${t(r.label)}`);
  };
  /** Tiro digitale con una breve animazione. */
  function roll() {
    setRolling(true);
    let i = 0;
    const t = setInterval(() => {
      const f = Array.from({length: n}, () => rollFace());
      setFaces(f);
      if (++i >= 8) { clearInterval(t); setRolling(false); finish(f, true); }
    }, 60);
  }
  /** Inserimento a mano: ogni clic sulla faccia passa vuota -> + -> -. */
  const cycle = (i: number) => {
    const f = [...faces]; f[i] = f[i] === ' ' ? '+' : f[i] === '+' ? '-' : ' ';
    setFaces(f); finish(f);
  };
  return (
    <div className="fudge">
      <div className="dice-row">
        {faces.map((f, i) => (
          <button key={i} className={`die die-fudge ${rolling ? 'rolling' : ''} ${i === 2 ? 'die-assist' : ''}`} onClick={() => cycle(i)}
            title={t('Tocca per inserire il risultato del dado fisico')}>{f === ' ' ? '' : f === '+' ? '+' : '−'}</button>
        ))}
        <button className="btn-primary" onClick={roll} disabled={rolling}>{t('Tira {n}dF', {n})}</button>
      </div>
      <div className="muted small">{t('Tocca un dado per impostare a mano il risultato dei dadi fisici.')} {t('Modificatore')}: {modifier >= 0 ? '+' : ''}{modifier}</div>
      {result && <div className={`outcome outcome-${result.outcome}`}>{t(result.label)}<span className="muted"> ({t('totale')} {result.total >= 0 ? '+' : ''}{result.total})</span></div>}
    </div>
  );
}

/** Dado numerico (d6, d20, d100…): tiro digitale o risultato scritto a mano. */
export function NumberDie({sides, onResult}: {sides: number, onResult?: (n: number) => void}) {
  const [v, setV] = useState<number | ''>('');
  const share = useShareRoll();
  return (
    <div className="num-die">
      <button className="die" onClick={() => { const r = d(sides); setV(r); onResult?.(r); share(`d${sides} → ${r}`); }}>d{sides}</button>
      <input type="number" min={1} max={sides} value={v} placeholder="—" aria-label={t('Risultato d{sides}', {sides})}
        onChange={e => { const r = +e.target.value; setV(r || ''); if (r) onResult?.(r); }} />
    </div>
  );
}

/** Classi da Allenatore dal server. */
export function useClasses() {
  return useCached<any[]>('/dex/classes') || [];
}

/** Chiede subito al server i dati usati dappertutto, così le pagine si aprono senza attese. */
export function prefetchDex(gen: number) {
  cached(`/dex/${gen}/species`);
  cached('/dex/natures');
  cached('/dex/classes');
}

/**
 * Squadra (in ordine) e PC. Con squadre personali (teamMode "own") e un owner indicato, solo quelli di quell'Allenatore
 * ("" = Pokémon senza Allenatore); senza owner, tutti i Pokémon della campagna.
 */
export function useParty(owner?: string) {
  const {mon, campaign} = useStore();
  const own = campaign.teamMode === 'own' && owner !== undefined;
  return useMemo(() => {
    const mine = own ? mon.filter(m => (m.owner || '') === owner) : mon;
    return {
      party: mine.filter(m => m.place === 'party').sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
      pc: mine.filter(m => m.place === 'pc'),
    };
  }, [mon, own, owner]);
}

/** Sprite dell'Allenatore come nei giochi, con il nome sotto. */
export function TrainerSprite({trainer, size = 96, showName = true}: {trainer: {name?: string, className?: string, gender?: string, sprite?: string}, size?: number, showName?: boolean}) {
  const {campaign} = useStore();
  const name = spriteForTrainer(trainer, campaign.gen);
  return (
    <figure className="trainer-sprite" style={{width: size}}>
      {name ? <img src={trainerSpriteUrl(name)} width={size} height={size} alt={trainer.className || ''} loading="lazy" /> : <div className="sprite-empty" style={{width: size, height: size}} />}
      {showName && <figcaption>{trainer.name || '—'}</figcaption>}
    </figure>
  );
}

/** Portamedaglie con le medaglie della regione della campagna. */
export function BadgeCase({earned, onToggle, small}: {earned: number[], onToggle?: (i: number) => void, small?: boolean}) {
  const {campaign} = useStore();
  const names = badgesOf(campaign.region);
  if (!names) return <p className="small muted">{campaign.region ? t('{region} non ha medaglie delle Palestre.', {region: t(campaign.region)}) : t('Scegli una regione nelle Impostazioni per vedere le medaglie.')}</p>;
  return (
    <div className={`badge-case ${small ? 'small' : ''}`}>
      {names.map((n, i) => {
        const got = earned.includes(i);
        const img = <img src={badgeUrl(campaign.region, i)} alt="" className={got ? 'got' : ''} />;
        return onToggle
          ? <button key={i} type="button" className={`badge-slot ${got ? 'got' : ''}`} onClick={() => onToggle(i)} title={t('Medaglia {name}', {name: n})} aria-pressed={got}>{img}{!small && <span>{n}</span>}</button>
          : <span key={i} className={`badge-slot ${got ? 'got' : ''}`} title={t(got ? 'Medaglia {name}' : 'Medaglia {name} (non ancora)', {name: n})}>{img}{!small && <span>{n}</span>}</span>;
      })}
    </div>
  );
}

/** Medaglie salvate come indici; i vecchi valori testuali vengono ignorati. */
export const badgeIndexes = (t?: {badges?: unknown}) => Array.isArray(t?.badges) ? (t!.badges as unknown[]).filter((x): x is number => typeof x === 'number') : [];

/** Medaglie dell'Allenatore, oppure quelle della squadra se la campagna le condivide. */
export function useBadges() {
  const {campaign, save, updateCampaign} = useStore();
  const of = (t?: {badges?: unknown}) => campaign.sharedBadges ? badgeIndexes(campaign) : badgeIndexes(t);
  const toggle = (t: Trainer, i: number) => {
    const cur = of(t);
    const next = cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort((a, b) => a - b);
    return campaign.sharedBadges ? updateCampaign({badges: next}) : save('trainer', {...t, badges: next});
  };
  return {of, toggle, shared: !!campaign.sharedBadges};
}

/** Una mossa come la manda il server (categorie in inglese: Physical, Special, Status). */
type MoveInfo = {id: string, name: string, type: string, category: string, power: number, accuracy: number | true, pp: number};
const CAT_IT: Record<string, string> = {Physical: 'Fisica', Special: 'Speciale', Status: 'Stato'};

/** Scheda di un Pokémon per i giocatori: statistiche, natura, abilità, mosse; possono cambiare soprannome e mosse, curarlo e salire di livello. */
export function MonDetails({mon, onClose, actions}: {mon: Mon, onClose: () => void, actions?: ReactNode}) {
  const {campaign, save} = useStore();
  const gen = campaign.gen;
  const sp = useSpecies(gen).get(mon.species);
  const natures = useCached<Record<string, string>>('/dex/natures');
  const moves = useCached<MoveInfo[]>(`/dex/${gen}/moves`);
  const [pickMoves, setPickMoves] = useState(false);
  const stats = calcStats(sp, mon);
  const max = stats ? Math.max(...Object.values(stats), 1) : 1;
  // crescita dall'ultimo aumento di livello (prevLevel lo salva il server quando il livello sale)
  const before = mon.prevLevel && mon.prevLevel < mon.level ? calcStats(sp, {...mon, level: mon.prevLevel}) : null;
  return (
    <Modal title={mon.nickname || mon.species} onClose={onClose}>
      <div className="mon-details">
        <div className="mon-details-head" style={{'--t': TYPE_HEX[sp?.types[0] || 'Normal']} as React.CSSProperties}>
          <Sprite species={mon.species} shiny={mon.shiny} size={128} />
          <div className="stack">
            <div className="nm">{mon.nickname ? `${mon.nickname} · ${mon.species}` : mon.species} <span className={`gender g-${mon.gender}`}>{genderSym(mon.gender)}</span>{mon.shiny && <span className="shiny"><Sparkles /></span>}</div>
            <div><b>LV {mon.level}</b></div>
            <div className="types">{sp?.types.map(t => <TypeBadge key={t} type={t} />)}</div>
            {gen >= 3 && <div className="small">{t('Natura')}: <b>{natureLabel(mon.nature, natures)}</b></div>}
            {gen >= 3 && mon.ability && <div className="small">{t('Abilità')}: <b>{mon.ability}</b></div>}
            {mon.item && <div className="small">{t('Strumento')}: <b>{mon.item}</b></div>}
          </div>
        </div>
        {mon.id && (mon.place === 'party' || mon.place === 'pc') && <>
          <label className="row gap-xs small">{t('Soprannome')}
            <input key={mon.id} defaultValue={mon.nickname || ''} placeholder={mon.species} maxLength={18}
              onBlur={e => { const v = e.target.value.trim(); if (v !== (mon.nickname || '')) save('mon', {...mon, nickname: v}); }}
              onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
          </label>
          <HpControls mon={mon} sp={sp} />
        </>}
        {stats && (
          <table className="stat-bars">
            {before && <caption className="small">{t('Ultima crescita: LV {from} → {to}', {from: mon.prevLevel, to: mon.level})}</caption>}
            <thead><tr><th></th><th>{t('Valore')}</th>{before && <th>{t('Crescita')}</th>}<th></th><th className="muted">{t('Base')}</th><th className="muted">IV</th><th className="muted">EV</th></tr></thead>
            <tbody>{(Object.keys(stats) as (keyof Stats)[]).map(k => (
              <tr key={k}>
                <th>{STAT_NAMES[k]}</th><td><b>{stats[k]}</b></td>{before && <td className={stats[k] > before[k] ? 'grow' : 'muted'}>+{stats[k] - before[k]}</td>}
                <td className="bar-cell"><span className="stat-bar" style={{transform: `scaleX(${stats[k] / max})`}} /></td>
                <td className="muted">{sp!.baseStats[k]}</td><td className="muted">{mon.ivs?.[k] ?? '—'}</td><td className="muted">{mon.evs?.[k] ?? 0}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {mon.id && mon.place !== 'npc' && <LevelUp mon={mon} />}
        <h3>{t('Mosse')} {mon.id && mon.place !== 'npc' && <button className="btn-s" onClick={() => setPickMoves(p => !p)}>{pickMoves ? t('Fatto') : t('Cambia mosse')}</button>}</h3>
        {pickMoves && <MoveChooser mon={mon} />}
        <ul className="move-list">
          {mon.moves.filter(Boolean).map(mv => {
            const info = moves?.find(x => x.name === mv);
            return (
              <li key={mv}>
                <strong>{mv}</strong>
                {info && <><TypeBadge type={info.type} /><span className="small muted">{t(CAT_IT[info.category] || info.category)} · {t('Potenza')} {info.power || '—'} · {t('Precisione')} {info.accuracy === true ? '—' : info.accuracy} · PP {info.pp}</span></>}
              </li>
            );
          })}
        </ul>
        {mon.notes && <p className="small">{mon.notes}</p>}
        {actions && <div className="row gap-s end wrap">{actions}</div>}
      </div>
    </Modal>
  );
}

/**
 * PS tra una lotta e l'altra: danno o cura di una quantità (Pozione = 20), PS al massimo, cura dello stato.
 * Lo usano anche i giocatori, per gli strumenti usati fuori dalla lotta.
 */
/** onChange: senza, salva subito (scheda dei giocatori, solo cure); con, cambia solo la copia in modifica (editor del master, salva con «Salva»). */
function HpControls({mon, sp, onChange}: {mon: Mon, sp?: SpeciesInfo, onChange?: (patch: Partial<Mon>) => void}) {
  const {save} = useStore();
  const [n, setN] = useState(20);
  const {cur, max} = hpOf(sp, mon);
  const gm = !!onChange; // i giocatori curano solo con gli strumenti: niente PS a mano né danno
  const apply = (patch: Partial<Mon>) => onChange ? onChange(patch) : save('mon', {...mon, ...patch});
  const setHp = (v: number, patch: Partial<Mon> = {}) => apply({...patch, hp: v >= max ? undefined : Math.max(0, Math.round(v)), status: v <= 0 ? '' : (patch.status ?? mon.status)});
  return (
    <div className="hp-controls">
      <MonHp mon={mon} sp={sp} />
      {gm && <label className="row gap-xs small">{t('PS attuali')}
        <input type="number" className="w-num" min={0} max={max} value={cur} onChange={e => e.target.value !== '' && setHp(Math.min(max, +e.target.value))} aria-label={t('PS attuali')} />
        <span className="muted">/ {max}</span>
      </label>}
      <div className="row gap-xs wrap">
        <input type="number" className="w-num" min={1} value={n} onChange={e => setN(Math.max(1, +e.target.value || 1))} aria-label={t('Quantità di PS')} />
        {gm && <button className="btn-s" onClick={() => setHp(cur - n)} disabled={!cur}>{t('− Danno')}</button>}
        <button className="btn-s" onClick={() => setHp(cur + n)} disabled={!cur || cur >= max} title={cur ? '' : t('È KO: serve un Revitalizzante (PS al massimo o metà)')}>{t('+ Cura')}</button>
        {!cur && <button className="btn-s" onClick={() => setHp(Math.floor(max / 2))}>{t('Revitalizzante (½)')}</button>}
        <button className="btn-s" onClick={() => setHp(max, {status: ''})} disabled={cur >= max && !mon.status}>{t('PS al massimo')}</button>
        {mon.status && <button className="btn-s" onClick={() => setHp(cur, {status: ''})}>{t('Cura {status}', {status: statusName(mon.status)})}</button>}
      </div>
    </div>
  );
}

/**
 * +1 livello dalla scorta data dal Master (il server controlla che ne resti uno: mai più livelli spesi che dati).
 * Dopo la salita mostra le mosse nuove e se può evolversi (l'evoluzione la decide il Master).
 */
function LevelUp({mon}: {mon: Mon}) {
  const {campaign, trainer} = useStore();
  const me = useContext(RollerCtx);
  const [info, setInfo] = useState<{newMoves: {move: string, level: number}[], evolutions: {name: string, ready: boolean}[]} | null>(null);
  const [err, setErr] = useState('');
  const owner = campaign.teamMode === 'own' ? trainer.find(x => x.id === mon.owner) : campaign;
  const left = (owner?.levelsGiven || 0) - (owner?.levelsSpent || 0);
  if (left <= 0 && !info) return null;
  async function up() {
    setErr('');
    try { setInfo(await api(`/c/${campaign.id}/levelup`, 'POST', {monId: mon.id, who: me.who})); } catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="callout">
      <div className="row between wrap gap-s">
        <span>{t('Livelli da distribuire')}{campaign.teamMode === 'own' && owner ? ` (${(owner as Trainer).name})` : ''}: <b>{left}</b></span>
        <button className="btn-primary btn-s" disabled={left <= 0 || mon.level >= 100} onClick={up}>+1 LV</button>
      </div>
      {info?.newMoves.map(nm => <div key={nm.move} className="small">{tj('Può imparare {move}: usa «Cambia mosse».', {move: <b>{nm.move}</b>})}</div>)}
      {info?.evolutions.filter(e => e.ready).map(e => <div key={e.name} className="small">{tj('Può evolversi in {name}! Dillo al Master.', {name: <b>{e.name}</b>})}</div>)}
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

/** Scelta delle 4 mosse tra quelle che il Pokémon impara per livello fino al suo livello (più quelle che conosce già). */
function MoveChooser({mon}: {mon: Mon}) {
  const {campaign, save} = useStore();
  const sp = useSpecies(campaign.gen).get(mon.species);
  const learn = useCached<{levelUp: {move: string, level: number}[]}>(sp ? `/dex/${campaign.gen}/learnset/${sp.id}` : null);
  if (!learn) return <p className="small muted">{t('Caricamento mosse…')}</p>;
  const known = mon.moves.filter(Boolean);
  const options = [...new Set([...known, ...learn.levelUp.filter(l => l.level <= mon.level).map(l => l.move)])];
  const setSlot = (i: number, mv: string) => {
    const next = [...known];
    if (!mv) next.splice(i, 1); else next[i] = mv;
    if (new Set(next).size !== next.length) return; // la stessa mossa due volte no
    save('mon', {...mon, moves: next});
  };
  return (
    <div className="grid-2">
      {[0, 1, 2, 3].map(i => (
        <select key={i} value={known[i] || ''} onChange={e => setSlot(i, e.target.value)} aria-label={t('Mossa {n}', {n: i + 1})} disabled={i > known.length}>
          <option value="">{i < known.length ? t('— dimentica —') : t('— vuota —')}</option>
          {options.filter(o => o === known[i] || !known.includes(o)).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ))}
    </div>
  );
}

/** Valori della tabella dei tipi di Showdown -> moltiplicatore: 0 neutro, 1 debole (x2), 2 resiste (x0,5), 3 immune (x0). */
const MULT = [1, 2, 0.5, 0];
/** Calcolatore dei tipi difensivi, con il modificatore al dado del libretto per l'aiuto dei Pokémon. */
export function TypeCalculator() {
  const {campaign, mon} = useStore();
  const species = useSpecies(campaign.gen);
  const data = useCached<{types: string[], chart: Record<string, Record<string, number>>}>(`/dex/${campaign.gen}/types`);
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [pick, setPick] = useState('');
  if (!data) return null;
  const def = [t1, t2].filter(Boolean);
  const rows = def.length ? data.types.map(a => ({a, m: def.reduce((x, d) => x * MULT[data.chart[d][a]], 1)})) : [];
  const groups: [string, (m: number) => boolean, string, string][] = [
    [t('Subisce x4'), m => m === 4, '− −', 'weak4'], [t('Subisce x2'), m => m === 2, '−', 'weak2'],
    [t('Resiste (x½ – x¼)'), m => m > 0 && m < 1, '+', 'res'], [t('Immune (x0)'), m => m === 0, '+ +', 'imm'],
  ];
  const choose = (name: string) => {
    setPick(name);
    const sp = species.get(mon.find(m => m.id === name)?.species || name);
    if (sp) { setT1(sp.types[0]); setT2(sp.types[1] || ''); }
  };
  return (
    <div className="type-calc">
      <div className="row gap-s wrap">
        <select value={pick} onChange={e => choose(e.target.value)} aria-label={t('Pokémon della squadra')}>
          <option value="">— {t('un Pokémon della squadra')} —</option>
          {mon.filter(m => m.place === 'party').map(m => <option key={m.id} value={m.id}>{m.nickname || m.species}</option>)}
        </select>
        <span className="muted small">{t('oppure i tipi:')}</span>
        <select value={t1} onChange={e => { setT1(e.target.value); setPick(''); }} aria-label={t('Primo tipo')}>
          <option value="">{t('Tipo 1')}</option>{data.types.map(ty => <option key={ty} value={ty}>{typeName(ty)}</option>)}
        </select>
        <select value={t2} onChange={e => { setT2(e.target.value); setPick(''); }} aria-label={t('Secondo tipo')}>
          <option value="">— {t('nessuno')} —</option>{data.types.filter(ty => ty !== t1).map(ty => <option key={ty} value={ty}>{typeName(ty)}</option>)}
        </select>
      </div>
      {def.length > 0 && (
        <div className="type-groups">
          {groups.map(([label, test, mod, cls]) => {
            const list = rows.filter(r => test(r.m));
            return (
              <div key={label} className={`type-group ${cls}`}>
                <div className="tg-head"><b>{label}</b><span className="tg-mod" title={t('Modificatore al dado (libretto)')}>{mod}</span></div>
                <div className="types">{list.length ? list.map(r => <TypeBadge key={r.a} type={r.a} />) : <span className="small muted">{t('nessuno')}</span>}</div>
              </div>
            );
          })}
        </div>
      )}
      <p className="small muted">{t("Aiuto di un Pokémon in un ambiente di un certo tipo: x4 dà − −, x2 dà −, resistenza +, immunità + +. Eccezione: Spettro e Normale non hanno effetto l'uno sull'altro.")}</p>
    </div>
  );
}

/** Nome leggibile di uno sprite: nome della classe se è nota, altrimenti il nome di Showdown. */
export function spriteLabel(base: string) {
  const known = NPC_CLASSES.find(c => c[1] === base)?.[0] || Object.entries(CLASS_SPRITES).find(([, p]) => p.includes(base))?.[0];
  return known ? `${t(known)} · ${base}` : base;
}

/**
 * Scelta di uno sprite Allenatore guardando le immagini.
 * Rotella sopra l'anteprima o frecce ← → per scorrere; "Sfoglia tutti" apre la griglia (frecce, Invio, ricerca).
 */
export function SpriteChooser({value, onChange, placeholder = t('automatico'), fallback = ''}: {value: string, onChange: (base: string) => void, placeholder?: string, fallback?: string}) {
  const {campaign} = useStore();
  const [browse, setBrowse] = useState(false);
  const shown = value || fallback;
  const i = BASE_SPRITES.indexOf(shown);
  const step = (d: number) => onChange(BASE_SPRITES[((i < 0 ? 0 : i + d) + BASE_SPRITES.length) % BASE_SPRITES.length]);
  const wheel = useWheelStep(step);
  return (
    <div className="sprite-chooser">
      <div className="sc-preview" tabIndex={0} ref={wheel} title={t('Rotella o frecce ← → per cambiare')}
        onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); } }}>
        <button type="button" className="btn-icon" onClick={() => step(-1)} aria-label={t('Precedente')}><ChevronLeft /></button>
        {shown ? <img src={trainerSpriteUrl(resolveTrainerSprite(shown, campaign.gen))} alt={shown} width={80} height={80} className={value ? '' : 'sc-auto'} /> : <span className="sc-empty">{placeholder}</span>}
        <button type="button" className="btn-icon" onClick={() => step(1)} aria-label={t('Successivo')}><ChevronRight /></button>
      </div>
      <div className="sc-name small">{value ? spriteLabel(value) : fallback ? `${spriteLabel(fallback)} (${t('automatico')})` : placeholder}</div>
      <div className="row gap-s">
        <button type="button" className="btn-s" onClick={() => setBrowse(true)}>{t('Sfoglia tutti')}</button>
        {value && <button type="button" className="btn-s" onClick={() => onChange('')}>{t('Togli')}</button>}
      </div>
      {browse && <SpriteBrowser value={shown} onPick={b => { onChange(b); setBrowse(false); }} onClose={() => setBrowse(false)} />}
    </div>
  );
}

/** Rotella del mouse → passo avanti/indietro (listener non passivo, così la pagina non scorre). */
function useWheelStep(step: (d: number) => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(step);
  cb.current = step;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let acc = 0;
    const h = (e: WheelEvent) => { e.preventDefault(); acc += e.deltaY; if (Math.abs(acc) >= 40) { cb.current(acc > 0 ? 1 : -1); acc = 0; } };
    el.addEventListener('wheel', h, {passive: false});
    return () => el.removeEventListener('wheel', h);
  }, []);
  return ref;
}

/** Griglia di tutti gli sprite con ricerca, per scegliere un personaggio qualsiasi. */
function SpriteBrowser({value, onPick, onClose}: {value: string, onPick: (b: string) => void, onClose: () => void}) {
  const {campaign} = useStore();
  const [q, setQ] = useState('');
  const list = BASE_SPRITES.filter(b => !q || spriteLabel(b).toLowerCase().includes(q.toLowerCase()));
  const [cur, setCur] = useState(Math.max(0, list.indexOf(value)));
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { setCur(c => Math.min(c, Math.max(0, list.length - 1))); }, [q]);
  useEffect(() => { grid.current?.querySelector<HTMLElement>(`[data-i="${cur}"]`)?.scrollIntoView({block: 'nearest'}); }, [cur]);
  function key(e: React.KeyboardEvent) {
    const cols = Math.max(1, Math.floor((grid.current?.clientWidth || 600) / 104));
    const mv: Record<string, number> = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols};
    if (mv[e.key] !== undefined) { e.preventDefault(); setCur(c => Math.max(0, Math.min(list.length - 1, c + mv[e.key]))); }
    if (e.key === 'Enter' && list[cur]) { e.preventDefault(); onPick(list[cur]); }
  }
  return (
    <Modal title={t('Scegli lo sprite')} onClose={onClose} wide>
      <div className="sprite-browser" onKeyDown={key}>
        <input autoFocus placeholder={t('Cerca (es. infermiera, gentleman, scienziato, roark)…')} value={q} onChange={e => setQ(e.target.value)} />
        <p className="small muted">{t('Frecce per muoverti, Invio per scegliere, rotella per scorrere. {n} sprite.', {n: list.length})}</p>
        <div className="sb-grid" ref={grid}>
          {list.map((b, k) => (
            <button key={b} type="button" data-i={k} className={`sb-item ${k === cur ? 'cur' : ''} ${b === value ? 'chosen' : ''}`}
              onClick={() => onPick(b)} onMouseEnter={() => setCur(k)} title={spriteLabel(b)}>
              <img src={trainerSpriteUrl(resolveTrainerSprite(b, campaign.gen))} alt="" loading="lazy" width={72} height={72} />
              <span>{spriteLabel(b).split(' · ')[0]}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Squadra riordinabile trascinando la tessera (mouse: trascina; dito: tieni premuto e trascina).
 * Il primo è quello che scende in campo per primo. Salva il nuovo ordine su tutti i dispositivi.
 */
export function SortableParty({party, render}: {party: Mon[], render: (m: Mon, handle: ReactNode) => ReactNode}) {
  const {save} = useStore();
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const g = useRef<{id: string, x: number, y: number, touch: boolean, active: boolean, timer?: number, swallow?: boolean} | null>(null);
  const live = useRef({order, dragId});
  live.current = {order, dragId};
  const ids = order || party.map(m => m.id!);
  const list = ids.map(id => party.find(m => m.id === id)).filter(Boolean) as Mon[];

  // durante il trascinamento col dito la pagina non deve scorrere
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const h = (e: TouchEvent) => { if (g.current?.active) e.preventDefault(); };
    el.addEventListener('touchmove', h, {passive: false});
    return () => el.removeEventListener('touchmove', h);
  }, []);

  /** Inizio del trascinamento: si ricorda l'ordine di partenza (vibrazione breve sui telefoni). */
  const activate = () => {
    if (!g.current) return;
    g.current.active = true;
    setDragId(g.current.id);
    setOrder(party.map(m => m.id!));
    navigator.vibrate?.(15);
  };
  /** Pressione su una tessera: col mouse si attende un piccolo spostamento, col dito una pressione di 300 ms. */
  function down(e: React.PointerEvent, id: string) {
    if (e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    g.current = {id, x: e.clientX, y: e.clientY, touch, active: false};
    if (touch) g.current.timer = window.setTimeout(activate, 300);
  }
  /** Spostamento: trova la tessera sotto il puntatore e ci sposta quella trascinata. */
  function move(e: React.PointerEvent) {
    const s = g.current;
    if (!s) return;
    const far = Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8;
    if (!s.active) {
      if (s.touch) { if (far) { clearTimeout(s.timer); g.current = null; } return; } // si sta scorrendo la pagina
      if (!far) return;
      activate();
    }
    const {order: cur, dragId: did} = live.current;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-sort-id]');
    const over = el?.dataset.sortId;
    if (!cur || !did || !over || over === did) return;
    const next = cur.filter(x => x !== did);
    next.splice(cur.indexOf(over), 0, did);
    setOrder(next);
  }
  /** Rilascio: salva solo i Pokémon che hanno cambiato posizione. */
  async function up() {
    const s = g.current;
    g.current = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (!s.active) return;
    swallowClick.current = true; // il clic che segue il rilascio non deve aprire la scheda
    setTimeout(() => { swallowClick.current = false; }, 0);
    const {order: cur} = live.current;
    setDragId(null);
    if (!cur) return;
    const changed = cur.map((id, i) => ({m: party.find(x => x.id === id)!, i})).filter(({m, i}) => m && m.order !== i);
    await Promise.all(changed.map(({m, i}) => save('mon', {...m, order: i})));
    setOrder(null);
  }
  const swallowClick = useRef(false);
  return (
    <div ref={box} className={`mon-grid sortable ${dragId ? 'is-dragging' : ''}`} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onClickCapture={e => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); } }}
      onContextMenu={e => { if (g.current?.touch) e.preventDefault(); }}>
      {list.map((m, i) => (
        <div key={m.id} data-sort-id={m.id} className={`sort-item ${dragId === m.id ? 'dragging' : ''}`} onPointerDown={e => down(e, m.id!)}>
          {render(m, <span className="sort-handle" title={t("Trascina la tessera per cambiare l'ordine")}><GripVertical /><b>{i + 1}</b></span>)}
        </div>
      ))}
    </div>
  );
}

/** Icona per ogni modo d'incontro. */
const METHOD_ICON: Record<string, typeof Sprout> = {walk: Sprout, surf: Waves, 'old-rod': Fish, 'good-rod': Fish, 'super-rod': Fish, 'rock-smash': Pickaxe, headbutt: TreeDeciduous};
/** Icona di un modo d'incontro. */
export function MethodIcon({id}: {id?: string}) {
  const I = METHOD_ICON[id || 'walk'] || Sprout;
  return <I />;
}

/** Un pulsante per ogni modo d'incontro presente nella zona (erba, surf, ami…). */
export function EncounterButtons({zone, onPick, disabled, big}: {zone?: Zone, onPick: (method: string) => void, disabled?: boolean, big?: boolean}) {
  const present = METHODS.filter(m => zone?.entries.some(e => e.species && e.rate > 0 && methodOf(e) === m.id));
  if (!zone) return <button className={`btn-primary ${big ? 'big' : ''}`} disabled><Sprout /> {t('Scegli una zona')}</button>;
  if (!present.length) return <p className="small muted">{t('La zona {name} non ha ancora Pokémon.', {name: zone.name})}</p>;
  return (
    <div className="encounter-buttons">
      {present.map((m, i) => (
        <button key={m.id} className={`${i === 0 ? 'btn-primary' : ''} ${big && i === 0 ? 'big' : ''}`} disabled={disabled} onClick={() => onPick(m.id)}>
          <MethodIcon id={m.id} /> {m.id === 'walk' ? t(big ? "Qualcosa si muove nell'erba…" : 'Erba alta') : t(m.short)}
        </button>
      ))}
    </div>
  );
}

/** Notifica veloce di ogni tiro di dado (di chiunque), in alto: sparisce da sola dopo 3 secondi. */
export function RollToast() {
  const [items, setItems] = useState<(Roll & {k: number})[]>([]);
  useEffect(() => {
    const on = (r: Roll) => {
      const k = Math.random();
      setItems(l => [...l.slice(-2), {...r, k}]);
      setTimeout(() => setItems(l => l.filter(x => x.k !== k)), 3000);
    };
    socket.on('roll', on);
    return () => { socket.off('roll', on); };
  }, []);
  return <div className="roll-toasts" aria-live="polite">{items.map(r => <div key={r.k} className="roll-toast" style={{'--c': r.color || '#16213f'} as React.CSSProperties}><b>{r.who}</b> {r.text}</div>)}</div>;
}

/** Storico dei tiri di tutti (gli ultimi 30). */
export function RollLog() {
  const rolls = useRolls();
  if (!rolls.length) return <p className="small muted">{t('Ancora nessun tiro.')}</p>;
  return (
    <ul className="roll-log">{rolls.map((r, i) => (
      <li key={r.t + '-' + i}><span className="roll-who" style={{background: r.color || '#16213f'}}>{r.who}</span> {r.text}
        <span className="muted small"> {new Date(r.t).toLocaleTimeString(LOCALE, {hour: '2-digit', minute: '2-digit'})}</span></li>
    ))}</ul>
  );
}
