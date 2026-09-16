import {
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type { MatchSpan } from '../lib/regexTokens'

type Segment = {
  text: string
  matchIndex: number | null
}

function buildSegments(text: string, spans: MatchSpan[]): Segment[] {
  if (!text) return []

  const fullMatches = spans
    .filter((s) => s.groupIndex === 0)
    .sort((a, b) => a.start - b.start)

  const segments: Segment[] = []
  let cursor = 0

  for (const match of fullMatches) {
    if (match.start < cursor) continue
    if (match.start > cursor) {
      segments.push({ text: text.slice(cursor, match.start), matchIndex: null })
    }
    segments.push({
      text: text.slice(match.start, match.end),
      matchIndex: match.matchIndex,
    })
    cursor = match.end
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matchIndex: null })
  }

  return segments
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildSampleHtml(
  segments: Segment[],
  getMatchColor: (matchIndex: number) => string,
): string {
  return segments
    .map((segment) => {
      if (segment.matchIndex === null) return escapeHtml(segment.text)
      const background = `color-mix(in srgb, ${getMatchColor(segment.matchIndex)} 22%, transparent)`
      // This is a real (not contentEditable-split) DOM node, so real margin
      // and padding are safe here — no invisible textarea to stay aligned
      // with — giving genuine colorless space around the tinted background
      // instead of just enlarging the tint itself.
      return `<mark class="mx-[0.1em] rounded-[0.2rem] px-[0.2em] py-[0.15em] text-inherit" style="background-color:${background}">${escapeHtml(segment.text)}</mark>`
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

type Props = {
  value: string
  onChange: (value: string) => void
  spans: MatchSpan[]
  getMatchColor: (matchIndex: number) => string
}

export function SampleField({ value, onChange, spans, getMatchColor }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const caretOffsetRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const segments = buildSegments(value, spans)
    // A trailing newline needs a following <br> to give the browser an
    // actual empty line to place the caret into — otherwise a caret "after"
    // the final \n renders ambiguously and new input lands before it instead.
    const trailingBreak = value.endsWith('\n') ? '<br>' : ''
    el.innerHTML =
      value.length === 0
        ? ''
        : buildSampleHtml(segments, getMatchColor) + trailingBreak
    if (caretOffsetRef.current !== null && document.activeElement === el) {
      setCaretOffset(el, caretOffsetRef.current)
    }
    caretOffsetRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, spans])

  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    const el = event.currentTarget
    caretOffsetRef.current = getCaretOffset(el)
    onChange(el.textContent ?? '')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()

    // `execCommand('insertText', false, '\n')` gets normalized away by the
    // browser instead of inserting a literal newline, so insert the text
    // node directly and drive our own state update (programmatic DOM edits
    // don't fire a native `input` event).
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const textNode = document.createTextNode('\n')
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    const el = rootRef.current
    if (!el) return
    caretOffsetRef.current = getCaretOffset(el)
    onChange(el.textContent ?? '')
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }

  return (
    <div
      ref={rootRef}
      role="textbox"
      aria-multiline="true"
      aria-label="Sample text"
      data-placeholder="Type some sample text to see matches light up."
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className="min-h-26 w-full rounded-xl bg-ink/5 px-6 py-5 font-sans text-lg leading-normal wrap-break-word whitespace-pre-wrap text-ink outline-none empty:before:text-ink/40 empty:before:italic empty:before:content-[attr(data-placeholder)]"
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  )
}
