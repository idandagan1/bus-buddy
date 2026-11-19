// Adding the web app to the home screen; the native app is already installed (see install.web.ts).
export type InstallMode = 'prompt' | 'ios' | null;

export function useInstall(): { mode: InstallMode; install: () => void; dismiss: () => void } {
  return { mode: null, install: () => {}, dismiss: () => {} };
}

export function handoffRoutesForIos() {}
