import { handoffRoutesForIos, useInstall } from './install';

describe('install (native app)', () => {
  it('never offers to add to the home screen', () => {
    // A plain function on native: no state, so it can be called outside a component.
    const install = useInstall();
    expect(install.mode).toBeNull();
    expect(install.steps).toEqual([]);
    expect(() => {
      install.install();
      install.dismiss();
      handoffRoutesForIos();
    }).not.toThrow();
  });
});
