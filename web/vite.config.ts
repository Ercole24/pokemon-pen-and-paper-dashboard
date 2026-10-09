// Configurazione di Vite (strumento che compila l'interfaccia React).
// - npm run build: produce web/dist, servita poi dal server sulla porta 3000.
// - npm run dev: server di sviluppo sulla 5173 con ricarica immediata; le chiamate /api e /socket.io
//   vengono girate al server vero sulla 3000.
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    /** permette di importare file fuori da web/ (server/src/methods.ts è condiviso) */
    fs: {allow: ['..']},
    proxy: {'/api': 'http://localhost:3000', '/socket.io': {target: 'ws://localhost:3000', ws: true}},
  },
});
