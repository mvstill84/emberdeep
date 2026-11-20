// Inlines src/*.js into src/shell.html -> index.html (the whole game, one file)
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
// Build number = commit count + 1 (the commit this build is about to become)
let build = 1; try { build = +execSync('git rev-list --count HEAD').toString().trim() + 1; } catch (e) { }
const parts = ['core', 'data', 'world', 'render', 'main', 'campaign', 'dev', 'boot'].map(n => readFileSync(`src/${n}.js`, 'utf8'));
parts[0] = parts[0].replace("'use strict';", `'use strict';\nconst BUILD = ${build};`);
const html = readFileSync('src/shell.html', 'utf8').replace('/*__JS__*/', () => parts.join('\n'));
writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(1) + ' KB');
