// Nuova mappa ed esportazione/importazione mappe tra campagne.
import {useState} from 'react';
import {useStore, type MapDoc, type Tileset} from './api';
import {Modal} from './components';
import {download, newMap} from './mapcore';
import {t} from './i18n';

/** Nuova mappa vuota: i tileset si caricano poi nell'editor. */
export function NewMapDialog({onCreated, onClose}: {onCreated: (id: string) => void, onClose: () => void}) {
  const {save, map} = useStore();
  const [name, setName] = useState(t('Mappa {n}', {n: map.length + 1}));
  const [w, setW] = useState(30);
  const [h, setH] = useState(20);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const m: MapDoc = newMap(name.trim() || t('Mappa'), Math.max(4, w), Math.max(4, h), 16);
    const saved = await save('map', m);
    onCreated(saved.id);
  }
  return (
    <Modal title={t('Nuova mappa')} onClose={onClose}>
      <label>{t('Nome')}<input value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="grid-2">
        <label>{t('Larghezza (caselle)')}<input type="number" min={4} max={500} value={w} onChange={e => setW(+e.target.value)} /></label>
        <label>{t('Altezza (caselle)')}<input type="number" min={4} max={500} value={h} onChange={e => setH(+e.target.value)} /></label>
      </div>
      <p className="small muted">{t("Nell'editor potrai caricare i tuoi tileset (immagini PNG).")}</p>
      <div className="row end"><button className="btn-primary" disabled={busy} onClick={create}>{t(busy ? 'Creo…' : "Crea e apri l'editor")}</button></div>
    </Modal>
  );
}

// --- esportazione / importazione tra campagne ---
/** File .pnpmap.json: mappa + i tileset che usa. */
type MapExport = {format: 'pnp-map', version: 1, map: MapDoc, tilesets: Tileset[]};

/** Esporta una mappa con i suoi tileset (senza i segnalini degli Allenatori). */
export async function exportMap(m: MapDoc, all: Tileset[]) {
  const used = m.tilesets.map(r => all.find(t => t.id === r.id)).filter(Boolean) as Tileset[];
  // le immagini caricate a mano sono già incluse (dataUrl)
  const data: MapExport = {format: 'pnp-map', version: 1, map: {...m, tokens: []}, tilesets: used};
  download(`${m.name}.pnpmap.json`, JSON.stringify(data));
}

/** Il JSON caricato è una mappa esportata dalla dashboard? */
export function isPnpMap(json: any): json is MapExport {
  return json?.format === 'pnp-map' && json.map && Array.isArray(json.tilesets);
}

/** Importa una mappa esportata: crea (o riusa) i tileset e rimappa i riferimenti. */
export async function importPnpMap(json: MapExport, existing: Tileset[], save: (kind: 'tileset' | 'map', doc: any) => Promise<any>) {
  const idMap = new Map<string, string>();
  for (const t of json.tilesets) {
    const same = existing.find(x => x.dataUrl === t.dataUrl && x.name === t.name);
    const doc = same || await save('tileset', {...t, id: undefined});
    idMap.set(t.id!, doc.id);
  }
  const m = json.map;
  return save('map', {
    ...m, id: undefined, group: m.group,
    tilesets: m.tilesets.map(r => ({...r, id: idMap.get(r.id) || r.id})),
    objects: m.objects.map(o => ({...o, toMap: undefined, npcTeam: undefined})), // porte e Allenatori appartengono alla vecchia campagna
  });
}
