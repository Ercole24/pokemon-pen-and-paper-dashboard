// Manuale (/c/<id>/manuale per il master, scheda «Manuale» sul telefono): come si gioca con la dashboard
// e le regole del libretto che la dashboard applica (2dF, cattura, livelli, PS tra le lotte).
// Testo fisso, in due lingue (ManualIt / ManualEn): se cambiano le regole nel codice (server/src/rules.ts)
// vanno aggiornate tutte e due.
import {LANG, t} from '../i18n';

/** Il manuale; gm = mostra anche la parte per il master. */
export default function Manual({gm = true}: {gm?: boolean}) {
  return (
    <div className={gm ? 'page' : ''}>
      {gm && <header className="page-head"><h1>{t('Manuale')}</h1></header>}
      {LANG === 'it' ? <ManualIt gm={gm} /> : <ManualEn gm={gm} />}
    </div>
  );
}

/** Manuale in italiano. */
function ManualIt({gm}: {gm: boolean}) {
  return (
      <div className="manual stack">
        <section className="panel">
          <h2>Primi passi (giocatori)</h2>
          <ol className="steps">
            <li>Apri sul telefono l'indirizzo che ti dà il Master e tocca il tuo Allenatore.</li>
            <li>In basso ci sono le schede: <b>Scheda</b> (statistiche, soldi, zaino), <b>Squadra</b>, <b>Dadi</b>, <b>Mappa</b>, <b>Lotte</b> e questo <b>Manuale</b>.</li>
            <li>Soldi e zaino li gestisci tu: «+ Aggiungi» / «− Togli» per i soldi, +/− sugli strumenti.</li>
          </ol>
        </section>

        <section className="panel">
          <h2>Mappa</h2>
          <ul>
            <li><b>Muoversi</b>: tocca il tuo personaggio, poi una casella evidenziata. Da tastiera: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o le frecce, una casella alla volta.</li>
            <li><b>Gli altri</b>: il nome di ogni Allenatore è sotto il suo personaggio, nel suo colore. Chi è fuori schermo ha una freccia sul bordo con la distanza (1 casella = 1 m).</li>
            <li><b>PNG e cartelli</b>: 💬 = ha qualcosa da dirti. Toccalo (o passa col mouse) per leggere.</li>
            <li><b>Puntatore laser</b>: tieni premuto il tasto destro del mouse e muovilo; sul telefono attiva il pulsante <b>⌖</b> e tocca la mappa. Tutti vedono il punto nel tuo colore.</li>
            <li><b>Porte</b>: le porte hanno una cornice dorata. Toccane una per scegliere dove entrare (di nuovo per togliere la scelta): il numero sopra dice quanti l'hanno scelta. Vi fa entrare il Master, un gruppo alla volta.</li>
            <li>Lente − / +: vedi più o meno mappa.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Prove: 2 dadi Fudge (2dF)</h2>
          <p>Ogni dado ha facce +, − e vuota. Somma i + e i −, aggiungi il modificatore della tua Classe per la statistica messa alla prova.</p>
          <table className="rules small">
            <tbody>
              <tr><th>+2 o più</th><td>Superefficace! Riesce con un bonus.</td></tr>
              <tr><th>+1</th><td>Successo.</td></tr>
              <tr><th>0</th><td>Pari: decide il Master o si improvvisa.</td></tr>
              <tr><th>−1</th><td>Non molto efficace: non funziona.</td></tr>
              <tr><th>−2 o meno</th><td>Fallimento critico, con conseguenze.</td></tr>
              <tr><th>due vuote</th><td>Successo usando solo l'Introforza (vale sempre, qualunque modificatore).</td></tr>
            </tbody>
          </table>
          <p className="small">Un Pokémon che aiuta aggiunge un terzo dado. Ogni tiro digitale arriva a tutto il tavolo: notifica in alto e storico in «Dadi».</p>
        </section>

        <section className="panel">
          <h2>Lotte</h2>
          <ol className="steps">
            <li>Apri Showdown dalla scheda <b>Lotte</b> con «Apri Showdown come …»: entri già col nome del tuo Allenatore, che il telefono ricorda finché Showdown non si riavvia.</li>
            <li>Il Master sceglie chi gioca per la squadra. Con il <b>comando a turno</b> ogni Pokémon avversario lo affronta un giocatore diverso.</li>
            <li>Quando inizia la lotta si apre da sola. Il banner rosso in alto la riapre.</li>
          </ol>
          <p><b>PS tra le lotte</b>: a fine lotta i PS e gli stati alterati restano. Un Pokémon KO resta KO e non entra nella lotta dopo finché non viene curato.
            Nella scheda del Pokémon (Squadra, toccalo) puoi usare gli strumenti: «+ Cura» (Pozione = 20 PS), «Revitalizzante», «Cura stato», «PS al massimo».
            I PS non si cambiano a mano: i danni e il Centro Pokémon li gestisce il Master.</p>
          <p><b>Chi mandare in campo</b> (scheda Lotte): durante la lotta, per ogni Pokémon della squadra la percentuale di convenienza e di rischio contro l'avversario in campo, calcolate solo sui tipi. Si aggiorna da sola a ogni cambio.</p>
          <p className="small">In «Dadi» la <b>tabella dei tipi</b> si collega da sola all'avversario in campo: per ogni tuo Pokémon mostra la mossa più efficace e quanto rischia.</p>
        </section>

        <section className="panel">
          <h2>Crescita dei Pokémon</h2>
          <ul>
            <li>Il Master dà dei <b>livelli da distribuire</b>: li spendete voi dalla scheda del Pokémon con «+1 LV». Il server conta dati e spesi: non se ne possono spendere più di quanti dati.</li>
            <li>La scheda mostra la <b>crescita</b>: +X per ogni statistica rispetto al livello precedente.</li>
            <li><b>Soprannome</b>: lo cambi dalla scheda del Pokémon (vuoto = nome della specie).</li>
            <li>«Cambia mosse»: scegli fino a 4 mosse tra quelle imparate per livello. Se il Pokémon può evolversi lo vedi dopo la salita: dillo al Master.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Cattura</h2>
          <p>Tiro d100 + modificatori: serve <b>90</b> (<b>99</b> per evoluzioni finali e leggendari).</p>
          <table className="rules small">
            <tbody>
              <tr><th>Ball</th><td>Poké Ball +0 · Mega Ball +10 · Ultra Ball +20</td></tr>
              <tr><th>PS del selvatico</th><td>pieni −10 · fino al 75% +0 · fino al 50% +10 · fino al 25% +20</td></tr>
              <tr><th>Stato</th><td>Sonno +15 · Paralisi / Congelamento +10 · Veleno / Scottatura +5 · Confusione +5 · Infatuazione +5</td></tr>
              <tr><th>Livello</th><td>il tuo Pokémon in campo è più alto +5, più basso −5</td></tr>
              <tr><th>Classe</th><td>bonus della tua Classe contro certi tipi</td></tr>
            </tbody>
          </table>
        </section>

        {gm && <section className="panel">
          <h2>Per il Master</h2>
          <ul>
            <li><b>Mappa in gioco</b>: trascina segnalini, PNG, oggetti e segnaposto per spostarli; un clic senza spostarli apre il menu (dialogo, sfida, nascondi, elimina).</li>
            <li><b>Porte</b>: la barra sopra la mappa mostra la coda delle porte scelte dai giocatori, un gruppo per porta. «Fai entrare» sposta solo quel gruppo e la mappa al tavolo diventa quella d'arrivo; gli altri gruppi restano in coda. Con «Porta tutti» entrano invece tutti gli Allenatori, anche quelli su altre mappe. La zona degli incontri in «Lotta» segue la mappa al tavolo.</li>
            <li><b>Due testi per PNG</b> (editor della mappa): «Cosa dice ai giocatori» lo leggono loro toccandolo; «Note per il Master» lo vedi solo tu (⚠️ sulla mappa, nel menu e al passaggio del mouse).</li>
            <li><b>+ Segnalino</b>: Pokémon, PNG o trappole, anche invisibili ai giocatori (tu li vedi semitrasparenti).</li>
            <li><b>Livelli</b>: in «Squadra e PC», riga «Livelli ai giocatori»: +1, +1d4, −1 (solo quelli non ancora spesi).</li>
            <li><b>PS</b>: «Centro Pokémon (cura tutti)» in «Squadra e PC»; PS e stato si cambiano anche dall'editor del Pokémon.</li>
          </ul>
        </section>}
      </div>
  );
}

/** Manuale in inglese. */
function ManualEn({gm}: {gm: boolean}) {
  return (
      <div className="manual stack">
        <section className="panel">
          <h2>First steps (players)</h2>
          <ol className="steps">
            <li>On your phone, open the address the Master gives you and tap your Trainer.</li>
            <li>The tabs at the bottom are: <b>Sheet</b> (stats, money, bag), <b>Team</b>, <b>Dice</b>, <b>Map</b>, <b>Battles</b> and this <b>Manual</b>.</li>
            <li>You manage money and bag yourself: «+ Add» / «− Remove» for money, +/− on the items.</li>
          </ol>
        </section>

        <section className="panel">
          <h2>Map</h2>
          <ul>
            <li><b>Moving</b>: tap your character, then a highlighted tile. With a keyboard: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys, one tile at a time.</li>
            <li><b>The others</b>: every Trainer's name is under their character, in their colour. Anyone off screen has an arrow on the edge with the distance (1 tile = 1 m).</li>
            <li><b>NPCs and signs</b>: 💬 = they have something to tell you. Tap them (or hover with the mouse) to read.</li>
            <li><b>Laser pointer</b>: hold the right mouse button and move it; on a phone turn on the <b>⌖</b> button and tap the map. Everyone sees the dot in your colour.</li>
            <li><b>Doors</b>: doors have a golden frame. Tap one to choose where to go in (again to undo): the number above says how many chose it. The Master lets you in, one group at a time.</li>
            <li>Magnifier − / +: see more or less of the map.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Checks: 2 Fudge dice (2dF)</h2>
          <p>Each die has +, − and blank faces. Add up the + and −, then add your Class modifier for the stat being tested.</p>
          <table className="rules small">
            <tbody>
              <tr><th>+2 or more</th><td>Super effective! Succeeds with a bonus.</td></tr>
              <tr><th>+1</th><td>Success.</td></tr>
              <tr><th>0</th><td>Tie: the Master decides or you improvise.</td></tr>
              <tr><th>−1</th><td>Not very effective: it doesn't work.</td></tr>
              <tr><th>−2 or less</th><td>Critical failure, with consequences.</td></tr>
              <tr><th>two blanks</th><td>Success using Hidden Power only (always applies, whatever the modifier).</td></tr>
            </tbody>
          </table>
          <p className="small">A helping Pokémon adds a third die. Every digital roll reaches the whole table: a notification at the top and the history in «Dice».</p>
        </section>

        <section className="panel">
          <h2>Battles</h2>
          <ol className="steps">
            <li>Open Showdown from the <b>Battles</b> tab with «Open Showdown as …»: you join already named after your Trainer, and the phone remembers it until Showdown restarts.</li>
            <li>The Master picks who plays for the team. With <b>rotating control</b> each opposing Pokémon is faced by a different player.</li>
            <li>When the battle starts it opens by itself. The red banner at the top reopens it.</li>
          </ol>
          <p><b>HP between battles</b>: at the end of a battle HP and status conditions stay. A fainted Pokémon stays fainted and doesn't join the next battle until it's healed.
            In the Pokémon's card (Team, tap it) you can use items: «+ Heal» (Potion = 20 HP), «Revive», «Cure status», «Max HP».
            HP can't be changed by hand: damage and the Pokémon Center are up to the Master.</p>
          <p><b>Who to send in</b> (Battles tab): during a battle, for every Pokémon in the team, how suitable it is and how risky against the opponent on the field, computed from types only. It updates by itself at every switch.</p>
          <p className="small">In «Dice» the <b>type chart</b> links itself to the opponent on the field: for each of your Pokémon it shows the most effective move and how much it risks.</p>
        </section>

        <section className="panel">
          <h2>Pokémon growth</h2>
          <ul>
            <li>The Master gives <b>levels to distribute</b>: you spend them from the Pokémon's card with «+1 LV». The server counts given and spent: you can't spend more than you were given.</li>
            <li>The card shows the <b>growth</b>: +X for each stat compared to the previous level.</li>
            <li><b>Nickname</b>: change it from the Pokémon's card (empty = species name).</li>
            <li>«Change moves»: pick up to 4 moves among those learnt by level. If the Pokémon can evolve you see it after levelling up: tell the Master.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Catching</h2>
          <p>Roll d100 + modifiers: you need <b>90</b> (<b>99</b> for final evolutions and legendaries).</p>
          <table className="rules small">
            <tbody>
              <tr><th>Ball</th><td>Poké Ball +0 · Great Ball +10 · Ultra Ball +20</td></tr>
              <tr><th>Wild Pokémon's HP</th><td>full −10 · up to 75% +0 · up to 50% +10 · up to 25% +20</td></tr>
              <tr><th>Status</th><td>Sleep +15 · Paralysis / Freeze +10 · Poison / Burn +5 · Confusion +5 · Infatuation +5</td></tr>
              <tr><th>Level</th><td>your Pokémon on the field is higher +5, lower −5</td></tr>
              <tr><th>Class</th><td>your Class bonus against certain types</td></tr>
            </tbody>
          </table>
        </section>

        {gm && <section className="panel">
          <h2>For the Master</h2>
          <ul>
            <li><b>Map in play</b>: drag tokens, NPCs, items and markers to move them; a click without moving opens their menu (dialogue, challenge, hide, delete).</li>
            <li><b>Doors</b>: the bar above the map shows the queue of doors chosen by players, one group per door. «Let in» moves only that group and the map at the table becomes the destination; the other groups stay queued. With «Bring everyone» all Trainers go through instead, even those on other maps. The encounter zone in «Battle» follows the map at the table.</li>
            <li><b>Two texts per NPC</b> (map editor): «What it says to players» is read by them when they tap it; «Notes for the Master» only you see (⚠️ on the map, in the menu and on mouse hover).</li>
            <li><b>+ Token</b>: Pokémon, NPCs or traps, even invisible to players (you see them semi-transparent).</li>
            <li><b>Levels</b>: in «Team &amp; PC», row «Levels for players»: +1, +1d4, −1 (only those not yet spent).</li>
            <li><b>HP</b>: «Pokémon Center (heal all)» in «Team &amp; PC»; HP and status can also be changed from the Pokémon editor.</li>
          </ul>
        </section>}
      </div>
  );
}
