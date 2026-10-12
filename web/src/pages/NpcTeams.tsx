// Pagina Squadre PNG (/c/<id>/png): gli avversari (capipalestra, rivali, reclute…) con la loro squadra.
// - Elenco raggruppato per la mappa dove il PNG è piazzato (un PNG sta su una mappa sola).
// - Scheda: nome, classe, sprite, ricompensa, Pokémon, note, "già sconfitto".
import {useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {Swords} from 'lucide-react';
import {api, useStore, type Mon} from '../api';
import {Modal, MonCard, MonEditor, newMon, SpriteChooser, TrainerSprite} from '../components';
import {NPC_CLASSES, spriteForTrainer, trainerSpriteUrl} from '../trainers';
import {t} from '../i18n';

/** Una Squadra PNG. bag = zaino usabile in lotta dal Master. */
type Team = {id?: string, name: string, trainerClass?: string, sprite?: string, auto?: boolean, mons: Mon[], notes?: string, reward?: string, bag?: string, defeated?: boolean};

/** Dove è piazzato ogni PNG: id squadra → mappe. Un PNG sta su una sola mappa. */
export function usePlacements() {
  const {map} = useStore();
  return useMemo(() => {
    const out = new Map<string, {id: string, name: string}>();
    for (const m of map) for (const o of m.objects || []) if (o.kind === 'npc' && o.npcTeam) out.set(o.npcTeam, {id: m.id!, name: m.name});
    return out;
  }, [map]);
}

/** Sprite del PNG: quello scelto, altrimenti quello della sua classe. */
export const npcSprite = (t: Team) => t.sprite || NPC_CLASSES.find(c => c[0] === t.trainerClass)?.[1] || '';

/** La pagina. */
export default function NpcTeams() {
  const {npcteam, save, remove, campaign, map} = useStore();
  const placed = usePlacements();
  const [sel, setSel] = useState<string | null>(npcteam[0]?.id || null);
  const [edit, setEdit] = useState<{i: number, mon: Mon} | null>(null);
  const team: Team | undefined = npcteam.find(t => t.id === sel);
  /** Salva una modifica alla squadra scelta. */
  const update = (p: Partial<Team>) => team && save('npcteam', {...team, ...p});

  return (
    <div className="page">
      <header className="page-head row between">
        <h1>{t('Squadre PNG')}</h1>
        <button className="btn-primary" onClick={async () => setSel((await save('npcteam', {name: t('Nuovo allenatore'), trainerClass: 'Capopalestra', sprite: '', auto: false, mons: []})).id)}>+ {t('Squadra')}</button>
      </header>
      <p className="muted">{t('Capipalestra, Superquattro, rivali, Team malvagi… Prepara le loro squadre e lanciale dalla pagina Lotta.')}</p>
      <div className="split">
        <nav className="list-nav">
          {[...map.filter(m => npcteam.some(x => placed.get(x.id)?.id === m.id)).map(m => [m.name, npcteam.filter(x => placed.get(x.id)?.id === m.id)] as const),
            [t('Non ancora sulla mappa'), npcteam.filter(x => !placed.has(x.id))] as const].filter(([, l]) => l.length).map(([group, list]) => (
            <div key={group} className="stack-xs">
              <h4 className="nav-group">{group}</h4>
              {list.map(x => <button key={x.id} className={`with-sprite ${sel === x.id ? 'active' : ''} ${x.defeated ? 'defeated' : ''}`} onClick={() => setSel(x.id)}><img src={trainerSpriteUrl(spriteForTrainer({sprite: npcSprite(x)}, campaign.gen))} alt="" /><span><strong>{x.name}</strong><br /><span className="muted small">{x.trainerClass ? t(x.trainerClass) : ''} · {x.mons?.length || 0} Pokémon{x.defeated ? ` · ${t('sconfitto')}` : ''}</span></span></button>)}
            </div>
          ))}
        </nav>
        {team && (
          <section className="panel" key={team.id}>
            <div className="sheet-top">
              <TrainerSprite trainer={{name: team.name, sprite: npcSprite(team)}} size={112} />
              <div className="grid-2">
                <label>{t('Nome')}<input defaultValue={team.name} onBlur={e => update({name: e.target.value})} /></label>
                <label>{t('Classe')}
                  <select value={team.trainerClass || ''} onChange={e => update({trainerClass: e.target.value, sprite: ''})}>
                    {NPC_CLASSES.map(([c]) => <option key={c} value={c}>{t(c)}</option>)}
                  </select>
                </label>
                <div className="stack"><span className="small muted">{t('Personaggio (sprite)')}</span>
                  <SpriteChooser value={team.sprite || ''} fallback={NPC_CLASSES.find(c => c[0] === team.trainerClass)?.[1] || ''} placeholder={t('scegli')} onChange={b => update({sprite: b})} />
                </div>
                <label>{t('Ricompensa')}<input defaultValue={team.reward} onBlur={e => update({reward: e.target.value})} placeholder={t('Medaglia, ₽…')} /></label>
                <label>{t('Zaino (usabile in lotta dal Master)')}<input defaultValue={team.bag} onBlur={e => update({bag: e.target.value})} placeholder={t('Pozione x2, Antidoto')} /></label>
              </div>
            </div>
            <div className="row gap-s wrap small">
              {placed.get(team.id!) ? <span>{t('Sulla mappa')} <Link to={`/c/${campaign.id}/mappe/${placed.get(team.id!)!.id}`}>{placed.get(team.id!)!.name}</Link></span> : <span className="muted">{t("Non ancora piazzato: aggiungilo a una mappa dall'editor (oggetto PNG).")}</span>}
              <label className="check"><input type="checkbox" checked={!!team.defeated} onChange={e => update({defeated: e.target.checked})} /> {t('Già sconfitto')}</label>
            </div>
            <div className="mon-grid">
              {team.mons.map((m, i) => <MonCard key={i} mon={m} onClick={() => setEdit({i, mon: m})} />)}
            </div>
            <div className="row gap-s">
              <button disabled={team.mons.length >= 6} onClick={() => setEdit({i: team.mons.length, mon: newMon('', 10)})}>+ Pokémon</button>
              <button className="btn-danger" onClick={() => confirm(t('Eliminare la squadra?')) && (remove('npcteam', team.id!), setSel(null))}>{t('Elimina squadra')}</button>
            </div>
            <label>{t('Note / tattica')}<textarea rows={3} defaultValue={team.notes} onBlur={e => update({notes: e.target.value})} /></label>
          </section>
        )}
      </div>
      {edit && team && <MonEditor initial={edit.mon} title={t('Pokémon del PNG')}
        onSave={m => { const mons = [...team.mons]; mons[edit.i] = {...m, place: undefined}; return update({mons}); }}
        onDelete={edit.i < team.mons.length ? () => update({mons: team.mons.filter((_, j) => j !== edit.i)}) : undefined}
        onClose={() => setEdit(null)} />}
    </div>
  );
}

/**
 * Scheda veloce di un PNG per il Master, aperta dalla mappa senza lasciarla: squadra, ricompensa, zaino, note
 * (modificabili) e «Sconfitto». Segnarlo sconfitto lo scrive nel diario.
 */
export function NpcTeamInfo({teamId, onClose, onChallenge}: {teamId: string, onClose: () => void, onChallenge?: () => void}) {
  const {npcteam, save, campaign} = useStore();
  const team: Team | undefined = npcteam.find(x => x.id === teamId);
  if (!team) return null;
  const update = (p: Partial<Team>) => save('npcteam', {...team, ...p});
  const who = `${team.trainerClass ? t(team.trainerClass) + ' ' : ''}${team.name}`;
  const defeat = (on: boolean) => {
    update({defeated: on});
    if (on) api(`/c/${campaign.id}/log`, 'POST', {text: team.reward ? t('{who} è stato sconfitto: ricompensa {reward}.', {who, reward: team.reward}) : t('{who} è stato sconfitto.', {who}), type: 'battle'});
  };
  return (
    <Modal title={who} onClose={onClose}>
      <div className="stack" key={team.id}>
        <div className="row gap-s">
          <TrainerSprite trainer={{name: team.name, sprite: npcSprite(team)}} size={80} />
          <div className="stack-xs">
            <label className="check"><input type="checkbox" checked={!!team.defeated} onChange={e => defeat(e.target.checked)} /> {t('Sconfitto')}</label>
            {onChallenge && !team.defeated && <button className="btn-primary btn-s" onClick={onChallenge}><Swords /> {t('Sfida')}</button>}
          </div>
        </div>
        <label>{t('Ricompensa')}<input defaultValue={team.reward} onBlur={e => update({reward: e.target.value})} placeholder={t('Medaglia, ₽…')} /></label>
        <label>{t('Zaino (usabile in lotta dal Master)')}<input defaultValue={team.bag} onBlur={e => update({bag: e.target.value})} placeholder={t('Pozione x2, Antidoto')} /></label>
        <label>{t('Note / tattica')}<textarea rows={4} defaultValue={team.notes} onBlur={e => update({notes: e.target.value})} /></label>
        <div className="mon-grid">{team.mons.map((m, i) => <MonCard key={i} mon={m} compact />)}</div>
        {!team.mons.length && <p className="small muted">{t('Nessun Pokémon in squadra.')}</p>}
      </div>
    </Modal>
  );
}
