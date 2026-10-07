// Config Firebase — mismo proyecto que prod (rpgwow-118f7). Mirror de
// /home/jovyan/wow_rpg_angular/src/app/services/firebase.service.ts.
// Esta app usa Realtime Database: mismo host que prod, árbol del plan nuevo.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCxsMUUHvw_LQrl24VgDtJiperHF2rRL_Y',
  authDomain: 'rpgwow-118f7.firebaseapp.com',
  databaseURL: 'https://rpgwow-118f7-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'rpgwow-118f7',
  storageBucket: 'rpgwow-118f7.firebasestorage.app',
  messagingSenderId: '408168433969',
  appId: '1:408168433969:web:d1f8521365c247ac934810',
  measurementId: 'G-STV8D02FJV',
};

// Clave del cliente jugador. Partida única, players definidos a mano;
// la regla RTDB compara el path contra esta key para permitir la escritura.
export const PLAYER_KEY = 'aranir';

// Documento raíz de la partida (una sola partida global). En RTDB no hay
// segmentos pares como exige Firestore, pero mantenemos el mismo árbol del
// plan: party/{partida}/players/{playerKey} y party/{partida}/events.
export const PARTY_DOC = 'partida';

export const RTDB_PARTY_ROOT = 'party';

// Clave única de caché local: un solo JSON en localStorage con partidas,
// perfiles y guardados manuales ({v:1, partidas, localsaves, legacy}).
export const FS_CACHE_KEY = 'wow_next_cache_v1';

// Claves de la caché antigua del namespace anterior (migradas al arranque).
export const LEGACY_CACHE_KEY = 'wow_next_player';

// Claves heredadas del sitio antiguo (wow_rpg_angular, mismo origen). Se
// respaldan bajo 'legacy' del cache v1 y se eliminan, para que no queden
// varios JSON de una sesión.
export const LEGACY_CACHE_KEYS = [
  'ttrpg_wow_monsters',
  'ttrpg_wow_character_v15',
  'wow_turn_state',
  'sim_runs_pending',
  'playerFicha',
];
