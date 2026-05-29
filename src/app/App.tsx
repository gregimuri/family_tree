import { useEffect } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { StartScreen } from '../components/start-screen/StartScreen';
import { TreeView } from '../components/tree/TreeView';
import { useProjectStore } from '../store/project-store';
import { useUiStore } from '../store/ui-store';
import { saveProjectFile } from '../services/project-io/zip-project';
import { Icons } from '../components/ui/Icons';
import './App.css';

function TreeRoute({ edit }: { edit: boolean }) {
  const project = useProjectStore((s) => s.project);
  const setMode = useProjectStore((s) => s.setMode);

  useEffect(() => {
    setMode(edit ? 'edit' : 'view');
  }, [edit, setMode]);

  if (!project) return <Navigate to="/" replace />;

  return (
    <div className="app-shell">
      <AppHeader edit={edit} />
      <TreeView />
    </div>
  );
}

function AppHeader({ edit }: { edit: boolean }) {
  const project = useProjectStore((s) => s.project);
  const mode = useProjectStore((s) => s.mode);
  const setMode = useProjectStore((s) => s.setMode);
  const mediaBlobs = useProjectStore((s) => s.mediaBlobs);
  const dirty = useProjectStore((s) => s.dirty);
  const toggleAddPerson = useUiStore((s) => s.toggleAddPerson);

  const personCount = project ? Object.keys(project.persons).length : 0;
  const unionCount = project ? Object.keys(project.unions).length : 0;
  const isEditing = edit || mode === 'edit';

  return (
    <header className="app-header">
      <Link to="/" className="app-home-link" title="На главную">
        <Icons.Home size={18} />
        <span>Главная</span>
      </Link>

      <div className="app-title-block">
        <Icons.Tree size={20} className="app-title-icon" />
        <span className="app-title">
          {project?.meta.name}
          {dirty && <span className="dirty-dot" title="Есть несохранённые изменения" />}
        </span>
        <span className="app-stats">
          {personCount} персон · {unionCount} семей
        </span>
      </div>

      <div className="app-header-actions">
        {isEditing && (
          <button type="button" className="btn" onClick={toggleAddPerson}>
            <Icons.UserPlus size={16} />
            Персона
          </button>
        )}
        {isEditing ? (
          <>
            <span className="mode-badge edit">Редактирование</span>
            <button type="button" className="btn" onClick={() => setMode('view')}>
              <Icons.Eye size={16} />
              Просмотр
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (project) void saveProjectFile(project, mediaBlobs);
              }}
            >
              <Icons.Save size={16} />
              Сохранить
            </button>
          </>
        ) : (
          <>
            <span className="mode-badge view">Просмотр</span>
            <button type="button" className="btn primary" onClick={() => setMode('edit')}>
              <Icons.Edit size={16} />
              Редактировать
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StartScreen />} />
        <Route path="/tree" element={<TreeRoute edit={false} />} />
        <Route path="/edit" element={<TreeRoute edit={true} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
