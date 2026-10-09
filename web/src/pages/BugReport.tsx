// Pagina "Segnala un bug" (/segnala-bug): spiega cosa scrivere e apre il modulo su GitHub (.github/ISSUE_TEMPLATE/bug_report.yml)
// con versione e browser già compilati.
import {Link} from 'react-router-dom';
import {CONFIG} from '../api';
import {LangSwitch, t} from '../i18n';

const REPO = 'https://github.com/Ercole24/pokemon-pen-and-paper-dashboard';
/** Modulo dei bug su GitHub, con versione e browser già scritti. */
export const bugReportUrl = () => `${REPO}/issues/new?` + new URLSearchParams({template: 'bug_report.yml', version: CONFIG.version, system: navigator.userAgent});

/** La pagina. */
export default function BugReport() {
  return (
    <div className="home">
      <LangSwitch className="corner" />
      <section className="panel credits">
        <h1>{t('Segnala un bug')}</h1>
        <p>{t('Qualcosa non funziona? Le segnalazioni si raccolgono su GitHub: serve un account (gratuito). Il modulo si apre con versione e browser già compilati.')}</p>
        <h2>{t('Cosa scrivere')}</h2>
        <ul>
          <li>{t('cosa è successo, con il messaggio d\'errore se c\'è;')}</li>
          <li>{t('i passi per farlo succedere di nuovo;')}</li>
          <li>{t('uno screenshot, se aiuta a capire.')}</li>
        </ul>
        <p className="small muted">{t('Versione {v}', {v: CONFIG.version})}</p>
        <p className="row gap-s">
          <Link className="btn" to="/">{t('Torna alle campagne')}</Link>
          <a className="btn btn-primary" href={bugReportUrl()} target="_blank" rel="noopener noreferrer">{t('Apri il modulo su GitHub')}</a>
        </p>
      </section>
    </div>
  );
}
