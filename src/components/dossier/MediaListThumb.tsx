import type { MediaItem } from '../../types';

const TYPE_LABELS: Record<MediaItem['type'], string> = {
  photo: 'Фото',
  video: 'Видео',
  audio: 'Аудио',
  document: 'Док',
};

interface MediaListThumbProps {
  media: MediaItem;
  url?: string;
}

export function MediaListThumb({ media, url }: MediaListThumbProps) {
  if (media.type === 'photo' && url) {
    return (
      <div className="media-list__thumb">
        <img src={url} alt="" loading="lazy" />
      </div>
    );
  }

  return (
    <div className={`media-list__thumb media-list__thumb--${media.type}`} aria-hidden>
      <span>{TYPE_LABELS[media.type]}</span>
    </div>
  );
}
