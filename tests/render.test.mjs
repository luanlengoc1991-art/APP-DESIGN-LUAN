import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function requestCanvasRender()'), source.indexOf('function renderLayers()'));
test('pointer events batch redraws and thumbnails invalidate on visual changes', () => {
  let callback, draws = 0, thumbnailsDrawn = 0;
  const context = vm.createContext({
    requestAnimationFrame: fn => { callback = fn; return 1; },
    renderCanvas: () => draws++,
    newCanvas: () => ({ getContext: () => ({ scale() {} }), toDataURL: () => `image-${thumbnailsDrawn}` }),
    drawLayer: () => thumbnailsDrawn++
  });
  vm.runInContext('let canvasFrame=null; const thumbnails=new Map(),cache=new Map(),S={w:1600,h:1000};' + helpers, context);
  vm.runInContext('requestCanvasRender();requestCanvasRender();requestCanvasRender()', context);
  assert.equal(draws, 0);
  callback();
  assert.equal(draws, 1);
  vm.runInContext('requestCanvasRender()', context);
  callback();
  assert.equal(draws, 2);
  vm.runInContext("const l={id:'a',type:'text',text:'Luân',x:10,y:20,size:30,color:'#fff'};layerThumbnail(l);layerThumbnail(l);l.name='renamed';layerThumbnail(l)", context);
  assert.equal(thumbnailsDrawn, 1);
  vm.runInContext("l.x=40;layerThumbnail(l);l.text='Design';layerThumbnail(l);S.w=2000;layerThumbnail(l)", context);
  assert.equal(thumbnailsDrawn, 4);
  vm.runInContext("l.type='image';l.src='data:image/png;base64,AA';layerThumbnail(l);cache.set(l.src,{});layerThumbnail(l)", context);
  assert.equal(thumbnailsDrawn, 6);
});
