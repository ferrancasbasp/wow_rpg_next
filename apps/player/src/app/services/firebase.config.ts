// Config Firebase — mismo proyecto que prod (rpgwow-118f7). Mirror de
// /home/jovyan/wow_rpg_angular/src/app/services/firebase.service.ts.
// RTDB queda de lado; esta app usa Firestore.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCxsMUUHvw_LQrl24VgDtJiperHF2rRL_Y',
  authDomain: 'rpgwow-118f7.firebaseapp.com',
  projectId: 'rpgwow-118f7',
  storageBucket: 'rpgwow-118f7.firebasestorage.app',
  messagingSenderId: '408168433969',
  appId: '1:408168433969:web:d1f8521365c247ac934810',
  measurementId: 'G-STV8D02FJV',
};

// Clave del cliente jugador. Partida única, players definidos a mano;
// la regla Firestore compara `request.resource.data` (o clientKey) contra esta key.
export const PLAYER_KEY = 'aranir';

export const FS_CACHE_KEY = 'wow_next_player';
