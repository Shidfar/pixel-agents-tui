package main

// addOutline adds a 1px dark outline to a sprite within the same canvas dimensions.
// Any transparent pixel that is cardinally adjacent to an opaque pixel gets the
// outline color. This makes characters visually pop against the background,
// especially after downsampling.
func addOutline(s Sprite, outlineColor string) Sprite {
	rows := len(s)
	if rows == 0 {
		return s
	}
	cols := len(s[0])
	result := make(Sprite, rows)
	for r := range s {
		result[r] = make([]string, cols)
		copy(result[r], s[r])
	}
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			if s[r][c] == "" {
				continue
			}
			for _, d := range [][2]int{{-1, 0}, {1, 0}, {0, -1}, {0, 1}} {
				nr, nc := r+d[0], c+d[1]
				if nr >= 0 && nr < rows && nc >= 0 && nc < cols && s[nr][nc] == "" && result[nr][nc] == "" {
					result[nr][nc] = outlineColor
				}
			}
		}
	}
	return result
}

// RenderSpriteToPixels blits a sprite's pixels onto a 2D pixel buffer at the
// given position. The pixel buffer uses hex color strings; empty string ("")
// means transparent. Only non-transparent sprite pixels are copied, so
// sprites composite naturally over the background.
//
// destX, destY are in pixel coordinates (top-left corner of where to place
// the sprite). Pixels that fall outside destBuf bounds are silently clipped.
func RenderSpriteToPixels(s Sprite, destBuf [][]string, destX, destY int) {
	if len(s) == 0 {
		return
	}
	bufH := len(destBuf)
	if bufH == 0 {
		return
	}
	bufW := len(destBuf[0])

	for row := 0; row < len(s); row++ {
		py := destY + row
		if py < 0 {
			continue
		}
		if py >= bufH {
			break
		}
		spriteRow := s[row]
		for col := 0; col < len(spriteRow); col++ {
			px := destX + col
			if px < 0 {
				continue
			}
			if px >= bufW {
				break
			}
			color := spriteRow[col]
			if color != "" {
				destBuf[py][px] = color
			}
		}
	}
}
