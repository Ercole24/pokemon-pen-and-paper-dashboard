// Pagina Lotta (/c/<id>/lotta): prepara e avvia le lotte su Showdown e gestisce la cattura.
// 1. Si sceglie l'avversario: selvatico (da una zona, scritto a mano, o arrivato dalla mappa) o una Squadra PNG.
// 2. Si scelgono i Pokémon della squadra e chi gioca su Showdown (i Guest collegati ricevono il nome Squadra/Master).
// 3. "Inizia la lotta" crea la stanza su Showdown e la apre in una nuova scheda; qui si vede lo stato in tempo reale.
// 4. Con un selvatico si può tentare la cattura con la tabella del libretto (CatchPanel).
import {useEffect, useMemo, useState} from 'react';
import {Sprout, Swords, X} from 'lucide-react';
import {api, showdownUrl, socket, typeName, useCached, useSpecies, useStore, type Mon} from '../api';
import {EncounterButtons, STATUS_IT, statusName, TypeBadge, MonCard, MonEditor, NumberDie, Sprite, SpeciesInput, useClasses, useParty} from '../components';
import {catchModifiers, classTypeBonus} from '../../../server/src/rules';
import {t, tj} from '../i18n';

/** Stato di una lotta come lo manda il server (vedi server/src/showdown.ts). */
export type BattleState = {
  roomid: string, title: string, ended: boolean, winner?: string, turn: number, auto: boolean,
  active: {p1?: SideMon, p2?: SideMon}, volatiles: {p2: string[]}, fainted: {p1: string[], p2: string[]},
  log: string[], meta?: {cid: string, kind: 'wild' | 'trainer', opponent: Mon[], playerMonIds: string[]},
};
/** Pokémon in campo. */
type SideMon = {name: string, species: string, level: number, hp: number, status: string, fainted: boolean};

/** Lotte di questa campagna, aggiornate in tempo reale (eventi 'battle' e 'battle-removed'). */
export function useBattles(cid: string) {
  const [list, setList] = useState<BattleState[]>([]);
  useEffect(() => {
    api<BattleState[]>('/battles').then(all => setList(all.filter(b => b.meta?.cid === cid)));
    const on = (b: BattleState) => b.meta?.cid === cid && setList(prev => {
      const i = prev.findIndex(x => x.roomid === b.roomid);
      return i >= 0 ? prev.map(x => x.roomid === b.roomid ? b : x) : [...prev, b];
    });
    const off = (id: string) => setList(prev => prev.filter(x => x.roomid !== id));
    socket.on('battle', on);
    socket.on('battle-removed', off);
    return () => { socket.off('battle', on); socket.off('battle-removed', off); };
  }, [cid]);
  return list;
}


/** Barra dei PS colorata (verde, giallo, rosso). */
export function HpBar({hp}: {hp: number}) {
  return <div className="hpbar"><div className={`hpbar-fill ${hp <= 20 ? 'red' : hp <= 50 ? 'yellow' : ''}`} style={{transform: `scaleX(${hp / 100})`}} /></div>;
}

/** Un lato della lotta: Pokémon in campo, livello, PS, stato. */
export function Side({m, label}: {m?: SideMon, label: string}) {
  if (!m) return <div className="battle-side muted">{label}: {t('in attesa…')}</div>;
  return (
    <div className="battle-side">
      <Sprite species={m.species} size={72} />
      <div>
        <div><strong>{m.name}</strong> <span className="muted">LV {m.level}</span> {m.status && <span className={`status st-${m.status}`}>{statusName(m.status)}</span>}</div>
        <HpBar hp={m.hp} />
        <div className="small muted">{m.fainted ? t('Esausto') : t('{hp}% PS', {hp: m.hp})}</div>
      </div>
    </div>
  );
}

/** La pagina. sessionStorage porta qui il selvatico o la squadra PNG scelti dalla mappa. */
export default function Battle() {
  const store = useStore();
  const {campaign, zone, npcteam, save, trainer, mon} = store;
  // squadre personali: si sceglie quale Allenatore combatte (sua squadra, suo nome su Showdown)
  const own = campaign.teamMode === 'own';
  const [fighter, setFighter] = useState(trainer[0]?.id || '');
  const fighterName = trainer.find(t => t.id === fighter)?.name;
  const {party} = useParty(own ? fighter : undefined);
  const species = useSpecies(campaign.gen);
  const battles = useBattles(campaign.id);

  const [kind, setKind] = useState<'wild' | 'trainer'>('wild');
  const [zoneId, setZoneId] = useState(campaign.activeZone || zone[0]?.id || '');
  const [wild, setWild] = useState<Mon | null>(() => {
    const s = sessionStorage.getItem('pnp-wild');
    sessionStorage.removeItem('pnp-wild');
    return s ? JSON.parse(s) : null;
  });
  const [manualSpecies, setManualSpecies] = useState('');
  const [manualLevel, setManualLevel] = useState(5);
  const [teamId, setTeamId] = useState(() => { const t = sessionStorage.getItem('pnp-team') || ''; sessionStorage.removeItem('pnp-team'); return t; });
  const [chosen, setChosen] = useState<string[]>([]);
  const [editWild, setEditWild] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [catching, setCatching] = useState<{wild: Mon, battle?: BattleState} | null>(null);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [teamUser, setTeamUser] = useState(own && fighterName || campaign.teamUser);
  const [gmUser, setGmUser] = useState(campaign.gmUser);
  /** Chi è collegato a Showdown, ricontrollato ogni 5 secondi. */
  const refreshUsers = () => api<OnlineUser[]>('/showdown/users').then(setOnline);
  useEffect(() => { refreshUsers(); const t = setInterval(refreshUsers, 5000); return () => clearInterval(t); }, []);

  useEffect(() => { setChosen(party.map(m => m.id!)); }, [party.length, fighter]);
  useEffect(() => { if (own && fighterName) setTeamUser(fighterName); }, [fighter]);
  useEffect(() => { if (teamId) setKind('trainer'); else if (wild) setKind('wild'); }, []);

  const opponent: Mon[] = kind === 'wild' ? (wild ? [wild] : []) : (npcteam.find(t => t.id === teamId)?.mons || []);

  /** Incontro casuale nella zona scelta, con il modo indicato (erba, surf…). */
  async function fromZone(method: string) {
    setErr('');
    try { setWild((await api(`/c/${campaign.id}/encounter`, 'POST', {zoneId, method})).mon); } catch (e: any) { setErr(e.message); }
  }
  /** Selvatico scelto a mano (specie e livello). */
  async function manual() {
    const sp = species.get(manualSpecies);
    if (!sp) return setErr(t('Specie non valida per questa generazione'));
    setWild(await api(`/dex/${campaign.gen}/generate`, 'POST', {species: sp.name, level: manualLevel, cid: campaign.id}));
  }
  /** Crea la lotta sul server e apre la stanza di Showdown in un'altra scheda. */
  async function start() {
    setErr(''); setBusy(true);
    try {
      const team = npcteam.find(t => t.id === teamId);
      const {roomid} = await api(`/c/${campaign.id}/battle`, 'POST', {
        playerMonIds: party.filter(p => chosen.includes(p.id!)).map(p => p.id!), opponent, kind, gmControls: true, teamUser, gmUser,
        title: kind === 'trainer' && team ? `${team.trainerClass ? t(team.trainerClass) + ' ' : ''}${team.name}` : undefined,
      });
      window.open(`${showdownUrl()}/${roomid}`, 'showdown');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="page">
      <header className="page-head"><h1>{t('Lotta')}</h1></header>
      <div className="battle-layout">
        <section className="panel">
          <div className="tabs">
            <button className={kind === 'wild' ? 'active' : ''} onClick={() => setKind('wild')}>{t('Pokémon selvatico')}</button>
            <button className={kind === 'trainer' ? 'active' : ''} onClick={() => setKind('trainer')}>{t('Allenatore')}</button>
          </div>

          {kind === 'wild' ? (
            <>
              <div className="row gap-s wrap">
                <select value={zoneId} onChange={e => setZoneId(e.target.value)} aria-label={t('Zona')}>
                  <option value="">— {t('Zona')} —</option>
                  {zone.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
                {zoneId && <EncounterButtons zone={zone.find(z => z.id === zoneId)} onPick={fromZone} />}
              </div>
              <div className="row gap-s wrap">
                <SpeciesInput value={manualSpecies} onChange={setManualSpecies} gen={campaign.gen} placeholder={t('…oppure scegli la specie')} />
                <input type="number" className="w-num" min={1} max={100} value={manualLevel} onChange={e => setManualLevel(+e.target.value)} aria-label={t('Livello')} />
                <button onClick={manual}>{t('Genera')}</button>
              </div>
              {wild && <MonCard mon={wild} onClick={() => setEditWild(true)} actions={<button className="btn-s" onClick={() => setEditWild(true)}>{t('Modifica')}</button>} />}
            </>
          ) : (
            <>
              <select value={teamId} onChange={e => setTeamId(e.target.value)} aria-label={t('Squadra avversaria')}>
                <option value="">— {t('Squadra PNG')} —</option>
                {npcteam.map(t => <option key={t.id} value={t.id}>{t.name} ({t.mons?.length || 0})</option>)}
              </select>
              <div className="mon-grid">{opponent.map((m, i) => <MonCard key={i} mon={m} compact />)}</div>
            </>
          )}

          {own ? (
            <div className="row between wrap gap-s">
              <h3>{t('In lotta')}</h3>
              <select value={fighter} onChange={e => setFighter(e.target.value)} aria-label={t('Allenatore in lotta')}>
                {trainer.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ) : <h3>{t('La vostra squadra')}</h3>}
          {own && !trainer.length && <p className="muted">{t('Crea prima gli Allenatori: ognuno ha la sua squadra.')}</p>}
          {party.length === 0 && (!own || trainer.length > 0) && <p className="muted">{own && fighterName ? t('La squadra di {name} è vuota: aggiungi Pokémon in “Squadra e PC”.', {name: fighterName}) : t('La squadra è vuota: aggiungi Pokémon in “Squadra e PC”.')}</p>}
          <div className="mon-grid">
            {party.map(m => (
              <label key={m.id} className={`pick ${chosen.includes(m.id!) ? 'on' : ''}`}>
                <input type="checkbox" checked={chosen.includes(m.id!)} onChange={e => setChosen(e.target.checked ? [...chosen, m.id!] : chosen.filter(x => x !== m.id))} />
                <MonCard mon={m} compact />
              </label>
            ))}
          </div>
          <ShowdownSeats online={online} refresh={refreshUsers} teamLabel={own && fighterName ? t('Gioca per {name}', {name: fighterName}) : t('Gioca per la squadra')} teamUser={teamUser} setTeamUser={setTeamUser} gmUser={gmUser} setGmUser={setGmUser} />
          {!opponent.length && <p className="small">{t(kind === 'wild' ? 'Prima genera o scegli il Pokémon selvatico.' : 'Prima scegli la squadra avversaria.')}</p>}
          {err && <p className="error">{err}</p>}
          <div className="row gap-s">
            <button className="btn-primary big" disabled={busy || !opponent.length || !chosen.length} onClick={start}><Swords /> {t('Crea lotta su Showdown')}</button>
            {kind === 'wild' && wild && <button onClick={() => setCatching({wild})}>{t('Cattura senza lotta')}</button>}
          </div>
        </section>

        <section className="panel battles">
          <h2>{t('Lotte in corso')}</h2>
          {battles.length === 0 && <p className="muted">{t('Nessuna lotta. Creane una qui accanto.')}</p>}
          <h3>{t('Chi mandare in campo')}</h3>
          <SwitchAdvisor owner={own ? fighter : undefined} />
          <details className="panel-inner"><summary>{tj("{b} (squadra contro l'avversario in campo)", {b: <b>{t('Tabella dei tipi')}</b>})}</summary><TypeMatchup owner={own ? fighter : undefined} /></details>
          {[...battles].reverse().map(b => <BattleCard key={b.roomid} b={b} party={mon} save={save} onCatch={() => setCatching({wild: b.meta!.opponent[0], battle: b})} />)}
        </section>
      </div>

      {editWild && wild && <MonEditor title={t('Pokémon selvatico')} initial={wild} saveLabel={t('Usa')} onSave={m => setWild(m)} onClose={() => setEditWild(false)} />}
      {catching && <CatchPanel wild={catching.wild} battle={catching.battle} defaultTrainer={own ? mon.find(m => m.id === catching.battle?.meta?.playerMonIds?.[0])?.owner || fighter : undefined} onClose={() => setCatching(null)} onCaught={() => { if (!catching.battle) setWild(null); }} />}
    </div>
  );
}

/** Scheda di una lotta: lati, registro, pulsanti Poké Ball (selvatici), Termina e Rimuovi; dopo la lotta, +1 livello ai Pokémon usati. */
function BattleCard({b, onCatch, party, save}: {b: BattleState, onCatch: () => void, party: Mon[], save: (k: 'mon', m: Mon) => Promise<any>}) {
  const mine = (b.meta?.playerMonIds || []).map(id => party.find(p => p.id === id)).filter(Boolean) as Mon[];
  const defeated = b.fainted.p2.length;
  return (
    <div className={`battle-card ${b.ended ? 'ended' : ''}`}>
      <header className="row between">
        <strong>{b.title}</strong>
        <span className="muted small">{b.ended ? (b.winner ? t('Vince {name}', {name: b.winner}) : t('Terminata')) : t('Turno {n}', {n: b.turn})}</span>
      </header>
      <div className="battle-sides"><Side m={b.active.p1} label={t('Squadra')} /><span className="vs">VS</span><Side m={b.active.p2} label={t('Avversario')} /></div>
      <div className="row gap-s wrap">
        <a className="btn" href={`${showdownUrl()}/${b.roomid}`} target="showdown">{t('Apri su Showdown')}</a>
        {!b.ended && b.meta?.kind === 'wild' && <button className="btn-primary" onClick={onCatch}>Poké Ball!</button>}
        {!b.ended
          ? <button onClick={() => api(`/battle/${b.roomid}/end`, 'POST', {loser: 'p2'})}>{t('Termina')}</button>
          : <button onClick={() => api(`/battle/${b.roomid}`, 'DELETE')}>{t("Rimuovi dall'elenco")}</button>}
      </div>
      {b.ended && defeated > 0 && mine.length > 0 && (
        <div className="callout">
          <div>{tj(defeated === 1 ? 'Pokémon avversari sconfitti: {n}. Assegna 1 livello a chi li ha battuti' : 'Pokémon avversari sconfitti: {n}. Assegna {n} livelli a chi li ha battuti', {n: <b>{defeated}</b>})}{b.meta?.kind === 'wild' ? ` ${t('(le regole escludono i selvatici: decidi tu)')}` : ''}:</div>
          <div className="chips">{mine.map(m => (
            <button key={m.id} className="chip" onClick={() => save('mon', {...m, level: Math.min(100, m.level + 1)})}>+1 {m.nickname || m.species} (LV {m.level})</button>
          ))}</div>
        </div>
      )}
      <details className="small"><summary>{t('Registro')}</summary><pre className="log">{b.log.slice(-15).join('\n')}</pre></details>
    </div>
  );
}

/**
 * Cattura con la tabella del libretto: ball, PS e stato (presi dalla lotta se c'è), livello, Allenatore (bonus di classe),
 * tiro d100. Mostra in anteprima i modificatori; il server decide l'esito e salva il Pokémon.
 */
/** defaultTrainer: chi lancia la Poké Ball all'inizio (con squadre personali, chi era in lotta). */
export function CatchPanel({wild, battle, defaultTrainer, onClose, onCaught}: {wild: Mon, battle?: BattleState, defaultTrainer?: string, onClose: () => void, onCaught?: () => void}) {
  const {campaign, trainer} = useStore();
  const classes = useClasses();
  const sp = useSpecies(campaign.gen).get(wild.species);
  const live = battle?.active.p2;
  const [ball, setBall] = useState<'poke' | 'great' | 'ultra'>('poke');
  const [hp, setHp] = useState(live?.hp ?? 100);
  const [status, setStatus] = useState(live?.status ?? '');
  const [confused, setConfused] = useState(!!battle?.volatiles.p2.some(v => /confusion/i.test(v)));
  const [infatuated, setInfatuated] = useState(!!battle?.volatiles.p2.some(v => /attract/i.test(v)));
  const [ownLevel, setOwnLevel] = useState<number | ''>(battle?.active.p1?.level ?? '');
  const [trainerId, setTrainerId] = useState(defaultTrainer || trainer[0]?.id || '');
  const [hard, setHard] = useState(!!sp && (sp.finalEvo || sp.legendary));
  const [roll, setRoll] = useState<number | null>(null);
  const [nickname, setNickname] = useState('');
  const [result, setResult] = useState<any>(null);

  const thrower = trainer.find(x => x.id === trainerId);
  const cls = thrower && (thrower.customClass || classes.find(c => c.name === thrower.className));
  const input = {ball, hpPercent: hp, status, confused, infatuated, ownLevel: ownLevel === '' ? undefined : ownLevel, wildLevel: wild.level,
    typeBonus: classTypeBonus(cls?.catchBonus, sp?.types || []), hardCatch: hard};
  const preview = useMemo(() => catchModifiers(input), [JSON.stringify(input)]);

  /** Lancia la ball: manda tutto al server e mostra il risultato. */
  async function throwBall() {
    if (roll === null) return;
    const r = await api(`/c/${campaign.id}/catch`, 'POST', {wild, input, roll, trainerId, roomid: battle && !battle.ended ? battle.roomid : undefined, hardCatch: hard, nickname});
    setResult(r);
    if (r.caught) onCaught?.();
  }

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={t('Cattura')}>
        <header className="modal-head"><h2>{t('Cattura {species} LV {level}', {species: wild.species, level: wild.level})}</h2><button className="btn-icon" onClick={onClose} aria-label={t('Chiudi')}><X /></button></header>
        <div className="modal-body catch">
          <div className="grid-2">
            <label>Ball<select value={ball} onChange={e => setBall(e.target.value as any)}>
              <option value="poke">Poké Ball (+0)</option><option value="great">{t('Mega Ball')} (+10)</option><option value="ultra">Ultra Ball (+20)</option>
            </select></label>
            <label>{t('Lancia')}<select value={trainerId} onChange={e => setTrainerId(e.target.value)}>
              <option value="">— {t('nessun bonus Classe')} —</option>
              {trainer.map(x => <option key={x.id} value={x.id}>{x.name} ({t(x.className)})</option>)}
            </select></label>
            <label>{t('PS del selvatico: {hp}%', {hp})}<input type="range" min={1} max={100} value={hp} onChange={e => setHp(+e.target.value)} /></label>
            <label>{t('Stato')}<select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">{t('Nessuno')}</option>{Object.entries(STATUS_IT).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </select></label>
            <label>{t('LV del tuo Pokémon in campo')}<input type="number" value={ownLevel} onChange={e => setOwnLevel(e.target.value ? +e.target.value : '')} /></label>
            <div>
              <label className="check"><input type="checkbox" checked={confused} onChange={e => setConfused(e.target.checked)} /> {t('Confuso')}</label>
              <label className="check"><input type="checkbox" checked={infatuated} onChange={e => setInfatuated(e.target.checked)} /> {t('Infatuato')}</label>
              <label className="check"><input type="checkbox" checked={hard} onChange={e => setHard(e.target.checked)} /> {t('Evoluzione finale / leggendario (serve 99)')}</label>
            </div>
          </div>
          <ul className="mods">
            {preview.mods.map(m => <li key={m.label}><span>{t(m.label)}</span><b>{m.value >= 0 ? '+' : ''}{m.value}</b></li>)}
            <li className="total"><span>{t('Bonus totale')}</span><b>{preview.bonus >= 0 ? '+' : ''}{preview.bonus}</b></li>
          </ul>
          <p>{tj('Serve {need}: tira un d100 ≥ {roll}.', {need: <b>{preview.threshold}</b>, roll: <b>{Math.max(1, preview.threshold - preview.bonus)}</b>})}</p>
          <div className="row gap-s">
            <NumberDie sides={100} onResult={setRoll} />
            <input placeholder={t('Soprannome (se catturato)')} value={nickname} onChange={e => setNickname(e.target.value)} />
            <button className="btn-primary" disabled={roll === null || result?.caught} onClick={throwBall}>{t('Lancia la Ball')}</button>
          </div>
          {result && (
            <div className={`outcome ${result.caught ? 'outcome-super' : 'outcome-critical'}`}>
              {result.roll} {result.bonus >= 0 ? '+' : '−'} {Math.abs(result.bonus)} = {result.total} → {result.caught ? t(result.mon?.place === 'pc' ? 'Preso! {species} è stato catturato e mandato al PC di Bill.' : 'Preso! {species} è stato catturato.', {species: wild.species}) : t('Oh no! Il Pokémon si è liberato!')}
            </div>
          )}
          {result?.caught && battle && !battle.ended && (
            <button onClick={() => { api(`/battle/${battle.roomid}/end`, 'POST', {loser: 'p2'}); onClose(); }}>{t('Chiudi la lotta su Showdown')}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Utente collegato a Showdown. */
type OnlineUser = {id: string, name: string, guest: boolean};

/** Chi è collegato a Showdown: ai Guest il Master assegna un nome (niente login né password). */
function ShowdownSeats({online, refresh, teamLabel, teamUser, setTeamUser, gmUser, setGmUser}: {
  online: OnlineUser[], refresh: () => void, teamLabel: string, teamUser: string, setTeamUser: (s: string) => void, gmUser: string, setGmUser: (s: string) => void,
}) {
  const {trainer, campaign} = useStore();
  const [err, setErr] = useState('');
  const names = [campaign.teamUser, campaign.gmUser, ...trainer.map(t => t.name)].filter((n, i, a) => n && a.indexOf(n) === i);
  /** Dà il nome scelto a un Guest. */
  async function rename(id: string, to: string) {
    setErr('');
    try { await api('/showdown/rename', 'POST', {from: id, to}); refresh(); } catch (e: any) { setErr(e.message); }
  }
  const named = online.filter(u => !u.guest);
  const opt = (sel: string) => [...new Set([sel, ...named.map(u => u.name)])].map(u =>
    <option key={u} value={u}>{u}{named.some(n => n.name === u) ? '' : ` (${t('non collegato')})`}</option>);
  return (
    <div className="seats">
      <h3>{t('Su Showdown')}</h3>
      {online.length === 0 && <p className="small muted">{tj('Nessuno collegato. Aprite {url} su questo PC e sul telefono di chi gioca: senza scegliere nessun nome.', {url: <a href={showdownUrl()} target="showdown">{showdownUrl()}</a>})}</p>}
      <ul className="seat-list">
        {online.map(u => (
          <li key={u.id}>
            <span className={`seat-name ${u.guest ? 'guest' : ''}`}>{u.name}</span>
            <select value="" onChange={e => e.target.value && rename(u.id, e.target.value)} aria-label={t('Dai un nome a {name}', {name: u.name})}>
              <option value="">{t(u.guest ? 'Assegna un nome…' : 'Rinomina…')}</option>
              {names.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </li>
        ))}
      </ul>
      {err && <p className="error small">{err}</p>}
      <div className="grid-2">
        <label>{teamLabel}<select value={teamUser} onChange={e => setTeamUser(e.target.value)}>{opt(teamUser)}</select></label>
        <label>{t('Avversario (il Master)')}<select value={gmUser} onChange={e => setGmUser(e.target.value)}>{opt(gmUser)}</select></label>
      </div>
    </div>
  );
}

/** Tabella dei tipi di Showdown: codice -> moltiplicatore (0 neutro, 1 debole x2, 2 resiste x½, 3 immune x0). */
const TYPE_MULT = [1, 2, 0.5, 0];
const multLabel = (m: number) => m === 0 ? 'x0' : m === 0.25 ? 'x¼' : m === 0.5 ? 'x½' : `x${m}`;
const multClass = (m: number) => m === 0 ? 'm0' : m < 1 ? 'mlow' : m > 1 ? 'mhigh' : 'm1';

/**
 * Tabella dei tipi collegata alla partita: avversario = Pokémon in campo nella lotta in corso (o scelto a mano),
 * e per ogni Pokémon della squadra quanto rischia (tipi dell'avversario contro i suoi) e la sua mossa migliore contro l'avversario.
 * Sotto, la tabella completa con evidenziati i tipi della squadra e quelli dell'avversario.
 */
export function TypeMatchup({owner}: {owner?: string}) {
  const {campaign} = useStore();
  const species = useSpecies(campaign.gen);
  const {party} = useParty(owner);
  const data = useCached<{types: string[], chart: Record<string, Record<string, number>>}>(`/dex/${campaign.gen}/types`);
  const moves = useCached<{name: string, type: string, category: string, power: number}[]>(`/dex/${campaign.gen}/moves`);
  const live = useBattles(campaign.id).filter(b => !b.ended).at(-1)?.active.p2;
  const [manual, setManual] = useState('');
  const opp = species.get(manual) || (live && species.get(live.species));
  if (!data) return null;
  const eff = (atk: string, defTypes: string[]) => defTypes.reduce((x, d) => x * TYPE_MULT[data.chart[d]?.[atk] ?? 0], 1);
  const ourTypes = new Set(party.flatMap(m => species.get(m.species)?.types || []));
  return (
    <div className="type-matchup">
      <div className="row gap-s wrap">
        <span>{t('Contro:')}</span>
        <SpeciesInput gen={campaign.gen} value={manual} onChange={setManual} placeholder={live ? t('{species} (in lotta)', {species: live.species}) : t("scegli l'avversario")} />
        {opp && <span className="types">{opp.types.map(ty => <TypeBadge key={ty} type={ty} />)}</span>}
      </div>
      {!opp && <p className="small muted">{t("Quando c'è una lotta in corso l'avversario in campo si sceglie da solo.")}</p>}
      {opp && (
        <table className="matchup">
          <thead><tr><th>Pokémon</th><th title={t("Mossa più forte dei tuoi contro l'avversario")}>{t('Attacco')}</th><th title={t("Mosse dei tipi dell'avversario contro di te")}>{t('Rischio')}</th></tr></thead>
          <tbody>{party.map(m => {
            const sp = species.get(m.species);
            if (!sp) return null;
            const best = m.moves.map(n => moves?.find(x => x.name === n)).filter(x => x && x.category !== 'Status')
              .map(x => ({name: x!.name, m: eff(x!.type, opp.types) * (sp.types.includes(x!.type) ? 1.5 : 1), raw: eff(x!.type, opp.types)}))
              .sort((a, b) => b.m - a.m)[0];
            const risk = Math.max(...opp.types.map(ty => eff(ty, sp.types)));
            return (
              <tr key={m.id} className={m.hp === 0 ? 'muted' : ''}>
                <td>{m.nickname || m.species}{m.hp === 0 ? ' (KO)' : ''} <span className="types">{sp.types.map(ty => <TypeBadge key={ty} type={ty} />)}</span></td>
                <td>{best ? <><span className={`mult ${multClass(best.raw)}`}>{multLabel(best.raw)}</span> {best.name}</> : <span className="muted small">—</span>}</td>
                <td><span className={`mult ${multClass(1 / (risk || .01))}`}>{multLabel(risk)}</span></td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <details className="small">
        <summary>{t('Tabella completa dei tipi (righe = attacco, colonne = difesa)')}</summary>
        <div className="type-grid-wrap">
          <table className="type-grid">
            <thead><tr><th></th>{data.types.map(d => <th key={d} className={ourTypes.has(d) ? 'ours' : ''} title={typeName(d)}>{typeName(d).slice(0, 3)}</th>)}</tr></thead>
            <tbody>{data.types.map(a => (
              <tr key={a} className={opp?.types.includes(a) ? 'opp' : ''}>
                <th>{typeName(a)}</th>
                {data.types.map(d => { const v = eff(a, [d]); return <td key={d} className={`${multClass(v)} ${ourTypes.has(d) ? 'ours' : ''}`}>{v === 1 ? '' : multLabel(v)}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="muted">{t("In giallo le colonne dei tipi della vostra squadra, in rosso le righe dei tipi dell'avversario.")}</p>
      </details>
    </div>
  );
}

/** Rischio (%) dal moltiplicatore peggiore che il Pokémon subisce dai tipi dell'avversario. */
const RISK_PCT: Record<number, number> = {0: 0, 0.25: 10, 0.5: 25, 1: 50, 2: 75, 4: 95};

/**
 * Chi conviene mandare in campo contro il Pokémon avversario che è in campo adesso, solo in base ai tipi (non alle mosse):
 * - attacco = il miglior moltiplicatore dei tipi del Pokémon contro i tipi dell'avversario (le mosse dello stesso tipo, STAB);
 * - rischio = il peggior moltiplicatore dei tipi dell'avversario contro i tipi del Pokémon.
 * Convenienza = attacco e difesa insieme su scala logaritmica (x2 e x½ pesano uguale), da 0% a 100%.
 * Si aggiorna da solo a ogni cambio in lotta; senza lotta in corso si può scegliere l'avversario a mano.
 */
export function SwitchAdvisor({owner}: {owner?: string}) {
  const {campaign} = useStore();
  const species = useSpecies(campaign.gen);
  const {party} = useParty(owner);
  const data = useCached<{types: string[], chart: Record<string, Record<string, number>>}>(`/dex/${campaign.gen}/types`);
  const battle = useBattles(campaign.id).filter(b => !b.ended).at(-1);
  const live = battle?.active.p2;
  const [manual, setManual] = useState('');
  const opp = (live && !live.fainted && species.get(live.species)) || species.get(manual);
  if (!data) return null;
  const eff = (atk: string, defTypes: string[]) => defTypes.reduce((x, d) => x * TYPE_MULT[data.chart[d]?.[atk] ?? 0], 1);
  const rows = !opp ? [] : party.map(m => {
    const sp = species.get(m.species);
    if (!sp) return null;
    const offT = [...sp.types].sort((a, b) => eff(b, opp.types) - eff(a, opp.types))[0];
    const off = eff(offT, opp.types);
    const defT = [...opp.types].sort((a, b) => eff(b, sp.types) - eff(a, sp.types))[0];
    const def = eff(defT, sp.types);
    const lg = (x: number) => x === 0 ? -3 : Math.log2(x); // immune = come x⅛
    const score = Math.round(Math.max(0, Math.min(1, (lg(off) - lg(def) + 4) / 8)) * 100);
    return {m, sp, off, offT, def, defT, score, risk: RISK_PCT[def] ?? 50, ko: m.hp === 0, active: battle?.active.p1?.name === (m.nickname || m.species)};
  }).filter(Boolean).sort((a, b) => +a!.ko - +b!.ko || b!.score - a!.score || a!.risk - b!.risk) as {m: Mon, sp: any, off: number, offT: string, def: number, defT: string, score: number, risk: number, ko: boolean, active: boolean}[];
  const best = rows.find(r => !r.ko);
  return (
    <div className="switch-advisor">
      <div className="row gap-s wrap">
        {live && !live.fainted
          ? <span>{tj('In campo contro di voi: {species} LV {level}', {species: <b>{live.species}</b>, level: live.level})}</span>
          : <><span>{t('Contro:')}</span><SpeciesInput gen={campaign.gen} value={manual} onChange={setManual} placeholder={battle ? t('in attesa del prossimo Pokémon…') : t('nessuna lotta: scegli a mano')} /></>}
        {opp && <span className="types">{opp.types.map(ty => <TypeBadge key={ty} type={ty} />)}</span>}
      </div>
      {opp && rows.map(r => (
        <div key={r.m.id} className={`advice ${r.ko ? 'ko' : ''} ${r === best ? 'best' : ''}`}>
          <Sprite species={r.m.species} size={48} />
          <div className="advice-main">
            <div><b>{r.m.nickname || r.m.species}</b> {r === best && <span className="badge">{t('Consigliato')}</span>} {r.active && <span className="badge">{t('In campo')}</span>} {r.ko && <span className="badge">KO</span>}</div>
            <div className="advice-bars">
              <span>{t('Conviene')}</span><div className="pbar"><div className="pbar-fill good" style={{width: `${r.score}%`}} /></div><b>{r.score}%</b>
              <span>{t('Rischio')}</span><div className="pbar"><div className="pbar-fill bad" style={{width: `${r.risk}%`}} /></div><b>{r.risk}%</b>
            </div>
            <div className="small muted">{t('Attacca {off} con {offType} · subisce {def} da {defType}', {off: multLabel(r.off), offType: typeName(r.offT), def: multLabel(r.def), defType: typeName(r.defT)})}</div>
          </div>
        </div>
      ))}
      {opp && !rows.length && <p className="small muted">{t('Squadra vuota.')}</p>}
      <p className="small muted">{t("Calcolo solo sui tipi (non sulle mosse che conoscono): attacco = miglior tipo del vostro Pokémon contro l'avversario, rischio = peggior tipo dell'avversario contro di lui.")}</p>
    </div>
  );
}
