// Punto d'ingresso dell'interfaccia: percorsi delle pagine (React Router) e struttura della vista del master.
// /                           elenco campagne (Home)
// /riconoscimenti             marchi, autori e licenze (Credits)
// /segnala-bug                come segnalare un bug (BugReport)
// /c/<id>/...                 dashboard del master (menu laterale + pagina)
// /c/<id>/giocatore[/<all>]   vista del giocatore sul telefono
import {StrictMode, useEffect, useState} from 'react';
import {BookOpen, BookText, Bug, Dices, Heart, Info, Music, Footprints, LayoutDashboard, Map as MapIcon, Settings as SettingsIcon, Smartphone, Sprout, Swords, UserRound, Users} from 'lucide-react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation, useParams} from 'react-router-dom';
import {api, socket, StoreCtx, useCampaignStore, useMaster, useStore} from './api';
import {LangSwitch, t} from './i18n';
import {BadgeCase, badgeIndexes, prefetchDex, RollToast} from './components';
import Home from './pages/Home';
import Credits, {DONATE_URL} from './pages/Credits';
import BugReport from './pages/BugReport';
import Overview from './pages/Overview';
import Trainers from './pages/Trainers';
import Party from './pages/Party';
import Zones from './pages/Zones';
import Battle from './pages/Battle';
import NpcTeams from './pages/NpcTeams';
import Maps from './pages/Maps';
import MapEditor from './pages/MapEditor';
import MapPlay from './pages/MapPlay';
import Dice from './pages/Dice';
import Stories from './pages/Stories';
import Settings from './pages/Settings';
import Player from './pages/Player';
import Manual from './pages/Manual';
import MusicPage, {MusicPlayer, useMusic} from './pages/Music';
import './style.css';

/**
 * Carica l'archivio della campagna e lo rende disponibile; finché non è pronto mostra "Caricamento".
 * Precarica anche il Pokédex della generazione.
 */
function CampaignShell({gm}: {gm: boolean}) {
  const {cid} = useParams();
  const store = useCampaignStore(cid!);
  useEffect(() => { if (store) prefetchDex(store.campaign.gen); }, [store?.campaign.gen]);
  if (!store || !store.ready) return <div className="loading">{t('Caricamento campagna…')}</div>;
  return <StoreCtx.Provider value={store}>{gm ? <GmLayout /> : <Outlet />}<RollToast /></StoreCtx.Provider>;
}

/** Pallino verde/rosso: il bot della dashboard è collegato a Showdown? */
function ShowdownStatus() {
  const [s, setS] = useState<{connected: boolean} | null>(null);
  useEffect(() => { api('/showdown/status').then(setS); socket.on('status', setS); return () => { socket.off('status', setS); }; }, []);
  return <span className={`status-dot ${s?.connected ? 'on' : 'off'}`} title={t(s?.connected ? 'Showdown collegato' : 'Showdown non collegato')}>Showdown</span>;
}

/** Voci del menu laterale: percorso, etichetta (da tradurre), icona. */
const NAV: [string, string, typeof Sprout][] = [
  ['', 'Panoramica', LayoutDashboard], ['lotta', 'Lotta', Swords], ['squadra', 'Squadra e PC', Footprints], ['allenatori', 'Allenatori', UserRound],
  ['zone', 'Zone e incontri', Sprout], ['png', 'Squadre PNG', Users], ['mappe', 'Mappe', MapIcon], ['dadi', 'Dadi', Dices],
  ['storie', 'Generatori di storie', BookOpen], ['musica', 'Musica (YouTube)', Music], ['manuale', 'Manuale', BookText], ['impostazioni', 'Impostazioni', SettingsIcon],
];

// acquerello del libretto diverso per sezione
const WASH: Record<string, string> = {lotta: 'red', squadra: 'blue', allenatori: 'yellow', zone: 'green', png: 'red', mappe: 'green', dadi: 'yellow', storie: 'blue', musica: 'yellow', impostazioni: 'blue'};

/**
 * Struttura del master: menu laterale (nome campagna, medaglie, sezioni, stato Showdown)
 * e la pagina scelta, con l'acquerello del libretto come sfondo. Il lettore di YouTube sta qui, dopo la pagina,
 * così la musica non si interrompe cambiando sezione (grande in Musica, miniatura altrove).
 */
function GmLayout() {
  useMaster();
  const {campaign, trainer} = useStore();
  const section = useLocation().pathname.split('/')[3] || '';
  const music = useMusic(useParams().cid!);
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand"><span className="brand-ball" />Pen &amp; Paper</NavLink>
        <div className="id-card">
          <strong>{campaign.name}</strong>
          <span>{campaign.region ? t(campaign.region) : t('Regione libera')} · Gen {campaign.gen} · {t('{n} Allenatori', {n: trainer.length})}</span>
          <BadgeCase small earned={campaign.sharedBadges ? badgeIndexes(campaign) : [...new Set(trainer.flatMap(t => badgeIndexes(t)))]} />
        </div>
        <nav>
          {NAV.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === ''}><Icon />{t(label)}</NavLink>)}
        </nav>
        <div className="sidebar-foot">
          <ShowdownStatus />
          <NavLink to="giocatore"><Smartphone /> {t('Vista giocatore')}</NavLink>
          <a href={DONATE_URL} target="_blank" rel="noopener noreferrer"><Heart /> {t('Sostieni Pen & Paper')}</a>
          <NavLink to="/riconoscimenti"><Info /> {t('Riconoscimenti')}</NavLink>
          <NavLink to="/segnala-bug"><Bug /> {t('Segnala un bug')}</NavLink>
        </div>
      </aside>
      <main className={`content ${section === 'musica' ? 'music-mode' : ''}`} style={{'--wash': `var(--wash-${WASH[section] || 'cover'})`} as React.CSSProperties}>
        <div className="content-top"><LangSwitch /></div>
        <Outlet context={music} />
        {music.link && <MusicPlayer m={music} full={section === 'musica'} />}
      </main>
    </div>
  );
}

/** Monta l'app nella pagina e definisce i percorsi. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/riconoscimenti" element={<Credits />} />
        <Route path="/segnala-bug" element={<BugReport />} />
        <Route path="/c/:cid/giocatore" element={<CampaignShell gm={false} />}>
          <Route index element={<Player />} />
          <Route path=":tid" element={<Player />} />
        </Route>
        <Route path="/c/:cid" element={<CampaignShell gm />}>
          <Route index element={<Overview />} />
          <Route path="lotta" element={<Battle />} />
          <Route path="squadra" element={<Party />} />
          <Route path="allenatori" element={<Trainers />} />
          <Route path="zone" element={<Zones />} />
          <Route path="png" element={<NpcTeams />} />
          <Route path="mappe" element={<Maps />} />
          <Route path="mappe/:mid" element={<MapEditor />} />
          <Route path="mappe/:mid/gioca" element={<MapPlay />} />
          <Route path="dadi" element={<Dice />} />
          <Route path="storie" element={<Stories />} />
          <Route path="musica" element={<MusicPage />} />
          <Route path="manuale" element={<Manual />} />
          <Route path="impostazioni" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
