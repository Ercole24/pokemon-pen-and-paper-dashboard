// Vista del giocatore sul telefono (/c/<id>/giocatore/<allenatore>).
// Prima si sceglie il proprio Allenatore, poi ci sono sei schede in basso:
// Scheda (modificabile), Squadra (ordine, PC, dettagli dei Pokémon), Dadi (con calcolatore dei tipi),
// Mappa (la mappa attiva, solo dopo essere stati posizionati dal master), Lotte (come entrare su Showdown) e Manuale.
import {useState} from 'react';
import {BookText, Dices, Footprints, IdCard, Map as MapIcon, Swords} from 'lucide-react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {RollerCtx, showdownUrl, useMap, useStore} from '../api';
import {BadgeCase, FudgeRoller, RollLog, MonCard, MonDetails, NumberDie, SortableParty, TypeCalculator, useBadges, useParty} from '../components';
import {ArrowDownToLine, ArrowUpFromLine} from 'lucide-react';
import type {Mon} from '../api';
import {spriteForTrainer, trainerSpriteUrl} from '../trainers';
import {TrainerSheet, classOf} from './Trainers';
import {useClasses} from '../components';
import {MapView, playerColor} from './MapPlay';
import Manual from './Manual';
import {useBattles, HpBar, SwitchAdvisor, TypeMatchup} from './Battle';
import {ALL_STATS} from '../../../server/src/classes';
import {LangSwitch, t, tj} from '../i18n';

/** Schede disponibili, con il nome mostrato nella barra in basso. */
type Tab = 'scheda' | 'squadra' | 'dadi' | 'mappa' | 'lotte' | 'manuale';
const TAB_LABEL: Record<Tab, string> = {scheda: 'Scheda', squadra: 'Squadra', dadi: 'Dadi', mappa: 'Mappa', lotte: 'Lotte', manuale: 'Manuale'};

/** La pagina. */
export default function Player() {
  const {tid} = useParams();
  const {trainer, campaign} = useStore();
  const nav = useNavigate();
  const me = trainer.find(t => t.id === tid);
  const [tab, setTab] = useState<Tab>('scheda');
  const {party, pc} = useParty(tid); // con squadre personali solo i miei; con la squadra condivisa tutti
  const {mon, save} = useStore();
  const [show, setShow] = useState<Mon | null>(null);
  /** Sposta un proprio Pokémon tra squadra e PC. */
  const movePlace = (m: Mon, place: 'party' | 'pc') => save('mon', {...m, place, order: place === 'party' ? party.length : undefined});
  const classes = useClasses();
  const badges = useBadges();
  const battles = useBattles(campaign.id).filter(b => !b.ended);
  const [stat, setStat] = useState(ALL_STATS[0]);
  const activeMap = useMap(campaign.activeMap);

  if (!me) {
    return (
      <div className="player-pick">
        <LangSwitch className="corner" />
        <h1>{campaign.name}</h1>
        <p className="muted">{t('Chi sei?')}</p>
        <div className="stack">
          {trainer.map(tr => <button key={tr.id} className="big pick-trainer" onClick={() => nav(tr.id!)}><img src={trainerSpriteUrl(spriteForTrainer(tr, campaign.gen))} alt="" />{tr.name} <span className="muted small">{t(tr.className)}</span></button>)}
          {trainer.length === 0 && <p className="muted">{t('Il Master non ha ancora creato gli Allenatori.')}</p>}
        </div>
      </div>
    );
  }
  const mods = classOf(me, classes)?.mods || {};

  return (
    <RollerCtx.Provider value={{who: me.name, color: playerColor(trainer, me.id)}}>
    <div className="player">
      <header className="player-head">
        <img className="player-avatar" src={trainerSpriteUrl(spriteForTrainer(me, campaign.gen))} alt="" />
        <div className="player-id"><strong>{me.name}</strong> <span className="muted small">{t(me.className)}</span>
          <BadgeCase small earned={badges.of(me)} /></div>
        <LangSwitch />
        <Link to=".." relative="path" className="small">{t('cambia')}</Link>
      </header>
      {battles.length > 0 && (
        <a className="battle-banner" href={`${showdownUrl()}/${battles.at(-1)!.roomid}`} target="showdown">
          <Swords /> {battles.at(-1)!.title}: {t('apri la lotta')}
        </a>
      )}
      <main className="player-body">
        {tab === 'scheda' && <TrainerSheet initial={me} playerMode />}
        {tab === 'squadra' && <>
          <h2>{t('Squadra')} {party.length}/6</h2>
          <p className="small muted">{t("Tocca un Pokémon per statistiche e mosse. Per cambiare l'ordine tieni premuto un Pokémon e trascinalo: il primo scende in campo per primo.")}</p>
          <SortableParty party={party} render={(m, handle) => <MonCard mon={m} onClick={() => setShow(m)} actions={handle} />} />
          <h2>{t('PC di Bill')} <span className="muted">{pc.length}</span></h2>
          {pc.length === 0 && <p className="small muted">{t('Vuoto.')}</p>}
          <div className="mon-grid pc-grid">{pc.map(m => <MonCard key={m.id} mon={m} compact onClick={() => setShow(m)}
            actions={<button className="btn-s" disabled={party.length >= 6} onClick={() => movePlace(m, 'party')}><ArrowUpFromLine /> {t('Squadra')}</button>} />)}</div>
        </>}
        {show && <MonDetails mon={mon.find(x => x.id === show.id) || show} onClose={() => setShow(null)} actions={<>
          {(mon.find(x => x.id === show.id) || show).place === 'party'
            ? <button disabled={party.length <= 1} onClick={() => { movePlace(show, 'pc'); setShow(null); }}><ArrowDownToLine /> {t('Manda al PC')}</button>
            : <button className="btn-primary" disabled={party.length >= 6} onClick={() => { movePlace(show, 'party'); setShow(null); }}><ArrowUpFromLine /> {t('Metti in squadra')}</button>}
          {party.length >= 6 && (mon.find(x => x.id === show.id) || show).place === 'pc' && <span className="small muted">{t('La squadra è piena: manda prima qualcuno al PC.')}</span>}
        </>} />}
        {tab === 'dadi' && <section className="panel">
          <label>{t('Statistica messa alla prova')}
            <select value={stat} onChange={e => setStat(e.target.value as any)}>
              {ALL_STATS.map(s => <option key={s} value={s}>{t(s)} {mods[s] ? `(${mods[s] > 0 ? '+'.repeat(mods[s]) : '−'.repeat(-mods[s])})` : ''}</option>)}
            </select>
          </label>
          <FudgeRoller modifier={mods[stat] || 0} />
          <h3>{t('Altri dadi')}</h3>
          <div className="dice-grid">{[4, 6, 20, 100].map(s => <NumberDie key={s} sides={s} />)}</div>
          <h3>{t('Tiri del tavolo')}</h3>
          <RollLog />
        </section>}
        {tab === 'dadi' && <section className="panel"><h2>{t('Tabella dei tipi')}</h2><TypeMatchup owner={tid} /></section>}
        {tab === 'dadi' && <section className="panel"><h2>{t('Tipi difensivi')}</h2><TypeCalculator /></section>}
        {tab === 'mappa' && (activeMap ? <MapView map={activeMap} myToken={me.id} /> : <p className="muted">{activeMap === null ? t('Caricamento mappa…') : t('Nessuna mappa al tavolo.')}</p>)}
        {tab === 'manuale' && <Manual gm={false} />}
        {tab === 'lotte' && <section className="panel"><h2>{t('Chi mandare in campo')}</h2><SwitchAdvisor owner={tid} /></section>}
        {tab === 'lotte' && <section className="stack">
          <div className="panel">
            <h2>{t('Come entrare in lotta')}</h2>
            <ol className="steps">
              <li>{tj("Apri {url} in un'altra scheda.", {url: <a href={showdownUrl()} target="showdown">{showdownUrl()}</a>})}</li>
              <li><b>{t('Non scegliere nessun nome.')}</b> {t('In alto a destra vedi “Guest” e un numero: dillo al Master.')}</li>
              <li>{t('Il Master ti dà il nome dalla dashboard: lo vedi cambiare da solo.')}</li>
              <li>{t('Quando inizia la lotta, si apre da sola nella scheda di Showdown.')}</li>
            </ol>
          </div>
          {battles.length === 0 && <p className="muted">{t('Nessuna lotta in corso.')}</p>}
          {battles.map(b => (
            <a key={b.roomid} className="panel battle-mini" href={`${showdownUrl()}/${b.roomid}`} target="showdown">
              <strong>{b.title}</strong>
              {b.active.p2 && <><span>{b.active.p2.name} LV {b.active.p2.level}</span><HpBar hp={b.active.p2.hp} /></>}
            </a>
          ))}
        </section>}
      </main>
      <nav className="tabbar">
        {([['scheda', IdCard], ['squadra', Footprints], ['dadi', Dices], ['mappa', MapIcon], ['lotte', Swords], ['manuale', BookText]] as const).map(([id, Icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon />{t(TAB_LABEL[id])}</button>
        ))}
      </nav>
    </div>
    </RollerCtx.Provider>
  );
}
