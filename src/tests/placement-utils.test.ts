import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import { buildLayout } from '../layout';
import { computePlacementNearAnchor } from '../layout/placement-utils';
import { COUPLE_GAP } from '../layout/graph-builder';
import { scaleCardLineFontSize } from '../layout/card-name-font';

describe('placement near anchor', () => {
  it('places partner to the right of anchor', () => {
    let project = createEmptyProject();
    const anchorId = Object.keys(project.persons)[0];
    const partner = createEmptyPerson({ givenName: 'Партнёр' });
    project = {
      ...project,
      persons: { ...project.persons, [partner.id]: partner },
    };
    const layout = buildLayout(project);
    const placement = computePlacementNearAnchor(project, layout, partner.id, anchorId, 'partner');
    const anchorNode = layout.nodes.find((n) => n.personId === anchorId)!;
    const partnerNode = layout.nodes.find((n) => n.personId === partner.id)!;
    expect(placement).toBeTruthy();
    expect(placement!.x).toBeGreaterThan(anchorNode.x + anchorNode.width / 2);
    expect(placement!.x - (anchorNode.x + anchorNode.width / 2)).toBeGreaterThanOrEqual(
      COUPLE_GAP + partnerNode.width / 2 - 1,
    );
  });

  it('places parent above child', () => {
    let project = createEmptyProject();
    const childId = Object.keys(project.persons)[0];
    const parent = createEmptyPerson({ givenName: 'Родитель' });
    project = {
      ...project,
      persons: { ...project.persons, [parent.id]: parent },
    };
    const layout = buildLayout(project);
    const placement = computePlacementNearAnchor(project, layout, parent.id, childId, 'parent');
    const childNode = layout.nodes.find((n) => n.personId === childId)!;
    expect(placement).toBeTruthy();
    expect(placement!.y).toBeLessThan(childNode.y + childNode.height / 2);
  });
});

describe('card name font scaling', () => {
  it('shrinks long names and enlarges short ones', () => {
    const short = scaleCardLineFontSize('Иван', 11, 108);
    const long = scaleCardLineFontSize('Артемьевна', 9, 108);
    expect(short).toBeGreaterThan(long);
    expect(long).toBeLessThanOrEqual(9);
  });
});
