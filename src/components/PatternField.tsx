import {
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import type { RegexToken } from '../lib/regexTokens'

type FlagOption = {
  key: string
  hint: string
}

const FLAG_OPTIONS: FlagOption[] = [
  { key: 'g', hint: 'global' },
  { key: 'i', hint: 'ignore case' },
  { key: 'm', hint: 'multiline' },
  { key: 's', hint: 'dot all' },
]

type Props = {
  flags: string
  onPatternChange: (value: string) => void
  onToggleFlag: (key: string) => void
  onUndo: () => void
  onRedo: () => void
  tokens: RegexToken[]
  getColor: (token: RegexToken) => string
  isValid: boolean
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildTokensHtml(
  tokens: RegexToken[],
  getColor: (token: RegexToken) => string,
): string {
  return tokens
    .map((token) => {
      const color = getColor(token)
      const background = `color-mix(in srgb, ${color} 14%, transparent)`
      return `<span data-token-id="${token.id}" class="mr-[0.06em] rounded-[0.35rem] px-[0.18rem] py-[0.12rem] transition-colors duration-150 last:mr-0" style="background-color:${background};color:${color}">${escapeHtml(token.text)}</span>`
    })
    .join('')
}

function getCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(root)
  preRange.setEnd(range.endContainer, range.endOffset)
  return preRange.toString().length
}

function setCaretOffset(root: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let target: Text | null = null
  let node = walker.nextNode()
  while (node) {
    const text = node as Text
    const len = text.length
    if (remaining <= len) {
      target = text
      break
    }
    remaining -= len
    node = walker.nextNode()
  }

  const range = document.createRange()
  if (target) {
    range.setStart(target, Math.max(0, Math.min(remaining, target.length)))
  } else {
    range.selectNodeContents(root)
  }
  range.collapse(true)

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const TOOLTIP_MAX_WIDTH = 'min(80vw, 320px)'

function readDurationMs(varName: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    varName,
  )
  const parsed = parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

// `measureEl` is the editable pattern text (its width is what must fit);
// `styleEl` is the shared ancestor whose font-size is actually adjusted, so
// the surrounding slashes and flag letters shrink/grow along with it.
function fitFontSize(measureEl: HTMLElement, styleEl: HTMLElement) {
  styleEl.style.fontSize = ''
  let size = parseFloat(getComputedStyle(styleEl).fontSize)

  // Token padding/margins use fixed (rem-based, not size-relative) units, and
  // shrinking the shared font-size also shrinks the slashes/flags, which in
  // turn changes how much width is left for the pattern text. A single ratio
  // computed once undershoots that feedback loop, so refine iteratively
  // until the pattern text actually fits.
  for (let i = 0; i < 12; i += 1) {
    const available = measureEl.clientWidth
    const needed = measureEl.scrollWidth
    if (available <= 0 || needed <= available) return
    size = Math.max(1, (size * available * 0.98) / needed)
    styleEl.style.fontSize = `${size}px`
  }
}

export function PatternField({
  flags,
  onPatternChange,
  onToggleFlag,
  onUndo,
  onRedo,
  tokens,
  getColor,
  isValid,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const caretOffsetRef = useRef<number | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const tooltipTextRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const hoveredTokenIdRef = useRef<string | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelPendingHide = () => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  const measureTooltipBox = (text: string) => {
    const measure = measureRef.current
    if (!measure) return { width: 0, height: 0 }
    measure.textContent = text
    return { width: measure.offsetWidth, height: measure.offsetHeight }
  }

  const placeTooltip = (target: HTMLElement, token: RegexToken) => {
    const wrap = wrapRef.current
    const tip = tooltipRef.current
    const textEl = tooltipTextRef.current
    if (!wrap || !tip || !textEl) return

    const text = `${token.title} — ${token.description}`
    const showing = tip.getAttribute('data-show') === 'true'
    const { width, height } = measureTooltipBox(text)
    const wrapRect = wrap.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()

    // Clamp horizontally so the bubble never spills past the viewport edge.
    const edgeMargin = 8
    const idealX =
      targetRect.left - wrapRect.left + targetRect.width / 2 - width / 2
    const minX = edgeMargin - wrapRect.left
    const maxX = window.innerWidth - edgeMargin - wrapRect.left - width
    const x = Math.min(Math.max(idealX, minX), Math.max(minX, maxX))

    // Flip below the row when there isn't enough room above it.
    const gap = 10
    const flip = wrapRect.top - height - gap < edgeMargin

    cancelPendingHide()
    hoveredTokenIdRef.current = token.id

    if (!showing) {
      // First appearance: snap geometry and text with no transition, then
      // let only the appear (opacity/scale) rule play.
      tip.style.transition = 'none'
      tip.style.width = `${width}px`
      tip.style.height = `${height}px`
      tip.style.setProperty('--tt-x', `${x}px`)
      tip.classList.toggle('t-tt--flip', flip)
      textEl.textContent = text
      void tip.offsetWidth
      tip.style.transition = ''
      tip.setAttribute('data-show', 'true')
      tip.setAttribute('aria-hidden', 'false')
      return
    }

    // Already showing and moving to a neighbour: the box travels and
    // resizes on its own transition while the text crossfades in place.
    tip.style.width = `${width}px`
    tip.style.height = `${height}px`
    tip.style.setProperty('--tt-x', `${x}px`)
    tip.classList.toggle('t-tt--flip', flip)

    if (textEl.textContent === text) return
    const swapDur = readDurationMs('--text-swap-dur', 150)
    textEl.classList.add('is-exit')
    window.setTimeout(() => {
      if (hoveredTokenIdRef.current !== token.id) return
      textEl.textContent = text
      textEl.classList.remove('is-exit')
      textEl.classList.add('is-enter-start')
      void textEl.offsetHeight
      textEl.classList.remove('is-enter-start')
    }, swapDur)
  }

  const hideTooltip = () => {
    cancelPendingHide()
    const tip = tooltipRef.current
    if (!tip) return
    hoveredTokenIdRef.current = null
    tip.setAttribute('data-show', 'false')
    tip.setAttribute('aria-hidden', 'true')
  }

  // Moving through the small gap between adjacent tokens (their margin, not
  // an actual element) briefly lands on the shared root instead of a token,
  // which would otherwise flash the tooltip closed and reopen it. Give it a
  // short grace window to reach the next token before actually hiding, so a
  // pointer resting on that gap for longer doesn't leave a stale tooltip up.
  const HOVER_GAP_GRACE_MS = 220

  const scheduleHide = () => {
    cancelPendingHide()
    hideTimeoutRef.current = setTimeout(() => {
      hideTimeoutRef.current = null
      hideTooltip()
    }, HOVER_GAP_GRACE_MS)
  }

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    el.innerHTML = buildTokensHtml(tokens, getColor)
    if (rowRef.current) fitFontSize(el, rowRef.current)
    if (document.activeElement === el) {
      const offset = caretOffsetRef.current ?? el.textContent?.length ?? 0
      setCaretOffset(el, offset)
    }
    caretOffsetRef.current = null
    if (
      hoveredTokenIdRef.current &&
      !tokens.some((t) => t.id === hoveredTokenIdRef.current)
    ) {
      hideTooltip()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens])

  useLayoutEffect(() => {
    const handleResize = () => {
      const el = rootRef.current
      if (el && rowRef.current) fitFontSize(el, rowRef.current)
    }
    window.addEventListener('resize', handleResize)

    // Web fonts can finish loading after the first measurement, which would
    // leave the fit computed against fallback-font metrics.
    document.fonts?.ready?.then(() => {
      const el = rootRef.current
      if (el && rowRef.current) fitFontSize(el, rowRef.current)
    })

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useLayoutEffect(() => cancelPendingHide, [])

  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    const el = event.currentTarget
    caretOffsetRef.current = getCaretOffset(el)
    onPatternChange(el.textContent ?? '')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      return
    }

    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (mod && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        onRedo()
      } else {
        onUndo()
      }
      return
    }
    if (mod && key === 'y') {
      event.preventDefault()
      onRedo()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  const handleMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const targetEl = (event.target as HTMLElement).closest?.(
      '[data-token-id]',
    ) as HTMLElement | null
    if (!targetEl) return
    const token = tokens.find((t) => t.id === targetEl.dataset.tokenId)
    if (!token) return
    placeTooltip(targetEl, token)
  }

  const handleMouseOut = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest?.('[data-token-id]')) return
    const related = event.relatedTarget as HTMLElement | null
    if (related?.closest?.('[data-token-id]')) return
    // Landing back on the shared root means the pointer is in the gap
    // between tokens rather than having actually left the field — give it a
    // short grace window to reach the next token instead of hiding at once.
    scheduleHide()
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div
        ref={rowRef}
        className="flex w-full items-center justify-center gap-1 font-mono text-[clamp(1.5rem,4.6vw,2.75rem)] leading-[1.45] font-medium"
      >
        <span className="shrink-0 text-ink/30 select-none">/</span>

        <div
          ref={rootRef}
          role="textbox"
          aria-multiline="false"
          aria-invalid={!isValid}
          aria-label="Regular expression pattern"
          data-placeholder="type a pattern"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          className="max-w-full min-w-0 shrink overflow-hidden border-0 bg-transparent text-center whitespace-nowrap outline-none empty:before:text-ink/30 empty:before:italic empty:before:content-[attr(data-placeholder)]"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onMouseOver={handleMouseOver}
          onMouseOut={handleMouseOut}
        />

        <span className="flex shrink-0 items-center">
          <span className="text-ink/30 select-none">/</span>
          {FLAG_OPTIONS.map((flag) => {
            const isOn = flags.includes(flag.key)
            return (
              <button
                key={flag.key}
                type="button"
                onClick={() => onToggleFlag(flag.key)}
                title={flag.hint}
                aria-pressed={isOn}
                className={`cursor-pointer rounded-sm transition-colors duration-150 ${
                  isOn ? 'text-ink' : 'text-ink/25 hover:text-ink/50'
                }`}
              >
                {flag.key}
              </button>
            )
          })}
        </span>
      </div>

      <div
        ref={tooltipRef}
        role="tooltip"
        data-show="false"
        aria-hidden="true"
        className="t-tt"
        style={{ maxWidth: TOOLTIP_MAX_WIDTH }}
      >
        <span ref={tooltipTextRef} className="t-tt-text" />
      </div>

      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 -z-50 w-max text-center font-sans text-sm leading-snug font-medium opacity-0"
        style={{ maxWidth: TOOLTIP_MAX_WIDTH, padding: '0.55rem 0.8rem' }}
      />
    </div>
  )
}
