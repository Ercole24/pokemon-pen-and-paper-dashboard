// Pagina Zone e incontri (/c/<id>/zone).
// Per ogni zona: specie, modo d'incontro (erba, surf, ami…), probabilità (peso relativo nello stesso modo), livelli, sesso.
// "Prova un incontro" genera Pokémon di esempio.
import {useEffect, useState} from 'react';
import {METHODS, methodOf} from '../../../server/src/methods';
import {Dices, X} from 'lucide-react';
import {api, useSpecies, useStore, type Mon, type Zone} from '../api';
import {MonCard, SpeciesInput, Sprite, TypeBadge} from '../components';
import {t} from '../i18n';

/** Zone per pagina nella lista. */
const ZONES_PAGE = 8;

/** La pagina: lista con ricerca e pagine, editor della zona scelta. */
export default function Zones() {
  const {zone, save, remove, campaign} = useStore();
  const [sel, setSel] = useState<string | null>(zone[0]?.id || null);
  const current = zone.find(z => z.id === sel);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const found = zone.filter(z => !q || z.name.toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(found.length / ZONES_PAGE));
  const pg = Math.min(page, pages - 1);
  /** Nuova zona vuota. */
  async function add() {
    const z = await save('zone', {name: t('Nuova zona {n}', {n: zone.length + 1}), entries: []});
    setSel(z.id);
  }
  return (
    <div className="page">
      <header className="page-head row between">
        <h1>{t('Zone e incontri')}</h1>
        <button className="btn-primary" onClick={add}>+ {t('Zona')}</button>
      </header>
      <p className="muted">{t('Per ogni zona (percorso, grotta, erba alta…) decidi quali Pokémon compaiono, con che probabilità e a che livello. Sesso, natura, IV, abilità e mosse vengono generati in automatico secondo le regole della Gen {gen}.', {gen: campaign.gen})}</p>
      <div className="split">
        <nav className="list-nav">
          <input type="search" placeholder={t('Cerca tra {n} zone…', {n: zone.length})} value={q} onChange={e => { setQ(e.target.value); setPage(0); }} aria-label={t('Cerca zona')} />
          {pages > 1 && <div className="row gap-s pager">
            <button className="btn-s" disabled={pg === 0} onClick={() => setPage(pg - 1)} aria-label={t('Pagina precedente')}>‹</button>
            <span className="small">{pg + 1} / {pages}</span>
            <button className="btn-s" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label={t('Pagina successiva')}>›</button>
          </div>}
          {!found.length && <p className="small muted">{t('Nessuna zona trovata.')}</p>}
          {found.slice(pg * ZONES_PAGE, (pg + 1) * ZONES_PAGE).map(z => <button key={z.id} className={sel === z.id ? 'active' : ''} onClick={() => setSel(z.id!)}><strong>{z.name}</strong><span className="muted small">{t('{n} specie', {n: z.entries.length})}</span></button>)}
        </nav>
        {current && <ZoneEditor key={current.id} zone={current} onDelete={() => { remove('zone', current.id!); setSel(null); }} />}
      </div>
    </div>
  );
}

/** Editor di una zona; le modifiche si salvano da sole dopo mezzo secondo. */
function ZoneEditor({zone, onDelete}: {zone: Zone, onDelete: () => void}) {
  const {save, campaign} = useStore();
  const species = useSpecies(campaign.gen);
  const [z, setZ] = useState<Zone>(zone);
  const [samples, setSamples] = useState<Mon[]>([]);
  useEffect(() => {
    const t = setTimeout(() => { if (JSON.stringify(z) !== JSON.stringify(zone)) save('zone', z); }, 500);
    return () => clearTimeout(t);
  }, [z]);
  // le probabilità contano dentro lo stesso metodo (erba, surf, amo…)
  /** Somma dei pesi di un modo, per mostrare le percentuali. */
  const totalOf = (m: string) => z.entries.filter(e => methodOf(e) === m).reduce((a, e) => a + (+e.rate || 0), 0);
  const [testMethod, setTestMethod] = useState('walk');
  /** Modifica una riga della tabella. */
  const setEntry = (i: number, p: Partial<Zone['entries'][0]>) => setZ({...z, entries: z.entries.map((e, j) => j === i ? {...e, ...p} : e)});

  /** Genera un Pokémon di prova con il modo scelto (ultimi 6 mostrati). */
  async function test() {
    const mon = (await api(`/c/${campaign.id}/encounter`, 'POST', {zoneId: z.id, method: testMethod})).mon;
    setSamples(prev => [mon, ...prev].slice(0, 6));
  }

  return (
    <section className="panel">
      <div className="row gap-s">
        <input className="title-input" value={z.name} onChange={e => setZ({...z, name: e.target.value})} aria-label={t('Nome zona')} />
        <button className="btn-danger" onClick={() => confirm(t('Eliminare la zona?')) && onDelete()}>{t('Elimina')}</button>
      </div>
      <div className="table-scroll"><table className="zone-table">
        <thead><tr><th></th><th>{t('Specie')}</th><th>{t('Tipi')}</th><th>{t('Come')}</th><th>{t('Probabilità')}</th><th>LV min</th><th>LV max</th><th>♂/♀</th><th></th></tr></thead>
        <tbody>
          {z.entries.map((e, i) => {
            const sp = species.get(e.species);
            return (
              <tr key={i}>
                <td>{sp && <Sprite species={sp.name} size={40} />}</td>
                <td><SpeciesInput value={e.species} gen={campaign.gen} onChange={v => setEntry(i, {species: v})} />{e.species && !sp && <div className="error small">{t('Non disponibile in Gen {gen}', {gen: campaign.gen})}</div>}</td>
                <td><div className="types">{sp?.types.map(ty => <TypeBadge key={ty} type={ty} />)}</div></td>
                <td><select value={methodOf(e)} onChange={ev => setEntry(i, {method: ev.target.value})} aria-label={t('Come si incontra')}>
                  {METHODS.map(m => <option key={m.id} value={m.id}>{t(m.label)}</option>)}
                </select></td>
                <td><input type="number" className="w-num" min={0} value={e.rate} onChange={ev => setEntry(i, {rate: +ev.target.value})} /> <span className="muted small">{totalOf(methodOf(e)) ? Math.round(e.rate / totalOf(methodOf(e)) * 100) : 0}%</span></td>
                <td><input type="number" className="w-num" min={1} max={100} value={e.minLevel} onChange={ev => setEntry(i, {minLevel: +ev.target.value})} /></td>
                <td><input type="number" className="w-num" min={1} max={100} value={e.maxLevel} onChange={ev => setEntry(i, {maxLevel: +ev.target.value})} /></td>
                <td className="small muted">{sp ? (sp.gender ? (sp.gender === 'N' ? t('asessuato') : t('solo {g}', {g: sp.gender === 'M' ? '♂' : '♀'})) : `${Math.round(sp.genderRatio.M * 100)}/${Math.round(sp.genderRatio.F * 100)}`) : ''}</td>
                <td><button className="btn-icon" aria-label={t('Rimuovi')} onClick={() => setZ({...z, entries: z.entries.filter((_, j) => j !== i)})}><X /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <div className="row gap-s">
        <button onClick={() => setZ({...z, entries: [...z.entries, {species: '', rate: 20, minLevel: 2, maxLevel: 5, method: z.entries.at(-1)?.method || 'walk'}]})}>+ {t('Specie')}</button>
        <select value={testMethod} onChange={e => setTestMethod(e.target.value)} aria-label={t('Metodo della prova')}>
          {METHODS.filter(m => z.entries.some(e => methodOf(e) === m.id)).map(m => <option key={m.id} value={m.id}>{t(m.label)}</option>)}
        </select>
        <button onClick={test} disabled={!z.entries.length}><Dices /> {t('Prova un incontro')}</button>
      </div>
      <label>{t('Note')}<textarea rows={2} value={z.notes || ''} onChange={e => setZ({...z, notes: e.target.value})} placeholder={t('Di notte compaiono Hoothoot…')} /></label>
      {samples.length > 0 && <div className="mon-grid">{samples.map((m, i) => <MonCard key={i} mon={m} />)}</div>}
    </section>
  );
}

