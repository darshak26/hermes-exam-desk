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
.cbt-shell{display:grid;height:100%;min-height:0;
  grid-template-columns:minmax(0,1fr) 358px;
  grid-template-rows:44px 40px minmax(0,1fr) 48px;
  grid-template-areas:"head head" "tabs pal" "body pal" "act pal";}
.cbt-shell.assisted{grid-template-rows:44px 40px minmax(0,1fr) var(--cbt-chat-h,168px) 48px;
  grid-template-areas:"head head" "tabs pal" "body pal" "chat chat" "act pal";}
.cbt-shell.assisted.collapsed{grid-template-rows:44px 40px minmax(0,1fr) 48px 48px}
.cbt-shell.assisted.collapsed .cbt-chat-log{display:none}
.cbt-chat{display:flex;flex-direction:column;min-height:0;border-top:1px solid var(--ui-stroke-secondary)}
.cbt-chat-log{flex:1;overflow:auto;padding:8px 16px;font-size:12.5px}
.cbt-chat-input{display:flex;gap:8px;align-items:center;padding:8px 16px;border-top:1px solid var(--ui-stroke-secondary)}
.cbt-pal-grid{display:grid;grid-template-columns:repeat(10,28px);gap:6px;justify-content:center;padding:12px}
.cbt-chip{height:24px;font-size:11.5px;font-variant-numeric:tabular-nums;border-radius:4px;border:1px solid var(--ui-stroke-secondary)}
.cbt-chip.s-not-visited{background:transparent;color:var(--ui-text-secondary)}
.cbt-chip.s-not-answered{border-color:var(--ui-error-foreground);background:color-mix(in srgb,var(--ui-error-foreground) 16%,transparent)}
.cbt-chip.s-answered{border-color:var(--ui-success-foreground);background:color-mix(in srgb,var(--ui-success-foreground) 16%,transparent)}
.cbt-chip.s-marked{border-color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 16%,transparent)}
.cbt-chip.s-answered-marked{border-color:var(--ui-success-foreground);background:color-mix(in srgb,var(--ui-accent) 18%,transparent)}
.cbt-qbody{max-width:860px;margin:0 auto;padding:24px 28px;font-size:15px;line-height:1.6;overflow:auto}
.cbt-actions{display:flex;gap:8px;align-items:center;padding:0 16px}
.cbt-shell.pal-collapsed{grid-template-columns:minmax(0,1fr) 24px}
.cbt-shell.pal-collapsed .cbt-pal-inner{display:none}
.cbt-head{display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--ui-stroke-secondary)}
.cbt-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--ui-stroke-secondary);overflow:hidden}
.cbt-tabs button{border:none;border-bottom:2px solid transparent;border-radius:0;padding:8px 14px}
.cbt-tabs button.on{border-bottom-color:var(--ui-accent);color:var(--ui-accent)}
.cbt-pal{display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--ui-stroke-secondary)}
.cbt-pal-head{padding:10px 12px 4px}
.cbt-pal-scroll{flex:1;overflow:auto}
.cbt-pal-group{margin:6px 0}
.cbt-pal-group h4{font-size:11px;margin:8px 12px 4px;color:var(--ui-text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.cbt-pal-submit{padding:8px 12px;border-top:1px solid var(--ui-stroke-secondary)}
.cbt-pal-toggle{position:absolute;right:0;top:0;height:100%;width:24px}
.cbt-pal-wrap{position:relative;display:flex;flex-direction:column;min-height:0;height:100%}
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

function legendNode(counts) {
  return jsx('div', { className: 'lg', children: LEGEND.map(([cls, label], i) =>
    jsxs('span', { key: label, className: 'item', children: [
      jsx('span', { className: `sw ${cls}` }), label + (counts ? `: ${counts[i]}` : ''),
    ] })) })
}

function fmtWhen(s) {
  if (!s) return '—'
  return new Date(s * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtHMS(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${sec}`
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

function chipState(qid, answered, visited, marked) {
  const v = answered[qid]
  const ans = v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  const m = marked.includes(qid)
  const vis = visited.includes(qid)
  if (ans && m) return 's-answered-marked'
  if (ans) return 's-answered'
  if (m) return 's-marked'
  if (vis) return 's-not-answered'
  return 's-not-visited'
}

function CbtExam({ attemptId, onResult }) {
  const q = useQuery({ queryKey: ['cbt', 'attempt', attemptId], queryFn: () => rest(`/attempts/${attemptId}`), refetchInterval: 30000 })
  const [curSec, setCurSec] = useState(null)
  const [curQid, setCurQid] = useState(null)
  const [palCollapsed, setPalCollapsed] = useState(false)
  const [showPaper, setShowPaper] = useState(false)
  if (q.isLoading) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'loading…' }) })
  if (q.isError) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'could not load attempt' }) })
  const { attempt, pack, remaining_seconds } = q.data
  if (attempt.status !== 'in_progress') {
    return jsxs('div', { className: 'cbt pad', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('p', { className: 'muted', children: 'This attempt is submitted.' }),
      jsx('button', { type: 'button', onClick: () => onResult(attemptId), children: 'Open result' }),
    ] })
  }
  const sections = pack.pattern.sections
  const qmap = Object.fromEntries(pack.questions.map(x => [x.id, x]))
  const activeSecId = curSec || sections[0].id
  const cur = qmap[curQid] || pack.questions.find(x => x.section === activeSecId) || pack.questions[0]
  const answered = attempt.answers || {}
  const marked = attempt.marked || []
  const visited = attempt.visited || []
  const secQs = sid => pack.questions.filter(x => x.section === sid)
  const secCounts = (() => {
    const counts = [0, 0, 0, 0, 0]
    for (const x of secQs(activeSecId)) {
      const st = chipState(x.id, answered, visited, marked)
      if (st === 's-not-visited') counts[0]++
      else if (st === 's-not-answered') counts[1]++
      else if (st === 's-answered') counts[2]++
      else if (st === 's-marked') counts[3]++
      else counts[4]++
    }
    return counts
  })()
  const secMeta = sections.find(s => s.id === activeSecId) || {}
  const counted = secQs(activeSecId).filter(x => attempt.answer_seq.includes(x.id)).length
  const jump = x => { setCurQid(x.id); setCurSec(x.section) }
  const jumpSection = sid => {
    setCurSec(sid)
    const first = secQs(sid)[0]
    if (first) setCurQid(first.id)
  }
  return jsxs('div', { className: `cbt cbt-shell${attempt.mode === 'assisted' ? ' assisted' : ''}${palCollapsed ? ' pal-collapsed' : ''}` }, [
    jsx('div', { className: 'cbt-head', style: { gridArea: 'head' }, children: [
      jsx('strong', { children: pack.title || pack.exam_id }),
      jsx('span', { className: `badge ${attempt.mode === 'assisted' ? 'assisted' : ''}`, children: attempt.mode === 'assisted' ? 'Assisted' : 'Exam' }),
      jsx('span', { style: { flex: 1 } }),
      jsx('button', { type: 'button', onClick: () => setShowPaper(v => !v), children: 'Question Paper' }),
      jsx('strong', { style: { fontVariantNumeric: 'tabular-nums' }, children: `Remaining Time: ${fmtHMS(remaining_seconds)}` }),
    ] }),
    jsx('div', { className: 'cbt-tabs', style: { gridArea: 'tabs' }, children: sections.map(s =>
      jsx('button', { key: s.id, type: 'button', className: s.id === activeSecId ? 'on' : '', onClick: () => jumpSection(s.id), children: s.title })) }),
    jsx('div', { className: 'cbt-qbody', style: { gridArea: 'body' }, children: [
      jsxs('div', { className: 'muted', children: [
        `Question ${cur.id} · ${QTYPE_LABEL[cur.type] || cur.type}`,
        cur.type === 'mcq' || cur.type === 'msq' ? ` · +${cur.marks_correct ?? secMeta.marks_correct} / ${cur.marks_wrong ?? secMeta.marks_wrong}` : '',
      ] }),
      jsx('p', { style: { fontSize: 16, marginTop: 8 }, children: cur.text }),
      jsx('div', { className: 'muted', children: 'Answer controls land in the next step.' }),
    ] }),
    jsx('div', { className: 'cbt-pal', style: { gridArea: 'pal' }, children: [
      jsx('div', { className: 'cbt-pal-wrap', children: [
        jsx('div', { className: 'cbt-pal-inner', style: { display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }, children: [
          jsx('div', { className: 'cbt-pal-head', children: [
            legendNode(secCounts),
            secMeta.attempt_limit
              ? jsx('div', { style: { fontSize: 12, color: counted >= secMeta.attempt_limit ? 'var(--ui-accent)' : 'var(--ui-text-secondary)' }, children: `Attempted ${counted} / ${secMeta.attempt_limit} counted — further answers in this section don't score` })
              : null,
          ] }),
          jsx('div', { className: 'cbt-pal-scroll', children: sections.map(s =>
            jsxs('div', { key: s.id, className: 'cbt-pal-group', children: [
              jsx('h4', { children: s.title }),
              jsx('div', { className: 'cbt-pal-grid', children: secQs(s.id).map((x, i) => {
                const st = chipState(x.id, answered, visited, marked)
                return jsx('button', {
                  key: x.id, type: 'button',
                  className: `cbt-chip ${st}${x.id === cur.id ? ' cur' : ''}`,
                  style: x.id === cur.id ? { outline: '2px solid var(--ui-accent)', outlineOffset: '1px' } : undefined,
                  onClick: () => jump(x),
                  children: st === 's-answered-marked' ? `${i + 1}✓` : String(i + 1),
                })
              }) }),
            ] })) }),
          jsx('div', { className: 'cbt-pal-submit', children: jsx('button', { type: 'button', style: { width: '100%' }, children: 'Submit' }) }),
        ] }),
        jsx('button', {
          type: 'button', className: 'cbt-pal-toggle',
          onClick: () => setPalCollapsed(v => !v),
          children: palCollapsed ? '<' : '>',
        }),
      ] }),
    ] }),
    jsx('div', { className: 'cbt-actions', style: { gridArea: 'act' }, children: [
      jsx('span', { className: 'muted', children: 'actions bar — next step' }),
    ] }),
    showPaper && jsxs('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
      onClick: () => setShowPaper(false),
      children: [jsx('div', {
        style: { background: 'var(--ui-surface-background)', color: 'var(--ui-text-primary)', maxWidth: 760, width: '90%', maxHeight: '80%', overflow: 'auto', borderRadius: 8, padding: 20 },
        onClick: e => e.stopPropagation(),
        children: [
          jsx('div', { className: 'row', children: [
            jsx('strong', { children: pack.title || pack.exam_id }),
            jsx('span', { style: { flex: 1 } }),
            jsx('button', { type: 'button', onClick: () => setShowPaper(false), children: 'Close' }),
          ] }),
          ...sections.map(s => jsxs('div', { key: s.id, children: [
            jsx('h3', { children: s.title }),
            ...secQs(s.id).map((x, i) => jsxs('p', { key: x.id, style: { margin: '8px 0', fontSize: 13 }, children: [
              jsx('strong', { children: `${i + 1}. ` }), x.text,
            ] })),
          ] })),
        ],
      })],
    }),
  ])
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
    view.name === 'exam' && jsx(CbtExam, { key: view.attemptId, attemptId: view.attemptId, onResult: id => setView({ name: 'result', attemptId: id }) }),
    view.name === 'result' && jsx(CbtResult, { key: view.attemptId, attemptId: view.attemptId }),
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
