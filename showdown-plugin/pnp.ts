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
