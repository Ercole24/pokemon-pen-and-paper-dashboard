
// --- Pokémon Pen & Paper: server locale in LAN ---
exports.port = 8000;
exports.bindaddress = '0.0.0.0';
exports.noguestsecurity = true; // nomi liberi senza login server (solo LAN!)
exports.nothrottle = true;
exports.noipchecks = true;
exports.repl = false;
exports.backdoor = false;
exports.subprocesses = {network: 0, simulator: 1, validator: 1, verifier: 0};
