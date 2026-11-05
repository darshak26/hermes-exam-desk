// cbt-exam — exam-agnostic CBT practice panel (route /cbt)
import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, useQuery } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

const CSS = `
.cbt{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--ui-text-primary,#222);font:13px/1.5 var(--font-sans,system-ui)}
.cbt *{box-sizing:border-box}
.cbt .muted{color:var(--ui-text-secondary,#666)}
.cbt .pad{padding:20px 24px;overflow:auto}
.cbt table{border-collapse:collapse;width:100%}
.cbt th,.cbt td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--ui-stroke-secondary,#ccc);font-size:12.5px}
.cbt th{color:var(--ui-text-secondary,#666);font-weight:600}
.cbt button{font:inherit;color:inherit;background:transparent;border:1px solid var(--ui-stroke-secondary,#ccc);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer}
.cbt button:hover:not(:disabled){background:color-mix(in srgb,currentColor 7%,transparent)}
.cbt button.primary{border-color:var(--ui-accent);color:var(--ui-accent)}
.cbt button:disabled{opacity:.5;cursor:default}
.cbt .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cbt .badge{display:inline-block;padding:1px 7px;border-radius:999px;border:1px solid var(--ui-stroke-secondary);font-size:11px}
.cbt .badge.assisted{border-color:var(--ui-accent);color:var(--ui-accent)}
.cbt .lg{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--ui-text-secondary);margin:10px 0}
.cbt .lg .item{display:flex;align-items:center}
.cbt .sw{width:12px;height:12px;border-radius:3px;margin-right:6px;border:1px solid var(--ui-stroke-secondary);display:inline-block}
.cbt .sw.err{border-color:var(--ui-error-foreground);background:color-mix(in srgb,var(--ui-error-foreground) 16%,transparent)}
.cbt .sw.ok{border-color:var(--ui-success-foreground);background:color-mix(in srgb,var(--ui-success-foreground) 16%,transparent)}
.cbt .sw.acc{border-color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 16%,transparent)}
.cbt h3{font-size:13px;margin:14px 0 6px}
`;

async function rest(path, opts) {
  const r = await ctxRest(path, opts)
  return r
}
let ctxRest = () => { throw new Error('register not called') }
let ctxStorage = null
let activeAttemptId = null

async function setActiveAttempt(id) {
  activeAttemptId = id
  try { await ctxStorage.set('activeAttempt', id) } catch {}
}
async function readActiveAttempt() {
  if (activeAttemptId) return activeAttemptId
  try {
    const v = await ctxStorage.get('activeAttempt')
    if (v) activeAttemptId = v
    return v || null
  } catch { return null }
}

const QTYPE_LABEL = { mcq: 'MCQ', msq: 'MSQ', nat: 'Numerical' }
const LEGEND = [
  ['', 'Not Visited'],
  ['err', 'Not Answered'],
  ['ok', 'Answered'],
  ['acc', 'Marked for Review'],
  ['acc', 'Answered & Marked (counts)'],
]

function legendNode() {
  return jsx('div', { className: 'lg', children: LEGEND.map(([cls, label]) =>
    jsxs('span', { key: label, className: 'item', children: [
      jsx('span', { className: `sw ${cls}` }), label,
    ] })) })
}

function fmtWhen(s) {
  if (!s) return '—'
  return new Date(s * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function CbtInstructions({ pack, mode, onBegin, onBack }) {
  const [starting, setStarting] = useState(false)
  const types = [...new Set(pack.questions.map(q => q.type))]
  const hours = Math.floor((pack.pattern.duration_minutes || 0) / 60)
  const mins = (pack.pattern.duration_minutes || 0) % 60
  const begin = async () => {
    if (starting) return
    setStarting(true)
    try {
      const r = await rest('/attempts', { method: 'POST', body: { exam_id: pack.exam_id, mode } })
      await setActiveAttempt(r.attempt.id)
      onBegin(r.attempt.id)
    } catch (e) { host.notifyError?.(`Could not start exam: ${e?.message || e}`); setStarting(false) }
  }
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('div', { className: 'row', children: [
      jsx('h2', { children: `Instructions — ${pack.title || pack.exam_id}` }),
      jsx('span', { className: `badge ${mode === 'assisted' ? 'assisted' : ''}`, children: mode === 'assisted' ? 'Assisted' : 'Exam' }),
    ] }),
    jsx('div', { className: 'muted', children: `Duration ${hours ? hours + ' h ' : ''}${mins} min · ${pack.questions.length} questions · ${types.map(t => QTYPE_LABEL[t] || t).join(' + ')}` }),
    jsx('h3', { children: 'Pattern & marking' }),
    jsxs('table', { children: [
      jsx('thead', { children: jsx('tr', { children: ['Section', 'Questions', 'To attempt', 'Marks'].map(h => jsx('th', { key: h, children: h })) }) }),
      jsx('tbody', { children: pack.pattern.sections.map(s => jsxs('tr', { key: s.id, children: [
        jsx('td', { children: s.title }),
        jsx('td', { children: String(s.question_count) }),
        jsx('td', { children: s.attempt_limit ? `first ${s.attempt_limit}` : 'all' }),
        jsx('td', { children: `+${s.marks_correct} / ${s.marks_wrong}` }),
      ] })) }) ] }),
    jsx('h3', { children: 'Question palette' }),
    legendNode(),
    jsx('div', { className: 'muted', children: 'Answered and marked-for-review questions are evaluated. Marked-for-review without an answer is not.' }),
    jsx('div', { className: 'row', style: { marginTop: 18 }, children: [
      jsx('button', { type: 'button', className: 'primary', disabled: starting, onClick: begin, children: starting ? 'Starting…' : 'I am ready to begin' }),
      jsx('button', { type: 'button', disabled: starting, onClick: onBack, children: 'Back' }),
      jsx('span', { className: 'muted', children: 'The timer starts when you click begin.' }),
    ] }),
  ] })
}

function CbtHome({ onStart, onResume, onViewResult }) {
  const packs = useQuery({ queryKey: ['cbt', 'packs'], queryFn: () => rest('/packs') })
  const hist = useQuery({ queryKey: ['cbt', 'attempts'], queryFn: () => rest('/attempts'), refetchInterval: 15000 })
  const start = async (p, mode) => {
    try {
      const full = await rest(`/packs/${p.exam_id}`)
      onStart(full, mode)
    } catch (e) { host.notifyError?.(`Could not load pack: ${e?.message || e}`) }
  }
  const source = () => {
    host.composer.submit(host.state.activeSessionId.get() ?? null,
      'Load the skill cbt-exam:pyq-sourcing and source <EXAM NAME> <YEAR> previous-year questions into the CBT plugin.')
    host.composer.focus(null)
  }
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('div', { className: 'row', children: [
      jsx('h2', { children: 'CBT Exams' }),
      jsx('span', { className: 'muted', children: 'exam-agnostic practice — any CBT, pattern is data' }),
      jsx('span', { style: { flex: 1 } }),
      jsx('button', { type: 'button', onClick: source, children: 'Source more papers' }),
    ] }),
    packs.isLoading
      ? jsx('div', { className: 'muted', children: 'loading packs…' })
      : packs.isError
        ? jsx('div', { className: 'muted', children: 'Backend unreachable — is cbt-exam in plugins.enabled and the gateway restarted?' })
        : jsxs('table', { children: [
            jsx('thead', { children: jsx('tr', { children: ['Exam', 'Year', 'Questions', 'Duration', 'Marks', 'Provenance', ''].map(h => jsx('th', { key: h, children: h })) }) }),
            jsx('tbody', { children: (packs.data?.packs || []).map(p => {
              const marks = (p.sections || []).map(s => `+${s.marks_correct}`).join(' ')
              const act = p.invalid
                ? jsx('span', { className: 'muted', children: 'invalid — fix the source file' })
                : jsxs('span', { className: 'row', children: [
                    jsx('button', { type: 'button', onClick: () => start(p, 'assisted'), children: 'Start (assisted)' }),
                    jsx('button', { type: 'button', onClick: () => start(p, 'exam'), children: 'Start (exam)' }),
                  ] })
              return jsxs('tr', { key: p.exam_id, children: [
                jsx('td', { children: p.title || p.exam_id }),
                jsx('td', { children: String(p.year || '—') }),
                jsx('td', { children: String(p.question_count ?? 'invalid') }),
                jsx('td', { children: `${p.duration_minutes ?? '?'} min` }),
                jsx('td', { children: marks || '—' }),
                jsx('td', { className: 'muted', children: p.provenance || p.invalid || '' }),
                jsx('td', { children: act }),
              ] })
            }) }) ] }),
    jsx('h3', { children: 'Attempts' }),
    hist.isLoading || hist.isError
      ? jsx('div', { className: 'muted', children: hist.isError ? 'could not load attempts' : 'loading…' })
      : (hist.data?.attempts?.length
        ? jsxs('table', { children: [
            jsx('thead', { children: jsx('tr', { children: ['Exam', 'Mode', 'Status', 'Score', 'Assists', 'When', ''].map(h => jsx('th', { key: h, children: h })) }) }),
            jsx('tbody', { children: hist.data.attempts.map(a => jsxs('tr', { key: a.id, children: [
              jsx('td', { children: a.exam_id }),
              jsx('td', { children: a.mode }),
              jsx('td', { children: a.status }),
              jsx('td', { children: a.score == null ? '—' : String(a.score) }),
              jsx('td', { children: a.assists ? String(a.assists) : '—' }),
              jsx('td', { className: 'muted', children: fmtWhen(a.submitted_at || a.started_at) }),
              jsx('td', { children: a.status === 'in_progress'
                ? jsx('button', { type: 'button', onClick: () => onResume(a.id), children: 'Resume' })
                : jsx('button', { type: 'button', onClick: () => onViewResult(a.id), children: 'View result' }) }),
            ] })) }) ] })
        : jsx('div', { className: 'muted', children: 'No attempts yet — start one above.' })),
  ] })
}

function CbtExam({ attemptId }) {
  const q = useQuery({ queryKey: ['cbt', 'attempt', attemptId], queryFn: () => rest(`/attempts/${attemptId}`), refetchInterval: 30000 })
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('h2', { children: 'Exam' }),
    q.isLoading
      ? jsx('div', { className: 'muted', children: 'loading…' })
      : q.isError
        ? jsx('div', { className: 'muted', children: 'could not load attempt' })
        : jsx('div', { className: 'muted', children: `Attempt ${attemptId} loaded — the exam panel lands in the next build step.` }),
  ] })
}

function CbtResult({ attemptId }) {
  return jsx('div', { className: 'cbt pad', children: jsx('h2', { children: 'Result' }) })
}

function CbtPage() {
  const [view, setView] = useState({ name: 'home' })
  useEffect(() => {
    readActiveAttempt().then(id => { if (id) setView({ name: 'exam', attemptId: id }) })
  }, [])
  return jsx('div', { style: { height: '100%' }, children: [
    jsx('style', { children: CSS }),
    view.name === 'home' && jsx(CbtHome, {
      onStart: (pack, mode) => setView({ name: 'instructions', pack, mode }),
      onResume: id => setView({ name: 'exam', attemptId: id }),
      onViewResult: id => setView({ name: 'result', attemptId: id }),
    }),
    view.name === 'instructions' && jsx(CbtInstructions, {
      pack: view.pack, mode: view.mode,
      onBegin: id => setView({ name: 'exam', attemptId: id }),
      onBack: () => setView({ name: 'home' }),
    }),
    view.name === 'exam' && jsx(CbtExam, { attemptId: view.attemptId }),
    view.name === 'result' && jsx(CbtResult, { attemptId: view.attemptId }),
  ] })
}

export default {
  id: 'cbt-exam',
  name: 'CBT Exams',
  defaultEnabled: false,
  register(ctx) {
    ctxRest = (p, o) => ctx.rest(p, o)
    ctxStorage = ctx.storage
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/cbt' }, render: () => jsx(CbtPage, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: '/cbt', label: 'CBT Exams', codicon: 'checklist' } },
      { id: 'open', area: PALETTE_AREA, data: { id: 'cbt.open', label: 'Open CBT Exams', keywords: ['cbt', 'exam', 'mock'], run: () => host.navigate('/cbt') } },
    ])
  },
}
