import type { Project } from '../types';

export function isExternalMediaUrl(filename: string): boolean {
  return /^https?:\/\//i.test(filename.trim());
}

export function countExternalMediaInProject(project: Project): number {
  return Object.values(project.media).filter((item) => isExternalMediaUrl(item.filename)).length;
}

export function formatExternalMediaWarning(count: number): string {
  if (count === 1) {
    return 'В файле найдена 1 ссылка на внешнее фото. По умолчанию такие ссылки не загружаются — браузер не обращается к сторонним сайтам. Ссылки сохранятся в проекте; загрузку можно включить в настройках древа.';
  }
  return `В файле найдено ${count} ссылок на внешние фото. По умолчанию такие ссылки не загружаются — браузер не обращается к сторонним сайтам. Ссылки сохранятся в проекте; загрузку можно включить в настройках древа.`;
}
