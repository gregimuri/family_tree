import { create } from 'zustand';

interface UiState {
  searchOpen: boolean;
  settingsOpen: boolean;
  addPersonOpen: boolean;
  exportOpen: boolean;
  fullscreen: boolean;
  searchQuery: string;
  highlightedPersonId: string | null;

  toggleSearch: () => void;
  toggleSettings: () => void;
  toggleAddPerson: () => void;
  setExportOpen: (open: boolean) => void;
  setFullscreen: (on: boolean) => void;
  setSearchQuery: (q: string) => void;
  setHighlightedPersonId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  searchOpen: true,
  settingsOpen: true,
  addPersonOpen: false,
  exportOpen: false,
  fullscreen: false,
  searchQuery: '',
  highlightedPersonId: null,

  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  toggleAddPerson: () => set((s) => ({ addPersonOpen: !s.addPersonOpen })),
  setExportOpen: (open) => set({ exportOpen: open }),
  setFullscreen: (on) => set({ fullscreen: on }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setHighlightedPersonId: (id) => set({ highlightedPersonId: id }),
}));
