// usage: node render.mjs <log> <cols> <rows> <out.png>  — replays a pty log in a headless xterm and paints it
import { readFileSync, writeFileSync } from 'node:fs'
import xterm from '@xterm/headless'
import { PNG } from 'pngjs'
const [log, colsS, rowsS, out] = process.argv.slice(2)
const cols = Number(colsS), rows = Number(rowsS)
const term = new xterm.Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 })
await new Promise(r => term.write(readFileSync(log), r))
const CW = 8, CH = 16
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
// 5x7 font for printable ASCII, packed as 7 row bytes (low 5 bits)
const F = {}
const glyphs = `A:0e11111f111111 B:1e11111e11111e C:0e11101010110e D:1e11111111111e E:1f10101e10101f F:1f10101e101010 G:0e11101713110f H:1111111f111111 I:0e04040404040e J:0702020202120c K:11121418141211 L:1010101010101f M:111b1515111111 N:11111915131111 O:0e11111111110e P:1e11111e101010 Q:0e11111115120d R:1e11111e141211 S:0f10100e01011e T:1f040404040404 U:1111111111110e V:11111111110a04 W:11111115151b11 X:11110a040a1111 Y:11110a04040404 Z:1f01020408101f 0:0e13151911110e 1:040c040404040e 2:0e11010204081f 3:1f020402011 4:02060a121f0202 5:1f1e010101110e 6:0608101e11110e 7:1f010204080808 8:0e11110e11110e 9:0e11110f01020c .:0000000000000c ,:00000000000c04 -:0000001f000000 _:0000000000001f /:01010204081010 =:00001f001f0000 :::000c0c000c0c00 (:02040808080402 ):08040202020408 [:0e08080808080e ]:0e02020202020e !:04040404000004 ?:0e110102040004 +:0004041f040400 *:00150e1f0e1500 #:0a0a1f0a1f0a0a >:08040201020408 <:02040810080402 '|':04040404040404 @:0e11171517100e %:18190204081303 &:0c12140815120d`.split(' ')
for (const g of glyphs) { const k = g[0] === "'" ? '|' : g[0]; const hex = g.slice(2); F[k] = []; for (let i = 0; i < 7; i++) F[k].push(parseInt(hex.slice(i * 2, i * 2 + 2) || '00', 16)) }
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
      else if (ch !== ' ') {
        const up = ch.toUpperCase(); const rowsG = F[up]
        if (rowsG) { const gy = y - 4, gx = x - 1; if (gy >= 0 && gy < 7 && gx >= 0 && gx < 5 && (rowsG[gy] >> (4 - gx)) & 1) c2 = fg }
        else if (x > 1 && x < 6 && y > 5 && y < 12) c2 = fg
      }
      put(c * CW + x, r * CH + y, c2)
    }
  }
  lines.push(text.replace(/\s+$/, ''))
}
writeFileSync(out, PNG.sync.write(png))
writeFileSync(out.replace(/\.png$/, '.txt'), lines.join('\n'))
console.log('wrote', out)
