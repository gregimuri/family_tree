import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import {
  CARD_GRID_CELL,
  CARD_H_FULL,
  CARD_H_TEXT,
  CARD_W,
  getCardDimensions,
  personShowsCardPhoto,
  snapCardCenterToGridCorners,
  snapTopLeftToGrid,
} from '../layout/card-dimensions';

describe('card dimensions', () => {
  it('uses 6x12 grid for full card and 6x4 for text-only', () => {
    expect(CARD_GRID_CELL).toBe(CARD_W / 6);
    expect(CARD_H_FULL).toBe(CARD_GRID_CELL * 12);
    expect(CARD_H_TEXT).toBe(CARD_GRID_CELL * 4);
    expect(CARD_H_TEXT).toBe(CARD_H_FULL / 3);
  });

  it('omits photo area when setting disabled or avatar missing', () => {
    let project = createEmptyProject();
    const person = createEmptyPerson({ givenName: 'Test' });
    project = { ...project, persons: { ...project.persons, [person.id]: person } };

    expect(personShowsCardPhoto(project, person, project.viewSettings)).toBe(false);

    const withPhoto = getCardDimensions(project, person, project.viewSettings, 1);
    expect(withPhoto.h).toBe(CARD_H_TEXT);
    expect(withPhoto.hasPhoto).toBe(false);
  });

  it('snaps card top-left to grid corners', () => {
    expect(snapTopLeftToGrid(23, CARD_GRID_CELL)).toBe(20);
    expect(snapTopLeftToGrid(31, CARD_GRID_CELL)).toBe(40);

    const snapped = snapCardCenterToGridCorners(65, 125, CARD_W, CARD_H_FULL, CARD_GRID_CELL);
    expect(snapped.x).toBe(60);
    expect(snapped.y).toBe(120);
  });
});
