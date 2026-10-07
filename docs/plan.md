# Plan de revamp → wow_rpg_next

Migración de `/home/jovyan/wow_rpg_angular` (Angular + RTDB, monolito de UI y estado) a un workspace nuevo multi-proyecto con Firestore. La campaña real no es inminente: días/libres por delante → migración gradual y no destructiva. PRINCIPIO: el juego en prod NUNCA se rompe; cada fase puede convivir con la anterior.

## Stack decido

- **Framework:** Angular (mantener).
- **Estado:** signals.
- **BD:** Firestore en el MISMO proyecto Firebase existente (la config actual ya tiene `storageBucket` → imágenes gratis). RTDB queda de lado.
- **Partida:** UNA sola partida global (no hay multi-incursión / roomId). Master aplica los eventos.
- **Lógica de combate:** clases con métodos propios — cada `CharacterClass` hereda de una base genérica y SOBRESCRIBE su lógica (los `if por clase` salen de los componentes y entran en el método de la clase).
- **Contenido:** TS tipado (specs compilados y testeables). Firestore NO guarda fórmulas/balance; solo catalogo mutable (items, npcs) + estado volátil.
- **Crítico:** unificado vía `resolveCrit(ability)` en la clase base llamando a una única fórmula compartida.

## Estructura del workspace

```
wow_rpg_next/
├── projects/
│   ├── core/        modelos + fórmulas puras (SIN Firebase, sin Angular) + tests de paridad
│   ├── state/       signals + SyncService (Firestore ↔ signals) + guardado/save
│   ├── ui/          componentes compartidos: status-badges, barras, tooltips
│   └── catalog/     specs de contenido tipado + seed script → catalog/
├── apps/
│   ├── player/      ficha + pasivas del jugador
│   ├── master/      pantalla del master (baúl/enemies/session)
│   └── combat/      motor de combate (session)
└── docs/
    ├── firestore-schema.md   (contrato Firestore — hecho)
    └── plan.md                (este archivo)
```

## Fases (orden de ejecución)

| # | Fase | Output | Validación |
|---|---|---|---|
| 1 | **core: fórmulas + modelos** | Definitivos `Stats/Ability/Character/items/npcs` tipados + fórmulas puras (hp, mana, sp, ap, crit, regen) extraídas de `Classes/character.service.ts` | Tests de paridad: dado un nivel/stats → los números devuelven los MISMOS resultados que la app actual |
| 2 | **factory + clase piloto (valkiria)** | Fábrica que regenera la ficha desde espec; la clase más compleja primero (specs, pasivas, recursos duales, selección de pool) | Play test equivalente a prod actual |
| 3 | **resto de clases** | Cada clase en `projects/core` con sus métodos propios sobrescribiendo la base | Paridad clase a clase contra prod |
| 4 | **estado + sync Firestore** | SyncService + signals siguiendo docs/firestore-schema.md; guardado periódico (debounce 30s) + flush crítico; master consume `events/` | Round de combate completo sobre Firestore con 2 clientes |
| 5 | **UI y split en 3 apps** | player / master / combat con ui-kit compartido; status-badges para debuffs del enemigo y buffs propios | Jugar una sesión completa 100% en el nuevo stack |
| 6 | **catálogo de objetos** | Seed script versionado → `catalog/items` + `catalog/npcs` + imágenes a Storage; inventario y equipamiento del jugador sobre BD | Añadir/equipar/dropear objetos sin re-deploy |

## Decisiones abiertas / próximos pasos

- [x] Firestore como BD (mismo proyecto Firebase).
- [x] Una sola partida global, master como aplicador de eventos.
- [x] Clases con métodos propios sobre base genérica.
- [x] Contenido TS tipado; solo items/npcs catálogo en BD.
- [x] Log de session acotado (~200 docs, peody master al insertar).
- [x] Seed script versionado + MCP local del juego (para editar items/npcs/inventario desde opencode).
- [ ] Completar fase 1 en proyectos/core con tests de paridad.
- [x] Docs: firestore-schema.md + plan.md en ~/wow_rpg_next/docs.

## Definición de hecho del revamp

- Las 3 apps (player/master/combat) funcionan al 100% sobre Firestore desde el repo nuevo.
- RTDB y el monolito actual quedan como referencia histórica, solo lectura.
- El crítico sale de una fórmula única. Los debuffs del enemigo y los buffs propios se ven claramente en la UI con el componente status-badges.
