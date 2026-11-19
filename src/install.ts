// Adding the web app to the home screen; the native app is already installed (see install.web.ts).
export type InstallMode = 'prompt' | 'steps' | null;

export function useInstall(): { mode: InstallMode; steps: string[]; install: () => void; dismiss: () => void } {
  return { mode: null, steps: [], install: () => {}, dismiss: () => {} };
}

export function handoffRoutesForIos() {}
