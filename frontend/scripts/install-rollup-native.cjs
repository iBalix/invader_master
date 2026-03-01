/**
 * Postinstall: ensure the correct rollup native binding is present.
 * Handles the npm bug where optional platform-specific deps are skipped.
 */

const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

const ROLLUP_VERSION = '4.52.5';

const PLATFORM_PACKAGES = {
  'win32-x64': '@rollup/rollup-win32-x64-msvc',
  'linux-x64': '@rollup/rollup-linux-x64-gnu',
  'darwin-x64': '@rollup/rollup-darwin-x64',
  'darwin-arm64': '@rollup/rollup-darwin-arm64',
  'linux-arm64': '@rollup/rollup-linux-arm64-gnu',
};

const key = `${os.platform()}-${os.arch()}`;
const pkgName = PLATFORM_PACKAGES[key];

if (!pkgName) {
  console.log(`[rollup-native] No known binding for ${key}, skipping.`);
  process.exit(0);
}

try {
  require.resolve(pkgName);
} catch {
  console.log(`[rollup-native] Installing ${pkgName}@${ROLLUP_VERSION} for ${key}...`);
  try {
    execSync(`npm install ${pkgName}@${ROLLUP_VERSION} --no-save`, {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
  } catch {
    console.warn(`[rollup-native] Could not install ${pkgName}, build may fail.`);
  }
}
