// Pagina Dadi (/c/<id>/dadi): 2dF (Fudge) del libretto con modificatore, dadi numerici e calcolatore dei tipi.
// Ogni tiro si può fare in digitale o inserendo il risultato dei dadi veri; gli ultimi risultati restano in elenco.
import {useState} from 'react';
import {useStore} from '../api';
import {FudgeRoller, NumberDie, TypeCalculator} from '../components';
import {t} from '../i18n';

/** La pagina. */
export default function Dice() {
  const {addLog} = useStore();
  const [mod, setMod] = useState(0);
  const [assist, setAssist] = useState(false);
  const [last, setLast] = useState<string[]>([]);
  const [notedRoll, setNotedRoll] = useState('');
  /** Aggiunge un risultato in cima all'elenco (massimo 12). */
  const note = (s: string) => setLast(l => [s, ...l].slice(0, 12));
  return (
    <div className="page">
      <header className="page-head"><h1>{t('Dadi')}</h1></header>
      <div className="dice-page">
        <section className="panel">
          <h2>{t('Prova (2dF)')}</h2>
          <div className="row gap-s">
            <label>{t('Modificatore')}
              <select value={mod} onChange={e => setMod(+e.target.value)}>
                {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n > 0 ? '+'.repeat(n) : n < 0 ? '−'.repeat(-n) : t('nessuno')}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={assist} onChange={e => setAssist(e.target.checked)} /> {t('Aiuto Pokémon (+1dF)')}</label>
          </div>
          <FudgeRoller modifier={mod} extraDie={assist} onResult={r => note(`2dF ${r.faces.map(f => f === ' ' ? t('vuota') : f).join(' ')} → ${t(r.label)}`)} />
          <table className="rules small">
            <tbody>
              <tr><th>++</th><td>{t('Superefficace! Riesce con un bonus.')}</td></tr>
              <tr><th>+</th><td>{t('Successo.')}</td></tr>
              <tr><th>+−</th><td>{t('Pari: decide il GM o si improvvisa.')}</td></tr>
              <tr><th>−</th><td>{t('Non molto efficace: non funziona.')}</td></tr>
              <tr><th>−−</th><td>{t('Fallimento critico, con conseguenze.')}</td></tr>
              <tr><th>{t('vuota')}×2</th><td>{t("Vuote: successo usando solo l'Introforza.")}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>{t('Altri dadi')}</h2>
          <div className="dice-grid">
            {[4, 6, 8, 10, 12, 20, 100].map(s => <NumberDie key={s} sides={s} onResult={n => note(`d${s} → ${n}`)} />)}
          </div>
          <h3>{t('Ultimi tiri')}</h3>
          <ul className="roll-list">{last.map((l, i) => <li key={i}>{l}</li>)}</ul>
          {last[0] && (notedRoll === last[0] ? <span className="noted">{t('Annotato nel diario')}</span> : <button className="btn-s" onClick={async () => { await addLog(t('Tiro: {roll}', {roll: last[0]})); setNotedRoll(last[0]); }}>{t('Annota nel diario')}</button>)}
        </section>
        <section className="panel wide-panel">
          <h2>{t('Tipi difensivi')}</h2>
          <TypeCalculator />
        </section>
      </div>
    </div>
  );
}
