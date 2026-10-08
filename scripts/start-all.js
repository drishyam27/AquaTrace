const { spawn, exec } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const serverPath = path.resolve(rootDir, 'live_track_ship/src/server.js');
const attributionScript = path.resolve(rootDir, 'aquatrace_ais/run_attribution.py');

console.log('🌊 ========================================================');
console.log('🌊 AquaTrace — Starting Unified Environment...');
console.log('🌊 ========================================================');

// 1. Run Python attribution scoring first
console.log('⚙️  Step 1: Running Python AIS Attribution scoring engine...');
const py = spawn('python', [attributionScript], { cwd: path.resolve(rootDir, 'aquatrace_ais'), stdio: 'inherit' });

py.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Step 1 complete: Attribution candidates generated.');
  } else {
    console.warn('⚠️  Step 1 notice: Python attribution exited with code', code, '(using fallback demo data).');
  }

  // 2. Start Live Node.js Server
  console.log('\n⚙️  Step 2: Starting Node.js Live AIS & Web Server...');
  const server = spawn('node', [serverPath], { cwd: path.resolve(rootDir, 'live_track_ship'), stdio: 'inherit' });

  // 3. Open browser after 1.5s
  setTimeout(() => {
    const url = 'http://localhost:3001';
    console.log(`\n🚀 Opening AquaTrace Dashboard at ${url} ...\n`);
    const openCmd = process.platform === 'win32'
      ? `start ${url}`
      : process.platform === 'darwin'
      ? `open ${url}`
      : `xdg-open ${url}`;
    exec(openCmd);
  }, 1500);

  server.on('close', (serverCode) => {
    console.log('Server stopped with exit code:', serverCode);
  });
});
