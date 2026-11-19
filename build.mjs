// Inlines src/*.js into src/shell.html -> index.html (the whole game, one file)
import { readFileSync, writeFileSync } from 'fs';
const parts = ['core', 'data', 'world', 'render', 'main'].map(n => readFileSync(`src/${n}.js`, 'utf8'));
const html = readFileSync('src/shell.html', 'utf8').replace('/*__JS__*/', () => parts.join('\n'));
writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(1) + ' KB');
