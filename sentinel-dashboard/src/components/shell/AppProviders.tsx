"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TutorialTermId } from "@/lib/tutorial";

type ToastState = { message: string } | null;

type AppContextValue = {
  toast: ToastState;
  showToast: (message: string) => void;
  tutorialOpen: boolean;
  tutorialTerm: TutorialTermId | null;
  openTutorial: (term?: TutorialTermId | null) => void;
  closeTutorial: () => void;
  addSheetOpen: boolean;
  openAddSheet: () => void;
  closeAddSheet: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProviders({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialTerm, setTutorialTerm] = useState<TutorialTermId | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast({ message });
    window.setTimeout(() => setToast(null), 2100);
  }, []);

  const openTutorial = useCallback((term: TutorialTermId | null = null) => {
    setTutorialTerm(term);
    setTutorialOpen(true);
  }, []);

  const closeTutorial = useCallback(() => {
    setTutorialOpen(false);
    setTutorialTerm(null);
  }, []);

  const value = useMemo(
    () => ({
      toast,
      showToast,
      tutorialOpen,
      tutorialTerm,
      openTutorial,
      closeTutorial,
      addSheetOpen,
      openAddSheet: () => setAddSheetOpen(true),
      closeAddSheet: () => setAddSheetOpen(false),
    }),
    [
      toast,
      showToast,
      tutorialOpen,
      tutorialTerm,
      openTutorial,
      closeTutorial,
      addSheetOpen,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppShell() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppShell must be used within AppProviders");
  return ctx;
}
