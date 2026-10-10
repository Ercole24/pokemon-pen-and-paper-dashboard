// Pagina Allenatori (/c/<id>/allenatori): schede dei giocatori come nel libretto.
// Nome, giocatore, classe (con i modificatori alle 12 statistiche), sprite, medaglie, soldi, zaino, note.
// TrainerSheet è usata anche nella vista giocatore.
import {useEffect, useState} from 'react';
import {TYPES_IT, typeName, useStore, type Trainer} from '../api';
import {LOCALE, t, tj} from '../i18n';
import {BadgeCase, FudgeRoller, Modal, SpriteChooser, TrainerSprite, useBadges, useClasses} from '../components';
import {CLASS_SPRITES, spriteForTrainer, trainerSpriteUrl} from '../trainers';
import {STAT_GROUPS, ALL_STATS} from '../../../server/src/classes';

/** Zaino salvato come testo («Poké Ball x5, Pozione x2»): elenco di [oggetto, quantità] e ritorno. */
export const parseBag = (bag = '') => bag.split(/[,\n]/).map(x => x.trim()).filter(Boolean)
  .map(x => { const m = x.match(/^(.*?)\s*[x×]\s*(\d+)$/i); return m ? [m[1], +m[2]] as [string, number] : [x, 1] as [string, number]; });
export const formatBag = (items: [string, number][]) => items.filter(([, n]) => n > 0).map(([name, n]) => n > 1 ? `${name} x${n}` : name).join(', ');

/** Scheda vuota per un nuovo Allenatore. */
const blank: Trainer = {name: '', className: 'Fantallenatore', gender: 'M', bag: '', notes: '', badges: [], money: 3000};

/** Classe dell'Allenatore (quella personalizzata o una del libretto). */
export function classOf(t: Trainer, classes: any[]) {
  return t.className === 'Personalizzata' ? t.customClass : classes.find(c => c.name === t.className);
}

/** Modificatore come "++" o "−". */
const plus = (n: number) => n > 0 ? '+'.repeat(n) : n < 0 ? '−'.repeat(-n) : '';

/** La pagina: elenco a sinistra, scheda a destra. */
export default function Trainers() {
  const {trainer, remove, campaign} = useStore();
  const [sel, setSel] = useState<string | 'new' | null>(trainer[0]?.id || null);
  const current = sel === 'new' ? blank : trainer.find(t => t.id === sel);
  return (
    <div className="page">
      <header className="page-head row between">
        <h1>{t('Allenatori')}</h1>
        <button className="btn-primary" onClick={() => setSel('new')}>+ {t('Allenatore')}</button>
      </header>
      <div className="split">
        <nav className="list-nav">
          {trainer.map(tr => <button key={tr.id} className={`with-sprite ${sel === tr.id ? 'active' : ''}`} onClick={() => setSel(tr.id!)}><img src={trainerSpriteUrl(spriteForTrainer(tr, campaign.gen))} alt="" /><span><strong>{tr.name}</strong><br /><span className="muted small">{t(tr.className)}</span></span></button>)}
          {trainer.length === 0 && <p className="muted">{t('Nessun allenatore.')}</p>}
        </nav>
        {current && <TrainerSheet key={sel!} initial={current} onSaved={t => setSel(t.id!)} onDelete={current.id ? () => { remove('trainer', current.id!); setSel(null); } : undefined} />}
      </div>
    </div>
  );
}

/** Scheda modificabile di un Allenatore; playerMode nasconde le parti riservate al master. */
export function TrainerSheet({initial, onSaved, onDelete, playerMode}: {initial: Trainer, onSaved?: (tr: Trainer) => void, onDelete?: () => void, playerMode?: boolean}) {
  const {save} = useStore();
  const classes = useClasses();
  const badges = useBadges();
  const [tr, setT] = useState<Trainer>(initial);
  const [dirty, setDirty] = useState(false);
  const [test, setTest] = useState<string | null>(null);
  const [assist, setAssist] = useState(false);
  useEffect(() => { if (!dirty) setT(initial); }, [initial]);
  const set = (p: Partial<Trainer>) => { setT({...tr, ...p}); setDirty(true); };
  /** Soldi e zaino si salvano subito (anche dal telefono), partendo dall'ultima versione salvata. */
  const quick = async (p: Partial<Trainer>) => {
    if (!tr.id) return set(p);
    const saved = await save('trainer', {...initial, ...p});
    setT(cur => ({...cur, money: saved.money, bag: saved.bag}));
  };
  const [amount, setAmount] = useState('');
  const [newItem, setNewItem] = useState('');
  const live = tr.id ? initial : tr; // con la scheda salvata mostra sempre l'ultima versione (anche se cambiata da un altro telefono)
  const bag = parseBag(live.bag);
  const setBag = (items: [string, number][]) => quick({bag: formatBag(items)});
  /** Aggiunge un oggetto (o ne aumenta la quantità se c'è già). */
  const addItem = () => {
    const [name, n] = parseBag(newItem)[0] || [];
    if (!name) return;
    const i = bag.findIndex(([x]) => x.toLowerCase() === name.toLowerCase());
    setBag(i >= 0 ? bag.map((it, j) => j === i ? [it[0], it[1] + n] : it) : [...bag, [name, n]]);
    setNewItem('');
  };
  const cls = classOf(tr, classes);
  const mods: Record<string, number> = cls?.mods || {};

  /** Salva la scheda. */
  async function submit() {
    if (!tr.name.trim()) return alert(t('Serve un nome'));
    const saved = await save('trainer', tr);
    setT(saved); setDirty(false); onSaved?.(saved);
  }

  const custom = tr.customClass || {name: 'Personalizzata', mods: {}, catchBonus: {value: 5, types: 'ALL'}};
  const plusUsed = Object.values<number>(custom.mods).filter(v => v > 0).reduce((a, b) => a + b, 0);
  const minusUsed = -Object.values<number>(custom.mods).filter(v => v < 0).reduce((a, b) => a + b, 0);
  /** Modifica la classe personalizzata. */
  const setCustom = (c: any) => set({customClass: {...custom, ...c}});

  return (
    <section className="panel sheet">
      <div className="sheet-top">
      <TrainerSprite trainer={tr} size={112} />
      <div className="grid-3">
        <label>{t('Nome')}<input value={tr.name} onChange={e => set({name: e.target.value})} /></label>
        <label>{t('Aspetto')}
          <select value={tr.gender || 'M'} onChange={e => set({gender: e.target.value as 'M' | 'F'})}>
            <option value="M">{t('Ragazzo')}</option><option value="F">{t('Ragazza')}</option>
          </select>
        </label>
        <label>{t('Giocatore')}<input value={tr.player || ''} onChange={e => set({player: e.target.value})} /></label>
        <label>{t('Età')}<input value={tr.age || ''} onChange={e => set({age: e.target.value})} /></label>
        <label>{t("Città d'origine")}<input value={tr.hometown || ''} onChange={e => set({hometown: e.target.value})} /></label>
        <label>{t('Classe')}
          <select value={tr.className} onChange={e => set({className: e.target.value})} disabled={playerMode}>
            {classes.map(c => <option key={c.name} value={c.name}>{t(c.name)}</option>)}
            <option value="Personalizzata">{t('Personalizzata')}</option>
          </select>
        </label>
        <div className="stack-xs"><span className="small">{t('Soldi')}: <b>{(live.money ?? 0).toLocaleString(LOCALE)} ₽</b></span>
          <div className="row gap-xs">
            <input type="number" min={0} inputMode="numeric" value={amount} placeholder={t('importo')} aria-label={t('Importo')} onChange={e => setAmount(e.target.value)} style={{width: '7em'}} />
            <button type="button" className="btn-s" disabled={!+amount} onClick={() => { quick({money: Math.max(0, (initial.money ?? 0) - +amount)}); setAmount(''); }}>{t('− Togli')}</button>
            <button type="button" className="btn-s" disabled={!+amount} onClick={() => { quick({money: (initial.money ?? 0) + +amount}); setAmount(''); }}>{t('+ Aggiungi')}</button>
          </div>
        </div>
        {!playerMode && <label>{t('Sprite personalizzato')}
          <SpriteChooser value={tr.sprite || ''} fallback={(CLASS_SPRITES[tr.className] || ['acetrainer', 'acetrainerf'])[tr.gender === 'F' ? 1 : 0]} placeholder={t('dalla Classe')} onChange={b => set({sprite: b})} />
        </label>}
      </div>
      </div>

      {cls && <p className="small">
        {tj(cls.catchBonus.types === 'ALL' ? 'Bonus cattura: {bonus} a tutti i tipi' : 'Bonus cattura: {bonus} a {types}', {bonus: <b>+{cls.catchBonus.value}</b>, types: cls.catchBonus.types === 'ALL' ? '' : cls.catchBonus.types.map(typeName).join(', ')})}
        {cls.note && <> · {t(cls.note)}</>}
      </p>}

      {tr.className === 'Personalizzata' && !playerMode && (
        <div className="callout small">
          {t('5 punti + e 2 punti − da distribuire, nessuna statistica oltre ++. Usati: {plus}/5 +, {minus}/2 −.', {plus: plusUsed, minus: minusUsed})}
          <div className="row gap-s wrap">
            <select value={custom.catchBonus.types === 'ALL' ? 'ALL' : custom.catchBonus.types.length === 1 ? 'ONE' : 'TWO'}
              onChange={e => setCustom({catchBonus: e.target.value === 'ALL' ? {value: 5, types: 'ALL'} : {value: e.target.value === 'ONE' ? 15 : 10, types: e.target.value === 'ONE' ? ['Normal'] : ['Normal', 'Fire']}})}>
              <option value="ONE">{t('+15 a un tipo')}</option><option value="TWO">{t('+10 a due tipi')}</option><option value="ALL">{t('+5 a tutti i tipi')}</option>
            </select>
            {custom.catchBonus.types !== 'ALL' && custom.catchBonus.types.map((ty: string, i: number) => (
              <select key={i} value={ty} onChange={e => { const tys = [...custom.catchBonus.types]; tys[i] = e.target.value; setCustom({catchBonus: {...custom.catchBonus, types: tys}}); }}>
                {Object.keys(TYPES_IT).map(k => <option key={k} value={k}>{typeName(k)}</option>)}
              </select>
            ))}
          </div>
        </div>
      )}

      <div className="stat-groups">
        {Object.entries(STAT_GROUPS).map(([group, stats]) => (
          <div key={group} className={`stat-group sg-${group.toLowerCase()}`}>
            <h3>{t(group)}</h3>
            {stats.map(st => (
              <div key={st} className="stat-row">
                <button className="stat-name" onClick={() => setTest(st)} title={t('Metti alla prova')}>{t(st)}</button>
                {tr.className === 'Personalizzata' && !playerMode ? (
                  <span className="row gap-xs">
                    <button className="btn-s" disabled={(custom.mods[st] || 0) <= -2 || ((custom.mods[st] || 0) <= 0 && minusUsed >= 2)} onClick={() => setCustom({mods: {...custom.mods, [st]: (custom.mods[st] || 0) - 1}})}>−</button>
                    <b className="mod">{plus(custom.mods[st] || 0) || '·'}</b>
                    <button className="btn-s" disabled={(custom.mods[st] || 0) >= 2 || ((custom.mods[st] || 0) >= 0 && plusUsed >= 5)} onClick={() => setCustom({mods: {...custom.mods, [st]: (custom.mods[st] || 0) + 1}})}>+</button>
                  </span>
                ) : <b className={`mod ${mods[st] > 0 ? 'pos' : mods[st] < 0 ? 'neg' : ''}`}>{plus(mods[st] || 0)}</b>}
                {tr.hiddenPower === st && <span className="hp-tag" title={t('Introforza')}>{t('IF')}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <label>{t('Introforza (una statistica senza bonus +)')}
        <select value={tr.hiddenPower || ''} onChange={e => set({hiddenPower: e.target.value})}>
          <option value="">— {t('segreta / non scelta')} —</option>
          {ALL_STATS.filter(s => !(mods[s] > 0)).map(s => <option key={s} value={s}>{t(s)}</option>)}
        </select>
      </label>

      <div className="grid-2">
        <div className="stack-xs"><span>{t('Zaino')}</span>
          {bag.length === 0 && <span className="small muted">{t('Vuoto.')}</span>}
          {bag.map(([name, n], i) => (
            <div key={i} className="row gap-xs between">
              <span>{name}</span>
              <span className="row gap-xs">
                <button type="button" className="btn-s" aria-label={t('Togli un {name}', {name})} onClick={() => setBag(bag.map((it, j) => j === i ? [it[0], it[1] - 1] : it))}>−</button>
                <b>{n}</b>
                <button type="button" className="btn-s" aria-label={t('Aggiungi un {name}', {name})} onClick={() => setBag(bag.map((it, j) => j === i ? [it[0], it[1] + 1] : it))}>+</button>
                <button type="button" className="btn-s" aria-label={t('Butta {name}', {name})} onClick={() => setBag(bag.filter((_, j) => j !== i))}>✕</button>
              </span>
            </div>
          ))}
          <form className="row gap-xs" onSubmit={e => { e.preventDefault(); addItem(); }}>
            <input value={newItem} placeholder={t('Pozione x2')} aria-label={t('Nuovo oggetto')} onChange={e => setNewItem(e.target.value)} />
            <button className="btn-s" disabled={!newItem.trim()}>{t('+ Aggiungi')}</button>
          </form>
        </div>
        <label>{t('Note')}<textarea rows={6} value={tr.notes || ''} onChange={e => set({notes: e.target.value})} /></label>
      </div>
      <div className="stack">
        <h3>{t('Medaglie')}{badges.shared && <span className="muted small"> · {t('condivise da tutta la squadra')}</span>}</h3>
        <BadgeCase earned={badges.of(tr)} onToggle={playerMode || !tr.id ? undefined : i => badges.toggle(initial, i)} />
      </div>

      <div className="row gap-s end">
        {onDelete && <button className="btn-danger" onClick={() => confirm(t('Eliminare {name}?', {name: tr.name})) && onDelete()}>{t('Elimina')}</button>}
        <button className="btn-primary" disabled={!dirty} onClick={submit}>{t(dirty ? 'Salva' : 'Salvato')}</button>
      </div>

      {test && (
        <Modal title={t('Prova di {stat}', {stat: t(test)})} onClose={() => { setTest(null); setAssist(false); }}>
          <p className="small muted">{t('Modificatore di Classe')}: {plus(mods[test] || 0) || t('nessuno')}{tr.hiddenPower === test && ` · ${t('è la tua Introforza')}`}</p>
          <label className="check"><input type="checkbox" checked={assist} onChange={e => setAssist(e.target.checked)} /> {t('Aiuto di un Pokémon (+1 dado)')}</label>
          <FudgeRoller modifier={mods[test] || 0} extraDie={assist} />
          {assist && <p className="small muted">{t('Ambiente sfavorevole al tipo del Pokémon? x4 danni: −2 · x2: −1 · resiste: +1 · immune: +2 (applicali a voce).')}</p>}
        </Modal>
      )}
    </section>
  );
}
