// Pagina iniziale (/): elenco delle campagne e creazione di una nuova (nome, regione, generazione).
import {useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ADVENTURES, api, useMaster, type Campaign} from '../api';
import {DONATE_URL} from './Credits';
import {LangSwitch, t} from '../i18n';

/** Regioni con la generazione in cui sono uscite (nomi italiani, si traducono con t()). */
export const REGIONS: [string, number][] = [
  ['Kanto', 1], ['Johto', 2], ['Hoenn', 3], ['Sinnoh', 4], ['Unima', 5], ['Kalos', 6], ['Alola', 7], ['Galar', 8], ['Paldea', 9],
];

/** La pagina. */
export default function Home() {
  useMaster();
  const [list, setList] = useState<Campaign[]>([]);
  const [name, setName] = useState('');
  const [gen, setGen] = useState(4);
  const [region, setRegion] = useState('Sinnoh');
  const [adventure, setAdventure] = useState<string>('team');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useEffect(() => { api<Campaign[]>('/campaigns').then(setList); }, []);

  /** Crea la campagna (cromatici 1/8192 fino alla Gen 5, 1/4096 dopo). */
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const {teamMode, sharedBadges} = ADVENTURES.find(x => x.id === adventure)!;
    const c = await api<Campaign>('/campaigns', 'PUT', {name: name.trim(), gen, region, shinyRate: gen >= 6 ? 4096 : 8192, teamMode, sharedBadges});
    nav(`/c/${c.id}`);
  }

  return (
    <div className="home">
      <LangSwitch className="corner" />
      <header className="home-hero">
        <span className="brand-ball big" />
        <div>
          <h1>Pokémon Pen &amp; Paper</h1>
          <p className="muted">{t('Dashboard per il Master e i giocatori')}</p>
        </div>
      </header>
      <section className="home-grid">
        <div className="panel">
          <h2>{t('Campagne')}</h2>
          {list.length === 0 && <p className="muted">{t('Nessuna campagna. Creane una qui accanto.')}</p>}
          <ul className="campaign-list">
            {list.map(c => (
              <li key={c.id}>
                <Link to={`/c/${c.id}`} className="campaign-link">
                  <strong>{c.name}</strong><span className="muted">{c.region ? t(c.region) : t('Regione libera')} · Gen {c.gen}</span>
                </Link>
                <Link to={`/c/${c.id}/giocatore`} className="btn">{t('Giocatore')}</Link>
              </li>
            ))}
          </ul>
        </div>
        <form className="panel" onSubmit={create}>
          <h2>{t('Nuova campagna')}</h2>
          <label>{t('Nome')}<input value={name} onChange={e => setName(e.target.value)} placeholder={t('Le avventure di Sinnoh')} required /></label>
          <label>{t('Regione')}
            <select value={region} onChange={e => { setRegion(e.target.value); const r = REGIONS.find(x => x[0] === e.target.value); if (r) setGen(r[1]); }}>
              {REGIONS.map(([r, g]) => <option key={r} value={r}>{t(r)} (Gen {g})</option>)}
              <option value="">{t('Altra / inventata')}</option>
            </select>
          </label>
          <label>{t('Generazione (Pokémon, mosse e regole di lotta)')}
            <select value={gen} onChange={e => setGen(+e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => <option key={g} value={g}>Gen {g} ({g === 9 ? t('tutte') : t('fino alla {g}ª', {g})})</option>)}
            </select>
          </label>
          <label>{t('Tipo di avventura')}
            <select value={adventure} onChange={e => setAdventure(e.target.value)}>
              {ADVENTURES.map(x => <option key={x.id} value={x.id}>{t(x.label)}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={busy}>{t(busy ? 'Preparo il tavolo…' : 'Crea campagna')}</button>
        </form>
      </section>
      <p className="home-foot">
        <a className="btn" href={DONATE_URL} target="_blank" rel="noopener noreferrer">{t('Sostieni Pen & Paper')}</a>
        <Link className="btn" to="/riconoscimenti">{t('Riconoscimenti')}</Link>
        <Link className="btn" to="/segnala-bug">{t('Segnala un bug')}</Link>
      </p>
    </div>
  );
}
