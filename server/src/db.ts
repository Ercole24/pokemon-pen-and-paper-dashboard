// Archivio dei dati: un database SQLite (modulo node:sqlite, incluso in Node 22) usato come "archivio di documenti JSON".
// Tutto (allenatori, Pokémon, zone, mappe, squadre PNG, campagne…) sta in UNA tabella `docs`:
//   id        identificativo univoco (UUID)
//   campaign  campagna a cui appartiene ('_' per le campagne stesse)
//   kind      tipo di documento: 'trainer', 'mon', 'zone', 'map', 'tileset', 'npcteam', 'log', 'note', 'track', 'campaign'
//   data      il documento intero in JSON
//   updated   ultimo salvataggio (ms), usato per l'ordine
// Così aggiungere un nuovo tipo di dato non richiede di cambiare lo schema del database.
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

/** Crea la cartella data/ se manca e apre (o crea) il file data/pnp.db. */
mkdirSync(new URL('../../data', import.meta.url), {recursive: true});
const db = new DatabaseSync(new URL('../../data/pnp.db', import.meta.url).pathname);
/** Schema: la tabella e un indice per cercare velocemente per campagna + tipo. */
db.exec(`CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY, campaign TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS docs_ck ON docs(campaign, kind);`);

/** Un documento: ha sempre un id, il resto dei campi dipende dal tipo. */
export type Doc = {id: string, [k: string]: any};

/** Tutti i documenti di un tipo in una campagna, dal meno al più recente. */
export function list(campaign: string, kind: string): Doc[] {
  return db.prepare('SELECT id, data FROM docs WHERE campaign = ? AND kind = ? ORDER BY updated')
    .all(campaign, kind).map((r: any) => ({...JSON.parse(r.data), id: r.id}));
}

/** Un documento per id (qualsiasi tipo), o undefined se non esiste. */
export function get(id: string): Doc | undefined {
  const r: any = db.prepare('SELECT id, data FROM docs WHERE id = ?').get(id);
  return r && {...JSON.parse(r.data), id: r.id};
}

/**
 * Salva un documento: se non ha id ne crea uno nuovo, altrimenti sovrascrive quello esistente ("upsert").
 * Restituisce il documento salvato, con l'id.
 */
export function put(campaign: string, kind: string, doc: Partial<Doc>): Doc {
  const id = doc.id || randomUUID();
  const data = {...doc, id};
  db.prepare(`INSERT INTO docs (id, campaign, kind, data, updated) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated`)
    .run(id, campaign, kind, JSON.stringify(data), Date.now());
  return data as Doc;
}

/** Cancella un documento. */
export function remove(id: string) {
  db.prepare('DELETE FROM docs WHERE id = ?').run(id);
}

/** Cancella una campagna e tutti i suoi documenti. */
export function removeCampaign(campaign: string) {
  db.prepare('DELETE FROM docs WHERE campaign = ? OR id = ?').run(campaign, campaign);
}
