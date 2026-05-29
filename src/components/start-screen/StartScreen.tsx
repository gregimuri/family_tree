import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecents, loadProjectFromDb } from '../../services/project-io/db';
import { openProjectFile, zipToProject } from '../../services/project-io/zip-project';
import { importGedcom } from '../../services/gedcom/import';
import { useProjectStore } from '../../store/project-store';
import { createId } from '../../utils/create-id';
import { countExternalMediaInProject, formatExternalMediaWarning } from '../../utils/media-url';
import type { Project, RecentProject } from '../../types';
import { Icons } from '../ui/Icons';
import './StartScreen.css';

export function StartScreen() {
  const navigate = useNavigate();
  const newProject = useProjectStore((s) => s.newProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [projectName, setProjectName] = useState('Новый проект');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getRecents().then(setRecents);
  }, []);

  const confirmExternalMedia = (project: Project): boolean => {
    const externalCount = countExternalMediaInProject(project);
    if (externalCount === 0) return true;
    setNotice(formatExternalMediaWarning(externalCount));
    return window.confirm(`${formatExternalMediaWarning(externalCount)}\n\nПродолжить открытие проекта?`);
  };

  const openTree = (edit = false) => {
    navigate(edit ? '/edit' : '/tree');
  };

  const handleNew = () => {
    newProject(projectName, true);
    openTree(true);
  };

  const handleOpen = async () => {
    const result = await openProjectFile();
    if (!result) return;
    if (!confirmExternalMedia(result.project)) return;
    loadProject(result.project, createId(), result.mediaBlobs, 'view', result.handle, result.file.name);
    openTree(false);
  };

  const handleGedcom = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ged,.gedcom,text/plain';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setError(null);
        const text = await file.text();
        const project = importGedcom(text, file.name.replace(/\.[^.]+$/, ''));
        if (Object.keys(project.persons).length === 0) {
          setError('Файл GEDCOM не содержит персон.');
          return;
        }
        if (!confirmExternalMedia(project)) return;
        loadProject(project, createId(), new Map(), 'edit');
        openTree(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не удалось импортировать GEDCOM');
      }
    };
    input.click();
  };

  const handleRecent = async (recent: RecentProject) => {
    const data = await loadProjectFromDb(recent.blobKey);
    if (data) {
      if (!confirmExternalMedia(data)) return;
      loadProject(data, recent.blobKey, new Map(), 'view');
      openTree(false);
    }
  };

  return (
    <div className="start-screen">
      <div className="start-layout">
        <section className="start-hero">
          <div className="start-logo">
            <Icons.Tree size={48} />
          </div>
          <h1>Генеалогическое древо</h1>
          <p className="subtitle">
            Создавайте, изучайте и редактируйте генеалогические древа. Проекты хранятся локально на вашем
            компьютере.
          </p>
          <ul className="start-features">
            <li>Импорт и экспорт GEDCOM</li>
            <li>Личные дела и медиаархив</li>
            <li>Настраиваемая визуализация</li>
          </ul>
        </section>

        <section className="start-card">
          {error && <p className="start-error">{error}</p>}
          {notice && !error && <p className="start-notice">{notice}</p>}

          <label className="start-label">
            Название нового проекта
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Семейное древо"
            />
          </label>

          <div className="start-actions">
            <button type="button" className="action-card primary" onClick={handleNew}>
              <span className="action-card__icon"><Icons.Plus size={22} /></span>
              <span className="action-card__text">
                <strong>Создать проект</strong>
                <small>Пустое древо для ручного заполнения</small>
              </span>
            </button>
            <button type="button" className="action-card" onClick={() => void handleOpen()}>
              <span className="action-card__icon"><Icons.FolderOpen size={22} /></span>
              <span className="action-card__text">
                <strong>Открыть проект</strong>
                <small>Файл .drevo или .zip</small>
              </span>
            </button>
            <button type="button" className="action-card" onClick={handleGedcom}>
              <span className="action-card__icon"><Icons.FileImport size={22} /></span>
              <span className="action-card__text">
                <strong>Импорт GEDCOM</strong>
                <small>Familio, FamyTale и другие</small>
              </span>
            </button>
          </div>

          {recents.length > 0 && (
            <section className="recents">
              <h2><Icons.Clock size={16} /> Недавние проекты</h2>
              <ul>
                {recents.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => void handleRecent(r)}>
                      <span className="recents__name">{r.name}</span>
                      <span className="recents__date">
                        {new Date(r.openedAt).toLocaleString('ru-RU')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

export async function openGedcomFile(file: File) {
  const text = await file.text();
  return importGedcom(text, file.name.replace(/\.[^.]+$/, ''));
}

export async function openZipFile(file: File) {
  return zipToProject(file);
}
