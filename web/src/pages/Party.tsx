// Pagina Squadra e PC (/c/<id>/squadra): squadra (massimo 6, riordinabile trascinando) e box del PC.
// Si aggiungono o modificano Pokémon, si spostano tra squadra e PC, si assegnano i livelli a fine percorso.
// Con squadre personali (avventura "ognuno per sé") ogni Allenatore ha la sua squadra e il suo PC.
import {useState} from 'react';
import {ArrowDownToLine, ArrowUpFromLine} from 'lucide-react';
import {api, useStore, type Mon, type Trainer} from '../api';
import {MonCard, MonEditor, Modal, newMon, NumberDie, SortableParty, useParty} from '../components';
import {t} from '../i18n';

/** La pagina. */
export default function Party() {
  const {trainer, mon, campaign} = useStore();
  const [route, setRoute] = useState(false);
  const own = campaign.teamMode === 'own';
  const inTeam = (m: Mon) => m.place === 'party' || m.place === 'pc';
  // squadre mostrate: una sola, oppure una per Allenatore (più i Pokémon rimasti senza Allenatore, da assegnare)
  const teams: {owner?: string, name?: string}[] = !own ? [{}] : [
    ...trainer.map(t => ({owner: t.id!, name: t.name})),
    ...(mon.some(m => inTeam(m) && !trainer.some(t => t.id === m.owner)) ? [{owner: ''}] : []),
  ];
  const party = (owner?: string) => mon.filter(m => m.place === 'party' && (owner === undefined || (m.owner || '') === owner));
  const groups = own
    ? trainer.map(t => ({players: [t], mons: party(t.id)}))
    : [{players: trainer.length ? trainer : [{id: 'squadra', name: t('Squadra')} as Trainer], mons: party()}];

  return (
    <div className="page">
      <header className="page-head row between">
        <h1>{t('Squadra e PC')}</h1>
        <button onClick={() => setRoute(true)}>{t('Percorso completato (d4)')}</button>
      </header>
      {own && !trainer.length && <p className="panel muted">{t('Ogni Allenatore ha la sua squadra: crea prima gli Allenatori.')}</p>}
      {teams.map(tm => <Team key={tm.owner ?? 'all'} owner={tm.owner} name={tm.name} />)}
      {route && <RouteLevels groups={groups} onClose={() => setRoute(false)} />}
    </div>
  );
}

/** Squadra e PC di un Allenatore (owner) o della campagna (owner assente). */
function Team({owner, name}: {owner?: string, name?: string}) {
  const {save, remove, trainer, addLog, campaign, mon} = useStore();
  const {party, pc} = useParty(owner);
  const [edit, setEdit] = useState<Mon | null>(null);
  const [exportText, setExportText] = useState('');
  const own = campaign.teamMode === 'own';
  // titoli: "Squadra", "Squadra di Ash", "Squadra senza Allenatore" (e lo stesso per PC)
  const title = (what: string) => owner === '' ? t('{what} senza Allenatore', {what: t(what)}) : name ? t('{what} di {name}', {what: t(what), name}) : t(what);

  /** Sposta un Pokémon tra squadra e PC (la squadra non supera 6). */
  const move = (m: Mon, place: 'party' | 'pc') => {
    if (place === 'party' && party.length >= 6) return alert(t('La squadra ha già 6 Pokémon: mandane uno al PC prima.'));
    save('mon', {...m, place, order: place === 'party' ? party.length : m.order});
  };
  /** Nome dell'Allenatore a cui appartiene il Pokémon (solo con la squadra condivisa: con squadre personali è il titolo). */
  const ownerName = (m: Mon) => own ? '' : trainer.find(x => x.id === m.owner)?.name;
  /** Posti liberi nella squadra di un Allenatore (o della campagna). */
  const partyOf = (o: string) => mon.filter(x => x.place === 'party' && (!own || (x.owner || '') === o));

  return (
    <>
      <section className="panel">
        <div className="row between wrap gap-s">
          <h2>{title('Squadra')} <span className="muted">{party.length}/6</span></h2>
          <div className="row gap-s">
            <button className="btn-s" onClick={async () => setExportText((await api('/dex/export', 'POST', {mons: party})).text)}>{t('Esporta per Showdown')}</button>
            <button className="btn-s btn-primary" onClick={() => setEdit({...newMon('', 5), owner: owner || undefined})}>+ Pokémon</button>
          </div>
        </div>
        <p className="small muted">{t("Trascina un Pokémon per cambiare l'ordine: il primo scende in campo per primo.")}</p>
        {party.length === 0 && <p className="muted">{t('Nessun Pokémon in squadra.')}</p>}
        <SortableParty party={party} render={(m, handle) => <MonCard mon={m} onClick={() => setEdit(m)}
          actions={<>{handle}<span className="small muted">{ownerName(m)}</span><button className="btn-s" onClick={() => move(m, 'pc')}><ArrowDownToLine /> PC</button></>} />} />
      </section>

      <section className="panel">
        <h2>{owner === undefined && !name ? t('PC di Bill') : title('PC')} <span className="muted">{pc.length}</span></h2>
        {pc.length === 0 && <p className="muted">{t('Vuoto.')}</p>}
        <div className="mon-grid pc-grid">
          {pc.map(m => <MonCard key={m.id} mon={m} compact onClick={() => setEdit(m)}
            actions={<button className="btn-s" onClick={() => move(m, 'party')}><ArrowUpFromLine /> {t('Squadra')}</button>} />)}
        </div>
      </section>

      {edit && <MonEditor initial={edit} title={edit.id ? (edit.nickname || edit.species) : t('Nuovo Pokémon')}
        onSave={async m => {
          // nuovo Pokémon, o ceduto a un altro Allenatore: in squadra se c'è posto, altrimenti nel PC
          const moved = !edit.id || (own && (edit.owner || '') !== (m.owner || ''));
          const dest = partyOf(m.owner || '').filter(x => x.id !== m.id);
          const place = !moved ? m.place : dest.length < 6 ? 'party' : 'pc';
          const saved = await save('mon', {...m, place, order: moved ? dest.length : m.order});
          const to = trainer.find(x => x.id === m.owner)?.name;
          const v = {species: saved.species, level: saved.level, name: m.nickname || m.species, to, pc: place === 'pc' ? ' → PC' : '', full: place === 'pc' ? ` ${t('(nel PC: squadra piena)')}` : ''};
          if (!edit.id) addLog(t(own && to ? '{species} si unisce alla squadra di {to} (LV {level}){pc}.' : '{species} si unisce alla squadra (LV {level}){pc}.', v));
          else if (moved) addLog(t(to ? '{name} passa a {to}{full}.' : '{name} passa senza Allenatore{full}.', v));
          else if (m.species !== edit.species) addLog(t('{old} si è evoluto in {species}!', {old: edit.nickname || edit.species, species: m.species}), 'catch');
        }}
        onDelete={edit.id ? () => remove('mon', edit.id!) : undefined} onClose={() => setEdit(null)} />}

      {exportText && (
        <Modal title={t('{team} in formato Showdown', {team: title('Squadra')})} onClose={() => setExportText('')}>
          <p className="small muted">{t('Copia nel Teambuilder di Showdown (Gen {gen} Custom Game).', {gen: campaign.gen})}</p>
          <textarea rows={16} readOnly value={exportText} onFocus={e => e.target.select()} />
        </Modal>
      )}
    </>
  );
}

/**
 * Regola del libretto: ogni Allenatore tira 1d4 per percorso e distribuisce i livelli.
 * groups: chi tira e tra quali Pokémon distribuisce (squadra condivisa: tutti insieme; squadre personali: ognuno i suoi).
 */
function RouteLevels({groups, onClose}: {groups: {players: Trainer[], mons: Mon[]}[], onClose: () => void}) {
  const {save, addLog} = useStore();
  const [rolls, setRolls] = useState<Record<string, number>>({});
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const sum = (ids: string[], o: Record<string, number>) => ids.reduce((a, id) => a + (o[id] || 0), 0);
  const mons = groups.flatMap(g => g.mons);
  const used = sum(mons.map(m => m.id!), alloc);

  /** Applica i livelli distribuiti e lo scrive nel diario. */
  async function apply() {
    for (const m of mons) if (alloc[m.id!]) await save('mon', {...m, level: Math.min(100, m.level + alloc[m.id!])});
    await addLog(t('Percorso completato: {n} livelli distribuiti ({list}).', {n: used, list: mons.filter(m => alloc[m.id!]).map(m => `${m.nickname || m.species} +${alloc[m.id!]}`).join(', ')}));
    onClose();
  }
  return (
    <Modal title={t('Percorso completato')} onClose={onClose}>
      <p className="small muted">{t(groups.length > 1 ? 'Ogni Allenatore tira 1d4 (o inserisci il dado fisico). Poi distribuisci i punti tra i Pokémon della sua squadra.' : 'Ogni Allenatore tira 1d4 (o inserisci il dado fisico). Poi distribuisci i punti tra i Pokémon usati nel percorso.')}</p>
      {groups.map((g, gi) => {
        const total = sum(g.players.map(p => p.id!), rolls);
        const spent = sum(g.mons.map(m => m.id!), alloc);
        return (
          <div key={gi} className="stack">
            {g.players.map(p => <div key={p.id} className="row between"><span>{p.name}</span><NumberDie sides={4} onResult={n => setRolls({...rolls, [p.id!]: n})} /></div>)}
            <h3>{t('Punti')}: {spent}/{total}</h3>
            {g.mons.length === 0 && <p className="small muted">{t('Nessun Pokémon in squadra.')}</p>}
            {g.mons.map(m => (
              <div key={m.id} className="row between">
                <span>{m.nickname || m.species} <span className="muted">LV {m.level}</span></span>
                <span className="row gap-s">
                  <button className="btn-s" onClick={() => setAlloc({...alloc, [m.id!]: Math.max(0, (alloc[m.id!] || 0) - 1)})}>−</button>
                  <b>{alloc[m.id!] || 0}</b>
                  <button className="btn-s" disabled={spent >= total} onClick={() => setAlloc({...alloc, [m.id!]: (alloc[m.id!] || 0) + 1})}>+</button>
                </span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="row end"><button className="btn-primary" disabled={!used} onClick={apply}>{t('Applica')}</button></div>
    </Modal>
  );
}
