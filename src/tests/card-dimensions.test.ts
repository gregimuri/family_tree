import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import {
  buildCardNameLines,
  cardBodyTextHeight,
  computeCardNameFontSizes,
  estimateCardTextHeight,
  resolveCardTypography,
} from '../layout/card-name-font';
import {
  CARD_GRID_CELL,
  CARD_H_FULL,
  CARD_H_TEXT,
  CARD_PHOTO_ASPECT,
  CARD_W,
  getCardDimensions,
  personShowsCardPhoto,
  snapCardCenterToGridCorners,
  snapToGridCorner,
  snapTopLeftToGrid,
} from '../layout/card-dimensions';

describe('card dimensions', () => {
  it('uses 6x5 text band and adds 8 cells for photo', () => {
    expect(CARD_GRID_CELL).toBe(CARD_W / 6);
    expect(CARD_H_TEXT).toBe(CARD_GRID_CELL * 5);
    expect(CARD_H_FULL).toBe(CARD_GRID_CELL * 13);
    expect(CARD_H_FULL).toBe(CARD_H_TEXT + CARD_GRID_CELL * 8);
    expect(CARD_PHOTO_ASPECT).toBeCloseTo(0.75);
  });

  it('uses shorter card height without photo', () => {
    let project = createEmptyProject();
    const person = createEmptyPerson({ givenName: 'Test' });
    project = { ...project, persons: { ...project.persons, [person.id]: person } };

    expect(personShowsCardPhoto(project, person, project.viewSettings)).toBe(false);

    const dims = getCardDimensions(project, person, project.viewSettings, 1);
    expect(dims.h).toBe(CARD_H_TEXT);
    expect(dims.hasPhoto).toBe(false);
  });

  it('snaps card top-left to grid corners', () => {
    expect(snapTopLeftToGrid(23, CARD_GRID_CELL)).toBe(20);
    expect(snapTopLeftToGrid(31, CARD_GRID_CELL)).toBe(40);

    const snapped = snapCardCenterToGridCorners(65, 125, CARD_W, CARD_H_FULL, CARD_GRID_CELL);
    expect(snapped.x).toBe(60);
    expect(snapped.y).toBe(130);
  });

  it('snaps arbitrary points to grid corners', () => {
    expect(snapToGridCorner(23, 31, CARD_GRID_CELL)).toEqual({ x: 20, y: 40 });
    expect(snapToGridCorner(29, 29, CARD_GRID_CELL)).toEqual({ x: 20, y: 20 });
  });

  it('scales card name font with card width', () => {
    const lines = [{ text: 'Иванов', base: 11 }];
    const full = computeCardNameFontSizes(lines, CARD_W, 1)[0]!;
    const small = computeCardNameFontSizes(lines, CARD_W * 0.75, 0.75)[0]!;
    expect(small).toBeLessThan(full);
  });

  it('fits default FIO and footer into text-only card height', () => {
    const fields = {
      surname: 'Иванов',
      givenName: 'Иван',
      patronymic: 'Иванович',
    };
    const footer = {
      hasDates: true,
      hasAge: false,
      hasReligion: false,
      hasLocation: true,
    };
    const nameLines = buildCardNameLines(fields, {
      showBirth: false,
      showNickname: false,
      nicknameAsPrimary: false,
    });
    const typo = resolveCardTypography(fields, {
      showBirth: false,
      showNickname: false,
      nicknameAsPrimary: false,
      width: CARD_W,
      height: CARD_H_TEXT,
      hasPhoto: false,
      cardScale: 1,
      footer,
    });
    const available = cardBodyTextHeight(CARD_H_TEXT, false);
    const used = estimateCardTextHeight(nameLines, typo.lineSizes, footer, typo);
    expect(used).toBeLessThanOrEqual(available + 0.5);
    expect(typo.lineSizes.length).toBeGreaterThan(0);
  });
});
