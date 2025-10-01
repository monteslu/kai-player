# CDG Integration Thoughts for KAI Player

## Overview
Adding CDG (CD+Graphics) support to KAI Player would provide compatibility with legacy karaoke files while maintaining the modern visualization experience.

## CDG Format Specs
- **Resolution**: 300×216 pixels total (288×192 active area + 6px border)
- **Colors**: 16-color palette (4-bit) with 4096 possible colors
- **Transparency**: 64 levels (0-63), perfect for overlays
- **File format**: Usually ZIP archives (.kar) containing MP3 + CDG files

## Perfect 1080p Scaling
- 300×216 × 5 = 1500×1080 (perfect vertical fit!)
- Horizontal centering: 210px margins on each side (1920-1500=420÷2)
- Integer scaling ensures crisp, pixel-perfect graphics

## Architecture Approach

### Canvas Layering Strategy
1. **Background Layer**: Butterchurn visualizations (full 1920×1080)
2. **CDG Layer**: Karaoke graphics (1500×1080, centered)
3. **Transparency**: CDG background can be transparent, letting visuals show through

### File Detection
```javascript
// Detect karaoke archive formats
const karaokeExtensions = ['.zip', '.kar', '.kai'];
const isKaraokeFile = karaokeExtensions.some(ext =>
  filename.toLowerCase().endsWith(ext)
);

// Inside ZIP: check for MP3 + CDG combination
if (hasMP3 && hasCDG) {
  return 'cdg-karaoke';
} else if (hasSongJson) {
  return 'kai-format';
}
```

## JavaScript CDG Libraries
Researched options:
1. **`karaoke` npm** - Most performant, requestAnimationFrame rendering
2. **`CDGPlayer` npm** - Feature-rich, handles ZIP files, pitch shifter included
3. **`cdg.js`** - Lightweight, no dependencies

## Technical Benefits
- **No vocal analysis needed**: CDG files are graphics-only
- **Legacy compatibility**: Instant access to thousands of existing karaoke tracks
- **Simple integration**: Just sync CDG graphics with audio playback
- **Butterchurn enhancement**: Visuals fill the side margins and background

## User Experience
- Classic karaoke nostalgia with modern visual flair
- Seamless switching between KAI (stems) and CDG (legacy) formats
- No restart interruptions (unlike Tesla CARaoke)
- Revolutionary upgrade to traditional karaoke bars

## Storage in Database
```sql
-- Add CDG support to songs table
ALTER TABLE songs ADD COLUMN has_cdg BOOLEAN DEFAULT FALSE;
ALTER TABLE songs ADD COLUMN cdg_path TEXT;
ALTER TABLE songs ADD COLUMN is_archive BOOLEAN DEFAULT FALSE;
```

## Implementation Priority
CDG + Butterchurn could be an awesome standalone product even without KAI support. The visual impact would be stunning and appeal to both retro karaoke fans and modern visualization enthusiasts.

## Next Steps
1. Experiment with CDG rendering libraries
2. Test Butterchurn + CDG layering
3. Implement ZIP file detection and extraction
4. Create unified library scanner for multiple formats