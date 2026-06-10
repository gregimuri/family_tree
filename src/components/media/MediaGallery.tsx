import { useMemo, useState } from 'react';
import type { MediaItem } from '../../types';
import { useProjectStore } from '../../store/project-store';
import { createId } from '../../utils/create-id';
import { MediaListThumb } from '../dossier/MediaListThumb';
import './MediaGallery.css';

interface MediaGalleryProps {
  onClose: () => void;
  canEdit: boolean;
}

function mediaTypeLabel(type: MediaItem['type']): string {
  switch (type) {
    case 'photo':
      return 'Фото';
    case 'video':
      return 'Видео';
    case 'audio':
      return 'Аудио';
    case 'document':
      return 'Документ';
    default:
      return type;
  }
}

export function MediaGallery({ onClose, canEdit }: MediaGalleryProps) {
  const project = useProjectStore((s) => s.project);
  const getMediaUrl = useProjectStore((s) => s.getMediaUrl);
  const updateMedia = useProjectStore((s) => s.updateMedia);
  const deleteMedia = useProjectStore((s) => s.deleteMedia);
  const addMedia = useProjectStore((s) => s.addMedia);
  const openMediaViewer = useProjectStore((s) => s.openMediaViewer);

  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    if (!project) return [];
    return Object.values(project.media).sort((a, b) =>
      (a.description || a.filename).localeCompare(b.description || b.filename, 'ru'),
    );
  }, [project]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (m) =>
        m.filename.toLowerCase().includes(q) ||
        (m.description ?? '').toLowerCase().includes(q) ||
        m.type.includes(q),
    );
  }, [items, query]);

  if (!project) return null;

  const removeMedia = (mediaId: string) => {
    const item = project.media[mediaId];
    const label = item?.description || item?.filename || 'файл';
    if (!window.confirm(`Удалить «${label}» из проекта? Файл будет удалён без возможности восстановления.`)) {
      return;
    }
    deleteMedia(mediaId);
  };

  return (
    <div className="media-gallery-overlay" onClick={onClose}>
      <div className="media-gallery" onClick={(e) => e.stopPropagation()}>
        <header className="media-gallery__header">
          <h3>Галерея проекта</h3>
          <button type="button" className="media-gallery__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>

        <div className="media-gallery__toolbar">
          <input
            type="search"
            className="media-gallery__search"
            placeholder="Поиск по названию или описанию…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {canEdit && (
            <label className="media-gallery__upload btn">
              <span>Добавить файл</span>
              <input
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const id = createId();
                  const type = file.type.startsWith('video')
                    ? 'video'
                    : file.type.startsWith('audio')
                      ? 'audio'
                      : file.type === 'application/pdf'
                        ? 'document'
                        : 'photo';
                  addMedia({ id, type, filename: file.name, description: file.name, personIds: [] }, file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="media-gallery__empty">
            {items.length === 0 ? 'В проекте пока нет медиафайлов' : 'Ничего не найдено'}
          </p>
        ) : (
          <ul className="media-gallery__list">
            {filtered.map((m) => {
              const url = getMediaUrl(m.filename);
              return (
                <li key={m.id} className={canEdit ? 'media-gallery__item media-gallery__item--edit' : 'media-gallery__item'}>
                  <button
                    type="button"
                    className="media-gallery__thumb-btn"
                    onClick={() => openMediaViewer(m.id)}
                    title="Открыть"
                  >
                    <MediaListThumb media={m} url={url} />
                  </button>
                  <div className="media-gallery__body">
                    <div className="media-gallery__meta">
                      {mediaTypeLabel(m.type)} · {m.filename}
                    </div>
                    {canEdit ? (
                      <div className="media-gallery__edit-row">
                        <input
                          value={m.description}
                          onChange={(e) => updateMedia({ ...m, description: e.target.value })}
                          placeholder="Описание"
                        />
                        <button
                          type="button"
                          className="media-gallery__delete"
                          onClick={() => removeMedia(m.id)}
                          title="Удалить из проекта"
                          aria-label="Удалить из проекта"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="media-gallery__label">{m.description || m.filename}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
