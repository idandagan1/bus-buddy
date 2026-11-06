// The runtime version is a fingerprint of the native project. npm scripts (test, build:njt, …) don't affect the
// native app, so leave them out; otherwise adding a script strands over-the-air updates until the next build.
const { SourceSkips } = require('@expo/fingerprint');

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: SourceSkips.PackageJsonScriptsAll,
};
