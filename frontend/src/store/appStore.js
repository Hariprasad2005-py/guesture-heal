// frontend/src/store/appStore.js
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useAppStore = create(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      token: null,

      setAuth: (user, token) => {
        set({ user, token });
      },
      logout: () => {
        set({ user: null, token: null, currentPatient: null, currentSession: null, publicPatientId: null });
      },
      isAuthenticated: () => !!get().token,

      // Current patient
      currentPatient: null,
      setCurrentPatient: (patient) => set({ currentPatient: patient }),

      // Public patient ID (for URL-based access)
      publicPatientId: null,
      setPublicPatientId: (id) => set({ publicPatientId: id }),

      // Current session
      currentSession: null,
      setCurrentSession: (session) => set({ currentSession: session }),

      // Game state
      currentGame: null,
      setCurrentGame: (game) => set({ currentGame: game }),
      gameCalibration: null,
      setGameCalibration: (data) => set({ gameCalibration: data }),

      // UI
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    {
      name: "gestureheal-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        currentPatient: state.currentPatient,
        currentSession: state.currentSession,
        gameCalibration: state.gameCalibration,
        publicPatientId: state.publicPatientId,
      }),
    }
  )
);