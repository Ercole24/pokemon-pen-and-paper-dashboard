// Pagina Riconoscimenti (/riconoscimenti): marchi, autori del gioco, fonti di immagini e dati, licenze.
// Stesso testo in README.md e NOTICE.
import {Link} from 'react-router-dom';
import {LangSwitch, t, tj} from '../i18n';

/** Pagina del gioco Pokémon Pen & Paper, dove si può sostenere chi l'ha scritto. */
export const DONATE_URL = 'https://sagegc.itch.io/pkmn';

/** Link esterno in una nuova scheda. */
const Ext = ({href, children}: {href: string, children: string}) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;

/** La pagina. */
export default function Credits() {
  return (
    <div className="home">
      <LangSwitch className="corner" />
      <section className="panel credits">
        <h1>{t('Riconoscimenti')}</h1>
        <p>{t('Pokémon e tutti i nomi, personaggi e immagini collegati sono marchi e © di Nintendo, Game Freak, Creatures Inc. e The Pokémon Company. Questo è un progetto di fan, gratuito e senza scopo di lucro, non affiliato né approvato da loro. Il repository non contiene immagini né audio dei giochi.')}</p>
        <h2>{t('Codice')}</h2>
        <p>{tj('Codice originale di {author}, licenza Apache 2.0: chi lo riusa deve citarlo come creatore del codice di base. Sorgenti: {repo}.', {author: <Ext href="https://github.com/Ercole24">Ercole24</Ext>, repo: <Ext href="https://github.com/Ercole24/pokemon-pen-and-paper-dashboard">GitHub</Ext>})}</p>
        <h2>{t('Gioco')}</h2>
        <p>{tj('{game} di Sage G.C.: regole, classi e tabelle sono sue. Se ti piace, sostienilo dalla sua pagina.', {game: <Ext href={DONATE_URL}>Pokémon Pen &amp; Paper Version</Ext>})}</p>
        <h2>{t('Immagini, audio e dati')}</h2>
        <ul>
          <li>{tj('{showdown} (Smogon): server delle lotte e dati di Pokémon e mosse (licenza MIT); client delle lotte (licenza AGPL-3.0), compilato dai sorgenti e modificato da questo progetto. Sprite, musica e versi sono caricati da play.pokemonshowdown.com durante il gioco.', {showdown: <Ext href="https://pokemonshowdown.com">Pokémon Showdown</Ext>})}</li>
          <li>{tj('{pokeapi}: immagini delle medaglie, caricate da internet.', {pokeapi: <Ext href="https://github.com/PokeAPI/sprites">PokeAPI/sprites</Ext>})}</li>
        </ul>
        <h2>{t('Caratteri')}</h2>
        <ul>
          <li>Atkinson Hyperlegible (Braille Institute) {t('e')} Press Start 2P (CodeMan38): SIL Open Font License.</li>
        </ul>
        <p className="row gap-s">
          <Link className="btn" to="/">{t('Torna alle campagne')}</Link>
          <a className="btn btn-primary" href={DONATE_URL} target="_blank" rel="noopener noreferrer">{t('Sostieni Pen & Paper')}</a>
        </p>
      </section>
    </div>
  );
}
