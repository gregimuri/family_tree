import { describe, it, expect } from 'vitest';
import { createEmptyProject, createEmptyPerson } from '../models/defaults';
import {
  avatarFromPhotoRegion,
  buildAvatarCropFromPixels,
  isSharedMedia,
  normalizeAvatarCrop,
} from '../utils/avatar-crop';

describe('avatar crop', () => {
  it('normalizes fractional crop coordinates', () => {
    expect(
      normalizeAvatarCrop({
        mediaId: 'm1',
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4,
        rotation: 0,
        scale: 1,
      }),
    ).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it('falls back to full frame for legacy pixel crops', () => {
    expect(
      normalizeAvatarCrop({
        mediaId: 'm1',
        x: 0,
        y: 0,
        width: 240,
        height: 320,
        rotation: 0,
        scale: 1,
      }),
    ).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('builds avatar crop from pixel area', () => {
    const crop = buildAvatarCropFromPixels('m1', { x: 100, y: 50, width: 200, height: 300 }, 1000, 800);
    expect(crop.x).toBeCloseTo(0.1);
    expect(crop.y).toBeCloseTo(0.0625);
    expect(crop.width).toBeCloseTo(0.2);
    expect(crop.height).toBeCloseTo(0.375);
  });

  it('detects shared media used by multiple persons', () => {
    const project = createEmptyProject();
    const mediaId = 'shared-photo';
    const [a, b] = Object.keys(project.persons);
    project.media[mediaId] = {
      id: mediaId,
      type: 'photo',
      filename: 'group.jpg',
      description: 'Групповое',
      personIds: [a, b],
    };
    project.persons[a] = {
      ...project.persons[a],
      avatar: { mediaId, x: 0, y: 0, width: 0.5, height: 1, rotation: 0, scale: 1 },
    };
    project.persons[b] = {
      ...project.persons[b],
      avatar: { mediaId, x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0, scale: 1 },
    };
    expect(isSharedMedia(project, mediaId)).toBe(true);
  });

  it('uses photo region when assigning avatar from mass photo', () => {
    const person = createEmptyPerson({ givenName: 'Anna', surname: 'Ivanova', gender: 'female' });
    const media = {
      id: 'photo-1',
      type: 'photo' as const,
      filename: 'mass.jpg',
      description: 'Mass',
      personIds: [] as string[],
      photoRegions: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4, personId: person.id, label: 'Anna' }],
    };
    const avatar = avatarFromPhotoRegion(media, person.id);
    expect(avatar).toEqual({
      mediaId: 'photo-1',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      rotation: 0,
      scale: 1,
    });
  });
});
