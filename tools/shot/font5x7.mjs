// The 5x7 pixel font the screenshot tools share. No imports, so it loads under node and bun alike.
// A terminal cell is 8x16 px; callers paint half-blocks themselves and ask here for text cells.
export const CW = 8, CH = 16

// 7 row bytes per glyph, low 5 bits are the pixels. Uppercase only: lowercase draws as uppercase.
// The bar `|` has no top row: screen.mjs always drew it that way, so existing pty shots stay comparable.
const GLYPHS = Object.fromEntries(`A:0e11111f111111 B:1e11111e11111e C:0e11101010110e D:1e11111111111e E:1f10101e10101f F:1f10101e101010 G:0e11101713110f H:1111111f111111 I:0e04040404040e J:0702020202120c K:11121418141211 L:1010101010101f M:111b1515111111 N:11111915131111 O:0e11111111110e P:1e11111e101010 Q:0e11111115120d R:1e11111e141211 S:0f10100e01011e T:1f040404040404 U:1111111111110e V:11111111110a04 W:11111115151b11 X:11110a040a1111 Y:11110a04040404 Z:1f01020408101f 0:0e13151911110e 1:040c040404040e 2:0e11010204081f 3:0e11010601110e 4:02060a121f0202 5:1f1e010101110e 6:0608101e11110e 7:1f010204080808 8:0e11110e11110e 9:0e11110f01020c .:0000000000000c ,:00000000000c04 -:0000001f000000 _:0000000000001f /:01010204081010 =:00001f001f0000 ::000c0c000c0c00 (:02040808080402 ):08040202020408 [:0e08080808080e ]:0e02020202020e !:04040404000004 ?:0e110102040004 +:0004041f040400 *:00150e1f0e1500 #:0a0a1f0a1f0a0a >:08040201020408 <:02040810080402 |:00040404040404 @:0e11171517100e %:18190204081303 &:0c12140815120d ★:04041f0e0e1b11 …:00000000000015 ✓:00010214080000 ✗:00110a040a1100`
  .split(' ')
  .map(g => [g[0], Array.from({ length: 7 }, (_, i) => parseInt(g.slice(-14).slice(i * 2, i * 2 + 2), 16))]))

// Is pixel (x, y) of the 8x16 cell lit for `ch`? A glyph the font lacks paints as a small box,
// so a missing character shows up instead of vanishing.
export const textPixel = (ch, x, y) => {
  const rows = GLYPHS[ch.toUpperCase()]
  const gx = x - 1, gy = y - 4
  if (rows) return gy >= 0 && gy < 7 && gx >= 0 && gx < 5 && ((rows[gy] >> (4 - gx)) & 1) === 1
  return x > 1 && x < 6 && y > 5 && y < 12
}
