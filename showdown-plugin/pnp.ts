// Plugin per Pokémon Showdown: comandi "chat" aggiunti al server di lotta, usati solo dal bot della dashboard.
// Viene copiato in showdown/server/chat-plugins/ (da scripts/start.mjs o dal Dockerfile) e compilato con Showdown.
// Ogni comando riceve un JSON e controlla il segreto PNP_SECRET (variabile d'ambiente condivisa con la dashboard):
// senza segreto giusto nessuno, nemmeno un giocatore curioso, può creare o chiudere lotte.
// Le risposte tornano solo alla connessione del bot come righe "|pnpbattle|…", "|pnperror|…", ecc.
/**
 * Pokémon Pen & Paper: comando usato dalla dashboard per creare lotte
 * con squadre già pronte tra utenti collegati.
 *
 * /pnpbattle {"secret","format","p1","p2","team1","team2"}
 * team = squadra in formato packed. Risponde con |pnpbattle|<roomid> o |pnperror|<msg>.
 */
/** Showdown registra automaticamente i comandi esportati in `commands` (si usano come /nome in chat). */
export const commands: Chat.ChatCommands = {
	/**
	 * Crea la lotta: controlla segreto, utenti collegati e formato, poi apre la stanza con le squadre già pronte
	 * (nessun teambuilder, nessuna sfida da accettare).
	 */
	pnpbattle(target, room, user, connection) {
		// errori per la dashboard: "testo con {0}|valore", tradotti da lei (server/src/i18n.ts)
		const fail = (msg: string) => connection.send(`|pnperror|${msg}`);
		let data: {secret: string, format: string, p1: string, p2: string, team1: string, team2: string, title?: string,
			hp1?: {hp: number | null, status: string}[]};
		try {
			data = JSON.parse(target);
		} catch {
			return fail('JSON non valido');
		}
		if (!process.env.PNP_SECRET || data.secret !== process.env.PNP_SECRET) return fail('Segreto errato');
		const u1 = Users.get(data.p1);
		const u2 = Users.get(data.p2);
		if (!u1?.connected) return fail(`Utente non collegato: {0}|${data.p1}`);
		if (!u2?.connected) return fail(`Utente non collegato: {0}|${data.p2}`);
		const format = Dex.formats.get(data.format);
		if (!format.exists) return fail(`Formato sconosciuto: {0}|${data.format}`);
		let battle;
		try {
			battle = Rooms.createBattle({
				format: format.id,
				players: [{user: u1, team: data.team1}, {user: u2, team: data.team2}],
				rated: false,
				challengeType: 'challenge',
				title: data.title,
			});
		} catch (e: any) {
			return fail(e.message);
		}
		if (!battle) return fail('Lotta non creata');
		// PS e stato rimasti dalla lotta precedente: impostati nel simulatore. La riga ">>> codice" che eval scrive nel registro
		// viene tolta subito (log.pop) e la Promise che non si risolve evita la riga del risultato: i giocatori non vedono niente.
		if (data.hp1?.some(h => h.hp !== null || h.status)) {
			const code = `battle.log.pop(); ${JSON.stringify(data.hp1)}.forEach((h, i) => { const p = p1.pokemon[i]; if (!p) return; ` +
				`if (h.status) p.setStatus(h.status); if (h.hp !== null) p.sethp(h.hp); }); ` +
				`if (p1.active[0]) battle.add('-sethp', p1.active[0], p1.active[0].getHealth, '[silent]'); new Promise(() => {})`;
			void battle.battle?.stream.write(`>eval ${code}`);
		}
		connection.send(`|pnpbattle|${battle.roomid}`);
	},

	/** /pnpend {"secret","roomid","loser":"p1"|"p2"} chiude la lotta facendo ritirare un lato */
	pnpend(target, room, user, connection) {
		let data: {secret: string, roomid: string, loser: 'p1' | 'p2'};
		try {
			data = JSON.parse(target);
		} catch {
			return connection.send('|pnperror|JSON non valido');
		}
		if (!process.env.PNP_SECRET || data.secret !== process.env.PNP_SECRET) return connection.send('|pnperror|Segreto errato');
		const battle = Rooms.get(data.roomid)?.battle;
		if (!battle || battle.ended) return;
		const player = battle[data.loser === 'p1' ? 'p1' : 'p2'];
		battle.forfeit(player.id, ' ha terminato la lotta.');
	},

	/**
	 * /pnpcontrol {"secret","roomid","user"}: lotta con «comando a turno» (squadra condivisa): da questo turno la Squadra (p1)
	 * la comanda quell'utente (un altro giocatore collegato). Chi comandava prima perde i comandi, il nuovo li riceve subito.
	 */
	pnpcontrol(target, room, user, connection) {
		let data: {secret: string, roomid: string, user: string, msg?: string};
		try {
			data = JSON.parse(target);
		} catch {
			return connection.send('|pnperror|JSON non valido');
		}
		if (!process.env.PNP_SECRET || data.secret !== process.env.PNP_SECRET) return connection.send('|pnperror|Segreto errato');
		const battle = Rooms.get(data.roomid)?.battle;
		const u = Users.get(data.user);
		if (!battle || battle.ended || !battle.p1 || !u?.connected || u.id in battle.playerTable) return;
		const old = Users.getExact(battle.p1.id);
		battle.setPlayerUser(battle.p1, u);
		old?.sendTo(battle.roomid, '|request|null');
		if (!u.inRooms.has(battle.roomid)) u.joinRoom(battle.roomid);
		battle.p1.active = true;
		void battle.stream.write(`>player p1 ${JSON.stringify({name: u.name, avatar: u.avatar})}`);
		battle.room.add(`|player|p1|${u.name}|${u.avatar}|`).add(`|raw|<div class="broadcast-blue">🎮 ${(data.msg || '{name}').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`).replace('{name}', `<b>${u.name.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</b>`)}</div>`).update();
		battle.onConnect(u);
	},

	/** /pnpusers: utenti collegati (anche i Guest), per scegliere chi gioca */
	pnpusers(target, room, user, connection) {
		const list = [...Users.users.values()]
			.filter(u => u.connected && u.id !== user.id)
			.map(u => ({id: u.id, name: u.name, guest: !u.named}));
		connection.send(`|pnpusers|${JSON.stringify(list)}`);
	},

	/**
	 * /pnprename {"secret","from","to"}: dà un nome a un utente collegato saltando il login server,
	 * così nessuno deve registrarsi o inserire password (solo LAN).
	 */
	pnprename(target, room, user, connection) {
		let data: {secret: string, from: string, to: string};
		try {
			data = JSON.parse(target);
		} catch {
			return connection.send('|pnperror|JSON non valido');
		}
		if (!process.env.PNP_SECRET || data.secret !== process.env.PNP_SECRET) return connection.send('|pnperror|Segreto errato');
		const u = Users.get(data.from);
		const name = String(data.to || '').trim().slice(0, 18);
		if (!u?.connected) return connection.send(`|pnperror|Utente non collegato: {0}|${data.from}`);
		if (!toID(name)) return connection.send('|pnperror|Nome non valido');
		const other = Users.get(name);
		if (other && other !== u) {
			if (other.connected) {
				// nome già in uso da un altro dispositivo (es. giocatore a distanza): unisce questa connessione allo stesso utente,
				// come fa Showdown con chi apre un account in due schede; entrambi ricevono le richieste di lotta e possono scegliere
				other.merge(u);
				Users.merge(other, u);
				u.destroy();
				Rooms.global.rejoinGames(other);
				return connection.send(`|pnprenamed|${other.name}`);
			}
			other.resetName(); // libera il nome di una vecchia sessione scollegata
		}
		if (!u.forceRename(name, false, true)) return connection.send(`|pnperror|Impossibile rinominare in {0}|${name}`);
		connection.send(`|pnprenamed|${u.name}`);
	},

	/**
	 * Zaino in lotta. Uno dei due giocatori (Squadra = p1, Master = p2) preme «Zaino» nei comandi della lotta (vedi client.mjs): /pnpbag;
	 * sceglie strumento e Pokémon: /pnpuse <allenatore>|<strumento>|<n. del Pokémon nella squadra>[|<passo>]
	 * (Poké Ball: passo «who:<id>» = chi la lancia, «go:<id>» = lancio).
	 * I due comandi passano solo la richiesta al bot della dashboard, che conosce gli zaini (Allenatori per p1, Squadra PNG per p2):
	 * risponde con /pnpbagshow (l'elenco, visibile solo a chi l'ha chiesto) o con /pnpitem (applica lo strumento, firmato col segreto).
	 */
	pnpbag(target, room, user) {
		const battle = room?.battle;
		if (!battle || battle.ended) return this.errorReply('The bag can only be used in an ongoing battle.');
		const side = battle.p1?.id === user.id ? 'p1' : battle.p2?.id === user.id ? 'p2' : '';
		if (!side) return this.errorReply('Only the two players of the battle can use the bag.');
		Users.get(process.env.PNP_BOT || 'Arbitro')?.send(`|pnpbagreq|${JSON.stringify({roomid: room.roomid, user: user.id, side})}`);
	},
	pnpuse(target, room, user) {
		const battle = room?.battle;
		if (!battle || battle.ended) return this.errorReply('The bag can only be used in an ongoing battle.');
		const side = battle.p1?.id === user.id ? 'p1' : battle.p2?.id === user.id ? 'p2' : '';
		if (!side) return this.errorReply('Only the two players of the battle can use the bag.');
		const [trainerId, item, idx, step] = target.split('|');
		Users.get(process.env.PNP_BOT || 'Arbitro')?.send(`|pnpusereq|${JSON.stringify({roomid: room.roomid, user: user.id, side, trainerId, item, idx: +idx, step})}`);
	},
	/** /pnpbagshow {"secret","roomid","user","html"}: mostra (o aggiorna) il riquadro dello zaino solo a quel giocatore */
	pnpbagshow(target, room, user, connection) {
		let data: {secret: string, roomid: string, user: string, html: string};
		try {
			data = JSON.parse(target);
		} catch {
			return connection.send('|pnperror|JSON non valido');
		}
		if (!process.env.PNP_SECRET || data.secret !== process.env.PNP_SECRET) return connection.send('|pnperror|Segreto errato');
		Users.get(data.user)?.sendTo(data.roomid as RoomID, `|uhtml|pnpbag|${data.html}`);
	},
	/**
	 * /pnpitem {"secret","roomid","side","idx","label","who","effect"}: il lato side (p1/p2) usa uno strumento sul suo Pokémon n. idx
	 * (effetti in server/src/items.ts). Come nei giochi l'uso occupa il turno: la scelta di quel lato diventa "passa".
	 * Nel registro della lotta compare «🎒 … usa …» (o «🚫 …» se non avrebbe effetto): il bot lo legge per togliere lo strumento dallo zaino.
	 * Poké Ball (effect.ball): mostra l'esito già calcolato dalla dashboard; se catturato vince la Squadra e la lotta finisce.
	 */
	pnpitem(target, room, user, connection) {
		let data: {secret: string, roomid: string, side: 'p1' | 'p2', idx: number, label: string, who: string, effect: any, txt: Record<string, string>};
		try {
			data = JSON.parse(target);
		} catch {
			return connection.send('|pnperror|JSON non valido');
		}
		if (!process.env.PNP_SECRET || data.secret !== process.env.PNP_SECRET) return connection.send('|pnperror|Segreto errato');
		const battle = Rooms.get(data.roomid)?.battle;
		if (!battle || battle.ended) return;
		const side = data.side === 'p2' ? 'p2' : 'p1', player = battle[side];
		if (player) Users.get(player.id)?.sendTo(data.roomid as RoomID, '|uhtmlchange|pnpbag|');
		const {idx, label, who, effect, txt} = data;
		// codice eseguito nel simulatore (come per i PS in /pnpbattle: la riga ">>> codice" si toglie e la Promise non si risolve).
		// Va su una riga sola: dentro niente commenti «//», che si mangerebbero il resto (solo /* … */)
		const code = `battle.log.pop(); (() => {
			const d = ${JSON.stringify({idx, label, who, effect, txt})}, e = d.effect, s = ${side};
			const T = (k, v) => (d.txt[k] || k).replace(/[{](\\w+)[}]/g, (m, x) => v && x in v ? v[x] : m);
			const no = why => { battle.add('message', '🚫 ' + d.label + ': ' + why); battle.sendUpdates(); };
			if (s.requestState !== 'move') return no(T('si usa quando bisogna scegliere la mossa'));
			if (s.activeRequest && s.activeRequest.wait) return no(T('in questo turno è già stato usato uno strumento'));
			const pass = () => {
				s.clearChoice(); s.choice.actions.push({choice: 'pass'}); s.choice.cantUndo = true;
				if (battle.allChoicesDone()) battle.commitChoices(); else s.emitRequest({wait: true, side: s.getRequestData()});
			};
			if (e.ball) {
				/* Poké Ball: l'esito l'ha già calcolato la dashboard (e.caught, e.text); se preso la lotta finisce qui */
				battle.add('message', '🎒 ' + T('{who} lancia {item}!', {who: d.who, item: d.label}));
				battle.add('message', e.text);
				if (e.caught) battle.win(s); else pass();
				return battle.sendUpdates();
			}
			const t = s.pokemon.find(p => p.set === s.team[d.idx]);
			if (!t) return no(T('Pokémon non trovato'));
			if (e.revive ? !t.fainted : t.fainted) return no(T(t.fainted ? '{name} è esausto' : '{name} non è esausto', {name: t.name}));
			if ((e.boost || e.volatile) && !t.isActive) return no(T('{name} non è in campo', {name: t.name}));
			const heals = e.heal !== undefined && t.hp < t.maxhp, st = t.status;
			const cures = !!(e.cure && st && (e.cure === 'all' || e.cure.includes(st)));
			if (!e.revive && !heals && !cures && !e.boost && !e.volatile) return no(T('su {name} non avrebbe effetto', {name: t.name}));
			battle.add('message', '🎒 ' + T('{who} usa {item} su {name}!', {who: d.who, item: d.label, name: t.name}));
			if (e.revive) {
				s.pokemonLeft++; t.fainted = false; t.faintQueued = false; t.subFainted = false; t.status = '';
				t.hp = 1; t.sethp(Math.max(1, Math.floor(t.maxhp * e.revive)));
				battle.add('-heal', t, t.getHealth, '[silent]');
			}
			if (heals) { t.sethp(e.heal ? Math.min(t.maxhp, t.hp + e.heal) : t.maxhp); battle.add('-heal', t, t.getHealth, '[silent]'); }
			if (cures) t.cureStatus();
			for (const [stat, n] of Object.entries(e.boost || {})) { const got = t.boostBy({[stat]: n}); if (got) battle.add('-boost', t, stat, got); }
			if (e.volatile) t.addVolatile(e.volatile);
			pass();
			battle.sendUpdates();
		})(); new Promise(() => {})`;
		void battle.stream.write(`>eval ${code.replace(/\n/g, ' ')}`);
	},

	/**
	 * /pnpshutdown {"secret"}: spegne Showdown (la dashboard lo chiede quando il master ha chiuso tutte le sue schede).
	 * Uscita pulita (codice 0): con restart: on-failure il container si ferma invece di ripartire.
	 */
	pnpshutdown(target, room, user, connection) {
		let data: {secret: string};
		try {
			data = JSON.parse(target);
		} catch {
			return connection.send('|pnperror|JSON non valido');
		}
		if (!process.env.PNP_SECRET || data.secret !== process.env.PNP_SECRET) return connection.send('|pnperror|Segreto errato');
		console.log('Spegnimento richiesto dalla dashboard');
		setTimeout(() => process.exit(0), 200);
	},
};
