import type { MediaItem } from '../../types';

export function AudioViewer({ url, media }: { url: string; media: MediaItem }) {
  return (
    <audio controls className="audio-viewer">
      <source src={url} />
      {media.description}
    </audio>
  );
}
