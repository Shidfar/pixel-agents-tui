import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { fromHex, isOpaque, resolve } from '../../src/engine/art'
import { TILE_SPRITES, CHAR_TEMPLATES, CHAR_PALETTES } from '../../src/engine/art.gen.ts'
const S = 4, names = Object.keys(TILE_SPRITES), tmpl = Object.keys(CHAR_TEMPLATES)
const W = Math.max(names.length * 18, tmpl.length * 18) * S, H = (18 + 26 * 2) * S
const png = new PNG({ width: W, height: H })
for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 30; png.data[i + 1] = 30; png.data[i + 2] = 40; png.data[i + 3] = 255 }
const rgb = (c) => [c >> 16, (c >> 8) & 255, c & 255]
const dot = (x, y, rgb) => { for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const i = ((y * S + a) * W + x * S + b) * 4; png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2] } }
names.forEach((n, k) => fromHex(TILE_SPRITES[n]).forEach((c, i) => { if (isOpaque(c)) dot(k * 18 + (i & 15), i >> 4, rgb(c)) }))
for (const [pi, oy] of [[0, 18], [1, 44]]) tmpl.forEach((n, k) => resolve(CHAR_TEMPLATES[n], CHAR_PALETTES[pi]).forEach((c, i) => { if (isOpaque(c)) dot(k * 18 + (i & 15), oy + (i >> 4), rgb(c)) }))
writeFileSync('docs/screenshots/art-sheet.png', PNG.sync.write(png)); console.log(names.join(' ')); console.log(tmpl.join(' '))
