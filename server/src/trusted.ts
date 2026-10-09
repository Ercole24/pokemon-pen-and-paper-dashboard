// Controllo delle richieste alla dashboard (HTTP e socket.io), usato da index.ts.
/**
 * Richieste ammesse: niente autenticazione (rete di casa), ma un sito qualunque aperto nel browser non deve poter usare la dashboard.
 * - Host: indirizzo IP, localhost, nome senza punti o .local (il "DNS rebinding" usa un dominio dell'attaccante);
 * - Origin, se c'è (lo mandano i browser): lo stesso host della richiesta.
 */
export function trusted(headers: Record<string, string | string[] | undefined>) {
  const host = String(headers.host || '');
  const name = host.replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');
  if (!/^(localhost|[\d.]+|[\da-f:]+|[^.]+|.+\.local)$/i.test(name)) return false;
  if (!headers.origin) return true;
  try { return new URL(String(headers.origin)).host === host; } catch { return false; }
}
