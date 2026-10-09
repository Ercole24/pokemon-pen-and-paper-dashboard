// Pagina Mappe (/c/<id>/mappe): elenco delle mappe della campagna per gruppo, con ricerca, e modi per crearne:
// - nuova mappa vuota;
// - da un'immagine già disegnata, da un file Tiled (.tmj) o da un file esportato da un'altra campagna (.pnpmap.json);
// - caricamento di tileset propri.
// Da qui si apre l'editor o la mappa di gioco, e si sceglie la mappa "attiva" che vedono i telefoni.
import {useMemo, useRef, useState} from 'react';
import {exportMap, importPnpMap, isPnpMap, NewMapDialog} from '../mapfiles';
import {Download, Trash2} from 'lucide-react';
import {Link, useNavigate} from 'react-router-dom';
import {useStore, type MapDoc, type Tileset} from '../api';
import {addTilesetToMap, importTmj, newMap} from '../mapcore';
import {t} from '../i18n';

/** La pagina. */
export default function Maps() {
  const {map, tileset, save, remove, campaign, updateCampaign} = useStore();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const tmjRef = useRef<HTMLInputElement>(null);
  const imgMapRef = useRef<HTMLInputElement>(null);
  const [tileSize, setTileSize] = useState(16);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const groups = useMemo(() => {
    const by = new Map<string, MapDoc[]>();
    for (const m of map.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'it', {numeric: true}))) {
      const g = m.group || t('Mappe create da te');
      if (!by.has(g)) by.set(g, []);
      by.get(g)!.push(m);
    }
    return [...by.entries()];
  }, [map, q]);

  /** Carica immagini come tileset (divise in tile della dimensione scelta). */
  async function uploadTilesets(files: FileList | null) {
    for (const f of Array.from(files || [])) {
      const dataUrl = await new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f); });
      const img = new Image();
      await new Promise(r => { img.onload = r; img.src = dataUrl; });
      await save('tileset', {name: f.name.replace(/\.\w+$/, ''), tileSize, dataUrl, columns: Math.floor(img.width / tileSize), rows: Math.floor(img.height / tileSize)} as Tileset);
    }
  }
  /** Mappa già disegnata: diventa tileset + livello Terreno pronto. */
  async function mapFromImage(file: File | undefined) {
    if (!file) return;
    const dataUrl = await new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(file); });
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });
    const cols = Math.floor(img.width / tileSize), rows = Math.floor(img.height / tileSize);
    if (!cols || !rows) return setMsg(t('Immagine troppo piccola per questa dimensione dei tile.'));
    const name = file.name.replace(/\.\w+$/, '');
    const ts = await save('tileset', {name: `${name} (${t('mappa')})`, tileSize, dataUrl, columns: cols, rows} as Tileset);
    let m = addTilesetToMap(newMap(name, cols, rows, tileSize), ts);
    const fg = m.tilesets[0].firstgid;
    m = {...m, layers: m.layers.map((l, i) => i === 0 ? {...l, data: Array.from({length: cols * rows}, (_, k) => fg + k)} : l)};
    const saved = await save('map', m);
    setMsg(img.width % tileSize || img.height % tileSize ? t("Nota: l'immagine non è un multiplo di {n}px, i bordi sono stati tagliati.", {n: tileSize}) : '');
    nav(saved.id);
  }

  /** Importa un file JSON: mappa esportata dalla dashboard o mappa di Tiled. */
  async function importTiled(file: File | undefined) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (isPnpMap(json)) { const saved = await importPnpMap(json, tileset, save as any); setMsg(''); nav(saved.id); return; }
      const {map: m, missing} = importTmj(json, file.name.replace(/\.\w+$/, ''), tileset);
      const saved = await save('map', m);
      setMsg(missing.length ? t('Importata. Tileset mancanti (caricali con lo stesso nome e reimporta): {list}', {list: missing.join(', ')}) : '');
      if (!missing.length) nav(saved.id);
    } catch (e: any) { setMsg(t('Import fallito: {error}', {error: t(e.message)})); }
  }

  return (
    <div className="page">
      <header className="page-head row between">
        <h1>{t('Mappe')}</h1>
        <div className="row gap-s">
          <button onClick={() => imgMapRef.current?.click()}>{t('Crea mappa da immagine')}</button>
          <button onClick={() => tmjRef.current?.click()}>{t('Importa mappa (esportata o Tiled)')}</button>
          <button className="btn-primary" onClick={() => setCreating(true)}>+ {t('Nuova mappa')}</button>
        </div>
        <input ref={tmjRef} type="file" accept=".tmj,.json" hidden onChange={e => { importTiled(e.target.files?.[0]); e.target.value = ''; }} />
        {creating && <NewMapDialog onClose={() => setCreating(false)} onCreated={id => nav(id)} />}
        <input ref={imgMapRef} type="file" accept="image/png,image/gif,image/webp" hidden onChange={e => { mapFromImage(e.target.files?.[0]); e.target.value = ''; }} />
      </header>
      {msg && <p className="callout">{msg}</p>}

      <section className="panel">
        <div className="row between wrap gap-s">
          <h2>{t('Le tue mappe')} <span className="muted">{map.length}</span></h2>
          <input placeholder={t('Cerca una mappa…')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('Cerca mappa')} />
        </div>
        {map.length === 0 && <p className="muted">{t('Nessuna mappa. Creane una nuova, oppure usa “Crea mappa da immagine”.')}</p>}
        <p className="small muted">{t('“Crea mappa da immagine” usa la dimensione tile indicata in Tileset.')}</p>
        {groups.map(([g, list]) => (
          <details key={g} className="map-group" open={groups.length <= 2 || !!q}>
            <summary><strong>{g}</strong> <span className="muted small">{list.length}</span></summary>
            <ul className="map-list">
              {list.map(m => (
                <li key={m.id}>
                  <div>
                    <strong>{m.name}</strong> <span className="muted small">{m.width}×{m.height}</span>
                    {campaign.activeMap === m.id && <span className="badge">{t('al tavolo')}</span>}
                  </div>
                  <div className="row gap-s">
                    <Link className="btn" to={m.id!}>{t('Modifica')}</Link>
                    <Link className="btn btn-primary" to={`${m.id}/gioca`} onClick={() => updateCampaign({activeMap: m.id})}>{t('Gioca')}</Link>
                    <button className="btn-icon" aria-label={t('Esporta')} title={t("Esporta per un'altra campagna")} onClick={() => exportMap(m, tileset)}><Download /></button>
                    <button className="btn-icon" aria-label={t('Elimina')} onClick={() => confirm(t('Eliminare {name}?', {name: m.name})) && remove('map', m.id!)}><Trash2 /></button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      <section className="panel">
        <h2>Tileset</h2>
        <p className="small muted">{t("Carica le immagini PNG dei tileset (restano solo sul tuo computer). Il nome del file serve per l'import da Tiled.")}</p>
        <div className="row gap-s">
          <label className="row gap-s">{t('Dimensione tile')} <input type="number" className="w-num" min={4} max={128} value={tileSize} onChange={e => setTileSize(+e.target.value)} /> px</label>
          <button onClick={() => fileRef.current?.click()}>{t('Carica PNG…')}</button>
          <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp" multiple hidden onChange={e => uploadTilesets(e.target.files)} />
        </div>
        <div className="tileset-grid">
          {tileset.map(ts => (
            <figure key={ts.id} className="tileset-card">
              <img src={ts.dataUrl} alt={ts.name} />
              <figcaption><strong>{ts.name}</strong><span className="muted small">{ts.tileSize}px · {ts.columns}×{ts.rows}</span>
                <button className="btn-icon" aria-label={t('Elimina tileset')} onClick={() => confirm(t('Eliminare il tileset {name}? Le mappe che lo usano perderanno quei tile.', {name: ts.name})) && remove('tileset', ts.id!)}><Trash2 /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}

