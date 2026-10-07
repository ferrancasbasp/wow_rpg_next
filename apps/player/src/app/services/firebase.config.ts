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

export const FS_CACHE_KEY = 'wow_next_player';
