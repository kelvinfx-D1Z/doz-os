// DOZ OS — module navigation store (Zustand)
import { create } from "zustand";

export type ModuleId =
  | "command"
  | "planning"
  | "crm"
  | "projects"
  | "procurement"
  | "finance"
  | "team"
  | "sop"
  | "ai"
  | "field"
  | "routines";

interface AppState {
  activeModule: ModuleId;
  setModule: (m: ModuleId) => void;
  sidebarOpen: boolean;
  setSidebar: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "command",
  setModule: (m) => set({ activeModule: m }),
  sidebarOpen: true,
  setSidebar: (open) => set({ sidebarOpen: open }),
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
}));
