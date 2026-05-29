import type { Person, Project, ViewSettings } from '../types';

/** Ширина карточки (6 клеток сетки). */
export const CARD_W = 120;

/** Соотношение сторон фото на карточке (ширина : высота). */
export const CARD_PHOTO_ASPECT = 3 / 4;

/** Высота карточки с фото (12 клеток). */
export const CARD_H_FULL = 240;

/** Высота карточки без фото (4 клетки). */
export const CARD_H_TEXT = 80;

/** Клетка сетки: 1/6 ширины и 1/12 высоты карточки с фото (= 1/4 без фото). */
export const CARD_GRID_CELL = CARD_W / 6;

export function personShowsCardPhoto(
  project: Project,
  person: Person,
  settings: ViewSettings,
): boolean {
  if (!settings.cardFields.showPhoto) return false;
  if (!person.avatar?.mediaId) return false;
  return !!project.media[person.avatar.mediaId];
}

export function getCardHeight(
  project: Project,
  person: Person,
  settings: ViewSettings,
  scale: number,
): number {
  const hasPhoto = personShowsCardPhoto(project, person, settings);
  return (hasPhoto ? CARD_H_FULL : CARD_H_TEXT) * scale;
}

export function getCardDimensions(
  project: Project,
  person: Person,
  settings: ViewSettings,
  scale: number,
): { w: number; h: number; hasPhoto: boolean } {
  const hasPhoto = personShowsCardPhoto(project, person, settings);
  return {
    w: CARD_W * scale,
    h: (hasPhoto ? CARD_H_FULL : CARD_H_TEXT) * scale,
    hasPhoto,
  };
}

/** Привязка верхнего левого угла карточки к углам сетки. */
export function snapTopLeftToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Привязка точки к пересечению линий сетки (углам клеток). */
export function snapToGridCorner(x: number, y: number, gridSize: number): { x: number; y: number } {
  return {
    x: snapTopLeftToGrid(x, gridSize),
    y: snapTopLeftToGrid(y, gridSize),
  };
}

export function snapCardCenterToGridCorners(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  gridSize: number,
): { x: number; y: number } {
  const topLeftX = centerX - width / 2;
  const topLeftY = centerY - height / 2;
  return {
    x: snapTopLeftToGrid(topLeftX, gridSize) + width / 2,
    y: snapTopLeftToGrid(topLeftY, gridSize) + height / 2,
  };
}
