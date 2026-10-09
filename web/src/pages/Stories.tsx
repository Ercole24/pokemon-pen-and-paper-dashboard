// Generatori di storie (/c/<id>/storie): spunti per il master.
// - 3d6: chi (WHO) + fa cosa (DOES) + a cosa (WHAT), dalle tabelle del libretto;
// - d100: 100 spunti d'avventura (PLOTS).
import {useState} from 'react';
import {Check} from 'lucide-react';
import {d, useStore} from '../api';
import {t} from '../i18n';

/** Tabelle del generatore 3d6 (testi italiani, si traducono con t()). */
const WHO = ['Il Team Rocket', 'Un Allevatore locale', 'Il Centro Pokémon', 'Un Allenatore di Palestra', 'Il Professore / un Assistente', 'Il gestore del Pokémarket'];
const DOES = ['ha rubato', 'ha bisogno di', 'vuole', 'ha smarrito', 'sta creando', 'ha perso'];
const WHAT = ['un Pokémon speciale', 'un vecchio fossile', 'un Uovo Pokémon misterioso', 'una bici speciale', 'delle bacche fresche', 'una Poké Ball sperimentale'];

/** I 100 spunti per il d100 (testi italiani, si traducono con t()). */
export const PLOTS = [
  "Il Team Rocket cerca di rubare il Pokémon di una Palestra!", "Un Dojo cerca nuovi allievi!", "Il fan club locale vuole organizzare una parata per la città!",
  "Un nuovissimo Team malvagio cerca di reclutare i nostri Allenatori!", "Tutti i Beedrill selvatici sono spariti all'improvviso!", "C'è un torneo locale e il premio è un Pokémon cromatico!",
  "I nostri Allenatori restano bloccati dalla neve per l'inverno! E qualcosa… si aggira là fuori!", "Un Centro Pokémon losco fa del male ai Pokémon invece di curarli! Perché!?",
  "L'Agente Jenny cerca finti membri di una banda di motociclisti per un'operazione sotto copertura!", "La Torre Pokémon sta per essere demolita per far posto a una capitalistica Torre Radio!",
  "Una tribù segreta nella natura adora un singolo Unown!", "Uno svitato del posto crede di essere un Dragonite e vuole dimostrarlo!",
  "Gli Allenatori possono ottenere una medaglia speciale superando l'Esame ufficiale della Lega!", "Un cacciatore-raccoglitore cresciuto dai Mightyena deve salvare casa sua dalla deforestazione!",
  "L'Infermiera Joy è innamorata di un pezzo grosso, un amministratore delegato!", "La dipendenza da Voltorb Flip sta mettendo in ginocchio la nazione!",
  "Una Medium inquietante fa cadere i nostri Allenatori in una trance allucinogena!", "Un hobbista ha costruito in casa la escape room e il percorso a ostacoli definitivi!",
  "Kangaskhan non trova il suo piccolo!", "Un concorso di Bellezza ha un premio enorme, ma nasconde un oscuro segreto!",
  "Un Bullo vuole unirsi alla squadra e non smette di seguire i nostri Allenatori!", "Ursaring è impazzito! Tutti dentro la baita!",
  "Un Samurai solitario e silenzioso cerca una Spada misteriosa!", "I nostri Allenatori si imbattono in una comune di artisti isolazionisti e naturisti che li invita a restare! Niente di sessuale, ma quanto sono fastidiosi!",
  "I nostri Allenatori scoprono un covo sotterraneo segreto usando Fossa o Sub!", "AAHHH ATTENZIONE, QUELL'ELECTRODE STA PER ESPLODERE!",
  "Il rocker Angus vuole una sfida… tra band!", "Un Escursionista illuminato propone di provare con lui i Funghi-Paras!",
  "Dei nerd del posto costruiscono Porygon per farli combattere come robot da battaglia!", "I nostri Allenatori sono diventati virali su internet! Una giornata di fama e paparazzi!",
  "Un Mr. Mime inquietante continua a comparire facendo sketch mediocri!", "Un Bullo sfida ogni giorno la Palestra della città e perde sempre, ma non si arrende! Forse oggi è il giorno giusto!",
  "Dei PokéNerd giocano a D&D e la cosa diventa molto meta!", "Un atleta spaccone sfida i nostri Allenatori a scalare fino in cima a un Exeggutor di Alola!",
  "Narra la leggenda che i gatti domestici siano in realtà i Pokémon più forti!", "Una troupe del telegiornale vuole una storia da Allenatori giovani e alla moda! Anche se fosse tutta inventata!",
  "Un Monaco silenzioso medita con il suo Medicham, ma fatica a restare concentrato!", "Due piccole Palestre rivali si contendono un posto nella Lega Indaco!",
  "Troppi Pokémon possono usare la MT26 Terremoto e la cosa sta facendo impazzire tutta la Regione!", "Un grosso Snorlax blocca la strada!",
  "Un Pescatore determinato è a un passo dal catturare il mostro di Loch Ness!", "Il triste Jigglypuff di un Allenatore canta malissimo e vuole migliorare!",
  "Inquietanti Pokémon di tipo Spettro continuano ad apparire di notte!", "Tutti i vostri Pokémon sono depressi perché il mondo è freddo e buio, e non lotteranno finché non staranno meglio!",
  "Tutti hanno fame e vanno al PokéMercato contadino! Ci sono troppe scelte!", "Uffa! Un genitore di un Allenatore chiama e ha bisogno di aiuto per un trasloco!",
  "Gli Ingegneri di Verdeazzupoli lavorano a un'invenzione letteralmente fuori dal mondo!", "Un pianoforte viene trovato in mezzo al nulla… e suona da solo!",
  "I nostri Allenatori hanno un breve ma incredibile incontro spirituale con Arceus!", "È ora di rimettere in funzione quella Centrale Elettrica abbandonata!",
  "L'Altopiano Blu è aperto alle visite guidate! Ma c'è un problema!", "La rete del PC di Bill non funziona e tutti sono furiosi!", "Il Museo di Plumbeopoli sta perdendo i finanziamenti!",
  "Gli Allenatori scoprono cosa si prova a stare dentro una Poké Ball! Magari ci restano pure bloccati!", "Il Ninetales di una Bellezza in realtà è nato con otto code!",
  "Compare un Absol che avverte: un uragano di categoria 5 sta arrivando dritto verso di voi!", "Attacco di un Pokémon gigante!", "Drifloon sta volando via!",
  "Qualcuno lascia strumenti in giro ovunque, in tutta la regione! Perché?!", "S̵u̷c̶c̵e̴d̵e̷ ̸q̷u̴a̵l̴c̷o̵s̶a̸ ̵d̷i̶ ̵s̷t̵r̶a̵n̶o̸", "Tutti i Draghi entrano in sciopero!",
  "Una grande e malvagia compagnia petrolifera causa sversamenti al largo! Pensate ai Pokémon d'acqua!", "Un Professore Pokémon deve trovare un nuovo assistente competente!",
  "Mew……. THREE!?!?!?!", "Almeno un esemplare di ognuna delle oltre 20 specie di Pokémon scimmia è scappato dallo zoo!", "Hypno ipnotizza!",
  "Un Superstudioso dice di poter costruire un congegno che insegna a parlare a un Pokémon! Ma funziona una sola volta, e non si torna indietro!",
  "Due Marinai sono bloccati da troppo tempo in un faro a catturare Krabby per il loro mercante! Stanno impazzendo!", "Nel vicino College Pokémon c'è una pazza festa segreta nei dormitori! (Ottimo)",
  "Dei teppistelli hanno appiccato un incendio nel bosco! Fermatelo prima che sia troppo tardi!", "Una corsa attraverso l'intero PokéMondo, in ogni regione, in 80 giorni!",
  "Un Ditto si trasforma in uno dei nostri Allenatori e nessuno nota la differenza!", "Brock e Misty escono insieme ed è un disastro!",
  "Oh oh! Episodio crossover! È Captain Falcon! O Naruto! O chi diavolo volete!", "Un neo-noir nei bassifondi! Il caso della Pepita scomparsa con il Detective Scraggy!",
  "Nella regione scoppia una pandemia trasmessa dai Pokémon e tocca ai nostri eroi procurare il vaccino!", "Un'immersione archeologica in un sistema di grotte dimenticato, tra enigmi e la ricerca di uno dei Regi!",
  "Johto e Kanto tornano in «guerra» e i nostri Allenatori vengono arruolati!", "Il signor Petri della Devon S.p.A. ha un pericoloso progetto di ricerca che richiede Allenatori audaci!",
  "La macchina è in fiamme e non c'è nessun Pokémon al volante!", "L'Insegnamosse non ricorda più perché ha scelto questo lavoro!", "Tutti al luna park!", "Colpo al Casinò!",
  "Devo sbrigare una commissione! Fai tu il Capopalestra per oggi!", "I nostri Allenatori vengono inghiottiti e restano bloccati nella pancia di un Wailord!",
  "Uno Swanna giudicante, ali sui fianchi, fissa i nostri Allenatori con disapprovazione!", "Il Rotom Phone ha una mente propria e non può farlo, Dave!",
  "Caccia alle Uova di Chansey nella Zona Safari! Gran premio!", "I nostri Allenatori trovano un varco nascosto verso il Mondo Distorto!",
  "(Con Allenatori bambini) Intrufoliamoci a vedere un film vietato ai minori! (Altrimenti) Giriamo un film vietato ai minori!",
  "Biglietti gratis per una vacanza su un'isola! Isole Settesule? Alola? Resort Lotta? Ma la nave parte oggi!", "Torneo di tennis!",
  "Un Pokémon mitico è inseguito da forze oscure e ha bisogno di una scorta!", "C'è una presa di ostaggi sul Ponte Levatoio di Libecciopoli!",
  "Il PC di Bill si è rotto e tutti i Pokémon depositati sono stati liberati nel mondo!", "Attaccano le Ultracreature! I varchi interdimensionali vanno chiusi!",
  "I Pokémon dei nostri Allenatori diventano cuccioli! È l'ora delle lotte Little Cup!", "Un misterioso Uovo Pokémon proprio non si schiude!",
  "Lotte tra Umani! Esistono, e sono i Pokémon a scegliere le mosse! Chi dei nostri Allenatori arriverà in cima?",
  "I nostri Allenatori usano la Capsula del Tempo di Bill come macchina del tempo! Anni '70 e PokéDisco Fever? Il selvaggio West della PokéMericana? O un futuro tutto cromato?",
];

/** La pagina: tiro digitale o numero inserito a mano. */
export default function Stories() {
  const {addLog} = useStore();
  const [quest, setQuest] = useState<number[] | null>(null);
  const [plot, setPlot] = useState<number | null>(null);
  const [manual, setManual] = useState('');
  const [noted, setNoted] = useState<number | null>(null);
  return (
    <div className="page">
      <header className="page-head"><h1>{t('Generatori di storie')}</h1></header>
      <p className="muted">{t('Non sai cosa fare dopo? Ecco tre modi per far scorrere la creatività.')}</p>
      <div className="stories">
        <section className="panel">
          <h2 className="m1">{t('Metodo #1 · Missione oggetto (3d6)')}</h2>
          <button className="btn-primary" onClick={() => setQuest([d(6), d(6), d(6)])}>{t('Tira 3d6')}</button>
          {quest && <p className="big-text">{t(WHO[quest[0] - 1])} <b>{t(DOES[quest[1] - 1])}</b> {t(WHAT[quest[2] - 1])}. <span className="muted small">({quest.join(', ')})</span></p>}
          <table className="rules small"><tbody>{WHO.map((w, i) => <tr key={i}><th>{i + 1}</th><td>{t(w)}</td><td>{t(DOES[i])}</td><td>{t(WHAT[i])}</td></tr>)}</tbody></table>
        </section>
        <section className="panel">
          <h2 className="m2">{t('Metodo #2 · Articolo a caso')}</h2>
          <p>{t('Bulbapedia è una risorsa fenomenale sul mondo dei Pokémon. Apri un articolo a caso: chissà cosa potrebbe ispirarti?')}</p>
          <a className="btn btn-primary" href="https://bulbapedia.bulbagarden.net/wiki/Special:Random" target="_blank">{t('Articolo casuale')}</a>
        </section>
        <section className="panel wide">
          <h2 className="m3">{t("Metodo #3 · Spunti d'avventura (d100)")}</h2>
          <div className="row gap-s">
            <button className="btn-primary" onClick={() => setPlot(d(100))}>{t('Tira d100')}</button>
            <input type="number" className="w-num" min={1} max={100} placeholder={t('n°')} value={manual} onChange={e => { setManual(e.target.value); if (+e.target.value >= 1 && +e.target.value <= 100) setPlot(+e.target.value); }} aria-label={t('Numero dado fisico')} />
          </div>
          {plot && <p className="big-text"><b>{plot}.</b> {t(PLOTS[plot - 1])} {noted === plot
            ? <span className="noted"><Check /> {t('Annotato nel diario')}</span>
            : <button className="btn-s" onClick={async () => { await addLog(t("Spunto d'avventura {n}: {text}", {n: plot, text: t(PLOTS[plot - 1])})); setNoted(plot); }}>{t('Annota nel diario')}</button>}</p>}
        </section>
      </div>
    </div>
  );
}
