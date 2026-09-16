import { Resvg } from '@resvg/resvg-js'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import satori from 'satori'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'public', 'ogp.png')

const WIDTH = 1200
const HEIGHT = 630

const INK = '#132033'
const INK_SOFT = '#3d4f66'
const PAPER = '#eef3f8'

const PRISM = [
  '#e76f51',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#287271',
  '#264653',
  '#3d5a80',
  '#ee6c4d',
]

type TokenChip = {
  text: string
  color: string
}

const PATTERN: TokenChip[] = [
  { text: '(?<user>', color: PRISM[5] },
  { text: '\\w+', color: PRISM[0] },
  { text: ')', color: PRISM[5] },
  { text: '@', color: PRISM[7] },
  { text: '(?<host>', color: PRISM[6] },
  { text: '[\\w.-]+', color: PRISM[1] },
  { text: '\\.', color: PRISM[3] },
  { text: '\\w+', color: PRISM[0] },
  { text: ')', color: PRISM[6] },
]

type Brick = {
  text: string
  color: string
}

const BRICKS: Brick[] = [
  { text: '/\\d{4}-\\d{2}-\\d{2}/g', color: PRISM[0] },
  { text: '/#[0-9a-fA-F]{3,6}\\b/g', color: PRISM[3] },
  { text: '/https?:\\/\\/[\\w.-]+/g', color: PRISM[6] },
  { text: '/[@#]\\w+/g', color: PRISM[7] },
  { text: '/\\b\\w{3,}\\b/i', color: PRISM[1] },
  { text: '/(?:foo|bar|baz)/', color: PRISM[4] },
  { text: '/\\(?\\d{3}\\)?[-.\\s]?\\d{3}/g', color: PRISM[5] },
  { text: '/^[A-Z][a-z]+$/', color: PRISM[2] },
  { text: '/\\s+$/m', color: PRISM[0] },
  { text: '/(?<=@)[\\w.-]+/', color: PRISM[3] },
  { text: '/\\d+(?:\\.\\d+)?/', color: PRISM[6] },
  { text: '/[\\u3040-\\u309F]+/u', color: PRISM[7] },
  { text: '/^\\s*$/', color: PRISM[4] },
  { text: '/\\b(https?|ftp):/', color: PRISM[1] },
  { text: '/[a-z0-9_-]{3,16}/i', color: PRISM[5] },
  { text: '/\\.\\w{2,6}\\b/', color: PRISM[0] },
  { text: '/(?<!\\w)@\\w+/', color: PRISM[3] },
  { text: '/\\d{1,3}(?:,\\d{3})*/', color: PRISM[2] },
  { text: '/uuid:[0-9a-f-]{36}/i', color: PRISM[6] },
  { text: '/\\$[A-Z_][A-Z0-9_]*/', color: PRISM[7] },
  { text: '/' + '<!--[\\s\\S]*?-->/', color: PRISM[4] },
  { text: '/\\{\\{.*?\\}\\}/', color: PRISM[1] },
  { text: '/\\/\\*.*?\\*\\//s', color: PRISM[5] },
  { text: '/\\bTODO\\b:?/', color: PRISM[0] },
  { text: '/\\d{2}:\\d{2}:\\d{2}/', color: PRISM[3] },
  { text: '/[+-]?\\d+(\\.\\d+)?e[+-]?\\d+/i', color: PRISM[2] },
  { text: '/' + '<(?<tag>\\w+)[^>]*>/', color: PRISM[6] },
  { text: '/\\w+@\\w+\\.\\w+/', color: PRISM[7] },
  { text: '/\\.{3}/', color: PRISM[4] },
  { text: '/\\[(?:\\d+,?)+\\]/', color: PRISM[1] },
  { text: '/(?=.*[A-Z])(?=.*\\d).{8,}/', color: PRISM[5] },
  { text: '/\\b(src|href)=["\'][^"\']*/', color: PRISM[0] },
  { text: '/\\n{2,}/', color: PRISM[3] },
  { text: '/[\\t ]+$/m', color: PRISM[2] },
  { text: '/\\b(0[xX][0-9a-fA-F]+)\\b/', color: PRISM[6] },
  { text: '/v?\\d+\\.\\d+\\.\\d+/', color: PRISM[7] },
]

/** Approximate brick widths for a running-bond layout (mono ~10.5px/char @ 17px). */
function estimateWidth(text: string): number {
  return Math.round(text.length * 10.5 + 28)
}

type PlacedBrick = Brick & { x: number; y: number; w: number }

function layoutBrickBand(
  startY: number,
  rows: number,
  brickOffset: number,
): PlacedBrick[] {
  const rowHeight = 46
  const gapX = 10
  const placed: PlacedBrick[] = []
  let cursor = brickOffset

  for (let row = 0; row < rows; row++) {
    const y = startY + row * rowHeight
    // Running bond: odd rows start mid-brick
    let x = row % 2 === 0 ? -90 : -20
    while (x < WIDTH + 120) {
      const brick = BRICKS[cursor % BRICKS.length]
      cursor++
      const w = estimateWidth(brick.text)
      placed.push({ ...brick, x, y, w })
      x += w + gapX
    }
  }

  return placed
}

const PLACED_BRICKS: PlacedBrick[] = [
  ...layoutBrickBand(-28, 3, 0),
  ...layoutBrickBand(HEIGHT - 110, 3, 17),
]

async function loadGoogleFont(
  family: string,
  weight: number,
): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`
  const css = await fetch(cssUrl, {
    headers: {
      // Request a TTF that satori can embed (woff2 is not supported).
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
    },
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to fetch CSS for ${family}: ${res.status}`)
    }
    return res.text()
  })

  const match = css.match(/src: url\(([^)]+)\) format\('(truetype|opentype)'\)/)
  const fontUrl = match?.[1]
  if (!fontUrl) {
    throw new Error(`Could not find TTF/OTF URL for ${family} ${weight}`)
  }

  const font = await fetch(fontUrl).then((res) => {
    if (!res.ok) {
      throw new Error(`Failed to download font ${family}: ${res.status}`)
    }
    return res.arrayBuffer()
  })

  return font
}

function patternChip(token: TokenChip) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: `${token.color}24`,
        color: token.color,
        borderRadius: 8,
        padding: '4px 7px',
        marginRight: 3,
      }}
    >
      {token.text}
    </div>
  )
}

function OgCard() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: PAPER,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {PLACED_BRICKS.map((brick, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: brick.x,
            top: brick.y,
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'IBM Plex Mono',
            fontSize: 17,
            fontWeight: 500,
            backgroundColor: `${brick.color}1F`,
            color: brick.color,
            borderRadius: 10,
            padding: '9px 13px',
            opacity: 0.45,
            whiteSpace: 'nowrap',
          }}
        >
          {brick.text}
        </div>
      ))}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: 'Figtree',
            fontSize: 40,
            fontWeight: 600,
            color: INK,
            letterSpacing: '-0.01em',
          }}
        >
          Regex Lens
        </div>

        <div
          style={{
            display: 'flex',
            fontFamily: 'Figtree',
            fontSize: 24,
            fontWeight: 500,
            color: INK_SOFT,
            textAlign: 'center',
          }}
        >
          Visualize regular expressions with color and hover explanations.
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'IBM Plex Mono',
            fontSize: 36,
            fontWeight: 500,
            lineHeight: 1.45,
            marginTop: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: 'rgba(19, 32, 51, 0.3)',
              marginRight: 4,
            }}
          >
            /
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {PATTERN.map((t) => patternChip(t))}
          </div>
          <div
            style={{
              display: 'flex',
              color: 'rgba(19, 32, 51, 0.3)',
              marginLeft: 2,
            }}
          >
            /
          </div>
          <div style={{ display: 'flex', color: INK, marginLeft: 2 }}>g</div>
        </div>
      </div>
    </div>
  )
}

async function main() {
  console.log('Loading fonts…')
  const [figtree500, figtree600, plexMono] = await Promise.all([
    loadGoogleFont('Figtree', 500),
    loadGoogleFont('Figtree', 600),
    loadGoogleFont('IBM Plex Mono', 500),
  ])

  console.log('Rendering with satori…')
  const svg = await satori(<OgCard />, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Figtree', data: figtree500, weight: 500, style: 'normal' },
      { name: 'Figtree', data: figtree600, weight: 600, style: 'normal' },
      { name: 'IBM Plex Mono', data: plexMono, weight: 500, style: 'normal' },
    ],
  })

  console.log('Rasterizing PNG…')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  })
  const png = resvg.render().asPng()

  await writeFile(OUT, png)
  console.log(`Wrote ${OUT} (${png.byteLength} bytes)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
