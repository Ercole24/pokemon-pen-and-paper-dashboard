// Panoramica (/c/<id>): colpo d'occhio sulla campagna: squadra, incontro rapido nella zona attiva,
// lotte in corso e diario (ultime 40 righe).
import {useState} from 'react';
import {ArrowRight, Sprout} from 'lucide-react';
import {Link, useNavigate} from 'react-router-dom';
import {api, showdownUrl, useStore} from '../api';
import {EncounterButtons, MonCard, useParty} from '../components';
import {Side, useBattles} from './Battle';
import {LOCALE, t} from '../i18n';

/** La pagina. */
export default function Overview() {
  const {campaign, zone, trainer, log, map, updateCampaign} = useStore();
  const {party, pc} = useParty();
  const own = campaign.teamMode === 'own'; // squadre personali: una per Allenatore
  const battles = useBattles(campaign.id).filter(b => !b.ended);
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const activeZone = campaign.activeZone || zone[0]?.id || '';

  /** Incontro rapido nella zona attiva: genera il selvatico e passa alla pagina Lotta. */
  async function encounter(method: string) {
    setErr('');
    try {
      const r = await api(`/c/${campaign.id}/encounter`, 'POST', {zoneId: activeZone, method});
      sessionStorage.setItem('pnp-wild', JSON.stringify(r.mon));
      nav('lotta');
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>{campaign.name}</h1>
        <p className="muted">{t('{n} allenatori', {n: trainer.length})} · {t('{n} in squadra', {n: own ? party.length : `${party.length}/6`})} · {t('{n} nel PC', {n: pc.length})}</p>
      </header>

      <div className="overview">
        <section className="panel">
          <div className="row between"><h2>{t(own ? 'Squadre' : 'Squadra')}</h2><Link to="squadra" className="small">{t('Gestisci')} <ArrowRight /></Link></div>
          {party.length === 0 ? <p className="muted">{t('Nessun Pokémon. Scegliete lo starter in “Squadra e PC”.')}</p> : !own ?
            <div className="mon-grid">{party.map(m => <MonCard key={m.id} mon={m} />)}</div> :
            trainer.map(tr => {
              const mine = party.filter(m => m.owner === tr.id);
              return <div key={tr.id} className="stack"><h3>{tr.name} <span className="muted small">{mine.length}/6</span></h3>
                {mine.length ? <div className="mon-grid">{mine.map(m => <MonCard key={m.id} mon={m} />)}</div> : <p className="small muted">{t('Nessun Pokémon.')}</p>}</div>;
            })}
        </section>

        <section className="panel quick">
          <h2>{t('Incontro rapido')}</h2>
          <label>{t('Zona attiva')}
            <select value={activeZone} onChange={e => updateCampaign({activeZone: e.target.value})}>
              <option value="">— {t('scegli')} —</option>
              {zone.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </label>
          <EncounterButtons zone={zone.find(z => z.id === activeZone)} onPick={encounter} big />
          {err && <p className="error">{err}</p>}
          {map.length > 0 && <Link to={`mappe/${campaign.activeMap || map[0].id}/gioca`} className="btn">{t('Apri la mappa al tavolo')}</Link>}
        </section>

        <section className="panel">
          <h2>{t('Lotte in corso')}</h2>
          {battles.length === 0 ? <p className="muted">{t('Nessuna.')}</p> : battles.map(b => (
            <div key={b.roomid} className="ov-battle">
              <div className="row between"><strong>{b.title}</strong><a className="small" href={`${showdownUrl()}/${b.roomid}`} target="showdown">{t('Turno {n}', {n: b.turn})} · {t('apri')}</a></div>
              <div className="battle-sides"><Side m={b.active.p1} label={t('Squadra')} /><span className="vs">VS</span><Side m={b.active.p2} label={t('Avversario')} /></div>
            </div>
          ))}
        </section>

        <section className="panel log-panel">
          <h2>{t('Diario')}</h2>
          <ul className="log-list">
            {[...log].reverse().slice(0, 40).map(l => (
              <li key={l.id} className={`log-${l.type}`}><time>{new Date(l.t).toLocaleString(LOCALE, {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}</time>{l.text}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
