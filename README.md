# Pokémon Pen & Paper Dashboard

**[English](#english) · [Italiano](#italiano)**

> Unofficial fan project. Pokémon belongs to Nintendo, The Pokémon Company, Game Freak and Creatures Inc.
> See the [legal notice](#legal-notice). · Progetto di fan non ufficiale: vedi le [note legali](#note-legali).

**Thank you, Sage G.C.!** This dashboard exists because of **[Pokémon Pen & Paper Version](https://sagegc.itch.io/pkmn)**,
the tabletop RPG created by Sage G.C.: rules and rulebook are on the [official page](https://sagegc.itch.io/pkmn).
This is an independent project, not affiliated with or endorsed by the author.
· **Grazie, Sage G.C.!** Questa dashboard esiste grazie al suo gioco di ruolo
[Pokémon Pen & Paper Version](https://sagegc.itch.io/pkmn): regole e manuale sono sulla [pagina ufficiale](https://sagegc.itch.io/pkmn).
È un progetto indipendente, non affiliato né approvato dall'autore.

---

## English

**Contents**
- [What it is](#what-it-is)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Playing](#playing)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Report a bug](#report-a-bug)
- [Official game and support](#official-game-and-support)
- [Legal notice](#legal-notice)
- [License](#license)
- [Credits](#credits)

### What it is
A dashboard for playing the tabletop RPG **[Pokémon Pen & Paper Version](https://sagegc.itch.io/pkmn)** at home.
The Game Master runs the campaign from a computer; players follow along on their phones, connected to the same Wi-Fi.
Battles are played on a private Pokémon Showdown server that starts together with the dashboard.

It is a tool to play the game: you still need the official rulebook (see [Official game and support](#official-game-and-support)).

### Features
- **Campaigns** by region and generation: Pokédex, moves, abilities and battle rules of the chosen generation.
- **Trainers** with the rulebook's classes, stats and dice checks.
- **Team and Bill's PC**: full Pokémon editor (nature, IVs/EVs, ability, moves, evolutions).
- **Encounter zones** with species, rates and levels; wild Pokémon generated automatically.
- **One-click battles** on Showdown with the teams already loaded; wild Pokémon can act on their own.
- **Catching** with the rulebook's table, using HP and status from the battle in progress.
- **Map editor** (your own PNG tilesets, Tiled import/export) and a **shared map** with live tokens.
- **Dice**, **story generators**, **campaign journal**, **gym badges**, **music player**.
- English and Italian, switchable from the flag menu at the top right.

### Requirements
- A computer with **Windows 10/11 (64-bit)**, **macOS** or **Linux (64-bit)**, at least 8 GB of RAM recommended
  and a few GB of free disk space.
- An **internet connection**: Pokémon images, sounds and badges are loaded online while playing.
- Phones or tablets with a modern browser, on the **same Wi-Fi** as the computer.

Docker and Node.js are needed too: the installer installs them if they are missing.

### Installation
Download the installer from the **[latest release](https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/releases/latest)**:

| System | File | How |
|---|---|---|
| Windows | `pnp-dashboard-setup.exe` | Double-click and follow the steps. |
| macOS | `install-mac.command` | The first time: right-click > Open. |
| Linux | `install.sh` | `bash install.sh`, or the command below. |

Linux, in one line:
```
curl -fsSL https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/releases/latest/download/install.sh | bash
```

The installer asks for the language (English or Italian), installs Docker and Node.js if needed, downloads the dashboard and creates its icon
(on the desktop too, if you want). On Windows, if Docker Desktop was just installed, restart the computer and open
Docker Desktop once before the first game.

### Playing
1. Open **Pokémon Pen & Paper** from its icon.
2. In the window, choose the browser and what to do when you close the dashboard, then press **Play**.
   The first time it takes a few minutes.
3. The dashboard opens on your computer. The window shows the address for the phones (e.g. `http://192.168.1.20:3000`):
   players open it on their phones and pick their Trainer.

If Pokémon images and sounds cannot be reached, the window says so and lets you enter another address
or continue anyway.

### Updating
When a new version is out, the start window shows **Update now**. Your campaigns and settings are kept.

### Uninstalling
- **Windows**: Settings > Apps, or "Uninstall Pokémon Pen & Paper" in the Start menu.
- **Linux**: "Uninstall Pokémon Pen & Paper" in the applications menu.
- **macOS**: run `installer/uninstall.sh` in `~/Library/Application Support/pnp-dashboard`.

You are asked whether to keep your campaigns.

### Report a bug
Use **Report a bug** in the dashboard or in the start window, or open the
**[bug report form](https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/issues/new?template=bug_report.yml)**
(a free GitHub account is needed).

### Official game and support
**Pokémon Pen & Paper Version** is made by **Sage G.C.**, not by this project: rulebook, rules and updates are on its
official page, **[sagegc.itch.io/pkmn](https://sagegc.itch.io/pkmn)**. If you enjoy it, support them there.
A big thank you to Sage G.C. for creating the game and sharing it: this project would not exist without it.

### Legal notice
Pokémon and all related names, characters, images, sounds and trademarks are the property of **Nintendo**,
**The Pokémon Company**, **Game Freak** and **Creatures Inc.**

This is an **unofficial, free, non-commercial fan project**. It is not affiliated with, sponsored or endorsed by
Nintendo, The Pokémon Company, Game Freak, Creatures Inc., Smogon / Pokémon Showdown or the authors of
Pokémon Pen & Paper Version (Sage G.C.). No copyright or trademark infringement is intended.

This repository contains **no images, audio or other files from the games**: they are loaded while playing from
Pokémon Showdown and PokeAPI. The rules, classes, tables and story prompts come from Pokémon Pen & Paper Version
and belong to its author, Sage G.C.

Do not sell this project or use it for commercial purposes. If you are a rights holder and want something changed
or removed, please [open an issue](https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/issues).

### License
The code of this project is released under the **[Apache License 2.0](LICENSE)**: you can use, modify and share it
for free, but you must **keep the [NOTICE](NOTICE) file and credit Ercole24 as the creator of the original code**.

The license covers only the original code of this project. It grants no rights over Pokémon or over
Pokémon Pen & Paper Version.

### Credits
- Original code: **[Ercole24](https://github.com/Ercole24)**.
- Game: **[Pokémon Pen & Paper Version](https://sagegc.itch.io/pkmn)** by Sage G.C.
- Pokémon: © Nintendo, The Pokémon Company, Game Freak, Creatures Inc.
- **[Pokémon Showdown](https://github.com/smogon/pokemon-showdown)** (Smogon, MIT License): battle server and Pokémon data.
- **[Pokémon Showdown client](https://github.com/smogon/pokemon-showdown-client)** (Smogon, AGPL-3.0): battle page,
  built from source and modified by this project (the changes are in this repository).
- **[play.pokemonshowdown.com](https://play.pokemonshowdown.com)**: sprites, effects, music and cries, loaded while playing.
- **[PokeAPI/sprites](https://github.com/PokeAPI/sprites)**: gym badge images, loaded while playing.
- Fonts: Atkinson Hyperlegible (Braille Institute) and Press Start 2P (CodeMan38), SIL Open Font License.

Full details: [NOTICE](NOTICE). For developers: [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Italiano

**Indice**
- [A cosa serve](#a-cosa-serve)
- [Funzioni](#funzioni)
- [Requisiti](#requisiti)
- [Installazione](#installazione)
- [Giocare](#giocare)
- [Aggiornare](#aggiornare)
- [Disinstallare](#disinstallare)
- [Segnalare un bug](#segnalare-un-bug)
- [Gioco ufficiale e sostegno](#gioco-ufficiale-e-sostegno)
- [Note legali](#note-legali)
- [Licenza](#licenza)
- [Riconoscimenti](#riconoscimenti)

### A cosa serve
Una dashboard per giocare a casa al gioco di ruolo **[Pokémon Pen & Paper Version](https://sagegc.itch.io/pkmn)**.
Il Master gestisce la campagna dal computer; i giocatori la seguono dal telefono, collegati alla stessa Wi-Fi.
Le lotte si giocano su un server Pokémon Showdown privato che parte insieme alla dashboard.

È uno strumento per giocare: serve comunque il manuale ufficiale (vedi [Gioco ufficiale e sostegno](#gioco-ufficiale-e-sostegno)).

### Funzioni
- **Campagne** per regione e generazione: Pokédex, mosse, abilità e regole di lotta della generazione scelta.
- **Allenatori** con le classi, le statistiche e le prove del manuale.
- **Squadra e PC di Bill**: editor completo dei Pokémon (natura, IV/EV, abilità, mosse, evoluzioni).
- **Zone di incontro** con specie, probabilità e livelli; Pokémon selvatici generati in automatico.
- **Lotte con un clic** su Showdown con le squadre già pronte; i selvatici possono muoversi da soli.
- **Cattura** con la tabella del manuale, usando PS e stato della lotta in corso.
- **Editor di mappe** (tileset PNG tuoi, import/export Tiled) e **mappa al tavolo** con segnalini in tempo reale.
- **Dadi**, **generatori di storie**, **diario della campagna**, **medaglie**, **lettore musicale**.
- Inglese e italiano, si cambia dal menu con le bandiere in alto a destra.

### Requisiti
- Un computer con **Windows 10/11 (64 bit)**, **macOS** o **Linux (64 bit)**, consigliati almeno 8 GB di RAM
  e qualche GB di spazio libero.
- Una **connessione a internet**: immagini, suoni e medaglie dei Pokémon si caricano online durante il gioco.
- Telefoni o tablet con un browser recente, sulla **stessa Wi-Fi** del computer.

Servono anche Docker e Node.js: se mancano li installa l'installer.

### Installazione
Scarica l'installer dall'**[ultima release](https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/releases/latest)**:

| Sistema | File | Come |
|---|---|---|
| Windows | `pnp-dashboard-setup.exe` | Doppio clic e segui i passaggi. |
| macOS | `install-mac.command` | La prima volta: tasto destro > Apri. |
| Linux | `install.sh` | `bash install.sh`, oppure il comando qui sotto. |

Linux, in una riga:
```
curl -fsSL https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/releases/latest/download/install.sh | bash
```

L'installer chiede la lingua (inglese o italiano), installa Docker e Node.js se servono, scarica la dashboard e crea l'icona (anche sul desktop, se vuoi).
Su Windows, se Docker Desktop è appena stato installato, riavvia il computer e apri Docker Desktop una volta
prima della prima partita.

### Giocare
1. Apri **Pokémon Pen & Paper** dall'icona.
2. Nella finestra scegli il browser e cosa fare quando chiudi la dashboard, poi premi **Gioca**.
   La prima volta ci vuole qualche minuto.
3. La dashboard si apre sul computer. La finestra mostra l'indirizzo per i telefoni (es. `http://192.168.1.20:3000`):
   i giocatori lo aprono dal telefono e scelgono il loro Allenatore.

Se immagini e suoni dei Pokémon non sono raggiungibili, la finestra lo dice e permette di scrivere un altro indirizzo
o di continuare comunque.

### Aggiornare
Quando esce una versione nuova, la finestra di avvio mostra **Aggiorna ora**. Campagne e impostazioni restano.

### Disinstallare
- **Windows**: Impostazioni > App, oppure "Disinstalla Pokémon Pen & Paper" nel menu Start.
- **Linux**: "Disinstalla Pokémon Pen & Paper" nel menu delle applicazioni.
- **macOS**: lancia `installer/uninstall.sh` in `~/Library/Application Support/pnp-dashboard`.

Ti chiede se tenere le campagne.

### Segnalare un bug
Usa **Segnala un bug** nella dashboard o nella finestra di avvio, oppure apri il
**[modulo per i bug](https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/issues/new?template=bug_report.yml)**
(serve un account GitHub gratuito).

### Gioco ufficiale e sostegno
**Pokémon Pen & Paper Version** è opera di **Sage G.C.**, non di questo progetto: manuale, regole e aggiornamenti
sono sulla sua pagina ufficiale, **[sagegc.itch.io/pkmn](https://sagegc.itch.io/pkmn)**. Se ti piace, sostienili lì.
Un grande grazie a Sage G.C. per aver creato il gioco e averlo condiviso: senza, questo progetto non esisterebbe.

### Note legali
Pokémon e tutti i nomi, personaggi, immagini, suoni e marchi collegati sono di proprietà di **Nintendo**,
**The Pokémon Company**, **Game Freak** e **Creatures Inc.**

Questo è un **progetto di fan non ufficiale, gratuito e senza scopo di lucro**. Non è affiliato, sponsorizzato né
approvato da Nintendo, The Pokémon Company, Game Freak, Creatures Inc., Smogon / Pokémon Showdown o dagli autori
di Pokémon Pen & Paper Version. Non c'è alcuna intenzione di violare diritti d'autore o marchi.

Il repository **non contiene immagini, audio o altri file dei giochi**: si caricano durante il gioco da
Pokémon Showdown e PokeAPI. Regole, classi, tabelle e spunti per le storie vengono da Pokémon Pen & Paper Version
e appartengono al suo autore, Sage G.C.

Non vendere questo progetto e non usarlo a scopo commerciale. Se sei titolare di diritti e vuoi che qualcosa venga
modificato o rimosso, [apri una segnalazione](https://github.com/Ercole24/pokemon-pen-and-paper-dashboard/issues).

### Licenza
Il codice di questo progetto è rilasciato con la **[Apache License 2.0](LICENSE)**: puoi usarlo, modificarlo e
condividerlo gratuitamente, ma devi **mantenere il file [NOTICE](NOTICE) e citare Ercole24 come creatore del codice
originale**.

La licenza riguarda solo il codice originale di questo progetto. Non dà alcun diritto sui Pokémon né su
Pokémon Pen & Paper Version.

### Riconoscimenti
- Codice originale: **[Ercole24](https://github.com/Ercole24)**.
- Gioco: **[Pokémon Pen & Paper Version](https://sagegc.itch.io/pkmn)** di Sage G.C.
- Pokémon: © Nintendo, The Pokémon Company, Game Freak, Creatures Inc.
- **[Pokémon Showdown](https://github.com/smogon/pokemon-showdown)** (Smogon, licenza MIT): server di lotta e dati dei Pokémon.
- **[Client di Pokémon Showdown](https://github.com/smogon/pokemon-showdown-client)** (Smogon, AGPL-3.0): pagina delle lotte,
  compilata dai sorgenti e modificata da questo progetto (le modifiche sono in questo repository).
- **[play.pokemonshowdown.com](https://play.pokemonshowdown.com)**: sprite, effetti, musica e versi, caricati durante il gioco.
- **[PokeAPI/sprites](https://github.com/PokeAPI/sprites)**: immagini delle medaglie, caricate durante il gioco.
- Caratteri: Atkinson Hyperlegible (Braille Institute) e Press Start 2P (CodeMan38), SIL Open Font License.

Dettagli completi: [NOTICE](NOTICE). Per chi sviluppa: [DEVELOPMENT.md](DEVELOPMENT.md).
