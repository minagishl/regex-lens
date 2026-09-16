export type TokenKind =
  | 'literal'
  | 'escape'
  | 'charClass'
  | 'group'
  | 'quantifier'
  | 'anchor'
  | 'alternation'
  | 'dot'
  | 'flag'
  | 'delimiter'
  | 'error'

export type RegexToken = {
  id: string
  text: string
  kind: TokenKind
  title: string
  description: string
  start: number
  end: number
  colorIndex: number
}

const ESCAPE_MEANINGS: Record<string, { title: string; description: string }> =
  {
    d: {
      title: 'Digit',
      description: 'Matches any digit from 0 to 9.',
    },
    D: {
      title: 'Non-digit',
      description: 'Matches any character that is not a digit.',
    },
    w: {
      title: 'Word character',
      description: 'Matches letters, digits, and underscore (_).',
    },
    W: {
      title: 'Non-word character',
      description: 'Matches anything that is not a word character.',
    },
    s: {
      title: 'Whitespace',
      description: 'Matches spaces, tabs, newlines, and other whitespace.',
    },
    S: {
      title: 'Non-whitespace',
      description: 'Matches any character that is not whitespace.',
    },
    b: {
      title: 'Word boundary',
      description:
        'Matches a position between a word and a non-word character.',
    },
    B: {
      title: 'Non-word boundary',
      description: 'Matches a position that is not a word boundary.',
    },
    n: {
      title: 'Newline',
      description: 'Matches a line feed character.',
    },
    t: {
      title: 'Tab',
      description: 'Matches a horizontal tab character.',
    },
    r: {
      title: 'Carriage return',
      description: 'Matches a carriage return character.',
    },
    '0': {
      title: 'Null character',
      description: 'Matches a null (NUL) character.',
    },
  }

const FLAG_MEANINGS: Record<string, { title: string; description: string }> = {
  g: {
    title: 'Global',
    description: 'Find every match in the text, not just the first one.',
  },
  i: {
    title: 'Ignore case',
    description: 'Match letters regardless of uppercase or lowercase.',
  },
  m: {
    title: 'Multiline',
    description: '^ and $ match the start and end of each line.',
  },
  s: {
    title: 'Dot all',
    description: 'The dot (.) also matches newline characters.',
  },
  u: {
    title: 'Unicode',
    description: 'Treat the pattern as a sequence of Unicode code points.',
  },
  y: {
    title: 'Sticky',
    description: 'Match only at the lastIndex position.',
  },
  d: {
    title: 'Has indices',
    description: 'Include start and end indices for each match group.',
  },
  v: {
    title: 'Unicode sets',
    description: 'Enable advanced Unicode character set features.',
  },
}

function explainQuantifier(text: string): {
  title: string
  description: string
} {
  if (text === '*') {
    return {
      title: 'Zero or more',
      description:
        'Match the previous item as many times as possible, including zero.',
    }
  }
  if (text === '+') {
    return {
      title: 'One or more',
      description: 'Match the previous item at least once.',
    }
  }
  if (text === '?') {
    return {
      title: 'Optional',
      description: 'Match the previous item zero or one time.',
    }
  }
  if (text.endsWith('?')) {
    return {
      title: 'Lazy quantifier',
      description: `Match as few times as possible (${text.slice(0, -1)}), expanding only when needed.`,
    }
  }
  const range = text.match(/^\{(\d+)(?:,(\d*))?\}$/)
  if (range) {
    const min = range[1]
    const max = range[2]
    if (max === undefined) {
      return {
        title: `Exactly ${min}`,
        description: `Match the previous item exactly ${min} time${min === '1' ? '' : 's'}.`,
      }
    }
    if (max === '') {
      return {
        title: `${min} or more`,
        description: `Match the previous item at least ${min} time${min === '1' ? '' : 's'}.`,
      }
    }
    return {
      title: `${min} to ${max}`,
      description: `Match the previous item between ${min} and ${max} times.`,
    }
  }
  return {
    title: 'Quantifier',
    description: 'Controls how many times the previous item can match.',
  }
}

function explainGroup(text: string): { title: string; description: string } {
  if (text === '(?:') {
    return {
      title: 'Non-capturing group',
      description: 'Groups tokens without creating a capture.',
    }
  }
  if (text === '(?=') {
    return {
      title: 'Positive lookahead',
      description:
        'Asserts that what follows matches, without consuming characters.',
    }
  }
  if (text === '(?!') {
    return {
      title: 'Negative lookahead',
      description: 'Asserts that what follows does not match.',
    }
  }
  if (text === '(?<=') {
    return {
      title: 'Positive lookbehind',
      description:
        'Asserts that what precedes matches, without consuming characters.',
    }
  }
  if (text === '(?<!') {
    return {
      title: 'Negative lookbehind',
      description: 'Asserts that what precedes does not match.',
    }
  }
  if (text.startsWith('(?<') && text.endsWith('>')) {
    const name = text.slice(3, -1)
    return {
      title: `Named group “${name}”`,
      description: `Captures the matched text under the name “${name}”.`,
    }
  }
  if (text === '(') {
    return {
      title: 'Capturing group',
      description: 'Groups tokens and remembers the matched text.',
    }
  }
  if (text === ')') {
    return {
      title: 'Group end',
      description: 'Closes the nearest open group.',
    }
  }
  return {
    title: 'Group',
    description: 'Groups part of the pattern together.',
  }
}

function explainCharClass(text: string): {
  title: string
  description: string
} {
  const negated = text.startsWith('[^')
  const inner = text.slice(negated ? 2 : 1, -1)
  return {
    title: negated ? 'Negated character class' : 'Character class',
    description: negated
      ? `Matches any character except: ${inner || '(empty)'}.`
      : `Matches any one of: ${inner || '(empty)'}.`,
  }
}

function explainEscape(text: string): { title: string; description: string } {
  const body = text.slice(1)
  if (ESCAPE_MEANINGS[body]) return ESCAPE_MEANINGS[body]
  if (/^\d+$/.test(body)) {
    return {
      title: `Backreference \\${body}`,
      description: `Re-matches the text captured by group ${body}.`,
    }
  }
  if (body.startsWith('k<') && body.endsWith('>')) {
    const name = body.slice(2, -1)
    return {
      title: `Named backreference`,
      description: `Re-matches the text captured by group “${name}”.`,
    }
  }
  if (body.startsWith('u{') || body.startsWith('u') || body.startsWith('x')) {
    return {
      title: 'Unicode / hex escape',
      description: `Matches the character represented by ${text}.`,
    }
  }
  return {
    title: 'Escaped character',
    description: `Matches the literal “${body}” character.`,
  }
}

function readCharClass(source: string, start: number): number {
  let i = start + 1
  if (source[i] === '^') i += 1
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2
      continue
    }
    if (source[i] === ']') return i + 1
    i += 1
  }
  return source.length
}

function readQuantifier(source: string, start: number): number {
  const ch = source[start]
  if (ch === '*' || ch === '+' || ch === '?') {
    return source[start + 1] === '?' ? start + 2 : start + 1
  }
  if (ch === '{') {
    let i = start + 1
    while (i < source.length && /[\d,]/.test(source[i])) i += 1
    if (source[i] === '}') {
      i += 1
      if (source[i] === '?') i += 1
      return i
    }
  }
  return start
}

function readGroupOpen(source: string, start: number): number {
  if (source.startsWith('(?:', start)) return start + 3
  if (source.startsWith('(?=', start)) return start + 3
  if (source.startsWith('(?!', start)) return start + 3
  if (source.startsWith('(?<=', start)) return start + 4
  if (source.startsWith('(?<!', start)) return start + 4
  if (source.startsWith('(?<', start)) {
    let i = start + 3
    while (i < source.length && source[i] !== '>' && source[i] !== ')') i += 1
    if (source[i] === '>') return i + 1
  }
  return start + 1
}

function readEscape(source: string, start: number): number {
  let i = start + 1
  if (i >= source.length) return source.length
  const ch = source[i]
  if (ch === 'k' && source[i + 1] === '<') {
    i += 2
    while (i < source.length && source[i] !== '>') i += 1
    return i < source.length ? i + 1 : source.length
  }
  if (ch === 'u' && source[i + 1] === '{') {
    i += 2
    while (i < source.length && source[i] !== '}') i += 1
    return i < source.length ? i + 1 : source.length
  }
  if (ch === 'u') return Math.min(i + 5, source.length)
  if (ch === 'x') return Math.min(i + 3, source.length)
  if (/\d/.test(ch)) {
    i += 1
    while (i < source.length && /\d/.test(source[i])) i += 1
    return i
  }
  return i + 1
}

/** Tokenize a regex pattern body (no surrounding slashes). */
export function tokenizePattern(pattern: string): RegexToken[] {
  const tokens: Omit<RegexToken, 'colorIndex' | 'id'>[] = []
  let i = 0

  while (i < pattern.length) {
    const ch = pattern[i]

    if (ch === '\\') {
      const end = readEscape(pattern, i)
      const text = pattern.slice(i, end)
      const info = explainEscape(text)
      tokens.push({
        text,
        kind: 'escape',
        title: info.title,
        description: info.description,
        start: i,
        end,
      })
      i = end
      continue
    }

    if (ch === '[') {
      const end = readCharClass(pattern, i)
      const text = pattern.slice(i, end)
      const info = explainCharClass(text)
      tokens.push({
        text,
        kind: 'charClass',
        title: info.title,
        description: info.description,
        start: i,
        end,
      })
      i = end
      continue
    }

    if (ch === '(') {
      const end = readGroupOpen(pattern, i)
      const text = pattern.slice(i, end)
      const info = explainGroup(text)
      tokens.push({
        text,
        kind: 'group',
        title: info.title,
        description: info.description,
        start: i,
        end,
      })
      i = end
      continue
    }

    if (ch === ')') {
      const info = explainGroup(')')
      tokens.push({
        text: ')',
        kind: 'group',
        title: info.title,
        description: info.description,
        start: i,
        end: i + 1,
      })
      i += 1
      continue
    }

    if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
      const end = readQuantifier(pattern, i)
      if (end > i) {
        const text = pattern.slice(i, end)
        const info = explainQuantifier(text)
        tokens.push({
          text,
          kind: 'quantifier',
          title: info.title,
          description: info.description,
          start: i,
          end,
        })
        i = end
        continue
      }
    }

    if (ch === '^' || ch === '$') {
      tokens.push({
        text: ch,
        kind: 'anchor',
        title: ch === '^' ? 'Start anchor' : 'End anchor',
        description:
          ch === '^'
            ? 'Matches the beginning of the string (or line in multiline mode).'
            : 'Matches the end of the string (or line in multiline mode).',
        start: i,
        end: i + 1,
      })
      i += 1
      continue
    }

    if (ch === '|') {
      tokens.push({
        text: '|',
        kind: 'alternation',
        title: 'Alternation',
        description:
          'Matches either the expression on the left or the one on the right.',
        start: i,
        end: i + 1,
      })
      i += 1
      continue
    }

    if (ch === '.') {
      tokens.push({
        text: '.',
        kind: 'dot',
        title: 'Any character',
        description:
          'Matches any character except newline (unless the s flag is on).',
        start: i,
        end: i + 1,
      })
      i += 1
      continue
    }

    tokens.push({
      text: ch,
      kind: 'literal',
      title: 'Literal character',
      description: `Matches the character “${ch}” exactly.`,
      start: i,
      end: i + 1,
    })
    i += 1
  }

  // Merge consecutive literals into readable chunks (keep single chars for hover precision
  // but merge runs of plain letters/digits for cleaner coloring)
  const merged: Omit<RegexToken, 'colorIndex' | 'id'>[] = []
  for (const token of tokens) {
    const prev = merged[merged.length - 1]
    if (
      prev &&
      prev.kind === 'literal' &&
      token.kind === 'literal' &&
      /^[\w\s]$/.test(prev.text.slice(-1)) &&
      /^[\w\s]$/.test(token.text)
    ) {
      prev.text += token.text
      prev.end = token.end
      prev.description = `Matches the text “${prev.text}” exactly.`
      prev.title = 'Literal text'
    } else {
      merged.push({ ...token })
    }
  }

  const kindOrder: TokenKind[] = [
    'group',
    'charClass',
    'escape',
    'quantifier',
    'anchor',
    'alternation',
    'dot',
    'literal',
    'flag',
    'delimiter',
    'error',
  ]

  return merged.map((token, index) => ({
    ...token,
    id: `t-${index}-${token.start}`,
    colorIndex: kindOrder.indexOf(token.kind) + index,
  }))
}

export function tokenizeFlags(flags: string): RegexToken[] {
  return [...flags].map((flag, index) => {
    const info = FLAG_MEANINGS[flag] ?? {
      title: `Flag “${flag}”`,
      description: 'Unrecognized or engine-specific flag.',
    }
    return {
      id: `f-${index}-${flag}`,
      text: flag,
      kind: 'flag' as const,
      title: info.title,
      description: info.description,
      start: index,
      end: index + 1,
      colorIndex: 20 + index,
    }
  })
}

export type CompiledRegex =
  | {
      ok: true
      regex: RegExp
      pattern: string
      flags: string
    }
  | {
      ok: false
      error: string
      pattern: string
      flags: string
    }

export function compileRegex(pattern: string, flags: string): CompiledRegex {
  try {
    const uniqueFlags = [...new Set(flags)].join('')
    return {
      ok: true,
      regex: new RegExp(pattern, uniqueFlags),
      pattern,
      flags: uniqueFlags,
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Invalid regular expression',
      pattern,
      flags,
    }
  }
}

export type MatchSpan = {
  start: number
  end: number
  text: string
  matchIndex: number
  groupIndex: number
}

export function findMatchSpans(regex: RegExp, text: string): MatchSpan[] {
  const spans: MatchSpan[] = []
  if (!text) return spans

  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const re = new RegExp(regex.source, flags)
  let match: RegExpExecArray | null
  let guard = 0
  let matchIndex = 0

  while ((match = re.exec(text)) !== null) {
    guard += 1
    if (guard > 5000) break

    const full = match[0]
    spans.push({
      start: match.index,
      end: match.index + full.length,
      text: full,
      matchIndex,
      groupIndex: 0,
    })

    for (let g = 1; g < match.length; g += 1) {
      const group = match[g]
      if (group == null || group === '') continue
      const groupStart = match.index + full.indexOf(group)
      // Prefer indices API when available
      const indices = (
        match as RegExpExecArray & {
          indices?: Array<[number, number] | undefined>
        }
      ).indices
      const range = indices?.[g]
      spans.push({
        start: range ? range[0] : groupStart,
        end: range ? range[1] : groupStart + group.length,
        text: group,
        matchIndex,
        groupIndex: g,
      })
    }

    if (full.length === 0) {
      re.lastIndex += 1
    }
    matchIndex += 1
  }

  return spans
}
