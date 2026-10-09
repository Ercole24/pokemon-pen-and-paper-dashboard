// Lingua dell'interfaccia: inglese di base, la scelta resta in questo browser (localStorage).
// t() traduce un testo (chiave = testo italiano, vedi server/src/i18n.ts); tj() fa lo stesso ma accetta
// elementi React nei segnaposto (es. un nome in grassetto). Cambiando lingua la pagina si ricarica.
import {Fragment, useEffect, useRef, useState, type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {LANGS, translate, type Lang} from '../../server/src/i18n';

const saved = (() => { try { return localStorage.getItem('pnp-lang'); } catch { return null; } })();
export const LANG: Lang = saved === 'it' ? 'it' : 'en';
/** Lingua per date e numeri. */
export const LOCALE = LANG === 'it' ? 'it-IT' : 'en-GB';
document.documentElement.lang = LANG;

/** Testo tradotto, con i segnaposto {nome} sostituiti. */
export const t = (s: string, vars?: Record<string, unknown>) => translate(LANG, s, vars);

/** Come t(), ma i segnaposto possono essere elementi React. */
export function tj(s: string, vars: Record<string, ReactNode>): ReactNode {
  return translate(LANG, s).split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{k && k in vars ? vars[k] : part}</Fragment>;
  });
}

/** Salva la lingua e ricarica la pagina. */
function setLang(l: Lang) {
  try { localStorage.setItem('pnp-lang', l); } catch {}
  location.reload();
}

const NAMES: Record<Lang, string> = {en: 'English', it: 'Italiano'};

/** Bandiera (SVG: le emoji delle bandiere su Windows non si vedono). */
function Flag({lang}: {lang: Lang}) {
  if (lang === 'it') return (
    <svg className="flag" viewBox="0 0 3 2" aria-hidden><rect width="1" height="2" fill="#009246" /><rect x="1" width="1" height="2" fill="#fff" /><rect x="2" width="1" height="2" fill="#ce2b37" /></svg>
  );
  return (
    <svg className="flag" viewBox="0 0 60 30" aria-hidden>
      <clipPath id="uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#uk-t)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

/** Selettore della lingua: bandiera e sigla, menu con le lingue disponibili. */
export function LangSwitch({className = ''}: {className?: string}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className={`lang-switch ${className}`} ref={box}>
      <button type="button" className="lang-current" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('Lingua')}>
        <Flag lang={LANG} /><span>{LANG.toUpperCase()}</span><ChevronDown />
      </button>
      {open && <ul className="lang-menu" role="menu">
        {LANGS.map(l => <li key={l}><button type="button" role="menuitemradio" aria-checked={l === LANG} className={l === LANG ? 'active' : ''}
          onClick={() => l === LANG ? setOpen(false) : setLang(l)}><Flag lang={l} />{NAMES[l]}</button></li>)}
      </ul>}
    </div>
  );
}
