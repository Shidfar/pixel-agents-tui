package main

// Speech bubble sprites rendered above characters to indicate state.
// Ported from webview-spriteData.ts BUBBLE_PERMISSION_SPRITE / BUBBLE_WAITING_SPRITE.
// Each is 11 wide x 13 tall (last row is empty for the tail pointer gap).

var (
	bB = "#555566" // border
	bF = "#EEEEFF" // fill
	bA = "#CCA700" // amber dots (permission)
	bG = "#44BB66" // green check (waiting)
	_t = ""        // transparent
)

// BubblePermissionSprite: white box with "..." in amber, tail pointer below (11x13)
var BubblePermissionSprite = Sprite{
	{bB, bB, bB, bB, bB, bB, bB, bB, bB, bB, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bA, bF, bA, bF, bA, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bB, bB, bB, bB, bB, bB, bB, bB, bB, bB},
	{_t, _t, _t, _t, bB, bB, bB, _t, _t, _t, _t},
	{_t, _t, _t, _t, _t, bB, _t, _t, _t, _t, _t},
	{_t, _t, _t, _t, _t, _t, _t, _t, _t, _t, _t},
}

// BubbleWaitingSprite: white box with green checkmark, tail pointer below (11x13)
var BubbleWaitingSprite = Sprite{
	{_t, bB, bB, bB, bB, bB, bB, bB, bB, bB, _t},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bG, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bG, bF, bF, bB},
	{bB, bF, bF, bG, bF, bF, bG, bF, bF, bF, bB},
	{bB, bF, bF, bF, bG, bG, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{bB, bF, bF, bF, bF, bF, bF, bF, bF, bF, bB},
	{_t, bB, bB, bB, bB, bB, bB, bB, bB, bB, _t},
	{_t, _t, _t, _t, bB, bB, bB, _t, _t, _t, _t},
	{_t, _t, _t, _t, _t, bB, _t, _t, _t, _t, _t},
	{_t, _t, _t, _t, _t, _t, _t, _t, _t, _t, _t},
}

// BubbleVerticalOffsetPx is how far above the character anchor to place the bubble.
const BubbleVerticalOffsetPx = 24

// BubbleSittingOffsetPx accounts for the sitting offset when typing.
const BubbleSittingOffsetPx = 10

// BubbleFadeDurationSec is the fade-out window for waiting bubbles.
// In TUI we can't do alpha, so we just hide when timer reaches 0.
const BubbleFadeDurationSec = 0.5
