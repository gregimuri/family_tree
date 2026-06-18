export type Gender = 'male' | 'female' | 'unknown';
export type AppMode = 'view' | 'edit';
export type TreeTheme = 'clean' | 'forest';
export type CardSizeMode = 'uniform' | 'diminish';
export type DateDisplayFormat = 'full' | 'years' | 'hidden';
export type LocationDisplaySource =
  | 'birth'
  | 'death'
  | 'burial'
  | `residence:${string}`;

export type Religion =
  | 'none'
  | 'anglican'
  | 'jewish'
  | 'catholic'
  | 'lutheran'
  | 'muslim'
  | 'orthodox'
  | 'old_believer';
export type MediaType = 'photo' | 'video' | 'audio' | 'document';
export type CenterType = 'person' | 'family';

export interface DateValue {
  day?: number;
  month?: number;
  year?: number;
  text?: string;
  /** Julian (old style) calendar */
  julian?: boolean;
}

export interface Place {
  name: string;
  details?: string;
}

export interface AvatarCrop {
  mediaId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
}

export interface ResidenceEntry {
  id: string;
  place: Place;
  fromDate?: DateValue;
  toDate?: DateValue;
}

export interface Person {
  id: string;
  gender: Gender;
  surname: string;
  givenName: string;
  patronymic: string;
  birthSurname?: string;
  birthGivenName?: string;
  birthPatronymic?: string;
  nickname?: string;
  nicknamePriority: boolean;
  birth?: { date?: DateValue; place?: Place };
  death?: { date?: DateValue; cause?: string; place?: Place };
  burial?: Place;
  /** @deprecated migrated to residences */
  currentResidence?: Place;
  /** @deprecated migrated to residences */
  longestResidence?: Place;
  /** @deprecated migrated to residences */
  mainResidence?: Place;
  residences?: ResidenceEntry[];
  cardLocationSource: LocationDisplaySource;
  religion?: Religion;
  avatar?: AvatarCrop;
  biography: string;
  parentUnionIds: string[];
  unionIds: string[];
  mediaIds: string[];
}

export interface Union {
  id: string;
  partnerIds: string[];
  marriageStart?: DateValue;
  marriageEnd?: DateValue;
  childIds: string[];
}

export interface PhotoRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  personId: string;
  label: string;
}

export interface DocumentRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  transcription: string;
}

export interface MediaItem {
  id: string;
  type: MediaType;
  filename: string;
  date?: DateValue;
  place?: Place;
  description: string;
  personIds: string[];
  photoRegions?: PhotoRegion[];
  documentRegions?: DocumentRegion[];
}

export interface CardFieldSettings {
  showBirthName: boolean;
  showNickname: boolean;
  nicknamePriority: boolean;
  dateFormat: DateDisplayFormat;
  showAge: boolean;
  showLocation: boolean;
  showPhoto: boolean;
  /** Показывать вероисповедание на карточке. */
  showReligion?: boolean;
  /** @deprecated migrated to marriageDateFormat */
  showMarriageYears?: boolean;
  marriageDateFormat: DateDisplayFormat;
}

export interface ViewSettings {
  generationsUp: number;
  generationsDown: number;
  sideBranchesAt: number;
  sideBranchDepth: number;
  cardSizeMode: CardSizeMode;
  /** Показать всех персон проекта без ограничения поколений и боковых ветвей. */
  showAllPersons?: boolean;
  showDiedBefore18: boolean;
  theme: TreeTheme;
  cardFields: CardFieldSettings;
  /** Загружать медиа по http(s) URL из GEDCOM и проектов (по умолчанию выкл.) */
  allowExternalMedia?: boolean;
  /** Умная раскладка LayoutNet (refiner + модель). */
  smartLayoutEnabled?: boolean;
}

export interface ProjectCenter {
  type: CenterType;
  id: string;
}

export interface ManualLayoutEntry {
  x: number;
  y: number;
}

export interface ProjectMeta {
  name: string;
  modifiedAt: string;
  createdAt: string;
}

export interface Project {
  version: number;
  meta: ProjectMeta;
  persons: Record<string, Person>;
  unions: Record<string, Union>;
  media: Record<string, MediaItem>;
  viewSettings: ViewSettings;
  center: ProjectCenter;
  manualLayout?: Record<string, ManualLayoutEntry>;
  /** Пользовательские маршруты линий связи (ключ — id ребра раскладки). */
  manualEdgeRoutes?: Record<string, { x: number; y: number }[]>;
}

export interface RecentProject {
  id: string;
  name: string;
  openedAt: string;
  blobKey: string;
}

export type SelectionTarget =
  | { type: 'person'; id: string }
  | { type: 'family'; id: string }
  | null;

export interface LayoutNode {
  id: string;
  kind: 'person' | 'family';
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  isSideBranch: boolean;
  personId?: string;
  unionId?: string;
  partnerIds?: string[];
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  points: { x: number; y: number }[];
  /** Pre-built SVG path for multi-segment pedigree connectors (stem + bus + drops). */
  pathD?: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface SearchResult {
  personId: string;
  score: number;
  label: string;
  snippet: string;
}
