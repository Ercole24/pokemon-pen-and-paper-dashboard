// Impostazioni della campagna (/c/<id>/impostazioni): nome, generazione, regione, probabilità di cromatici e abilità nascoste,
// nomi usati su Showdown, passi per turno sulla mappa, medaglie condivise; istruzioni per collegare i telefoni.
import {useState} from 'react';
import {Check} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {ADVENTURES, adventureOf, api, showdownUrl, useStore, type Campaign} from '../api';
import {REGIONS} from './Home';
import {t, tj} from '../i18n';

/** La pagina: le modifiche si salvano con il pulsante. */
export default function Settings() {
  const {campaign, updateCampaign} = useStore();
  const [c, setC] = useState<Campaign>(campaign);
  const [saved, setSaved] = useState(false);
  const nav = useNavigate();
  /** Modifica locale (non ancora salvata). */
  const set = (p: Partial<Campaign>) => { setC({...c, ...p}); setSaved(false); };
  const lan = `http://${location.host}/c/${campaign.id}/giocatore`;

  return (
    <div className="page">
      <header className="page-head"><h1>{t('Impostazioni')}</h1></header>
      <section className="panel narrow">
        <label>{t('Nome campagna')}<input value={c.name} onChange={e => set({name: e.target.value})} /></label>
        <div className="grid-2">
          <label>{t('Regione')}
            <select value={c.region} onChange={e => set({region: e.target.value})}>
              {REGIONS.map(([r, g]) => <option key={r} value={r}>{t(r)} (Gen {g})</option>)}
              <option value="">{t('Altra / inventata')}</option>
            </select>
          </label>
          <label>{t('Generazione')}
            <select value={c.gen} onChange={e => set({gen: +e.target.value})}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => <option key={g} value={g}>Gen {g}</option>)}
            </select>
          </label>
          <label>{t('Probabilità cromatico: 1 su')}<input type="number" min={1} value={c.shinyRate} onChange={e => set({shinyRate: +e.target.value})} /></label>
          <label>{t('Abilità nascosta (%)')}<input type="number" min={0} max={100} value={Math.round(c.hiddenAbilityChance * 100)} onChange={e => set({hiddenAbilityChance: +e.target.value / 100})} /></label>
          {c.teamMode !== 'own' && <label>{t('Nome Showdown della squadra')}<input value={c.teamUser} onChange={e => set({teamUser: e.target.value})} /></label>}
          <label>{t('Nome Showdown del Master')}<input value={c.gmUser} onChange={e => set({gmUser: e.target.value})} /></label>
          <label>{t('Tipo di avventura')}
            <select value={adventureOf(c)} onChange={e => { const a = ADVENTURES.find(x => x.id === e.target.value)!; set({teamMode: a.teamMode, sharedBadges: a.sharedBadges}); }}>
              {ADVENTURES.map(a => <option key={a.id} value={a.id}>{t(a.label)}</option>)}
            </select>
          </label>
          <label>{t('Passi per turno sulla mappa (giocatori)')}<input type="number" min={1} max={20} value={c.moveRange ?? 8} onChange={e => set({moveRange: +e.target.value})} /></label>
        </div>
        <p className="small muted">{t('Cambiare generazione non modifica i Pokémon già creati: le specie non disponibili verranno segnalate.')}</p>
        {c.teamMode === 'own' && <p className="small muted">{t('Squadre personali: i Pokémon senza Allenatore compaiono a parte in “Squadra e PC”; assegnali dalla loro scheda (campo Allenatore).')}</p>}
        <div className="row gap-s end">
          <button className="btn-danger" onClick={async () => {
            if (prompt(t('Scrivi il nome della campagna per eliminarla definitivamente:')) !== campaign.name) return;
            await api(`/campaigns/${campaign.id}`, 'DELETE'); nav('/');
          }}>{t('Elimina campagna')}</button>
          <button className="btn-primary" onClick={async () => { await updateCampaign(c); setSaved(true); }}>{saved ? <><Check /> {t('Salvato')}</> : t('Salva')}</button>
        </div>
      </section>

      <section className="panel narrow">
        <h2>{t('Come collegarsi al tavolo')}</h2>
        <ol className="steps">
          <li>{tj('I giocatori, sulla stessa rete Wi-Fi, aprono {url} e scelgono il proprio Allenatore.', {url: <b>{lan}</b>})}</li>
          <li>{tj('Chi gioca le lotte della squadra apre {url} sul telefono.', {url: <b>{showdownUrl()}</b>})} <b>{t('Non deve scegliere nessun nome')}</b>: {t('compare come “Guest” con un numero (in alto a destra).')}</li>
          <li>{t('Il Master apre la stessa pagina sul suo PC.')}</li>
          <li>{t('Nella pagina Lotta della dashboard, sotto “Su Showdown”, il Master assegna un nome a ogni Guest (per esempio {team} e {gm}). Niente password.', {team: c.teamMode === 'own' ? t('il nome di ogni Allenatore') : c.teamUser, gm: c.gmUser})}</li>
          <li>{t("Il Master crea la lotta: la stanza si apre da sola sul telefono del giocatore e sul PC del Master, che muove l'avversario.")}</li>
        </ol>
        <p className="small muted">{t('Il client di Showdown è servito da questo PC; sprite, musica e versi arrivano da play.pokemonshowdown.com: serve una connessione a internet.')}</p>
      </section>
    </div>
  );
}
