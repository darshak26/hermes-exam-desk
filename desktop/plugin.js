// cbt-exam — exam-agnostic CBT practice panel (route /cbt)
import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, useQuery } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const CSS = `
.cbt{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--ui-text-primary,#222);font:13px/1.5 var(--font-sans,system-ui)}
.cbt *{box-sizing:border-box}
.cbt .muted{color:var(--ui-text-secondary,#666)}
.cbt .pad{padding:20px 24px;overflow:auto}
.cbt table{border-collapse:collapse;width:100%}
.cbt th,.cbt td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--ui-stroke-secondary,#ccc);font-size:12.5px}
.cbt th{color:var(--ui-text-secondary,#666);font-weight:600}
`

async function rest(path, opts) {
  const r = await ctxRest(path, opts)
  return r
}
let ctxRest = () => { throw new Error('register not called') }

function CbtHome() {
  const q = useQuery({ queryKey: ['cbt', 'packs'], queryFn: () => rest('/packs') })
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('style', { children: CSS }),
    jsx('h2', { children: 'CBT Exams' }),
    q.isLoading
      ? jsx('div', { className: 'muted', children: 'loading packs…' })
      : q.isError
        ? jsx('div', { className: 'muted', children: 'Backend unreachable — is cbt-exam in plugins.enabled and the gateway restarted?' })
        : jsxs('table', { children: [
            jsx('thead', { children: jsx('tr', { children: ['Exam', 'Year', 'Questions', 'Duration', 'Provenance', ''].map(h => jsx('th', { key: h, children: h })) }) }),
            jsx('tbody', { children: (q.data?.packs || []).map(p => jsxs('tr', { key: p.exam_id, children: [
              jsx('td', { children: p.title || p.exam_id }),
              jsx('td', { children: String(p.year || '—') }),
              jsx('td', { children: String(p.question_count ?? 'invalid') }),
              jsx('td', { children: `${p.duration_minutes ?? '?'} min` }),
              jsx('td', { className: 'muted', children: p.provenance || p.invalid || '' }),
            ] })) }) ] })
  ] })
}

export default {
  id: 'cbt-exam',
  name: 'CBT Exams',
  defaultEnabled: false,
  register(ctx) {
    ctxRest = (p, o) => ctx.rest(p, o)
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/cbt' }, render: () => jsx(CbtHome, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: '/cbt', label: 'CBT Exams', codicon: 'checklist' } },
      { id: 'open', area: PALETTE_AREA, data: { id: 'cbt.open', label: 'Open CBT Exams', keywords: ['cbt', 'exam', 'mock'], run: () => host.navigate('/cbt') } },
    ])
  },
}
