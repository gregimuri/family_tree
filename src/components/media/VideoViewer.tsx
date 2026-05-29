import type { MediaItem } from '../../types';

export function VideoViewer({ url, media }: { url: string; media: MediaItem }) {
  return (
    <video controls className="video-viewer">
      <source src={url} />
      {media.description}
    </video>
  );
}
