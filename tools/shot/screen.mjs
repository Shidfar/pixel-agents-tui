// usage: node render.mjs <log> <cols> <rows> <out.png>  — replays a pty log in a headless xterm and paints it
import { readFileSync, writeFileSync } from 'node:fs'
import xterm from '@xterm/headless'
import { PNG } from 'pngjs'
import { CW, CH, textPixel } from './font5x7.mjs'
const [log, colsS, rowsS, out] = process.argv.slice(2)
const cols = Number(colsS), rows = Number(rowsS)
const term = new xterm.Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 })
await new Promise(r => term.write(readFileSync(log), r))
const png = new PNG({ width: cols * CW, height: rows * CH })
const DEF_FG = [204, 204, 204], DEF_BG = [16, 16, 20]
const base16 = [[0,0,0],[205,49,49],[13,188,121],[229,229,16],[36,114,200],[188,63,188],[17,168,205],[229,229,229],[102,102,102],[241,76,76],[35,209,139],[245,245,67],[59,142,234],[214,112,214],[41,184,219],[255,255,255]]
const pal = (n) => {
  if (n < 16) return base16[n]
  if (n < 232) { n -= 16; const v = [0, 95, 135, 175, 215, 255]; return [v[Math.floor(n / 36)], v[Math.floor(n / 6) % 6], v[n % 6]] }
  const g = 8 + (n - 232) * 10; return [g, g, g]
}
const color = (cell, fg) => {
  const rgb = fg ? cell.isFgRGB() : cell.isBgRGB()
  const p = fg ? cell.isFgPalette() : cell.isBgPalette()
  const v = fg ? cell.getFgColor() : cell.getBgColor()
  if (rgb) return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  if (p) return pal(v)
  return fg ? DEF_FG : DEF_BG
}
const put = (x, y, c) => { const i = (y * png.width + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255 }
const buf = term.buffer.active
const lines = []
for (let r = 0; r < rows; r++) {
  const line = buf.getLine(buf.viewportY + r); let text = ''
  for (let c = 0; c < cols; c++) {
    const cell = line?.getCell(c); const ch = cell?.getChars() || ' '; text += ch
    let fg = cell ? color(cell, true) : DEF_FG, bg = cell ? color(cell, false) : DEF_BG
    if (cell?.isInverse()) [fg, bg] = [bg, fg]
    if (cell?.isDim()) fg = fg.map(v => (v * 0.6) | 0)
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      let c2 = bg
      if (ch === '▀') c2 = y < CH / 2 ? fg : bg
      else if (ch === '▄') c2 = y >= CH / 2 ? fg : bg
      else if (ch === '█') c2 = fg
      else if (ch !== ' ' && textPixel(ch, x, y)) c2 = fg
      put(c * CW + x, r * CH + y, c2)
    }
  }
  lines.push(text.replace(/\s+$/, ''))
}
writeFileSync(out, PNG.sync.write(png))
writeFileSync(out.replace(/\.png$/, '.txt'), lines.join('\n'))
console.log('wrote', out)
