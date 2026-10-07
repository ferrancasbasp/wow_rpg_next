export interface MobSymbol {
  id: string;
  icon: string;
  img: string;
  label: string;
}

export const MOB_SYMBOLS: MobSymbol[] = [
  { id: 'skull', icon: '💀', img: 'img/mobs/skull.jpg', label: 'Calavera' },
  { id: 'cross', icon: '✕', img: 'img/mobs/cross.jpg', label: 'Cruz' },
  { id: 'square', icon: '⬛', img: 'img/mobs/square.jpg', label: 'Cuadrado' },
  { id: 'diamond', icon: '🔶', img: 'img/mobs/diamond.jpg', label: 'Rombo' },
  { id: 'circle', icon: '🔴', img: 'img/mobs/circle.jpg', label: 'Círculo' },
  { id: 'triangle', icon: '🔺', img: 'img/mobs/triangle.jpg', label: 'Triángulo' },
  { id: 'moon', icon: '🌙', img: 'img/mobs/moon.jpg', label: 'Luna' },
  { id: 'star', icon: '⭐', img: 'img/mobs/star.jpg', label: 'Estrella' },
];
