import { useEffect } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { StartScreen } from '../components/start-screen/StartScreen';
import { TreeView } from '../components/tree/TreeView';
import { useProjectUndo } from '../hooks/useProjectUndo';
import { useProjectStore } from '../store/project-store';
import { useUiStore } from '../store/ui-store';
import { Icons } from '../components/ui/Icons';
import './App.css';

function TreeRoute({ edit }: { edit: boolean }) {
  const project = useProjectStore((s) => s.project);
  const setMode = useProjectStore((s) => s.setMode);

  useEffect(() => {
    setMode(edit ? 'edit' : 'view');
  }, [edit, setMode]);

  useProjectUndo(edit);

  if (!project) return <Navigate to="/" replace />;

  return (
    <div className="app-shell">
      <AppHeader />
      <TreeView />
    </div>
  );
}

function AppHeader() {
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.project);
  const mode = useProjectStore((s) => s.mode);
  const setMode = useProjectStore((s) => s.setMode);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const saveProject = useProjectStore((s) => s.saveProject);
  const saveProjectAs = useProjectStore((s) => s.saveProjectAs);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.undoStack.length > 0);
  const canRedo = useProjectStore((s) => s.redoStack.length > 0);
  const dirty = useProjectStore((s) => s.dirty);
  const toggleAddPerson = useUiStore((s) => s.toggleAddPerson);

  const personCount = project ? Object.keys(project.persons).length : 0;
  const unionCount = project ? Object.keys(project.unions).length : 0;
  const isEditing = mode === 'edit';

  const enterViewMode = () => {
    setMode('view');
    navigate('/tree');
  };

  const enterEditMode = () => {
    setMode('edit');
    navigate('/edit');
  };

  return (
    <header className="app-header">
      <Link to="/" className="app-home-link" title="На главную">
        <Icons.Home size={18} />
        <span>Главная</span>
      </Link>

      <div className="app-title-block">
        <Icons.Tree size={20} className="app-title-icon" />
        {isEditing ? (
          <input
            className="app-title-input"
            value={project?.meta.name ?? ''}
            onChange={(e) => setProjectName(e.target.value)}
            aria-label="Название проекта"
          />
        ) : (
          <span className="app-title">
            {project?.meta.name}
            {dirty && <span className="dirty-dot" title="Есть несохранённые изменения" />}
          </span>
        )}
        {isEditing && dirty && <span className="dirty-dot" title="Есть несохранённые изменения" />}
        <span className="app-stats">
          {personCount} персон · {unionCount} семей
        </span>
      </div>

      <div className="app-header-actions">
        {isEditing && (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => undo()}
              disabled={!canUndo}
              title="Отменить (Ctrl+Z)"
            >
              <Icons.Undo size={16} />
              Отменить
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => redo()}
              disabled={!canRedo}
              title="Вернуть (Ctrl+Y)"
            >
              <Icons.Redo size={16} />
              Вернуть
            </button>
            <button type="button" className="btn" onClick={toggleAddPerson}>
              <Icons.UserPlus size={16} />
              Персона
            </button>
          </>
        )}
        {isEditing ? (
          <>
            <span className="mode-badge edit">Редактирование</span>
            <button type="button" className="btn" onClick={enterViewMode}>
              <Icons.Eye size={16} />
              Просмотр
            </button>
            <button type="button" className="btn primary" onClick={() => void saveProject()}>
              <Icons.Save size={16} />
              Сохранить
            </button>
            <button type="button" className="btn" onClick={() => void saveProjectAs()}>
              Сохранить как
            </button>
          </>
        ) : (
          <>
            <span className="mode-badge view">Просмотр</span>
            <button type="button" className="btn primary" onClick={enterEditMode}>
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
  const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <BrowserRouter basename={routerBasename || undefined}>
      <Routes>
        <Route path="/" element={<StartScreen />} />
        <Route path="/tree" element={<TreeRoute edit={false} />} />
        <Route path="/edit" element={<TreeRoute edit={true} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
