import type { Person, Project, ViewSettings } from '../types';

/** Ширина карточки (6 клеток сетки). */
export const CARD_W = 120;

/** Клетка сетки: 1/6 ширины карточки (= 20 px). */
export const CARD_GRID_CELL = CARD_W / 6;

/** Текстовый блок: 5 клеток по высоте (с фото и без). */
export const CARD_BODY_CELLS = 5;
export const CARD_BODY_HEIGHT = CARD_GRID_CELL * CARD_BODY_CELLS;

/** Фото: 8 клеток по высоте (добавляется к текстовому блоку). */
export const CARD_PHOTO_CELLS = 8;
export const CARD_PHOTO_HEIGHT = CARD_GRID_CELL * CARD_PHOTO_CELLS;

/** Соотношение сторон фото на карточке (ширина : высота). */
export const CARD_PHOTO_ASPECT = CARD_W / CARD_PHOTO_HEIGHT;

/** Карточка с фото: 13 клеток (8 + 5). */
export const CARD_H_FULL = CARD_PHOTO_HEIGHT + CARD_BODY_HEIGHT;

/** Карточка без фото: 5 клеток — только текст. */
export const CARD_H_TEXT = CARD_BODY_HEIGHT;

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
