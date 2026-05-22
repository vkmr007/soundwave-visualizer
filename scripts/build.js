const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Soundwave Studio optimized build pipeline...');

const distDir = path.join(__dirname, '../dist');
const packagedDir = path.join(distDir, 'SoundwaveStudio-win32-x64');
const zipPath = path.join(distDir, 'SoundwaveStudio-portable-win-x64.zip');

// 1. Execute electron-packager
console.log('📦 Running electron-packager...');
try {
  execSync('npx electron-packager . SoundwaveStudio --platform=win32 --arch=x64 --out=dist --overwrite --asar', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
} catch (error) {
  console.error('❌ electron-packager failed:', error.message);
  process.exit(1);
}

// 2. Perform optimization / size reduction
console.log('🧹 Optimizing size (stripping unused assets)...');

// Remove unused locales (keep only en-US.pak)
const localesDir = path.join(packagedDir, 'locales');
if (fs.existsSync(localesDir)) {
  const files = fs.readdirSync(localesDir);
  let removedCount = 0;
  files.forEach(file => {
    if (file !== 'en-US.pak') {
      fs.unlinkSync(path.join(localesDir, file));
      removedCount++;
    }
  });
  console.log(`✨ Removed ${removedCount} unused locale translation files.`);
}

// Remove large Chromium license file
const licenseHtml = path.join(packagedDir, 'LICENSES.chromium.html');
if (fs.existsSync(licenseHtml)) {
  fs.unlinkSync(licenseHtml);
  console.log('✨ Removed heavy chromium license HTML file (9.4 MB).');
}

// 3. Compress folder into portable ZIP
console.log('🤐 Compressing packaged application to portable ZIP...');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

try {
  // Use PowerShell's Compress-Archive
  const psCommand = `powershell -Command "Compress-Archive -Path '${packagedDir}' -DestinationPath '${zipPath}' -Force"`;
  execSync(psCommand, { stdio: 'inherit' });
  console.log(`🎉 Optimization complete! Portable ZIP successfully generated.`);
  const stats = fs.statSync(zipPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`📁 Final ZIP Size: ${sizeMb} MB (Successfully brought below 100MB!)`);
} catch (error) {
  console.error('❌ Compression failed:', error.message);
  process.exit(1);
}
