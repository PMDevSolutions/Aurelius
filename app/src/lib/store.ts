import { create } from "zustand";
import type {
  AppState,
  SEOAnalysis,
  AnalysisSettings,
  CheckCategory,
} from "@/types/seo";
import { getStorageItem, setStorageItem } from "./storage";

interface ToastState {
  visible: boolean;
  message: string;
}

interface Store extends AppState {
  toast: ToastState;
  setView: (view: AppState["view"]) => void;
  setAnalysis: (analysis: SEOAnalysis) => void;
  setSettings: (settings: Partial<AnalysisSettings>) => void;
  setActiveCategory: (category: CheckCategory | null) => void;
  setApiKey: (key: string) => void;
  setError: (error: string | null) => void;
  showToast: (message: string) => void;
  hideToast: () => void;
  loadApiKey: () => Promise<void>;
  reset: () => void;
}

const defaultSettings: AnalysisSettings = {
  keyword: "",
  secondaryKeywords: "",
  pageType: "blog-post",
  language: "en",
  advancedMode: false,
  targetUrl: "",
};

export const useStore = create<Store>((set) => ({
  view: "setup",
  analysis: null,
  settings: { ...defaultSettings },
  activeCategory: null,
  apiKey: "",
  error: null,
  toast: { visible: false, message: "" },

  setView: (view) => set({ view }),
  setAnalysis: (analysis) => set({ analysis }),
  setSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
  setActiveCategory: (category) =>
    set({ activeCategory: category, view: category ? "subscores" : "score" }),
  setApiKey: (key) => {
    set({ apiKey: key });
    // Persist in background — don't block state update
    setStorageItem("openai_api_key", key.trim());
  },
  setError: (error) => set({ error }),
  showToast: (message) => set({ toast: { visible: true, message } }),
  hideToast: () => set({ toast: { visible: false, message: "" } }),
  loadApiKey: async () => {
    const key = await getStorageItem<string>("openai_api_key");
    if (key) set({ apiKey: key });
  },
  reset: () =>
    set((state) => ({
      view: "setup",
      analysis: null,
      settings: {
        ...defaultSettings,
        targetUrl: state.settings.targetUrl,
        keyword: state.settings.keyword,
        advancedMode: state.settings.advancedMode,
        pageType: state.settings.pageType,
        secondaryKeywords: state.settings.secondaryKeywords,
        language: state.settings.language,
      },
      activeCategory: null,
      error: null,
    })),
}));
