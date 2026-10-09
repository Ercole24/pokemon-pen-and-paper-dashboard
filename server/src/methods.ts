// Modi di incontrare un Pokémon selvatico, come nei giochi (erba, surf, canne da pesca…).
// File condiviso: lo usano sia il server (filtrare gli incontri) sia l'interfaccia (etichette e icone).
/** Elenco dei modi: id interno, nome completo e nome corto per i pulsanti. */
export const METHODS = [
  {id: 'walk', label: 'Erba alta / grotta', short: 'Erba'},
  {id: 'surf', label: 'Surf', short: 'Surf'},
  {id: 'old-rod', label: 'Amo Vecchio', short: 'Amo Vecchio'},
  {id: 'good-rod', label: 'Amo Buono', short: 'Amo Buono'},
  {id: 'super-rod', label: 'Super Amo', short: 'Super Amo'},
  {id: 'rock-smash', label: 'Spaccaroccia', short: 'Spaccaroccia'},
  {id: 'headbutt', label: 'Bottintesta (alberi)', short: 'Bottintesta'},
] as const;
/** Tipo TypeScript: uno degli id qui sopra. */
export type MethodId = typeof METHODS[number]['id'];
/** Modo di una voce di zona; le voci vecchie senza modo valgono come "erba". */
export const methodOf = (e: {method?: string}) => (e.method || 'walk') as MethodId;
/** Nome leggibile di un modo (per testi e menu). */
export const methodLabel = (id?: string) => METHODS.find(m => m.id === (id || 'walk'))?.label || id || '';
