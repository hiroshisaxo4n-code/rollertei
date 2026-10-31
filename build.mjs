import fs from 'fs';
const src = (f) => fs.readFileSync(new URL(`./src/${f}`, import.meta.url), 'utf8');
const mp4 = fs.readFileSync(new URL('./test/nosleep.mp4', import.meta.url)).toString('base64');
const js = [
  src('ble.js'), src('fit.js'), src('workouts.js'), src('scene.js'),
  `const NOSLEEP_MP4 = 'data:video/mp4;base64,${mp4}';`,
  src('app.js'),
].join('\n;\n').replace(/<\/script/gi, '<\\/script');
let html = src('index.html');
html = html.replace('/*__CSS__*/', () => src('style.css')).replace('/*__JS__*/', () => js);
fs.writeFileSync(new URL('./dist/index.html', import.meta.url), html);
console.log('built', (html.length / 1024).toFixed(1), 'KB');
