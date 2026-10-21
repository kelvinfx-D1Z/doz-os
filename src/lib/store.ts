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
  | "routines"
  | "marketing"
  | "staff-hub"
  | "help"
  | "updates"
  | "profile"
  | "messages"
  | "vendors"
  | "documents"
  | "tasks"
  | "playbook"
  | "news";

interface AppState {
  activeModule: ModuleId;
  setModule: (m: ModuleId) => void;
  /**
   * Which tab Procurement should open on. Set by a caller that is sending the
   * user somewhere specific (the Command Center's vendor-application card
   * wants the Onboarding tab, not the default Payments one). Only one module
   * is mounted at a time, so Procurement reads this on mount as its
   * defaultValue and clears it — it is a one-shot hand-off, not live state.
   */
  procurementTab: string | null;
  setProcurementTab: (tab: string | null) => void;
  sidebarOpen: boolean;
  setSidebar: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "command",
  setModule: (m) => set({ activeModule: m }),
  procurementTab: null,
  setProcurementTab: (tab) => set({ procurementTab: tab }),
  sidebarOpen: true,
  setSidebar: (open) => set({ sidebarOpen: open }),
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
}));
