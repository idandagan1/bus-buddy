import { installGuide } from './installSteps';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/133.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  desktopChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const first = (ua: string, touchMac = false) => installGuide(ua, touchMac)?.steps[0];

describe('installGuide', () => {
  it('sends iPhone Chrome to the Share button in its address bar, not Safari’s', () => {
    expect(installGuide(UA.iphoneChrome)?.os).toBe('ios');
    expect(first(UA.iphoneChrome)).toMatch(/Chrome’s address bar/);
  });

  it('gives each iPhone browser its own menu', () => {
    expect(first(UA.iphoneSafari)).toMatch(/^Tap the Share button/);
    expect(first(UA.iphoneFirefox)).toMatch(/menu ☰/);
  });

  it('asks in-app browsers to open Safari first', () => {
    expect(first(UA.iphoneInstagram)).toMatch(/Open this page in Safari/);
  });

  it('treats an iPad asking for the desktop site as an iPad', () => {
    expect(installGuide(UA.ipadDesktopMode, true)?.os).toBe('ios');
    expect(installGuide(UA.ipadDesktopMode)).toBeNull();
  });

  it('gives Android browsers their menu steps', () => {
    expect(installGuide(UA.androidChrome)?.os).toBe('android');
    expect(first(UA.androidChrome)).toMatch(/menu ⋮/);
    expect(installGuide(UA.androidSamsung)?.steps[1]).toMatch(/Add page to/);
    expect(installGuide(UA.androidFirefox)?.steps[1]).toMatch(/Add to Home screen/);
  });

  it('has nothing for desktops', () => {
    expect(installGuide(UA.desktopChrome)).toBeNull();
  });
});
