import { useEffect, useMemo, useRef, useState } from 'react'
import { PatternField } from './components/PatternField'
import { SampleField } from './components/SampleField'
import {
  compileRegex,
  findMatchSpans,
  tokenizePattern,
  type RegexToken,
} from './lib/regexTokens'

const PRISM = [
  '#e76f51',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#287271',
  '#264653',
  '#3d5a80',
  '#ee6c4d',
  '#c1666b',
  '#4a6fa5',
]

type Preset = {
  pattern: string
  flags: string
  sample: string
}

const PRESETS: Preset[] = [
  {
    pattern: '(?<user>\\w+)@(?<host>[\\w.-]+\\.\\w+)',
    flags: 'g',
    sample:
      'Write to ada@lens.dev or grace@hopper.org — skip invalid@@mail and keep going.',
  },
  {
    pattern: '\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}',
    flags: 'g',
    sample: 'Call us at (415) 555-2671 or 415.555.9820 for support.',
  },
  {
    pattern: '#[0-9a-fA-F]{3,6}\\b',
    flags: 'g',
    sample: 'Brand palette: #1abc9c, #E74C3C and #fff for backgrounds.',
  },
  {
    pattern: 'https?:\\/\\/[\\w.-]+(?:\\/[\\w./?%&=-]*)?',
    flags: 'g',
    sample:
      'Visit https://example.com/docs or http://test.dev/path?x=1 for more.',
  },
  {
    pattern: '\\d{4}-\\d{2}-\\d{2}',
    flags: 'g',
    sample: 'The release ships on 2026-03-14, with a follow-up on 2026-04-01.',
  },
  {
    pattern: '[@#]\\w+',
    flags: 'g',
    sample: 'Follow @regexlens and check out #regex101 for more tips.',
  },
]

function pickPreset(): Preset {
  return PRESETS[Math.floor(Math.random() * PRESETS.length)]
}

function colorFor(index: number): string {
  return PRISM[((index % PRISM.length) + PRISM.length) % PRISM.length]
}

function App() {
  const [initial] = useState(pickPreset)
  const [pattern, setPattern] = useState(initial.pattern)
  const [flags, setFlags] = useState(initial.flags)
  const [sample, setSample] = useState(initial.sample)

  const undoStackRef = useRef<string[]>([])
  const redoStackRef = useRef<string[]>([])

  const updatePattern = (next: string) => {
    setPattern((prev) => {
      if (next === prev) return prev
      undoStackRef.current.push(prev)
      if (undoStackRef.current.length > 200) undoStackRef.current.shift()
      redoStackRef.current = []
      return next
    })
  }

  const undoPattern = () => {
    const prev = undoStackRef.current.pop()
    if (prev === undefined) return
    setPattern((current) => {
      redoStackRef.current.push(current)
      return prev
    })
  }

  const redoPattern = () => {
    const next = redoStackRef.current.pop()
    if (next === undefined) return
    setPattern((current) => {
      undoStackRef.current.push(current)
      return next
    })
  }

  const patternTokens = useMemo(() => tokenizePattern(pattern), [pattern])

  const compiled = useMemo(() => compileRegex(pattern, flags), [pattern, flags])

  // PatternField's own layout effect forces synchronous reflows (fitting the
  // font to the available width) in the same commit as this error state
  // change, which can suppress the CSS transition on `.t-error-msg` (no
  // clean "before" frame to transition from). Flipping the visible flag on
  // the next animation frame gives it one; the text update rides along in
  // the same callback so it keeps showing the last message while it fades.
  const [errorState, setErrorState] = useState({
    shown: !compiled.ok,
    text: compiled.ok ? '' : compiled.error,
  })

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      setErrorState((prev) => ({
        shown: !compiled.ok,
        text: compiled.ok ? prev.text : compiled.error,
      }))
    })
    return () => cancelAnimationFrame(rafId)
  }, [compiled])

  const spans = useMemo(() => {
    if (!compiled.ok || !pattern) return []
    return findMatchSpans(compiled.regex, sample)
  }, [compiled, pattern, sample])

  const getColor = (token: RegexToken) => colorFor(token.colorIndex)

  const toggleFlag = (key: string) => {
    setFlags((prev) =>
      prev.includes(key) ? prev.replace(key, '') : `${prev}${key}`,
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-8 px-5 py-8 font-sans text-ink-soft sm:px-8 sm:py-12">
      <main className="flex flex-1 flex-col justify-center gap-10">
        <section aria-label="Regular expression" className="text-center">
          <PatternField
            flags={flags}
            onPatternChange={updatePattern}
            onToggleFlag={toggleFlag}
            onUndo={undoPattern}
            onRedo={redoPattern}
            tokens={patternTokens}
            getColor={getColor}
            isValid={compiled.ok}
          />

          <p
            className={`t-error-msg mx-auto max-w-md text-sm text-danger ${
              errorState.shown ? 'is-shown' : ''
            }`}
            role="alert"
          >
            {errorState.text}
          </p>
        </section>

        <section aria-label="Sample text" className="mx-auto w-full max-w-xl">
          <SampleField
            value={sample}
            onChange={setSample}
            spans={spans}
            getMatchColor={(matchIndex) => colorFor(matchIndex + 3)}
          />
        </section>
      </main>

      <footer className="flex flex-col items-center gap-2 pt-2 text-center text-sm text-ink-soft/80">
        <p>Hover any colored fragment to learn what it does.</p>
        <p className="flex items-center gap-2">
          <a
            href="https://github.com/minagishl/regex-lens/blob/main/LICENSE"
            className="transition-colors hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            MIT License
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/minagishl/regex-lens"
            className="transition-colors hover:text-ink"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
