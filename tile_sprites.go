package main

// Floor tile sprites - 16x16 per-pixel sprites for each floor type and void.
// Each sprite uses the base color from FloorColors plus light/dark shade variants
// to create wood plank patterns with grain detail.

// shade helpers - pre-computed color variants for each floor tile

// TileFloor1: base #8B7355, light #9B8365, dark #7B6345
var f1b, f1l, f1d = "#8B7355", "#9B8365", "#7B6345"

// TileFloor2: base #7A6548, light #8A7558, dark #6A5538
var f2b, f2l, f2d = "#7A6548", "#8A7558", "#6A5538"

// TileFloor3: kitchen light tile checkerboard
var f3b, f3l, f3d = "#B0A890", "#C0B8A0", "#8A8070"

// TileFloor4: kitchen dark tile checkerboard
var f4b, f4l, f4d = "#9A9080", "#AAA090", "#7A7060"

// TileFloor5: base #9B8465, light #AB9475, dark #8B7455
var f5b, f5l, f5d = "#9B8465", "#AB9475", "#8B7455"

// TileFloor6: base #A08B6D, light #B09B7D, dark #907B5D
var f6b, f6l, f6d = "#A08B6D", "#B09B7D", "#907B5D"

// TileFloor7: base #6E5F4A, light #7E6F5A, dark #5E4F3A
var f7b, f7l, f7d = "#6E5F4A", "#7E6F5A", "#5E4F3A"

// void shades
var v0b, v0l, v0d = "#1A1A2E", "#22223A", "#121224"

// spriteFloor1 - horizontal wood planks, warm brown
var spriteFloor1 = Sprite{
	{f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b},
	{f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b},
	{f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b},
	{f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d},
	{f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b},
	{f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b},
	{f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b},
	{f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d},
	{f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b},
	{f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l},
	{f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b},
	{f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d},
	{f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b},
	{f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b},
	{f1b, f1l, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1b, f1l, f1b, f1b, f1b, f1l, f1b},
	{f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d, f1d},
}

// spriteFloor2 - horizontal wood planks, medium brown, offset joints
var spriteFloor2 = Sprite{
	{f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b},
	{f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b},
	{f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b},
	{f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d},
	{f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b},
	{f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b},
	{f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b},
	{f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d},
	{f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b},
	{f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b},
	{f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l},
	{f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d},
	{f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b},
	{f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b},
	{f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b, f2b, f2b, f2b, f2b, f2l, f2b, f2b, f2b},
	{f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d, f2d},
}

// spriteFloor3 - kitchen light tile checkerboard (8x8 squares)
var spriteFloor3 = Sprite{
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
	{f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3d, f3b, f3b, f3b, f3b, f3b, f3b, f3b, f3b},
}

// spriteFloor4 - kitchen dark tile checkerboard (8x8 squares)
var spriteFloor4 = Sprite{
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
	{f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4d, f4b, f4b, f4b, f4b, f4b, f4b, f4b, f4b},
}

// spriteFloor5 - diagonal parquet pattern, light tan
var spriteFloor5 = Sprite{
	{f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b},
	{f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b},
	{f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b},
	{f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l},
	{f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b},
	{f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b},
	{f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b},
	{f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d},
	{f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b},
	{f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b},
	{f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b},
	{f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l},
	{f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b},
	{f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b},
	{f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b},
	{f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d, f5b, f5b, f5b, f5l, f5b, f5b, f5b, f5d},
}

// spriteFloor6 - herringbone / basket weave pattern, lighter tan
var spriteFloor6 = Sprite{
	{f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b},
	{f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b},
	{f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d},
	{f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d},
	{f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b},
	{f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b},
	{f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l},
	{f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l},
	{f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b},
	{f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b},
	{f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d},
	{f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d},
	{f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b},
	{f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b},
	{f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l},
	{f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l, f6b, f6b, f6d, f6d, f6b, f6b, f6l, f6l},
}

// spriteFloor7 - brick/parquet with vertical+horizontal alternation, muted brown
var spriteFloor7 = Sprite{
	{f7d, f7b, f7b, f7b, f7b, f7b, f7b, f7d, f7l, f7l, f7d, f7l, f7l, f7d, f7l, f7l},
	{f7d, f7b, f7l, f7b, f7b, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b},
	{f7d, f7b, f7b, f7b, f7b, f7l, f7b, f7d, f7b, f7b, f7d, f7b, f7l, f7d, f7b, f7b},
	{f7d, f7b, f7b, f7b, f7b, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b},
	{f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d},
	{f7l, f7l, f7d, f7l, f7l, f7d, f7l, f7l, f7d, f7b, f7b, f7b, f7b, f7b, f7b, f7d},
	{f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7l, f7b, f7b, f7b, f7b, f7d},
	{f7b, f7b, f7d, f7b, f7l, f7d, f7b, f7b, f7d, f7b, f7b, f7b, f7l, f7b, f7b, f7d},
	{f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b, f7b, f7b, f7b, f7b, f7d},
	{f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d},
	{f7d, f7b, f7b, f7b, f7b, f7b, f7b, f7d, f7l, f7l, f7d, f7l, f7l, f7d, f7l, f7l},
	{f7d, f7b, f7b, f7l, f7b, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b},
	{f7d, f7b, f7b, f7b, f7b, f7b, f7b, f7d, f7b, f7l, f7d, f7b, f7b, f7d, f7b, f7l},
	{f7d, f7b, f7l, f7b, f7b, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b, f7d, f7b, f7b},
	{f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d, f7d},
	{f7l, f7l, f7d, f7l, f7l, f7d, f7l, f7l, f7d, f7b, f7b, f7b, f7b, f7b, f7l, f7d},
}

// spriteVoid - dark void with subtle noise
var spriteVoid = Sprite{
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0d, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0d, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0l, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0d, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0d, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0l, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0l, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0l, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0d, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0d, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0d, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0l, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
	{v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b, v0b},
}

var floorSprites = map[TileType]Sprite{
	TileFloor1: spriteFloor1,
	TileFloor2: spriteFloor2,
	TileFloor3: spriteFloor3,
	TileFloor4: spriteFloor4,
	TileFloor5: spriteFloor5,
	TileFloor6: spriteFloor6,
	TileFloor7: spriteFloor7,
	TileVoid:   spriteVoid,
}

// GetFloorSprite returns the 16x16 sprite for a floor or void tile type.
func GetFloorSprite(t TileType) Sprite {
	if s, ok := floorSprites[t]; ok {
		return s
	}
	return nil
}

// ── Wall Sprite ──────────────────────────────────────────────────────

// wallSprite - dark wall with brick/panel texture
// Horizontal mortar lines at rows 5, 11; vertical divider at cols 7-8
var wallSprite = Sprite{
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#4A4A6C", "#4A4A6C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#4A4A6C", "#4A4A6C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#4A4A6C", "#4A4A6C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#4A4A6C", "#4A4A6C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#4A4A6C", "#4A4A6C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C", "#4A4A6C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
	{"#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C", "#3A3A5C"},
}

// ── Furniture Sprites ────────────────────────────────────────────────

// deskSprite - bold desk for terminal: 2px dark edge, light surface, visible front face
// Top 11 rows: desk surface (bird's eye). Bottom 5 rows: front face with depth shadow.
var deskSprite = Sprite{
	{"#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#9B7A4E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#8B6A3E", "#4A2818", "#4A2818"},
	{"#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818", "#4A2818"},
	{"#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E"},
	{"#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E", "#6B4A2E"},
	{"#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E"},
	{"#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E", "#5C3A1E"},
	{"#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010", "#3A2010"},
}

// computerSprite - bright monitor screen with dark bezel, optimized for terminal
// Top 10 rows: screen (bright blue) in dark frame. Bottom 6 rows: stand + base.
var computerSprite = Sprite{
	{"#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#66AADD", "#4488BB", "#4488BB", "#4488BB", "#66AADD", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#4488BB", "#4488BB", "#66AADD", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#66AADD", "#4488BB", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#66AADD", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#4488BB", "#66AADD", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#66AADD", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#4488BB", "#1A1A2A", "#1A1A2A"},
	{"#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A", "#1A1A2A"},
	{"", "", "", "", "", "", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "", "", "", "", "", ""},
	{"", "", "", "", "", "", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "", "", "", "", "", ""},
	{"", "", "", "", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "", "", "", ""},
	{"", "", "", "", "#2A2A3A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#2A2A3A", "", "", "", ""},
	{"", "", "", "", "#2A2A3A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#2A2A3A", "", "", "", ""},
	{"", "", "", "", "", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "#2A2A3A", "", "", "", "", ""},
}

// bookshelfSprite - shelves with colored book spines
// rows 0-2: shelf top, rows 3-6: books row 1, rows 7-9: shelf divider,
// rows 10-13: books row 2, rows 14-15: shelf bottom
var bookshelfSprite = Sprite{
	{"#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#CC4444", "#CC4444", "#4477AA", "#4477AA", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#4477AA", "#4477AA", "#CC4444", "#CC4444", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#4477AA", "#4477AA", "#CC4444", "#CC4444", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#4477AA", "#4477AA", "#CC4444", "#CC4444", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#2E1A0E", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#4477AA", "#4477AA", "#CC4444", "#CC4444", "#44AA66", "#44AA66", "#CCAA33", "#CCAA33", "#2E1A0E", "#3E2415"},
	{"#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415"},
	{"#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415", "#3E2415"},
}

// plantSprite - green plant seen from above with brown pot at bottom
var plantSprite = Sprite{
	{"", "", "", "", "", "", "#2E6B3A", "#3D8B37", "#3D8B37", "#2E6B3A", "", "", "", "", "", ""},
	{"", "", "", "", "", "#3D8B37", "#2E6B3A", "#3D8B37", "#2E6B3A", "#3D8B37", "", "", "", "", "", ""},
	{"", "", "", "", "#3D8B37", "#2E6B3A", "#1E5B2A", "#3D8B37", "#1E5B2A", "#2E6B3A", "#3D8B37", "", "", "", "", ""},
	{"", "", "", "#3D8B37", "#2E6B3A", "#3D8B37", "#2E6B3A", "#1E5B2A", "#3D8B37", "#2E6B3A", "#3D8B37", "#2E6B3A", "", "", "", ""},
	{"", "", "#2E6B3A", "#3D8B37", "#1E5B2A", "#2E6B3A", "#3D8B37", "#3D8B37", "#2E6B3A", "#1E5B2A", "#3D8B37", "#2E6B3A", "#3D8B37", "", "", ""},
	{"", "#3D8B37", "#2E6B3A", "#1E5B2A", "#3D8B37", "#2E6B3A", "#3D8B37", "#3D8B37", "#3D8B37", "#2E6B3A", "#1E5B2A", "#3D8B37", "#2E6B3A", "#3D8B37", "", ""},
	{"", "#2E6B3A", "#3D8B37", "#3D8B37", "#2E6B3A", "#1E5B2A", "#2E6B3A", "#3D8B37", "#1E5B2A", "#3D8B37", "#2E6B3A", "#3D8B37", "#1E5B2A", "#2E6B3A", "", ""},
	{"", "", "#3D8B37", "#2E6B3A", "#3D8B37", "#3D8B37", "#2E6B3A", "#3D8B37", "#2E6B3A", "#3D8B37", "#3D8B37", "#2E6B3A", "#3D8B37", "", "", ""},
	{"", "", "", "#2E6B3A", "#3D8B37", "#2E6B3A", "#1E5B2A", "#3D8B37", "#2E6B3A", "#1E5B2A", "#2E6B3A", "#3D8B37", "", "", "", ""},
	{"", "", "", "", "#3D8B37", "#2E6B3A", "#3D8B37", "#2E6B3A", "#3D8B37", "#2E6B3A", "", "", "", "", "", ""},
	{"", "", "", "", "", "#2E6B3A", "#3D8B37", "#2E6B3A", "#3D8B37", "", "", "", "", "", "", ""},
	{"", "", "", "", "", "", "#6B4E0A", "#6B4E0A", "", "", "", "", "", "", "", ""},
	{"", "", "", "", "", "#8B4422", "#8B4422", "#8B4422", "#8B4422", "#8B4422", "", "", "", "", "", ""},
	{"", "", "", "", "#8B4422", "#A05530", "#A05530", "#A05530", "#A05530", "#A05530", "#8B4422", "", "", "", "", ""},
	{"", "", "", "", "#8B4422", "#A05530", "#A05530", "#A05530", "#A05530", "#A05530", "#8B4422", "", "", "", "", ""},
	{"", "", "", "", "", "#8B4422", "#8B4422", "#8B4422", "#8B4422", "#8B4422", "", "", "", "", "", ""},
}

// chairSprite - high-contrast chair seat, bright cushion vs dark frame
// Wider fill and brighter colors so it reads at terminal scale vs wood floor.
var chairSprite = Sprite{
	{"", "", "", "", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "", "", "", ""},
	{"", "", "", "#5C3D0A", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "", "", ""},
	{"", "", "", "#5C3D0A", "#5C3D0A", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#C8A850", "#5C3D0A", "#5C3D0A", "", "", ""},
	{"", "", "", "", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "", "", "", ""},
	{"", "", "", "", "", "", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "", "", "", "", "", ""},
	{"", "", "", "", "", "", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "", "", "", "", "", ""},
	{"", "", "", "", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "#5C3D0A", "", "", "", ""},
	{"", "", "", "", "#5C3D0A", "", "", "", "", "", "", "#5C3D0A", "", "", "", ""},
	{"", "", "", "", "#5C3D0A", "", "", "", "", "", "", "#5C3D0A", "", "", "", ""},
}

// rugSprite - blue carpet with subtle lighter center and border accent
var rugSprite = Sprite{
	{"#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#3A5A7B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#2A4A6B", "#223D5E"},
	{"#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E", "#223D5E"},
}

// counterSprite - kitchen counter with bright surface and wooden cabinet doors below
var counterSprite = Sprite{
	{"#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070", "#8A8070"},
	{"#E8E0D0", "#E8E0D0", "#E8E0D0", "#F0E8D8", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#F0E8D8", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0"},
	{"#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#F0E8D8", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#F0E8D8", "#E8E0D0", "#E8E0D0"},
	{"#E8E0D0", "#E8E0D0", "#F0E8D8", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0"},
	{"#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#F0E8D8", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0"},
	{"#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0", "#E8E0D0"},
	{"#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#C0B090", "#C0B090", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#C0B090", "#C0B090", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#8B7050", "#5A4030", "#5A4030"},
	{"#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030", "#5A4030"},
}

// applianceSprite - vending/coffee machine with orange display, window, and dispensing slot
var applianceSprite = Sprite{
	{"#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A"},
	{"#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A", "#4A4A5A"},
	{"#4A4A5A", "#4A4A5A", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#4A4A5A", "#4A4A5A"},
	{"#4A4A5A", "#4A4A5A", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#CC6633", "#4A4A5A", "#4A4A5A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#8A8A9A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#3A3A4A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A", "#5A5A6A"},
	{"#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A"},
	{"#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A"},
	{"#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A"},
	{"#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A", "#6A6A7A"},
}

// doorSprite - open doorway with dark wood frame and welcome mat
var doorSprite = Sprite{
	// Row 0: frame top
	{"#3E2A1A", "#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A", "#3E2A1A"},
	// Row 1: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 2: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#6B5A45", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#6B5A45", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 3: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 4: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 5: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 6: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 7: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#6B5A45", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#6B5A45", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 8: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 9: frame + interior
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#7B6A55", "#7B6A55", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 10: frame + interior floor
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 11: frame + mat edge
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#6B5A45", "#8B6B4A", "#8B6B4A", "#8B6B4A", "#8B6B4A", "#8B6B4A", "#8B6B4A", "#6B5A45", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 12: welcome mat
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#8B6B4A", "#A07B5A", "#8B6B4A", "#A07B5A", "#A07B5A", "#8B6B4A", "#A07B5A", "#8B6B4A", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 13: welcome mat center
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#8B6B4A", "#8B6B4A", "#A07B5A", "#A07B5A", "#A07B5A", "#A07B5A", "#8B6B4A", "#8B6B4A", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 14: welcome mat
	{"#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#8B6B4A", "#A07B5A", "#8B6B4A", "#A07B5A", "#A07B5A", "#8B6B4A", "#A07B5A", "#8B6B4A", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A"},
	// Row 15: frame bottom
	{"#3E2A1A", "#3E2A1A", "#3E2A1A", "#5A3A20", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#6B5A45", "#5A3A20", "#3E2A1A", "#3E2A1A", "#3E2A1A"},
}

// ── Furniture + Wall Sprite Map ──────────────────────────────────────

var furnitureSprites = map[TileType]Sprite{
	TileWall:      wallSprite,
	TileDesk:      deskSprite,
	TileComputer:  computerSprite,
	TileBookshelf: bookshelfSprite,
	TilePlant:     plantSprite,
	TileChair:     chairSprite,
	TileRug:       rugSprite,
	TileCounter:   counterSprite,
	TileAppliance: applianceSprite,
	TileDoor:      doorSprite,
}

// GetTileSprite returns the 16x16 sprite for any tile type.
// It delegates to GetFloorSprite for floor/void tiles, and returns
// furniture or wall sprites for other types. Returns nil for unknown types.
func GetTileSprite(t TileType) Sprite {
	if s := GetFloorSprite(t); s != nil {
		return s
	}
	if s, ok := furnitureSprites[t]; ok {
		return s
	}
	return nil
}
