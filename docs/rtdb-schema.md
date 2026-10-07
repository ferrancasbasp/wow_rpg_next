# Schema RTDB (wow_rpg_next)

Contrato de datos del juego en Firebase **Realtime Database**. Fuente de verdad de contenido = código TS tipado (specs de classes/talentos/habilidades en el repo, versionadas y testeables); RTDB guarda catálogo de contenido mutable (items, npcs) y TODO el estado volátil de la partida.

> **Decisión (2026-10-07):** la nueva web usa RTDB (mismo proyecto `rpgwow-118f7`, mismo host que prod `wow_rpg_angular`) en lugar de Firestore. Motivo: la red de los equipos bloquea `firestore.googleapis.com` (los POST `Write/channel` fallan con `net::ERR_BLOCKED_BY_CLIENT`), mientras que RTDB (`*.firebasedatabase.app`) ya funciona. Se mantiene el **árbol del plan nuevo** (`party/{partida}/...`), no el de la app vieja.

## Regla general

- **contenido** (catalog): estático, sembrado por script seed versionado, read-only en la app.
- **estado** (party): volátil, escrito por el actor que corresponde (ver "escritores" abajo) con `serverTimestamp()`.
- **derivado no se persiste**: stats derivadas, HP/SP total, daño esperado, crit. La ficha guarda estado base; todo lo derivado se calcula en el cliente en `projects/core`. Evita doble fuente de verdad.

## Árbol

```
rpgwow/                               (raíz: proyecto Firebase existente)
├── catalog/                          SEED — read-only en la app
│   ├── items/{itemId}
│   └── npcs/{npcId}
└── party/                            ESTADO volátil
    └── {partida}/                    raíz de la partida (una sola global)
        ├── players/{playerKey}       ficha persistente (jugador se escribe a sí mismo)
        │   └── inventory/{itemKey}
        ├── session/
        │   ├── state                 doc único de fase de partida (master)
        │   ├── players/{playerKey}   estado en vivo por jugador (master)
        │   ├── enemies/{enemyKey}    encuentro actual (master)
        │   └── log/{logId}           log de combate acotado (master)
        └── events/{eventId}          cola de comandos de jugadores (→ master)
```

> En RTDB no hay documento con segmentos pares como en Firestore, pero se mantiene el mismo árbol del plan (`party/{partida}/players/{playerKey}` es un path plano, equivalente).

## Nodos

### catalog/items/{itemId}
| campo | tipo | notas |
|---|---|---|
| id | string | key del nodo |
| name | string | |
| slot | string | head \| chest \| hands \| legs \| feet \| mainHand \| offHand \| twoHand \| ranged \| accessory |
| rarity | string | common \| uncommon \| rare \| epic \| legendary |
| stats | map{StatKey→number} | opcional; parcial (solo stats que aporta) |
| weaponDamage | {min:number, max:number} | opcional; solo armas |
| defense | number | opcional; solo armaduras |
| iconImg | string | ruta a Firebase Storage (mismo proyecto, gratis) |
| description | string | opcional |
| dropeable | boolean | si aparece en loot de npc |
| price | number | opcional |

### catalog/npcs/{npcId}
| campo | tipo | notas |
|---|---|---|
| id, name | string | |
| level | number | |
| hp | number | |
| armor | number | |
| magicResist | number | opcional |
| zone | string | |
| attacks | [{name,minDamage,maxDamage,isHeal?,aoe?,damageType?,inflictsEffects?}] | espejo de game.models.NpcAttack |
| imageUrl | string | Storage |
| isElite | boolean | opcional |
| description | string | opcional |

### party/{partida}/players/{playerKey}
Ficha PERSISTENTE — estado que sobrevive entre sesiones. Escribir con `update` (merge) + debounce + flush en cambios críticos.

| campo | tipo | notas |
|---|---|---|
| name | string | |
| classKey | string | |
| level | number | |
| baseStats | map{StatKey→number} | |
| talents | map{skillId→points} | |
| capstone | string \| null | |
| currentXP | number | |
| trainedRanks | map{abilityId→rank} | |
| equipment | map{slot→{name,bonus,weaponDamage?,defense?}} | espejo de game.models.Equipment (resuelto en la factory) |
| images | {horizontal:string, vertical:string} | Storage |
| raidSymbol | number \| null | |
| savedAt | serverTimestamp | índice de última escritura |

> **Seed inicial**: `docs/seed/players.json` contiene los 4 perfiles a nivel 1 (Melkor, Vástago, Moby, Ragnar). Importar en Firebase Console → Realtime Database → **raíz** `party/partida/players` (Import JSON con el fichero o pegando su contenido). Los `trainedRanks` van precalculados al rango máximo del nivel 1; la app los completa automáticamente al subir de nivel.

### party/{partida}/players/{playerKey}/inventory/{itemKey}
| campo | tipo | notas |
|---|---|---|
| itemId | string | ref a catalog/items |
| qty | number | |
| equipped | boolean | si está equipado (max 1 por slot efectivo) |

Las **stats se resuelven en la factory** leyendo catalog/items → nunca se duplican en la ficha. Equipar = set `equipped` en inventario y recalcular en cliente.

### party/{partida}/session/state (nodo único)
| campo | tipo | notas |
|---|---|---|
| phase | string | ficheo \| combate \| bestia |
| round | number | contador de turnos |
| turnOrder | set de playerKey | |
| activeTurn | string \| null | playerKey |
| raidTarget | string \| null | playerKey marcado para raid-tools |
| masterKey | string | clave del cliente master (autoridad de session) |
| updatedAt | serverTimestamp | |

### party/{partida}/session/players/{playerKey}
ESTADO EN VIVO (combate) — espejo que crea/actualiza el **master** al consumir events. El jugador no escribe aquí.

| campo | tipo | notas |
|---|---|---|
| currentHP | number | máx derivable de la ficha + fórmulas |
| currentMana | number \| null | |
| currentRage / currentEnergy / currentFocus | number | |
| comboPoints | number | y notes/shards/sunShards/spear/shield charges según clase |
| currentCooldowns | map{abilityId→number} | |
| activeEffects | [{id,type,name,target,value,duration,isPercent?,debuffType?,stanceId?}] | espejo ActiveEffect |
| activePet / companionPet | {petId,currentHP,currentMana} \| null | |
| totems / infernalTurnsLeft | opcional | |

### party/{partida}/session/enemies/{enemyKey}
| campo | tipo | notas |
|---|---|---|
| npcId | string | ref catalog/npcs |
| currentHP | number | |
| effects | array ActiveEffect | debuffs/DoTs vivos |
| index | number | posición en pantalla |
| target | playerKey \| null | |

### party/{partida}/session/log/{logId}
| campo | tipo | notas |
|---|---|---|
| ts | serverTimestamp | ordenable |
| text | string | o estructura {actor,target,type,value} para render |
| type | string | dano \| cura \| buff \| debuff \| status \| evento |

**Acotado:** el master poda a ~200 logs al insertar (borrado de los más antiguos). Replay de turnos = leer log con `orderByChild('ts')`. Historial largo fuera de BD. (En RTDB no existe `limit` server-side estricto: se lee el nodo y se poda en cliente/master; a ~200 entradas es trivial.)

### party/{partida}/events/{eventId}
| campo | tipo | notas |
|---|---|---|
| playerKey | string | emisor |
| type | string | lanzarHabilidad \| mover \| equipar \| cambiarStance \| usarItem \| ... |
| payload | map | args del comando |
| ts | serverTimestamp | |

Los eventos se insertan con `push()` (key única de RTDB por cliente), igual que la app vieja hacía con `playerEvents`.

## Escritores (anti-colisión)

| Actor | Escribe | Lee |
|---|---|---|
| Jugador (app player) | `party/{partida}/players/<suKey>` + `party/{partida}/events` | su ficha + catálogo |
| Master (app master) | `party/{partida}/session/*` | catálogo + fichas del grupo + events |
| Combat (app combat) | — (solo suscribe) | session + fichas |
| Seed script | `catalog/*` | — |

El master es **único escritor** de `session/*`: consume `events/`, valida, aplica, responde. Los jugadores nunca tocan `session/`. Con una sola partida global esto elimina carreras reales.

## Persistencia y sync (SyncService / projects/state)

- `onValue(party/{partida}/players/<myKey>)` → refresca la signal del jugador.
- Guardado: `update` con merge (cv `StateGateway` → `RtdbStateBackend.writeFicha`), debounce ~30s + flush en eventos críticos (subir nivel, equipar, gastar recursos), marca `savedAt` con `serverTimestamp()`.
- localStorage pasa a ser SOLO caché offline (lectura inicial), nunca fuente de verdad.
- session: `onValue` de state + players/<grupal> + enemies + log.

## Seguridad (reglas RTDB — ver docs/rtdb.rules)

- `catalog/*`: read público, write negado (solo seed/admin).
- `party/{partida}/players/{key}`: write permitido al perfil que el cliente cargue desde el selector ('Cargar'). Los 4 perfiles sembrados (Melkor, Vástago, Moby, Ragnar) son editables por la app; auth anónima opcional más adelante.
- `party/{partida}/session/*` y `party/{partida}/events`: write solo al masterKey (o role master).

## Imágenes (Firebase Storage)

- Items y npcs: `gs://<project>.appspot.com/items/<itemId>.png`, mirrors por clase en `classes/`.
- La app referencia la URL pública (sin auth) o via Storage bucket del mismo proyecto Firebase.

## Notas de migración

1. Contenido en TS tipado NO migra a BD (fórmulas/balance). Los specs quedan en `projects/core` y el seed de catalog se registra solo para items/npcs.
2. Cualquier dato que hoy está en `players/` de RTDB que sea "estado en vivo" (hp, cooldowns, effects) → `session/players`, no ficha.
3. Compatibilidad: el SyncService abstrae la fuente (`StateBackend`); la app nueva lee/escribe RTDB con el árbol del plan nuevo. La app vieja (`wow_rpg_angular`) sigue en su árbol RTDB histórico (`characters/`, `playerEvents/`...) sin tocarse; la convivencia es intencional.
