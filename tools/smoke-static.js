#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'tiny-world-builder.html'), 'utf8');

function fail(message) {
  console.error('smoke failed:', message);
  process.exit(1);
}
function requireIncludes(text, label) {
  if (!html.includes(text)) fail('missing ' + label + ': ' + text);
}
function requireNotIncludes(text, label) {
  if (html.includes(text)) fail('unexpected ' + label + ': ' + text);
}

requireIncludes('function setCell(', 'state mutation entry point');
requireIncludes('function renderCellObject(', 'object renderer');
requireIncludes('function applyTool(', 'tool application');
requireIncludes('function doClear(', 'clear action');
requireIncludes('function togglePerspective(', 'camera toggle');
requireIncludes('function makeCloud(', 'voxel cloud factory');
requireIncludes('function openTinyModal(', 'modal focus helper');
requireIncludes('customDepthMaterial', 'cloud shadow depth material');
requireIncludes('vendor/three/three.r128.min.js', 'self-hosted Three.js');
requireIncludes('vendor/three/GLTFLoader.r128.js', 'self-hosted GLTFLoader');

const netlifyToml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
if (!netlifyToml.includes('publish = "dist"') || !netlifyToml.includes('command = "./publish.sh"')) {
  fail('netlify.toml does not point Netlify at publish.sh/dist');
}

requireNotIncludes('cdnjs.cloudflare.com/ajax/libs/three.js', 'Three.js CDN');
requireNotIncludes('cdn.jsdelivr.net/npm/three', 'GLTFLoader CDN');
requireNotIncludes('postTarget', 'post-processing render target');
requireNotIncludes('postMaterial', 'post-processing shader material');
requireNotIncludes('postProcessingEnabled', 'post-processing mode flag');
requireNotIncludes('render-smoothing', 'dead post smoothing control');

for (const asset of [
  'vendor/three/three.r128.min.js',
  'vendor/three/GLTFLoader.r128.js',
  'cluso/cluso-embed.js',
  'cluso/cluso-embed.css',
]) {
  if (!fs.existsSync(path.join(root, asset))) fail('missing local asset ' + asset);
}

console.log('smoke ok');
