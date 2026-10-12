
// --- Pokémon Pen & Paper: server locale in LAN ---
exports.port = 8000;
exports.bindaddress = '0.0.0.0';
exports.noguestsecurity = true; // nomi liberi senza login server (solo LAN!)
exports.nothrottle = true;
exports.noipchecks = true;
exports.repl = false;
exports.backdoor = false;
exports.subprocesses = {network: 0, simulator: 1, validator: 1, verifier: 0};
// link alle stanze con parametri (…/battle-x?pnpname=Nome): Showdown riconosce la stanza solo senza «?…», si toglie qui
// (la pagina li legge comunque da location.search)
exports.customhttpresponse = (req) => {
	const m = /^(\/[A-Za-z0-9][A-Za-z0-9-]*\/?)\?/.exec(req.url || '');
	if (m) req.url = m[1];
	return false;
};
