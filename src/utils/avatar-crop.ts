import type { CSSProperties } from 'react';
import type { AvatarCrop, MediaItem, Project } from '../types';

export interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Crop rectangle in 0–1 coordinates relative to the source image. */
export function normalizeAvatarCrop(avatar: AvatarCrop): NormalizedCrop {
  const { x, y, width, height } = avatar;
  if (
    width > 0 &&
    width <= 1 &&
    height > 0 &&
    height <= 1 &&
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1 &&
    x + width <= 1.001 &&
    y + height <= 1.001
  ) {
    return { x, y, width, height };
  }
  return { x: 0, y: 0, width: 1, height: 1 };
}

export function avatarCropImageStyle(crop: NormalizedCrop): CSSProperties {
  const w = 100 / crop.width;
  const h = 100 / crop.height;
  return {
    width: `${w}%`,
    height: `${h}%`,
    maxWidth: 'none',
    marginLeft: `${(-crop.x * w).toFixed(4)}%`,
    marginTop: `${(-crop.y * h).toFixed(4)}%`,
  };
}

export function avatarFromPhotoRegion(media: MediaItem, personId: string): AvatarCrop | null {
  const region = media.photoRegions?.find((r) => r.personId === personId);
  if (!region) return null;
  return {
    mediaId: media.id,
    x: region.x,
    y: region.y,
    width: region.w,
    height: region.h,
    rotation: 0,
    scale: 1,
  };
}

export function isSharedMedia(project: Project, mediaId: string, editingPersonId?: string): boolean {
  const media = project.media[mediaId];
  if (!media) return false;
  if ((media.photoRegions?.length ?? 0) > 0) return true;

  const otherPersonIds = editingPersonId
    ? media.personIds.filter((id) => id !== editingPersonId)
    : media.personIds;
  if (otherPersonIds.length > 0) return true;

  for (const person of Object.values(project.persons)) {
    if (editingPersonId && person.id === editingPersonId) continue;
    if (person.avatar?.mediaId === mediaId) return true;
  }

  return false;
}

export function buildAvatarCropFromPixels(
  mediaId: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): AvatarCrop {
  return {
    mediaId,
    x: pixelCrop.x / imageWidth,
    y: pixelCrop.y / imageHeight,
    width: pixelCrop.width / imageWidth,
    height: pixelCrop.height / imageHeight,
    rotation: 0,
    scale: 1,
  };
}
