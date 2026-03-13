package main

// Theme defines a color palette for the office environment.
type Theme struct {
	Name       string
	Background [3]uint8                                    // framebuffer clear color
	StatusFg   [3]uint8                                    // status bar foreground
	StatusBg   [3]uint8                                    // status bar background
	Transform  func(r, g, b uint8) (uint8, uint8, uint8) // color transform for all pixels
}

func clampU8(v int) uint8 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return uint8(v)
}

var ThemeDefault = Theme{
	Name:       "default",
	Background: [3]uint8{20, 20, 30},
	StatusFg:   [3]uint8{200, 200, 200},
	StatusBg:   [3]uint8{40, 40, 60},
	Transform:  func(r, g, b uint8) (uint8, uint8, uint8) { return r, g, b },
}

var ThemeWarm = Theme{
	Name:       "warm",
	Background: [3]uint8{30, 20, 15},
	StatusFg:   [3]uint8{220, 200, 180},
	StatusBg:   [3]uint8{50, 35, 25},
	Transform: func(r, g, b uint8) (uint8, uint8, uint8) {
		return clampU8(int(r) + 20), clampU8(int(g) + 5), clampU8(int(b) - 15)
	},
}

var ThemeCool = Theme{
	Name:       "cool",
	Background: [3]uint8{15, 20, 35},
	StatusFg:   [3]uint8{180, 200, 220},
	StatusBg:   [3]uint8{25, 35, 55},
	Transform: func(r, g, b uint8) (uint8, uint8, uint8) {
		return clampU8(int(r) - 10), clampU8(int(g) + 5), clampU8(int(b) + 20)
	},
}

var ThemeDark = Theme{
	Name:       "dark",
	Background: [3]uint8{8, 8, 12},
	StatusFg:   [3]uint8{160, 160, 160},
	StatusBg:   [3]uint8{20, 20, 30},
	Transform: func(r, g, b uint8) (uint8, uint8, uint8) {
		return uint8(float64(r) * 0.6), uint8(float64(g) * 0.6), uint8(float64(b) * 0.6)
	},
}

var ThemeLight = Theme{
	Name:       "light",
	Background: [3]uint8{40, 40, 50},
	StatusFg:   [3]uint8{240, 240, 240},
	StatusBg:   [3]uint8{60, 60, 80},
	Transform: func(r, g, b uint8) (uint8, uint8, uint8) {
		return clampU8(int(float64(r) * 1.3)), clampU8(int(float64(g) * 1.3)), clampU8(int(float64(b) * 1.3))
	},
}

var AllThemes = []*Theme{&ThemeDefault, &ThemeWarm, &ThemeCool, &ThemeDark, &ThemeLight}

func FindTheme(name string) *Theme {
	for _, t := range AllThemes {
		if t.Name == name {
			return t
		}
	}
	return &ThemeDefault
}

func NextTheme(current *Theme) *Theme {
	for i, t := range AllThemes {
		if t.Name == current.Name {
			return AllThemes[(i+1)%len(AllThemes)]
		}
	}
	return AllThemes[0]
}
