// cbt-exam — exam-agnostic CBT practice panel (route /cbt)
import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, STATUSBAR_AREAS, useQuery, useQueryClient } from '@hermes/plugin-sdk'
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
.cbt .badge.err{border-color:var(--ui-error-foreground);color:var(--ui-error-foreground)}
.cbt .badge.ok{border-color:var(--ui-success-foreground);color:var(--ui-success-foreground)}
.cbt .badge.acc{border-color:var(--ui-accent);color:var(--ui-accent)}
.cbt .lg{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--ui-text-secondary);margin:10px 0}
.cbt .lg .item{display:flex;align-items:center}
.cbt .sw{width:12px;height:12px;border-radius:3px;margin-right:6px;border:1px solid var(--ui-stroke-secondary);display:inline-block}
.cbt .sw.err{border-color:var(--ui-error-foreground);background:color-mix(in srgb,var(--ui-error-foreground) 16%,transparent)}
.cbt .sw.ok{border-color:var(--ui-success-foreground);background:color-mix(in srgb,var(--ui-success-foreground) 16%,transparent)}
.cbt .sw.acc{border-color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 16%,transparent)}
.cbt h3{font-size:13px;margin:14px 0 6px}
.cbt input[type=text]{font:inherit;color:inherit;background:var(--ui-surface-background,#fff);border:1px solid var(--ui-stroke-secondary,#ccc);border-radius:6px;padding:6px 10px;min-width:280px}
.cbt .opt{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid var(--ui-stroke-secondary,#ccc);border-radius:6px;margin:8px 0;cursor:pointer;background:var(--ui-surface-background,#fff)}
.cbt .opt input{margin-top:2px}
.cbt .opt.sel{border-color:var(--ui-accent)}
.cbt .opt{text-align:left;max-width:640px}
.cbt-shell{display:grid;height:100%;min-height:0;
  grid-template-columns:minmax(0,1fr) 358px;
  grid-template-rows:44px 40px minmax(0,1fr) 48px;
  grid-template-areas:"head head" "tabs pal" "body pal" "act pal";}
.cbt-pal-grid{display:grid;grid-template-columns:repeat(10,28px);gap:6px;justify-content:center;padding:12px}
.cbt-chip{height:24px;font-size:11.5px;font-variant-numeric:tabular-nums;border-radius:4px;border:1px solid var(--ui-stroke-secondary)}
.cbt-chip.s-not-visited{background:transparent;color:var(--ui-text-secondary)}
.cbt-chip.s-not-answered{border-color:var(--ui-error-foreground);background:color-mix(in srgb,var(--ui-error-foreground) 16%,transparent)}
.cbt-chip.s-answered{border-color:var(--ui-success-foreground);background:color-mix(in srgb,var(--ui-success-foreground) 16%,transparent)}
.cbt-chip.s-marked{border-color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 16%,transparent)}
.cbt-chip.s-answered-marked{border-color:var(--ui-success-foreground);background:color-mix(in srgb,var(--ui-accent) 18%,transparent)}
.cbt-qbody{max-width:860px;margin:0 auto;padding:24px 28px;font-size:15px;line-height:1.6;overflow:auto}
.cbt-actions{display:flex;gap:8px;align-items:center;padding:0 16px;flex-wrap:wrap}
.cbt-actions button{text-align:left}
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
  activeAttemptId = id || null
  try {
    if (id) await ctxStorage.set('activeAttempt', id)
    else await ctxStorage.remove('activeAttempt')
  } catch {}
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
      if (mode === 'assisted') {
        // prime the real composer: load the exam-assist skill so doubts typed in the
        // app's own chatbox get answered against the live question context file.
        host.composer.submit(host.state.activeSessionId.get() ?? null,
          'Load the skill cbt-exam:exam-assist — I am starting an assisted CBT exam (attempt '
          + r.attempt.id + '). Answer my doubts using the live question context file.')
        host.composer.focus(null)
      }
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
            jsx('thead', { children: jsx('tr', { children: ['Exam', 'Mode', 'Status', 'Score', 'When', ''].map(h => jsx('th', { key: h, children: h })) }) }),
            jsx('tbody', { children: hist.data.attempts.map(a => jsxs('tr', { key: a.id, children: [
              jsx('td', { children: a.exam_id }),
              jsx('td', { children: a.mode }),
              jsx('td', { children: a.status }),
              jsx('td', { children: a.score == null ? '—' : String(a.score) }),
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

function CbtExam({ attemptId, onResult, onHome }) {
  const q = useQuery({ queryKey: ['cbt', 'attempt', attemptId], queryFn: () => rest(`/attempts/${attemptId}`), refetchInterval: 30000 })
  const qc = useQueryClient()
  const [curSec, setCurSec] = useState(null)
  const [curQid, setCurQid] = useState(null)
  const [palCollapsed, setPalCollapsed] = useState(false)
  const [showPaper, setShowPaper] = useState(false)
  const [sel, setSel] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [subDone, setSubDone] = useState(false)
  const [base, setBase] = useState({ t: Date.now(), left: null })
  const [, setTick] = useState(0)
  const serverLeft = q.data?.remaining_seconds ?? 0
  const status = q.data?.attempt?.status
  const shown = status === 'in_progress' && q.data && base.left != null
    ? Math.max(0, base.left - (Date.now() - base.t) / 1000)
    : 0
  const adopt = resp => {
    qc.setQueryData(['cbt', 'attempt', attemptId], resp)
  }
  const doSubmit = async () => {
    if (submitting || subDone) return
    setSubmitting(true)
    try {
      const resp = await rest(`/attempts/${attemptId}/submit`, { method: 'POST' })
      adopt(resp)
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
      setSubDone(true)
      await setActiveAttempt(null)
      onResult(attemptId)
    } catch (e) {
      host.notifyError?.(`Submit failed: ${e?.message || e}`)
      setSubmitting(false)
    }
  }
  useEffect(() => { setBase({ t: Date.now(), left: serverLeft }) }, [serverLeft])
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => {
    const d = q.data
    if (!d || d.attempt?.status !== 'in_progress') return
    const qid = curQid && d.pack.questions.some(x => x.id === curQid)
      ? curQid
      : (d.pack.questions.find(x => x.section === (curSec || d.pack.pattern.sections[0].id)) || d.pack.questions[0]).id
    const saved = d.attempt.answers[qid]
    setSel(saved === undefined ? null : saved)
  }, [curQid, curSec, q.data?.attempt?.answers?.[curQid]])
  useEffect(() => {
    if (status === 'in_progress' && q.data && base.left != null && base.left > 0 && shown <= 0 && !submitting && !subDone) {
      setSel(null)
      void doSubmit()
    }
  }, [shown <= 0, status, subDone, submitting])
  if (q.isLoading) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'loading…' }) })
  if (q.isError) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'could not load attempt' }) })
  const { attempt, pack } = q.data
  const qmap = Object.fromEntries(pack.questions.map(x => [x.id, x]))
  const sections = pack.pattern.sections
  const activeSecId = curSec || sections[0].id
  const curIdResolved = qmap[curQid] ? curQid : (pack.questions.find(x => x.section === activeSecId) || pack.questions[0]).id
  const cur = qmap[curIdResolved]
  const answered = attempt.answers || {}
  const marked = attempt.marked || []
  const visited = attempt.visited || []
  const secQs = sid => pack.questions.filter(x => x.section === sid)
  const goTo = async qid => {
    if (!qid || qid === curIdResolved) {
      if (qid) { setCurQid(qid); setCurSec(qmap[qid].section) }
      return
    }
    setCurQid(qid); setCurSec(qmap[qid].section)
    try { adopt(await rest(`/attempts/${attemptId}`, { method: 'PATCH', body: { visited: [qid] } })) } catch {}
  }
  const neighbors = () => {
    const all = pack.questions.map(x => x.id)
    const i = all.indexOf(curIdResolved)
    return { prev: all[i - 1], next: all[i + 1] }
  }
  const act = async kind => {
    if (submitting) return
    try {
      if (kind === 'clear') {
        adopt(await rest(`/attempts/${attemptId}`, { method: 'PATCH', body: { answers: { [curIdResolved]: null } } }))
        setSel(null)
        return
      }
      if (kind === 'back' || kind === 'next') {
        adopt(await rest(`/attempts/${attemptId}`, { method: 'PATCH', body: { visited: [curIdResolved] } }))
        const t = neighbors()[kind]
        if (t) { setCurQid(t); setCurSec(qmap[t].section) }
        return
      }
      const payload = { answers: { [curIdResolved]: sel } }
      if (kind === 'saveMark' || kind === 'markNext') {
        payload.marked = marked.includes(curIdResolved) ? marked : [...marked, curIdResolved]
      }
      adopt(await rest(`/attempts/${attemptId}`, { method: 'PATCH', body: payload }))
      const t = neighbors().next
      if (t) { setCurQid(t); setCurSec(qmap[t].section) }
    } catch (e) { host.notifyError?.(`${kind} failed: ${e?.message || e}`) }
  }
  if (attempt.status !== 'in_progress') {
    return jsxs('div', { className: 'cbt pad', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('p', { className: 'muted', children: 'This attempt is submitted.' }),
      jsxs('div', { className: 'row', children: [
        jsx('button', { type: 'button', className: 'primary', onClick: () => onResult(attemptId), children: 'Open result' }),
        onHome ? jsx('button', { type: 'button', onClick: () => onHome(), children: 'Home' }) : null,
      ] }),
    ] })
  }
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
  const jumpSection = sid => {
    setCurSec(sid)
    const first = secQs(sid)[0]
    goTo(first && first.id)
  }
  const optRow = (i, text, kind) => {
    if (kind === 'mcq') {
      const on = sel === i
      return jsxs('label', { key: i, className: `opt${on ? ' sel' : ''}`, children: [
        jsx('input', { type: 'radio', name: curIdResolved, checked: on, onChange: () => setSel(i) }),
        jsx('span', { children: `${String.fromCharCode(65 + i)}) ${text}` }),
      ] })
    }
    const on = Array.isArray(sel) && sel.includes(i)
    return jsxs('label', { key: i, className: `opt${on ? ' sel' : ''}`, children: [
      jsx('input', { type: 'checkbox', checked: on, onChange: () => setSel(on ? sel.filter(x => x !== i) : [...(sel || []), i]) }),
      jsx('span', { children: `${String.fromCharCode(65 + i)}) ${text}` }),
    ] })
  }
  const confirmLines = sections.map(s => {
    const qs = secQs(s.id)
    const a = qs.filter(x => answered[x.id] !== undefined && answered[x.id] !== null && answered[x.id] !== '' && !(Array.isArray(answered[x.id]) && answered[x.id].length === 0)).length
    return `${s.title}: ${a} answered, ${qs.length - a} not answered`
  }).join(' · ')
  return jsxs('div', { className: `cbt cbt-shell${palCollapsed ? ' pal-collapsed' : ''}` }, [
    jsx('div', { className: 'cbt-head', style: { gridArea: 'head' }, children: [
      jsx('strong', { children: pack.title || pack.exam_id }),
      jsx('span', { className: `badge ${attempt.mode === 'assisted' ? 'assisted' : ''}`, children: attempt.mode === 'assisted' ? 'Assisted' : 'Exam' }),
      jsx('span', { style: { flex: 1 } }),
      jsx('button', { type: 'button', onClick: () => setShowPaper(v => !v), children: 'Question Paper' }),
      jsx('strong', { style: { fontVariantNumeric: 'tabular-nums' }, children: `Remaining Time: ${fmtHMS(shown)}` }),
    ] }),
    jsx('div', { className: 'cbt-tabs', style: { gridArea: 'tabs' }, children: sections.map(s =>
      jsx('button', { key: s.id, type: 'button', className: s.id === activeSecId ? 'on' : '', onClick: () => jumpSection(s.id), children: s.title })) }),
    jsx('div', { className: 'cbt-qbody', style: { gridArea: 'body' }, children: [
      jsxs('div', { className: 'muted', children: [
        `Question ${cur.id} · ${QTYPE_LABEL[cur.type] || cur.type}`,
        cur.type !== 'nat' ? ` · +${cur.marks_correct ?? secMeta.marks_correct} / ${cur.marks_wrong ?? secMeta.marks_wrong}` : '',
      ] }),
      jsx('p', { style: { fontSize: 16, marginTop: 8 }, children: cur.text }),
      cur.type === 'nat'
        ? jsx('input', {
            type: 'text', inputMode: 'decimal', placeholder: 'Your answer',
            value: sel == null ? '' : String(sel),
            onChange: e => setSel(e.target.value),
          })
        : cur.options.map((o, i) => optRow(i, o, cur.type)),
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
                  className: `cbt-chip ${st}`,
                  style: x.id === curIdResolved ? { outline: '2px solid var(--ui-accent)', outlineOffset: '1px' } : undefined,
                  onClick: () => goTo(x.id),
                  children: st === 's-answered-marked' ? `${i + 1}✓` : String(i + 1),
                })
              }) }),
            ] })) }),
          jsx('div', { className: 'cbt-pal-submit', children: jsx('button', { type: 'button', style: { width: '100%' }, onClick: () => setConfirming(true), children: 'Submit' }) }),
        ] }),
        jsx('button', {
          type: 'button', className: 'cbt-pal-toggle',
          onClick: () => setPalCollapsed(v => !v),
          children: palCollapsed ? '<' : '>',
        }),
      ] }),
    ] }),
    jsx('div', { className: 'cbt-actions', style: { gridArea: 'act' }, children: confirming ? [
      jsx('strong', { key: 'q', children: 'Submit?' }), jsx('span', { key: 's', className: 'muted', children: confirmLines }),
      jsx('button', { key: 'y', type: 'button', className: 'primary', disabled: submitting, onClick: () => void doSubmit(), children: submitting ? 'Submitting…' : 'Confirm submit' }),
      jsx('button', { key: 'n', type: 'button', disabled: submitting, onClick: () => setConfirming(false), children: 'Keep answering' }),
    ] : [
      jsx('button', { key: 'sn', type: 'button', onClick: () => void act('saveNext'), children: 'Save & Next' }),
      jsx('button', { key: 'sm', type: 'button', onClick: () => void act('saveMark'), children: 'Save & Mark for Review' }),
      jsx('button', { key: 'cr', type: 'button', onClick: () => void act('clear'), children: 'Clear Response' }),
      jsx('button', { key: 'mn', type: 'button', onClick: () => void act('markNext'), children: 'Mark for Review & Next' }),
      jsx('span', { key: 'sp', style: { flex: 1 } }),
      jsx('button', { key: 'bk', type: 'button', onClick: () => void act('back'), children: '<< Back' }),
      jsx('button', { key: 'nx', type: 'button', onClick: () => void act('next'), children: 'Next >>' }),
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

function fmtAns(q, v) {
  if (v === undefined || v === null || v === '') return '—'
  if (q.type === 'nat') return String(v)
  const L = x => String.fromCharCode(65 + x)
  return Array.isArray(v) ? v.map(L).join(', ') : L(v)
}

const VERDICT_CLS = { correct: 'ok', wrong: 'err', skipped: '', not_counted: 'acc' }
const VERDICT_LABEL = { correct: 'Correct', wrong: 'Wrong', skipped: 'Skipped', not_counted: 'Not counted' }

function evaluationCard(d) {
  if (!d) return null
  return jsxs('div', { style: { marginTop: 8 }, children: [
    jsx('p', { style: { margin: '4px 0 8px' }, children: d.overall_comment }),
    (d.sections || []).map((s, i) => jsx('p', { key: i, className: 'muted', children: `${s.section_id}: ${s.comment}` })),
    (d.weak_topics || []).length
      ? jsxs('div', { children: [
          jsx('h4', { style: { margin: '10px 0 4px' }, children: 'Weak topics' }),
          jsx('div', { className: 'row', children: d.weak_topics.map((w, i) =>
            jsxs('span', { key: i, className: `badge ${w.priority === 'high' ? 'err' : w.priority === 'medium' ? 'acc' : ''}`, children: [`${w.topic} `, jsx('span', { className: 'muted', children: `(${w.priority})` })] })) }),
        ] })
      : null,
    (d.wrong_answer_notes || []).length
      ? jsxs('div', { children: [
          jsx('h4', { style: { margin: '10px 0 4px' }, children: 'Where it slipped' }),
          ...d.wrong_answer_notes.map((n, i) => jsx('p', { key: i, style: { margin: '2px 0' }, children: [jsx('strong', { children: `${n.question_id}: ` }), n.note] })),
        ] })
      : null,
    (d.study_plan || []).length
      ? jsxs('div', { children: [
          jsx('h4', { style: { margin: '10px 0 4px' }, children: 'Study plan' }),
          jsx('ol', { style: { margin: '4px 0', paddingLeft: 20 }, children: d.study_plan.map((s, i) => jsx('li', { key: i, children: s })) }),
        ] })
      : null,
  ] })
}

function CbtResult({ attemptId, onHome }) {
  const q = useQuery({ queryKey: ['cbt', 'attempt', attemptId], queryFn: () => rest(`/attempts/${attemptId}`) })
  const qc = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [evalBusy, setEvalBusy] = useState(false)
  const [evalError, setEvalError] = useState(null)
  const [evalTried, setEvalTried] = useState(false)
  const [armingRe, setArmingRe] = useState(false)
  const runEval = async () => {
    if (evalBusy) return
    setEvalBusy(true); setEvalError(null)
    try {
      const ev = await rest(`/attempts/${attemptId}/evaluate`, { method: 'POST' })
      const d = q.data
      qc.setQueryData(['cbt', 'attempt', attemptId], { ...d, attempt: { ...d.attempt, evaluation: ev } })
      setEvalTried(true)
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
    } catch (e) { setEvalError(e?.message || String(e)) }
    setEvalBusy(false)
  }
  useEffect(() => {
    const a = q.data?.attempt
    if (a?.status === 'submitted' && a.result && !a.evaluation && !evalTried && !evalBusy) {
      setEvalTried(true)
      void runEval()
    }
  }, [q.data?.attempt?.evaluation, q.data?.attempt?.status, evalTried, evalBusy])
  const discuss = () => {
    const a = q.data?.attempt
    host.composer.submit(host.state.activeSessionId.get() ?? null,
      `Discuss my CBT attempt: ${q.data.pack.title || q.data.pack.exam_id} — score ${a.result.score} (correct ${a.result.totals.correct}, wrong ${a.result.totals.wrong}, skipped ${a.result.totals.skipped}). The full review and AI evaluation are in the cbt-exam plugin result page.`)
    host.composer.focus(null)
  }
  if (q.isLoading) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'loading…' }) })
  if (q.isError || !q.data) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'could not load result' }) })
  const { attempt, pack } = q.data
  if (attempt.status !== 'submitted' || !attempt.result) {
    return jsxs('div', { className: 'cbt pad', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('p', { className: 'muted', children: 'This attempt is still in progress — resume it to finish.' }),
      jsx('button', { type: 'button', onClick: () => onHome(), children: 'Back to home' }),
    ] })
  }
  const r = attempt.result
  const qmap = Object.fromEntries(pack.questions.map(x => [x.id, x]))
  const rows = r.questions.filter(row => filter === 'all' || row.verdict === filter)
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('div', { className: 'row', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('span', { className: `badge ${attempt.mode === 'assisted' ? 'assisted' : ''}`, children: attempt.mode === 'assisted' ? 'Assisted' : 'Exam' }),
      jsx('span', { className: 'muted', children: `submitted ${fmtWhen(attempt.submitted_at)}` }),
      jsx('span', { style: { flex: 1 } }),
      jsx('button', { type: 'button', onClick: () => onHome(), children: 'New attempt' }),
    ] }),
    jsx('div', { style: { fontSize: 34, fontWeight: 700, marginTop: 8 }, children: String(r.score) }),
    jsx('div', { className: 'row', children: ['correct', 'wrong', 'skipped', 'not_counted'].map(k =>
      jsxs('span', { key: k, className: 'badge', children: [`${VERDICT_LABEL[k]} `, jsx('strong', { children: String(r.totals[k]) })] })) }),
    jsx('h3', { children: 'Sections' }),
    jsxs('table', { children: [
      jsx('thead', { children: jsx('tr', { children: ['Section', 'Score', 'Correct', 'Wrong', 'Skipped', 'Not counted'].map(h => jsx('th', { key: h, children: h })) }) }),
      jsx('tbody', { children: pack.pattern.sections.map(s => {
        const st = r.sections[s.id] || {}
        return jsxs('tr', { key: s.id, children: [
          jsx('td', { children: s.title }),
          jsx('td', { children: String(st.score ?? '—') }),
          jsx('td', { children: String(st.correct ?? 0) }),
          jsx('td', { children: String(st.wrong ?? 0) }),
          jsx('td', { children: String(st.skipped ?? 0) }),
          jsx('td', { children: String(st.not_counted ?? 0) }),
        ] })
      }) }) ] }),
    jsx('h3', { children: 'Review' }),
    jsx('div', { className: 'row', children: ['all', 'wrong', 'skipped', 'not_counted'].map(f =>
      jsx('button', { key: f, type: 'button', className: filter === f ? 'primary' : '', onClick: () => setFilter(f), children: f })) }),
    jsx('div', { style: { marginTop: 8 }, children: rows.map(row => {
      const qq = qmap[row.id]
      const expanded = open === row.id
      return jsxs('div', { key: row.id, style: { borderTop: '1px solid var(--ui-stroke-secondary)', padding: '6px 0' }, children: [
        jsx('div', { className: 'row', onClick: () => setOpen(expanded ? null : row.id), style: { cursor: 'pointer' }, children: [
          jsx('strong', { children: row.id }),
          jsx('span', { className: `badge ${VERDICT_CLS[row.verdict]}`, children: `${VERDICT_LABEL[row.verdict]}${row.awarded ? ` (${row.awarded})` : ''}` }),
          jsx('span', { className: 'muted', children: `${row.type.toUpperCase()} · ${row.topic || ''}` }),
          jsx('span', { style: { flex: 1 } }),
          jsx('span', { className: 'muted', children: expanded ? '▾' : '▸' }),
        ] }),
        expanded && jsxs('div', { style: { marginTop: 8, maxWidth: 860 }, children: [
          jsx('p', { children: qq.text }),
          (qq.options || []).map((o, i) => jsx('div', { key: i, className: 'muted', children: `${String.fromCharCode(65 + i)}) ${o}` })),
          jsx('p', { children: [jsx('strong', { children: 'Your answer: ' }), fmtAns(qq, attempt.answers[row.id])] }),
          jsx('p', { children: [jsx('strong', { children: 'Correct answer: ' }), fmtAns(qq, qq.answer)] }),
          qq.explanation ? jsx('p', { className: 'muted', children: qq.explanation }) : null,
        ] }),
      ] })
    }) }),
  ] })
}

function CbtPage() {
  const [view, setView] = useState({ name: 'home' })
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const id = await readActiveAttempt()
      if (!id || cancelled) return
      // Resume ONLY an attempt that is still running. A stored id from a finished
      // attempt used to hijack the page into that attempt's old screen (a
      // "submitted" stub or its result) instead of the start screen.
      let live = null
      try { live = await rest(`/attempts/${id}`) } catch { live = null }
      if (cancelled) return
      if (live?.attempt?.status === 'in_progress') {
        // never override a view the user already reached while this was in flight
        setView(v => (v.name === 'home' ? { name: 'exam', attemptId: id } : v))
      } else {
        void setActiveAttempt(null)
      }
    })()
    return () => { cancelled = true }
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
    view.name === 'exam' && jsx(CbtExam, { key: view.attemptId, attemptId: view.attemptId, onResult: id => setView({ name: 'result', attemptId: id }), onHome: () => setView({ name: 'home' }) }),
    view.name === 'result' && jsx(CbtResult, { key: view.attemptId, attemptId: view.attemptId, onHome: () => setView({ name: 'home' }) }),
  ] })
}

function TimerChip() {
  const q = useQuery({
    queryKey: ['cbt', 'attempt', activeAttemptId || 'none'],
    queryFn: () => rest(`/attempts/${activeAttemptId}`),
    enabled: !!activeAttemptId,
    refetchInterval: 30000,
  })
  const a = q.data?.attempt
  if (!activeAttemptId || !a || a.status !== 'in_progress') return null
  return jsx('button', {
    type: 'button',
    onClick: () => host.navigate('/cbt'),
    children: `⏱ ${fmtHMS(q.data.remaining_seconds)}`,
  })
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
      { id: 'timer', area: STATUSBAR_AREAS.right, render: () => jsx(TimerChip, {}) },
    ])
  },
}
