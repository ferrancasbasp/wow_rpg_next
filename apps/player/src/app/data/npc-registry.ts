export interface NpcSpec {
  id: string;
  name: string;
  level: number;
  maxHP: number;
  armor: number;
  magicResist: number;
  zone: string;
  iconImg: string;
  isElite?: boolean;
}

export const NPC_REGISTRY: NpcSpec[] = [
  { id: 'mottled_boar', name: 'Mottled Boar', level: 3, maxHP: 85, armor: 10, magicResist: 0, zone: 'Elwynn Forest', iconImg: 'img/enemies/Boar-3.jpeg' },
  { id: 'dire_boar', name: 'Dire Boar', level: 5, maxHP: 152, armor: 20, magicResist: 0, zone: 'Elwynn Forest', iconImg: 'img/enemies/Boar-5.jpeg' },
  { id: 'wolf_pup', name: 'Wolf Pup', level: 4, maxHP: 110, armor: 12, magicResist: 0, zone: 'Elwynn Forest', iconImg: 'img/enemies/Wolf-4.jpeg' },
  { id: 'wolf_alpha', name: 'Wolf Alpha', level: 9, maxHP: 285, armor: 22, magicResist: 0, zone: 'Elwynn Forest', iconImg: 'img/enemies/Wolf-9.jpeg' },
  { id: 'defias_looter', name: 'Defias Looter', level: 6, maxHP: 175, armor: 25, magicResist: 0, zone: 'Westfall', iconImg: 'img/enemies/Defias-6.jpeg' },
  { id: 'defias_evoker', name: 'Defias Evoker', level: 7, maxHP: 198, armor: 10, magicResist: 20, zone: 'Westfall', iconImg: 'img/enemies/Defias-Mage-7.jpeg' },
  { id: 'murloc_razorfin', name: 'Razorfin Murloc', level: 8, maxHP: 230, armor: 18, magicResist: 8, zone: 'Westfall', iconImg: 'img/enemies/Murloc-8.jpeg' },
  { id: 'riverpaw_gnoll', name: 'Riverpaw Gnoll', level: 6, maxHP: 210, armor: 25, magicResist: 0, zone: 'Westfall', iconImg: 'img/enemies/Gnoll-6.jpeg' },
  { id: 'great_goretusk', name: 'Great Goretusk', level: 12, maxHP: 412, armor: 40, magicResist: 0, zone: 'Redridge Mountains', iconImg: 'img/enemies/Boar-12.jpeg' },
  { id: 'elder_goretusk', name: 'Elder Goretusk', level: 15, maxHP: 585, armor: 55, magicResist: 0, zone: 'Redridge Mountains', iconImg: 'img/enemies/Boar-15.jpeg' },
  { id: 'dire_wolf', name: 'Dire Wolf', level: 17, maxHP: 680, armor: 40, magicResist: 0, zone: 'Redridge Mountains', iconImg: 'img/enemies/Wolf-17.jpeg' },
  { id: 'elite_defias_pirate_mage', name: 'Ruzal, Pirata Arcano', level: 17, maxHP: 1050, armor: 30, magicResist: 30, zone: 'Westfall', iconImg: 'img/enemies/Elite-Defias-Pirate-mage-17.jpeg', isElite: true },
  { id: 'elite_iron_golem', name: 'Ghonos, Golem de Hierro', level: 18, maxHP: 1450, armor: 90, magicResist: 40, zone: 'Redridge Mountains', iconImg: 'img/enemies/Elite-Iron-Golem-18.jpeg', isElite: true },
  { id: 'clock_head_boss', name: 'Cabeza del Reloj', level: 25, maxHP: 30000, armor: 100, magicResist: 80, zone: 'La Fortaleza del Reloj', iconImg: 'img/enemies/Head-boss.jpeg', isElite: true },
];
