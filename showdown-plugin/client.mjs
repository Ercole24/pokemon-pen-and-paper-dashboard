// Pagina del client di Showdown servita dal nostro server (porta 8000), compilata dal repo pokemon-showdown-client.
// Perché: Chrome blocca i siti pubblici (psim.us) che si collegano a un indirizzo della LAN
// ("Couldn't connect to server!"); se la pagina arriva dal PC stesso, la connessione è consentita.
// JS e dati sono serviti dal PC; immagini (sprite, effetti, sfondi) e audio arrivano da play.pokemonshowdown.com.
// Prende la pagina generata dal build del client (caches/index-old.html) e la modifica così:
// 0. indirizzi "//pnp-host/..." (routes.json del build) -> percorsi relativi; niente referrer;
// 1. dopo config.js: modalità testclient (niente iframe verso play.pokemonshowdown.com), server = questo PC;
// 2. dopo battledata.js: risorse e audio da play.pokemonshowdown.com;
// 3. dopo client.js: niente login server (nomi liberi grazie a noguestsecurity), quindi
//    nessun popup e "Choose name" rinomina direttamente con /trn; il nome resta finché la scheda è aperta;
//    con ?pnpname=Nome nell'indirizzo (link dalla pagina del giocatore) il nome è già quello;
// 4. dopo client-mainmenu.js: niente news (le scaricherebbe da pokemonshowdown.com);
// 5. dopo client-battle.js: pulsante «Zaino» (Bag) per usare gli strumenti in lotta.
// Corregge anche i CSS in <cartella>/style (effetti fx/ da play.pokemonshowdown.com).
// Uso: node client.mjs <index-old.html del build> <cartella servita>   (es. server/static di Showdown)
import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';

const [source, dir] = process.argv.slice(2);
// indirizzo delle immagini e dell'audio: scelto nel launcher (PNP_ASSETS), di base il sito di Showdown
const PS = (process.env.PNP_ASSETS || 'https://play.pokemonshowdown.com/').replace(/\/?$/, '/');
// dimensioni degli sprite animati (solo numeri): il build del client le genera solo avendo gli sprite, la pagina le carica sempre
mkdirSync(`${dir}/data`, {recursive: true});
for (const file of ['data/pokedex-mini.js', 'data/pokedex-mini-bw.js']) {
  const res = await fetch(PS + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  // la pagina lo esegue: da un indirizzo scelto a mano accetta solo dati (oggetto di nomi e numeri, nessuna chiamata)
  const text = await res.text();
  if (!/^\/\*[^*]*\*\/\s*exports\.BattlePokemonSprites(BW)? = \{[\w\s{}:,."\-[\]]*\};?\s*$/.test(text)) throw new Error(`${PS}${file}: non sono i dati attesi`);
  writeFileSync(`${dir}/${file}`, text);
}
// effetti (fx/) tolti dall'immagine: nei CSS puntano al sito di Showdown come già fanno gli sprite
for (const css of readdirSync(`${dir}/style`).filter(f => f.endsWith('.css'))) {
  const file = `${dir}/style/${css}`;
  writeFileSync(file, readFileSync(file, 'utf8').replace(/url\((['"]?)\.\.\/fx\//g, `url($1${PS}fx/`));
}

const after = (page, file, code) => {
  const re = new RegExp(`(<script src="[^"]*/${file}[^"]*"></script>)`);
  if (!re.test(page)) throw new Error(`${file} non trovato nella pagina di Showdown: il client è cambiato?`);
  return page.replace(re, m => `${m}\n${code}`); // funzione: niente sostituzioni «$» dentro il codice
};

let page = readFileSync(source, 'utf8')
  .replaceAll('//pnp-host/', '/')
  .replaceAll('//play.pokemonshowdown.com/', '/')
  .replace(/<script src="[^"]*clean-cookies\.php[^"]*"[^>]*><\/script>/, '') // PHP del sito ufficiale: qui servirebbe il sorgente
  .replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n<meta name="referrer" content="no-referrer" />');
page = after(page, 'config/config\\.js', '<script>' + [
  'Config.testclient = true;',
  'Config.server = {id: "pnp", host: location.hostname, port: 8000, httpport: 8000, registered: false};',
  'Config.routes.client = location.host;',
].join('\n') + '</script>');
page = after(page, 'js/battledata\\.js', '<script>' + [
  // sprite, effetti, sfondi e audio da play.pokemonshowdown.com (non sono nel repo né nell'immagine)
  `Dex.resourcePrefix = "${PS}"; Dex.fxPrefix = "${PS}fx/";`,
  'BattleSound.getSound = function (url) {',
  '  if (!this.soundCache[url]) { var s = document.createElement("audio"); s.src = Dex.resourcePrefix + url; s.volume = this.effectVolume / 100; this.soundCache[url] = s; }',
  '  return this.soundCache[url];',
  '};',
].join('\n') + '</script>');
page = after(page, 'oldclient/client\\.js', '<script>' + [
  // link dalla pagina del giocatore (…?pnpname=Nome): la scheda prende subito il nome del suo Allenatore, senza Guest da rinominare
  'try { var pnpQ = new URLSearchParams(location.search).get("pnpname"); if (pnpQ) sessionStorage.setItem("pnpName", pnpQ.replace(/[|,;]+/g, "").slice(0, 18)); } catch (e) {}',
  // la modalità testclient sostituisce $.get/$.post con popup manuali: rimettiamo quelli normali
  '(function (get, post) { Storage.whenAppLoaded(function () { $.get = get; $.post = post; }); })($.get, $.post);',
  // nome tenuto per tutta la vita della scheda (sessionStorage): a ogni nuova connessione (ricarica, telefono che ha chiuso
  // il socket in background) si riprende lo stesso utente; Showdown unisce la vecchia sessione scollegata (stesso IP)
  'Storage.whenAppLoaded(function () { app.user.on("change:name", function (u, n) { try { sessionStorage.setItem("pnpName", n); } catch (e) {} }); });',
  'User.prototype.receiveChallstr = function (c) {',
  '  this.challstr = c; this.loaded = true; app.topbar.updateUserbar();',
  '  var n; try { n = sessionStorage.getItem("pnpName"); } catch (e) {}',
  '  if (n) { app.pnpReclaim = {name: n, tries: 0}; app.send("/trn " + n); }',
  '};',
  // la vecchia connessione può risultare ancora aperta per qualche secondo: "nome in uso" -> si riprova, senza popup
  '(function (receive) { App.prototype.receive = function (data) {',
  '  var r = app.pnpReclaim;',
  '  if (r && data.indexOf("|nametaken|") === 0) {',
  '    if (++r.tries <= 10) { setTimeout(function () { app.send("/trn " + r.name); }, 3000); return; }',
  '    app.pnpReclaim = null;',
  '  } else if (r && data.indexOf("|updateuser|") === 0) app.pnpReclaim = null;',
  '  return receive.apply(this, arguments);',
  '}; })(App.prototype.receive);',
  'User.prototype.rename = function (name) { app.send("/trn " + name.replace(/[|,;]+/g, "")); };',
].join('\n') + '</script>');
// Zaino: pulsante nei comandi della lotta, per i due giocatori (Squadra e Master) quando devono scegliere la mossa.
// Manda /pnpbag (showdown-plugin/pnp.ts): l'elenco degli strumenti arriva nel registro della lotta, visibile solo a chi l'ha chiesto.
page = after(page, 'oldclient/client-battle\\.js', '<script>' + [
  '(function (update) { BattleRoom.prototype.updateMoveControls = function (type) {',
  '  update.apply(this, arguments);',
  '  if (type === "movetarget") return;',
  '  this.$controls.find(".controls").append(\'<div class="pnpbag" style="clear:both;padding-top:6px"><button class="button" name="pnpBag">🎒 Bag</button></div>\');',
  '}; })(BattleRoom.prototype.updateMoveControls);',
  'BattleRoom.prototype.pnpBag = function () { this.send("/pnpbag"); };',
].join('\n') + '</script>');
page = after(page, 'oldclient/client-mainmenu\\.js', '<script>MainMenuRoom.prototype.addNews = function () {};</script>');

// controllo finale: nessun tracker e nessuna risorsa caricata da fuori (i semplici link cliccabili vanno bene)
const leak = /google-analytics|googletag|doubleclick|vntsm|ccgateway|(?:src|srcset)="(?:https?:)?\/\/[^"]*|<link[^>]*href="(?:https?:)?\/\/[^"]*/.exec(page);
if (leak) throw new Error(`la pagina di Showdown carica ancora qualcosa da fuori (${leak[0]}): il client è cambiato?`);
writeFileSync(`${dir}/index.html`, page);
