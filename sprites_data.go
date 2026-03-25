package main

// Character sprite definitions, converted from webview-spriteData.ts.
//
// The TypeScript original uses "template cells" (hair, skin, shirt, pants, shoes, eyes)
// that are resolved against per-palette colors. We replicate this exactly:
// templates are stored as [][]string with palette keys, then resolved at init time.
//
// Each character sprite is 16x24 pixels.
// Walk: 4 frames per direction (frame 0, 1=standing, 2=mirror legs, 3=standing again)
// Type: 2 frames per direction (seated, arms on keyboard alternating)
// Read: 2 frames per direction (seated, arms at sides, head bob)

// ── Palette keys ──────────────────────────────────────────────
const (
	tH = "hair"    // hair color
	tK = "skin"    // skin color
	tS = "shirt"   // shirt color
	tP = "pants"   // pants color
	tO = "shoes"   // shoe color
	tE = "#FFFFFF" // eyes (white)
	t_ = ""        // transparent
)

// charPalette holds the 5 color slots for a character.
type charPalette struct {
	Skin  string
	Shirt string
	Pants string
	Hair  string
	Shoes string
}

// The 6 original palettes from webview-spriteData.ts CHARACTER_PALETTES.
var characterPalettes = []charPalette{
	{Skin: "#FFCC99", Shirt: "#4488CC", Pants: "#334466", Hair: "#553322", Shoes: "#222222"},
	{Skin: "#FFCC99", Shirt: "#CC4444", Pants: "#333333", Hair: "#FFD700", Shoes: "#222222"},
	{Skin: "#DEB887", Shirt: "#44AA66", Pants: "#334444", Hair: "#222222", Shoes: "#333333"},
	{Skin: "#FFCC99", Shirt: "#AA55CC", Pants: "#443355", Hair: "#AA4422", Shoes: "#222222"},
	{Skin: "#DEB887", Shirt: "#CCAA33", Pants: "#444433", Hair: "#553322", Shoes: "#333333"},
	{Skin: "#FFCC99", Shirt: "#FF8844", Pants: "#443322", Hair: "#111111", Shoes: "#222222"},
}

// resolveTemplate converts a template grid to a resolved Sprite using palette colors.
func resolveTemplate(template [][]string, pal charPalette) Sprite {
	result := make(Sprite, len(template))
	for r, row := range template {
		resolved := make([]string, len(row))
		for c, cell := range row {
			switch cell {
			case t_:
				resolved[c] = ""
			case tE:
				resolved[c] = tE
			case tH:
				resolved[c] = pal.Hair
			case tK:
				resolved[c] = pal.Skin
			case tS:
				resolved[c] = pal.Shirt
			case tP:
				resolved[c] = pal.Pants
			case tO:
				resolved[c] = pal.Shoes
			default:
				resolved[c] = cell
			}
		}
		result[r] = resolved
	}
	return result
}

// flipHorizontal mirrors a template grid left-to-right.
func flipTemplateHorizontal(template [][]string) [][]string {
	result := make([][]string, len(template))
	for r, row := range template {
		flipped := make([]string, len(row))
		for i, v := range row {
			flipped[len(row)-1-i] = v
		}
		result[r] = flipped
	}
	return result
}

// ══════════════════════════════════════════════════════════════
// DOWN-FACING TEMPLATES
// ══════════════════════════════════════════════════════════════

var charWalkDown1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tE, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_},
	{t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_},
	{t_, t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_},
	{t_, t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

var charWalkDown2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tE, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

var charWalkDown3 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tE, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_},
	{t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Down typing frame 1: front-facing seated, arms wide on keyboard
var charDownType1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tE, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, tK, tK, tS, tS, tS, tS, tS, tS, tK, tK, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Down typing frame 2: front-facing seated, one arm extended
var charDownType2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tE, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, tK, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, t_, tK, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Down reading frame 1: seated, arms at sides, normal head
var charDownRead1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tE, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Down reading frame 2: seated, head bobbed down 1px
var charDownRead2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tE, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// ══════════════════════════════════════════════════════════════
// UP-FACING TEMPLATES (back of head, no face)
// ══════════════════════════════════════════════════════════════

var charWalkUp1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_},
	{t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_},
	{t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_},
	{t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

var charWalkUp2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

var charWalkUp3 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_},
	{t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, tO, tO, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Up typing frame 1: back view, arms out to keyboard
var charUpType1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, tK, tK, tS, tS, tS, tS, tS, tS, tK, tK, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Up typing frame 2: back view, one arm extended
var charUpType2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, tK, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, t_, tK, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Up reading frame 1
var charUpRead1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Up reading frame 2: head bobbed down 1px
var charUpRead2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_},
	{t_, t_, t_, t_, tK, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, tP, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// ══════════════════════════════════════════════════════════════
// RIGHT-FACING TEMPLATES (side profile, one eye)
// Left sprites are generated by flipTemplateHorizontal()
// ══════════════════════════════════════════════════════════════

var charWalkRight1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tS, tS, tS, tS, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, tP, tP, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, tP, tP, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, t_, t_, tO, tO, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, t_, t_, tO, tO, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

var charWalkRight2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tS, tS, tS, tS, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tO, tO, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tO, tO, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

var charWalkRight3 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tS, tS, tS, tS, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, tP, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tO, tO, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Right typing frame 1: side profile seated, arm on keyboard
var charRightType1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tO, tO, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Right typing frame 2: side profile seated, arm further extended
var charRightType2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, tK, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, tK, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tO, tO, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Right reading frame 1: side sitting, arms at sides
var charRightRead1 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tS, tS, tS, tS, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tO, tO, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// Right reading frame 2: head bobbed down 1px
var charRightRead2 = [][]string{
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tH, tH, tH, tH, tH, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tE, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tK, tK, tK, tK, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tS, tS, tS, tS, tS, tS, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, tK, tS, tS, tS, tS, tK, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tS, tS, tS, tS, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, tP, tP, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, tP, tP, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tP, tP, t_, tP, tP, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, tO, tO, t_, tO, tO, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
	{t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_, t_},
}

// ══════════════════════════════════════════════════════════════
// Resolved sprite data
// ══════════════════════════════════════════════════════════════

// CharSprites holds all sprites for one character palette.
// Walk: [direction][frame] with 4 walk frames per direction.
// Type: [direction][frame] with 2 type frames per direction.
// Read: [direction][frame] with 2 read frames per direction.
type CharSprites struct {
	Walk [4][4]Sprite // [direction][frame]
	Type [4][2]Sprite // [direction][frame]
	Read [4][2]Sprite // [direction][frame]
}

// CharacterSprites holds pre-resolved sprites for all 6 palettes.
var CharacterSprites []CharSprites

func init() {
	CharacterSprites = make([]CharSprites, len(characterPalettes))
	for i, pal := range characterPalettes {
		// Resolve template and add 2px dark outline for visibility at terminal scale.
		// 1px outline is only sampled 1/3 of the time at ~3x downscale; 2px ensures
		// the silhouette is always visible. Two addOutline passes expand the outline ring.
		r := func(t [][]string) Sprite {
			s := addOutline(resolveTemplate(t, pal), "#111122")
			return addOutline(s, "#111122")
		}
		rf := func(t [][]string) Sprite {
			s := addOutline(resolveTemplate(flipTemplateHorizontal(t), pal), "#111122")
			return addOutline(s, "#111122")
		}

		CharacterSprites[i] = CharSprites{
			Walk: [4][4]Sprite{
				// DirDown=0
				{r(charWalkDown1), r(charWalkDown2), r(charWalkDown3), r(charWalkDown2)},
				// DirLeft=1 (flipped right)
				{rf(charWalkRight1), rf(charWalkRight2), rf(charWalkRight3), rf(charWalkRight2)},
				// DirRight=2
				{r(charWalkRight1), r(charWalkRight2), r(charWalkRight3), r(charWalkRight2)},
				// DirUp=3
				{r(charWalkUp1), r(charWalkUp2), r(charWalkUp3), r(charWalkUp2)},
			},
			Type: [4][2]Sprite{
				// DirDown=0
				{r(charDownType1), r(charDownType2)},
				// DirLeft=1
				{rf(charRightType1), rf(charRightType2)},
				// DirRight=2
				{r(charRightType1), r(charRightType2)},
				// DirUp=3
				{r(charUpType1), r(charUpType2)},
			},
			Read: [4][2]Sprite{
				// DirDown=0
				{r(charDownRead1), r(charDownRead2)},
				// DirLeft=1
				{rf(charRightRead1), rf(charRightRead2)},
				// DirRight=2
				{r(charRightRead1), r(charRightRead2)},
				// DirUp=3
				{r(charUpRead1), r(charUpRead2)},
			},
		}
	}
}

// GetSprite returns the appropriate sprite for a character given their palette,
// state, direction, and animation frame index.
func GetSprite(paletteIdx int, state CharState, dir Direction, frame int) Sprite {
	if paletteIdx < 0 || paletteIdx >= len(CharacterSprites) {
		paletteIdx = 0
	}
	sprites := CharacterSprites[paletteIdx]
	d := int(dir)
	if d < 0 || d > 3 {
		d = 0
	}
	switch state {
	case CharType:
		f := frame % len(sprites.Type[d])
		return sprites.Type[d][f]
	case CharRead:
		f := frame % len(sprites.Read[d])
		return sprites.Read[d][f]
	case CharWalk:
		f := frame % len(sprites.Walk[d])
		return sprites.Walk[d][f]
	default: // CharIdle — use walk frame 0 (standing)
		return sprites.Walk[d][0]
	}
}
