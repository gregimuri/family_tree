import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export const Icons = {
  Tree: (p: IconProps) => (
    <Icon {...p}><path d="M12 22v-7" /><path d="M9 15H7a4 4 0 0 1 4-4V3" /><path d="M15 15h2a4 4 0 0 0-4-4V3" /><path d="M12 3a3 3 0 0 0-3 3v2" /><path d="M12 3a3 3 0 0 1 3 3v2" /></Icon>
  ),
  Plus: (p: IconProps) => (
    <Icon {...p}><path d="M12 5v14" /><path d="M5 12h14" /></Icon>
  ),
  FolderOpen: (p: IconProps) => (
    <Icon {...p}><path d="M6 14V6a2 2 0 0 1 2-2h3l2 2h5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" /></Icon>
  ),
  FileImport: (p: IconProps) => (
    <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="M9 15l3 3 3-3" /></Icon>
  ),
  Search: (p: IconProps) => (
    <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>
  ),
  Settings: (p: IconProps) => (
    <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></Icon>
  ),
  Export: (p: IconProps) => (
    <Icon {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></Icon>
  ),
  Target: (p: IconProps) => (
    <Icon {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></Icon>
  ),
  ZoomIn: (p: IconProps) => (
    <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="M11 8v6" /><path d="M8 11h6" /><path d="m21 21-4.3-4.3" /></Icon>
  ),
  ZoomOut: (p: IconProps) => (
    <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="M8 11h6" /><path d="m21 21-4.3-4.3" /></Icon>
  ),
  Maximize: (p: IconProps) => (
    <Icon {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></Icon>
  ),
  Minimize: (p: IconProps) => (
    <Icon {...p}><path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="M14 14l7-7" /><path d="M3 21l7-7" /></Icon>
  ),
  Move: (p: IconProps) => (
    <Icon {...p}><path d="M12 2v20" /><path d="m15 5-3-3-3 3" /><path d="m15 19-3 3-3-3" /><path d="M2 12h20" /><path d="m5 9-3 3 3 3" /><path d="m22 9-3 3 3-3" /></Icon>
  ),
  Home: (p: IconProps) => (
    <Icon {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></Icon>
  ),
  UserPlus: (p: IconProps) => (
    <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></Icon>
  ),
  Edit: (p: IconProps) => (
    <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>
  ),
  Save: (p: IconProps) => (
    <Icon {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></Icon>
  ),
  Eye: (p: IconProps) => (
    <Icon {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Icon>
  ),
  ChevronLeft: (p: IconProps) => (
    <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>
  ),
  ChevronRight: (p: IconProps) => (
    <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>
  ),
  Clock: (p: IconProps) => (
    <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Icon>
  ),
};
