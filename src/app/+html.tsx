import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Web only: the HTML shell around every page.
//
// Each deploy renames the JS bundles, so a page from before a deploy (an open tab, a cached copy) asks for
// files that are gone and stalls on its server-rendered first frame. When one of our own bundles fails to
// load, reload once to get the current page; the timestamp keeps a real outage from looping.
const RELOAD_ON_STALE_BUNDLE = `
addEventListener('error', function (e) {
  var src = e.target && (e.target.src || e.target.href);
  if (!src || src.indexOf('/_expo/static/') < 0) return;
  try {
    var last = Number(sessionStorage.getItem('staleReload') || 0);
    if (Date.now() - last < 30000) return;
    sessionStorage.setItem('staleReload', String(Date.now()));
  } catch (_) {}
  location.reload();
}, true);
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <script dangerouslySetInnerHTML={{ __html: RELOAD_ON_STALE_BUNDLE }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
