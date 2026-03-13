package main

import "math"

// ── Particle colors by tool category ─────────────────────────

const (
	ParticleColorFile  = "#00CCFF" // cyan - reading files
	ParticleColorWrite = "#00FF88" // green - writing code
	ParticleColorWeb   = "#FFCC00" // yellow - web/external
	ParticleColorBash  = "#FF8800" // orange - commands
	ParticleColorAgent = "#CC66FF" // purple - agent-to-agent
	ParticleColorBurst = "#FFFFFF" // white - completion
)

// ParticlesEnabled controls whether the particle system renders.
var ParticlesEnabled = true

// ── Particle ─────────────────────────────────────────────────

// Particle is a single moving colored dot in the pixel buffer.
type Particle struct {
	X, Y   float64 // pixel position
	VX, VY float64 // velocity (px/sec)
	Color  string  // hex color
	Life   float64 // total lifetime (seconds)
	Age    float64 // elapsed time (seconds)
	Size   int     // diameter in pixels (2-4)
}

// ── ParticleBeam ─────────────────────────────────────────────

// ParticleBeam continuously emits particles from source to target.
type ParticleBeam struct {
	SourceX, SourceY float64
	TargetX, TargetY float64
	Color            string
	EmitTimer        float64 // countdown to next emission
	EmitRate         float64 // seconds between emissions
	ParticleSpeed    float64 // px/sec
	ParticleLife     float64 // seconds
	AgentID          int
	ToolID           string
}

// ── ParticleSystem ───────────────────────────────────────────

// ParticleSystem manages all particles, beams, and connection arcs.
type ParticleSystem struct {
	Particles []Particle
	Beams     []ParticleBeam
	Time      float64 // accumulates for pulsing effects
}

// NewParticleSystem creates an empty particle system.
func NewParticleSystem() *ParticleSystem {
	return &ParticleSystem{}
}

// Update advances all beams and particles by dt seconds.
func (ps *ParticleSystem) Update(dt float64) {
	ps.Time += dt

	// Emit particles from active beams
	for i := range ps.Beams {
		b := &ps.Beams[i]
		b.EmitTimer -= dt
		if b.EmitTimer <= 0 {
			b.EmitTimer += b.EmitRate
			ps.emitBeamParticle(b)
		}
	}

	// Update and cull particles
	alive := ps.Particles[:0]
	for i := range ps.Particles {
		p := &ps.Particles[i]
		p.Age += dt
		if p.Age >= p.Life {
			continue
		}
		p.X += p.VX * dt
		p.Y += p.VY * dt
		alive = append(alive, *p)
	}
	ps.Particles = alive
}

// emitBeamParticle spawns one particle traveling from source toward target.
func (ps *ParticleSystem) emitBeamParticle(b *ParticleBeam) {
	dx := b.TargetX - b.SourceX
	dy := b.TargetY - b.SourceY
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist < 1 {
		return
	}

	// Unit vectors: along beam and perpendicular
	ux := dx / dist
	uy := dy / dist
	nx := -uy
	ny := ux

	// Perpendicular jitter for visual interest
	jitter := randomRange(-1, 1) * 3.0

	ps.Particles = append(ps.Particles, Particle{
		X:     b.SourceX + nx*jitter,
		Y:     b.SourceY + ny*jitter,
		VX:    ux*b.ParticleSpeed + nx*jitter*1.5,
		VY:    uy*b.ParticleSpeed + ny*jitter*1.5,
		Color: b.Color,
		Life:  b.ParticleLife,
		Age:   0,
		Size:  3,
	})
}

// ── Beam management ──────────────────────────────────────────

// AddBeam creates a continuous particle stream from source to target.
func (ps *ParticleSystem) AddBeam(srcX, srcY, tgtX, tgtY float64, color string, agentID int, toolID string) {
	dx := tgtX - srcX
	dy := tgtY - srcY
	dist := math.Sqrt(dx*dx + dy*dy)

	speed := 70.0
	life := dist / speed
	if life < 0.3 {
		life = 0.3
	}
	if life > 2.0 {
		life = 2.0
	}

	ps.Beams = append(ps.Beams, ParticleBeam{
		SourceX:       srcX,
		SourceY:       srcY,
		TargetX:       tgtX,
		TargetY:       tgtY,
		Color:         color,
		EmitTimer:     0,
		EmitRate:      0.10,
		ParticleSpeed: speed,
		ParticleLife:  life,
		AgentID:       agentID,
		ToolID:        toolID,
	})
}

// RemoveBeamsForTool removes beams matching an agent+tool pair.
func (ps *ParticleSystem) RemoveBeamsForTool(agentID int, toolID string) {
	kept := ps.Beams[:0]
	for _, b := range ps.Beams {
		if b.AgentID == agentID && b.ToolID == toolID {
			continue
		}
		kept = append(kept, b)
	}
	ps.Beams = kept
}

// RemoveBeamsForAgent removes all beams for a given agent.
func (ps *ParticleSystem) RemoveBeamsForAgent(agentID int) {
	kept := ps.Beams[:0]
	for _, b := range ps.Beams {
		if b.AgentID == agentID {
			continue
		}
		kept = append(kept, b)
	}
	ps.Beams = kept
}

// ── Burst effect ─────────────────────────────────────────────

// EmitBurst creates a radial burst of particles at (x, y).
func (ps *ParticleSystem) EmitBurst(x, y float64, color string, count int) {
	for i := 0; i < count; i++ {
		angle := float64(i) / float64(count) * 2 * math.Pi
		speed := randomRange(25, 55)
		ps.Particles = append(ps.Particles, Particle{
			X:     x,
			Y:     y,
			VX:    math.Cos(angle) * speed,
			VY:    math.Sin(angle) * speed,
			Color: color,
			Life:  randomRange(0.4, 0.8),
			Age:   0,
			Size:  2,
		})
	}
}

// EmitDirectionalBurst emits particles in a cone centered on the given direction.
func (ps *ParticleSystem) EmitDirectionalBurst(x, y float64, dir Direction, color string, count int) {
	// Base angle from direction
	baseAngle := 0.0
	switch dir {
	case DirUp:
		baseAngle = -math.Pi / 2
	case DirDown:
		baseAngle = math.Pi / 2
	case DirLeft:
		baseAngle = math.Pi
	case DirRight:
		baseAngle = 0
	}

	spread := math.Pi / 2 // 90-degree cone
	for i := 0; i < count; i++ {
		angle := baseAngle + randomRange(-spread/2, spread/2)
		speed := randomRange(30, 60)
		ps.Particles = append(ps.Particles, Particle{
			X:     x,
			Y:     y,
			VX:    math.Cos(angle) * speed,
			VY:    math.Sin(angle) * speed,
			Color: color,
			Life:  randomRange(0.3, 0.6),
			Age:   0,
			Size:  2,
		})
	}
}

// ── Rendering ────────────────────────────────────────────────

// Render draws all particles into the pixel buffer.
func (ps *ParticleSystem) Render(pixels [][]string, pxW, pxH int) {
	for i := range ps.Particles {
		p := &ps.Particles[i]

		// Fade based on age
		alpha := 1.0 - (p.Age / p.Life)
		if alpha <= 0 {
			continue
		}

		color := p.Color
		if alpha < 0.5 {
			color = dimHexColor(color, alpha*2)
		}

		cx := int(p.X)
		cy := int(p.Y)
		r := p.Size / 2

		for dy := -r; dy <= r; dy++ {
			for dx := -r; dx <= r; dx++ {
				if dx*dx+dy*dy > r*r+1 {
					continue
				}
				px := cx + dx
				py := cy + dy
				if px >= 0 && px < pxW && py >= 0 && py < pxH {
					pixels[py][px] = color
				}
			}
		}
	}
}

// RenderConnections draws pulsing dotted lines between simultaneously active agents.
func (ps *ParticleSystem) RenderConnections(pixels [][]string, pxW, pxH int, characters map[int]*Character) {
	// Collect active agents (those with active tools)
	var active []*Character
	for _, ch := range characters {
		if ch.ActiveToolCount > 0 {
			active = append(active, ch)
		}
	}
	if len(active) < 2 {
		return
	}

	// Draw connection arc between each pair
	for i := 0; i < len(active)-1; i++ {
		for j := i + 1; j < len(active); j++ {
			ps.renderArc(pixels, pxW, pxH, active[i], active[j])
		}
	}
}

// renderArc draws a pulsing dotted line between two characters.
func (ps *ParticleSystem) renderArc(pixels [][]string, pxW, pxH int, a, b *Character) {
	dx := b.X - a.X
	dy := b.Y - a.Y
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist < 16 {
		return
	}

	// Draw dots every 6px along the line
	steps := int(dist / 6)
	if steps < 2 {
		steps = 2
	}

	for s := 1; s < steps; s++ {
		t := float64(s) / float64(steps)
		px := a.X + dx*t
		py := a.Y + dy*t - 10 // offset above character feet

		// Traveling pulse: brightness varies with position + time
		phase := t*dist*0.08 + ps.Time*4.0
		brightness := 0.3 + 0.7*((math.Sin(phase)+1)/2)

		color := dimHexColor(ParticleColorAgent, brightness)

		// Draw 2x2 dot
		ix := int(px)
		iy := int(py)
		for ddy := 0; ddy < 2; ddy++ {
			for ddx := 0; ddx < 2; ddx++ {
				x := ix + ddx
				y := iy + ddy
				if x >= 0 && x < pxW && y >= 0 && y < pxH {
					pixels[y][x] = color
				}
			}
		}
	}
}

// ── Tool → particle mapping ─────────────────────────────────

// ToolParticleColor returns the beam color for a tool name.
func ToolParticleColor(toolName string) string {
	switch toolName {
	case "Read", "Grep", "Glob":
		return ParticleColorFile
	case "WebFetch", "WebSearch":
		return ParticleColorWeb
	case "Bash":
		return ParticleColorBash
	case "Task":
		return ParticleColorAgent
	case "Edit", "Write":
		return ParticleColorWrite
	default:
		return ParticleColorWrite
	}
}

// ToolCategory classifies a tool for particle source selection.
func ToolCategory(toolName string) string {
	switch toolName {
	case "Read", "Grep", "Glob":
		return "file"
	case "WebFetch", "WebSearch":
		return "web"
	case "Bash":
		return "bash"
	case "Task":
		return "agent"
	default:
		return "write"
	}
}

// DataSourcePos returns the pixel position of the data source for a tool category.
func DataSourcePos(category string, office *Office) (float64, float64) {
	switch category {
	case "file":
		if len(office.BookshelfSpots) > 0 {
			spot := office.BookshelfSpots[randomInt(0, len(office.BookshelfSpots)-1)]
			return tileCenter(spot.Col, spot.Row)
		}
		return tileCenter(1, 1)
	case "web":
		// "The cloud" — top center of office
		return float64(office.Cols*TileSize) / 2, 4.0
	case "bash":
		if len(office.KitchenSpots) > 0 {
			spot := office.KitchenSpots[randomInt(0, len(office.KitchenSpots)-1)]
			return tileCenter(spot.Col, spot.Row)
		}
		return float64(office.Cols*TileSize) * 0.75, float64(TileSize)
	default:
		return 0, 0
	}
}

// ── Color helpers ────────────────────────────────────────────

// dimHexColor dims a hex color by the given factor (0.0 = black, 1.0 = full).
func dimHexColor(hex string, factor float64) string {
	r, g, b := HexToRGB(hex)
	r = uint8(float64(r) * factor)
	g = uint8(float64(g) * factor)
	b = uint8(float64(b) * factor)
	return rgbToHex(r, g, b)
}

// rgbToHex converts RGB components to a #RRGGBB string.
func rgbToHex(r, g, b uint8) string {
	hex := [16]byte{'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'}
	return string([]byte{
		'#',
		hex[r>>4], hex[r&0xF],
		hex[g>>4], hex[g&0xF],
		hex[b>>4], hex[b&0xF],
	})
}
