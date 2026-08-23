/**
 * Evalúa expresiones simples de cantidad para conteo (ej. "112-6" → 106).
 * Solo permite enteros y + - * / (sin potencias ni funciones).
 * Acepta símbolos del teclado móvil: × ÷ x − etc.
 */

/** Normaliza símbolos del teclado (× ÷ x −) a operadores ASCII. */
function normalizeCantidadExpr(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[×⋅·xX]/g, '*')
    .replace(/[÷∕]/g, '/')
    .replace(/[−–—]/g, '-')
}

function tokenize(expr: string): string[] | null {
  const tokens: string[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (ch === '+' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push(ch)
      i += 1
      continue
    }
    if (ch === '-') {
      const prev = tokens[tokens.length - 1]
      const unary = tokens.length === 0 || prev === '(' || prev === '+' || prev === '-' || prev === '*' || prev === '/'
      if (unary) {
        let j = i + 1
        if (j >= expr.length || !/\d/.test(expr[j])) return null
        while (j < expr.length && /\d/.test(expr[j])) j += 1
        tokens.push(expr.slice(i, j))
        i = j
      } else {
        tokens.push('-')
        i += 1
      }
      continue
    }
    if (/\d/.test(ch)) {
      let j = i
      while (j < expr.length && /\d/.test(expr[j])) j += 1
      tokens.push(expr.slice(i, j))
      i = j
      continue
    }
    return null
  }
  return tokens
}

function precedence(op: string): number {
  if (op === '+' || op === '-') return 1
  if (op === '*' || op === '/') return 2
  return 0
}

function applyOp(a: number, b: number, op: string): number | null {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      if (b === 0) return null
      return a / b
    default:
      return null
  }
}

/** Evalúa con precedencia * / sobre + -. Devuelve null si es inválida. */
export function evalCantidadExpr(raw: string): number | null {
  const cleaned = normalizeCantidadExpr(raw)
  if (!cleaned) return null

  if (/^-?\d+$/.test(cleaned)) {
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }

  if (!/^[\d+\-*/()]+$/.test(cleaned)) return null

  const tokens = tokenize(cleaned)
  if (!tokens || tokens.length === 0) return null

  const values: number[] = []
  const ops: string[] = []

  const reduce = (): boolean => {
    if (values.length < 2 || ops.length === 0) return false
    const op = ops.pop()!
    const b = values.pop()!
    const a = values.pop()!
    const r = applyOp(a, b, op)
    if (r == null || !Number.isFinite(r)) return false
    values.push(r)
    return true
  }

  for (const t of tokens) {
    if (/^-?\d+$/.test(t)) {
      values.push(Number(t))
      continue
    }
    if (t === '(') {
      ops.push(t)
      continue
    }
    if (t === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') {
        if (!reduce()) return null
      }
      if (ops[ops.length - 1] !== '(') return null
      ops.pop()
      continue
    }
    if (t === '+' || t === '-' || t === '*' || t === '/') {
      while (
        ops.length &&
        ops[ops.length - 1] !== '(' &&
        precedence(ops[ops.length - 1]) >= precedence(t)
      ) {
        if (!reduce()) return null
      }
      ops.push(t)
      continue
    }
    return null
  }

  while (ops.length) {
    if (ops[ops.length - 1] === '(') return null
    if (!reduce()) return null
  }

  if (values.length !== 1) return null
  const result = values[0]
  if (!Number.isFinite(result)) return null
  // Solo enteros (conteo de cajas)
  if (!Number.isInteger(result)) return null
  return result
}

/** true si el texto parece una cuenta (tiene operador), no solo un número. */
export function cantidadExprEsCuenta(raw: string): boolean {
  const s = normalizeCantidadExpr(raw)
  if (!s) return false
  return /[+\-*/]/.test(s.replace(/^-/, ''))
}

/** true si algún campo PALLET todavía tiene una cuenta sin resolver. */
export function palletCantidadesPendientes(
  unidadesPorBulto: string,
  cantidadSuelta: string
): boolean {
  if (cantidadExprEsCuenta(unidadesPorBulto)) return true
  if (cantidadSuelta.trim() && cantidadExprEsCuenta(cantidadSuelta)) return true
  return false
}

/** true si el formulario de conteo tiene cuentas pendientes de resolver. */
export function conteoExprPendientes(opts: {
  tipo: 'PALLET' | 'CAJA' | 'SUELTO' | string
  cantidadBultos: string
  unidadesPorBulto: string
  cantidadSuelta: string
}): boolean {
  if (opts.tipo === 'PALLET') {
    return palletCantidadesPendientes(opts.unidadesPorBulto, opts.cantidadSuelta)
  }
  if (opts.tipo === 'CAJA') {
    return cantidadExprEsCuenta(opts.cantidadBultos)
  }
  return false
}

/**
 * Resuelve el campo a un entero ≥ min (si es válido).
 * Si no se puede evaluar, deja el texto original.
 */
export function resolveCantidadExprField(
  raw: string,
  opts?: { min?: number; allowEmpty?: boolean }
): { text: string; value: number | null; error?: string } {
  const min = opts?.min ?? 0
  const trimmed = raw.trim()
  if (!trimmed) {
    if (opts?.allowEmpty) return { text: '', value: null }
    return { text: raw, value: null, error: 'Indicá una cantidad' }
  }

  const value = evalCantidadExpr(trimmed)
  if (value == null) {
    return { text: raw, value: null, error: 'Cuenta inválida (ej. 112-6)' }
  }
  if (value < min) {
    return { text: raw, value: null, error: `El resultado debe ser ≥ ${min}` }
  }
  return { text: String(value), value }
}

/** Inserta un operador (o dígito) en la posición del cursor del input. */
export function insertCantidadExprToken(
  input: HTMLInputElement | null,
  current: string,
  token: string
): { next: string; caret: number } {
  if (!input) {
    return { next: current + token, caret: current.length + token.length }
  }
  const start = input.selectionStart ?? current.length
  const end = input.selectionEnd ?? current.length
  const next = current.slice(0, start) + token + current.slice(end)
  return { next, caret: start + token.length }
}

export function focusCantidadExprInput(input: HTMLInputElement | null, caret: number) {
  if (!input) return
  input.focus()
  try {
    input.setSelectionRange(caret, caret)
  } catch {
    // algunos navegadores fallan si el input no está visible
  }
}
