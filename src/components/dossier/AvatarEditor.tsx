import { useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import type { AvatarCrop, MediaItem } from '../../types';
import { CARD_PHOTO_ASPECT } from '../../layout/card-dimensions';
import { useProjectStore } from '../../store/project-store';
import { createId } from '../../utils/create-id';
import { getCroppedImageBlob } from '../../utils/crop-image';
import './AvatarEditor.css';

interface AvatarEditorProps {
  personId: string;
  allowUpload?: boolean;
  onClose: () => void;
}

function resetCropState() {
  return {
    crop: { x: 0, y: 0 },
    zoom: 1,
    rotation: 0,
    croppedAreaPixels: null as Area | null,
  };
}

export function AvatarEditor({ personId, allowUpload = true, onClose }: AvatarEditorProps) {
  const project = useProjectStore((s) => s.project);
  const updatePerson = useProjectStore((s) => s.updatePerson);
  const addMedia = useProjectStore((s) => s.addMedia);
  const getMediaUrl = useProjectStore((s) => s.getMediaUrl);
  const fileRef = useRef<HTMLInputElement>(null);

  const AVATAR_MIN_ZOOM = 0.15;
  const AVATAR_MAX_ZOOM = 10;

  const [mediaId, setMediaId] = useState<string | null>(
    project?.persons[personId]?.avatar?.mediaId ?? null,
  );
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!project) return null;
  const person = project.persons[personId];
  const media = mediaId ? project.media[mediaId] : null;
  const imageUrl = media ? getMediaUrl(media.filename) : undefined;
  const archivePhotos = person.mediaIds
    .map((id) => project.media[id])
    .filter((item): item is MediaItem => Boolean(item && item.type === 'photo'));

  const selectMedia = (id: string) => {
    setMediaId(id);
    const next = resetCropState();
    setCrop(next.crop);
    setZoom(next.zoom);
    setRotation(next.rotation);
    setCroppedAreaPixels(next.croppedAreaPixels);
    setError(null);
  };

  const onFile = (file: File) => {
    const id = createId();
    const item: MediaItem = {
      id,
      type: 'photo',
      filename: file.name,
      description: `Аватар ${person.givenName}`,
      personIds: [personId],
    };
    addMedia(item, file);
    selectMedia(id);
  };

  const confirm = async () => {
    if (!mediaId || !imageUrl || !croppedAreaPixels) {
      setError('Дождитесь загрузки изображения и настройте кадр.');
      return;
    }

    const currentProject = useProjectStore.getState().project;
    const currentPerson = currentProject?.persons[personId];
    const currentMedia = currentProject?.media[mediaId];
    if (!currentPerson || !currentMedia) return;

    setSaving(true);
    setError(null);
    try {
      const croppedBlob = await getCroppedImageBlob(imageUrl, croppedAreaPixels, rotation);
      const avatarMediaId = createId();
      const extMatch = currentMedia.filename.match(/(\.[a-zA-Z0-9]+)$/);
      const ext = extMatch?.[1] ?? '.jpg';
      const avatarFilename = `avatar-${personId.slice(0, 8)}-${avatarMediaId}${ext}`;
      const avatarItem: MediaItem = {
        id: avatarMediaId,
        type: 'photo',
        filename: avatarFilename,
        description: `Аватар ${currentPerson.givenName}`,
        personIds: [personId],
      };
      addMedia(avatarItem, croppedBlob);

      const avatar: AvatarCrop = {
        mediaId: avatarMediaId,
        x: 0,
        y: 0,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
        rotation: 0,
        scale: 1,
      };

      const mediaIds = [...currentPerson.mediaIds];
      if (mediaId !== avatarMediaId && !mediaIds.includes(mediaId)) {
        mediaIds.push(mediaId);
      }
      if (!mediaIds.includes(avatarMediaId)) {
        mediaIds.push(avatarMediaId);
      }

      updatePerson({ ...currentPerson, avatar, mediaIds });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить фото');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="avatar-editor-overlay" onClick={onClose}>
      <div className="avatar-editor" onClick={(e) => e.stopPropagation()}>
        <h3>{allowUpload ? 'Замена фотографии' : 'Выбор фотографии'}</h3>
        <div className="avatar-editor-sources">
          {allowUpload && (
            <button type="button" onClick={() => fileRef.current?.click()}>
              Выбрать файл
            </button>
          )}
          {archivePhotos.length > 0 && (
            <div className="avatar-editor-archive">
              <span className="avatar-editor-archive__label">Из архива:</span>
              <div className="avatar-editor-archive__list">
                {archivePhotos.map((item) => {
                  const url = getMediaUrl(item.filename);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`avatar-editor-archive__item${mediaId === item.id ? ' selected' : ''}`}
                      onClick={() => selectMedia(item.id)}
                      title={item.description || item.filename}
                    >
                      {url ? <img src={url} alt="" /> : item.filename}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {allowUpload && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        )}
        {imageUrl && (
          <div className="avatar-editor-crop">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={CARD_PHOTO_ASPECT}
              minZoom={AVATAR_MIN_ZOOM}
              maxZoom={AVATAR_MAX_ZOOM}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropAreaChange={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
            />
          </div>
        )}
        {imageUrl && (
          <div className="avatar-editor-controls">
            <label>
              Масштаб
              <input
                type="range"
                min={AVATAR_MIN_ZOOM}
                max={AVATAR_MAX_ZOOM}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(+e.target.value)}
              />
            </label>
            <label>
              Поворот
              <input
                type="range"
                min={0}
                max={360}
                value={rotation}
                onChange={(e) => setRotation(+e.target.value)}
              />
            </label>
          </div>
        )}
        {error && <p className="avatar-editor-error">{error}</p>}
        <div className="avatar-editor-actions">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Отмена
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void confirm()}
            disabled={!mediaId || !croppedAreaPixels || saving}
          >
            {saving ? 'Сохранение…' : 'Подтвердить'}
          </button>
        </div>
      </div>
    </div>
  );
}
