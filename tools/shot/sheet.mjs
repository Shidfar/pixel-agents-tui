import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { TILE_PALETTE, TILE_SPRITES, CHAR_TEMPLATES, CHAR_PALETTES } from '../../src/engine/art.gen.ts'
const S = 4, names = Object.keys(TILE_SPRITES), tmpl = Object.keys(CHAR_TEMPLATES)
const W = Math.max(names.length * 18, tmpl.length * 18) * S, H = (18 + 26 * 2) * S
const png = new PNG({ width: W, height: H })
for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 30; png.data[i + 1] = 30; png.data[i + 2] = 40; png.data[i + 3] = 255 }
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const dot = (x, y, rgb) => { for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { const i = ((y * S + a) * W + x * S + b) * 4; png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2] } }
names.forEach((n, k) => TILE_SPRITES[n].forEach((row, y) => { for (let x = 0; x < 16; x++) { const p = row.slice(x * 2, x * 2 + 2); if (p !== '..') dot(k * 18 + x, y, hex(TILE_PALETTE[parseInt(p, 16)])) } }))
const keys = { H: 'hair', K: 'skin', S: 'shirt', P: 'pants', O: 'shoes' }
for (const [pi, oy] of [[0, 18], [1, 44]]) tmpl.forEach((n, k) => CHAR_TEMPLATES[n].forEach((row, y) => { for (let x = 0; x < 16; x++) { const c = row[x]; if (c === '.') continue; dot(k * 18 + x, oy + y, c === 'E' ? [255, 255, 255] : hex(CHAR_PALETTES[pi][keys[c]])) } }))
writeFileSync('docs/screenshots/art-sheet.png', PNG.sync.write(png)); console.log(names.join(' ')); console.log(tmpl.join(' '))
