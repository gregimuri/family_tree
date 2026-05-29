import { useProjectStore } from '../../store/project-store';
import { PhotoViewer } from './PhotoViewer';
import { VideoViewer } from './VideoViewer';
import { AudioViewer } from './AudioViewer';
import { DocumentViewer } from './DocumentViewer';
import './MediaViewer.css';

interface MediaViewerProps {
  mediaId: string;
}

export function MediaViewer({ mediaId }: MediaViewerProps) {
  const project = useProjectStore((s) => s.project);
  const closeMediaViewer = useProjectStore((s) => s.closeMediaViewer);
  const getMediaUrl = useProjectStore((s) => s.getMediaUrl);

  if (!project) return null;
  const media = project.media[mediaId];
  if (!media) return null;
  const url = getMediaUrl(media.filename);

  return (
    <div className="media-viewer-overlay" onClick={closeMediaViewer}>
      <div className="media-viewer" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="media-viewer-close" onClick={closeMediaViewer}>
          ×
        </button>
        <header className="media-viewer-meta">
          <p>{media.description}</p>
          <p className="muted">
            {[media.date?.year, media.place?.name].filter(Boolean).join(' · ')}
          </p>
        </header>
        {!url ? (
          <p>Файл не найден: {media.filename}</p>
        ) : media.type === 'photo' ? (
          <PhotoViewer url={url} media={media} project={project} />
        ) : media.type === 'video' ? (
          <VideoViewer url={url} media={media} />
        ) : media.type === 'audio' ? (
          <AudioViewer url={url} media={media} />
        ) : (
          <DocumentViewer url={url} media={media} />
        )}
      </div>
    </div>
  );
}
