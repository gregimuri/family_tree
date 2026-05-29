import type { MediaItem, Project } from '../../types';
import { formatPersonName } from '../../models/person-utils';
import './MediaViewer.css';

interface PhotoViewerProps {
  url: string;
  media: MediaItem;
  project: Project;
}

export function PhotoViewer({ url, media, project }: PhotoViewerProps) {
  return (
    <div className="photo-viewer">
      <img src={url} alt={media.description} />
      {media.photoRegions?.map((r, i) => {
        const person = project.persons[r.personId];
        const label = r.label || (person ? formatPersonName(person) : '');
        return (
          <div
            key={i}
            className="photo-region"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
            }}
            title={label}
          >
            <span className="photo-region-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
