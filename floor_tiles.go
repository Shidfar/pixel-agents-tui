package main

// Floor tile and wall colors for the office renderer.
//
// In the web version, floors use colorized PNG sprites with HSB adjustment.
// For the terminal renderer, we use solid fallback colors per tile type.
// The web renderer's FALLBACK_FLOOR_COLOR is #808080 (gray), but we use
// warmer tones to match the default colorization (h=35, s=30, b=15).

// FallbackFloorColor is used when no specific tile color is defined.
const FallbackFloorColor = "#808080"

// WallColor is the solid color used for wall tiles when no wall sprites are loaded.
// From webview-floorTiles.ts: WALL_COLOR = '#3A3A5C'
const WallColor = "#3A3A5C"

// VoidColor is the background color for void (empty) tiles.
const VoidColor = "#1A1A2E"

// FloorColors maps each floor tile type to a default hex color.
// These approximate the web renderer's default colorization settings
// (h=35, s=30, b=15, c=0) applied to different grayscale patterns.
var FloorColors = map[TileType]string{
	TileFloor1: "#8B7355", // warm brown (lightest)
	TileFloor2: "#7A6548", // medium brown
	TileFloor3: "#B0A890", // kitchen light tile
	TileFloor4: "#9A9080", // kitchen dark tile
	TileFloor5: "#9B8465", // light tan
	TileFloor6: "#A08B6D", // lighter tan
	TileFloor7: "#6E5F4A", // muted brown

	// Furniture tiles
	TileDesk:      "#5C3A1E", // dark wood desk
	TileComputer:  "#2A2A3A", // dark monitor/screen
	TileBookshelf: "#3E2415", // dark bookshelf wood
	TilePlant:     "#2E6B3A", // green plant
	TileChair:     "#8B6B4A", // lighter wood chair
	TileRug:       "#2A4A6B", // blue carpet/rug
	TileCounter:   "#C8C0B0", // light kitchen counter
	TileAppliance: "#7A7A8A", // silver appliance
	TileDoor:      "#4A3A2E", // dark wood door
}

// GetTileColor returns the hex color string for a tile type.
func GetTileColor(t TileType) string {
	if c, ok := FloorColors[t]; ok {
		return c
	}
	if t == TileWall {
		return WallColor
	}
	return VoidColor
}
