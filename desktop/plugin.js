// cbt-exam — exam-agnostic CBT practice panel (route /cbt)
import {
  host, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, STATUSBAR_AREAS, useQuery, useQueryClient,
  Badge, Button, Codicon, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Kbd, SegmentedControl, Separator, Tip, icons,
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'

const CSS = `
/* Tokens only. Chrome (buttons, badges, dialogs, tips, kbd, segmented controls)
   comes from the app's primitives; this sheet owns layout and this plugin's own
   surfaces, and never re-specifies a primitive's padding, radius or colour. */
.cbt{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--ui-text-primary);font:13px/1.5 var(--font-sans,system-ui)}
.cbt *{box-sizing:border-box}
.cbt .muted,.cbt .cbt-sub{color:var(--ui-text-secondary)}
.cbt .cbt-sub{font-size:12px}
.cbt .cbt-inline{display:inline}
.cbt .cbt-clickable{cursor:pointer}
.cbt .cbt-label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ui-text-secondary);margin-top:8px}
.cbt .cbt-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.cbt .cbt-gap-sm{gap:6px}
.cbt h2{font-size:17px;line-height:1.35;font-weight:600;margin:0 0 12px}
.cbt h3{font-size:13px;font-weight:600;margin:24px 0 8px}
.cbt h4{font-size:12px;font-weight:600;margin:16px 0 6px;color:var(--ui-text-secondary)}
.cbt p{margin:0 0 12px}
.cbt .cbt-list,.cbt ul.list{margin:0 0 12px;padding-left:20px;color:var(--ui-text-primary)}
.cbt .cbt-list li,.cbt ul.list li{margin:0 0 6px}
/* the page root is both .cbt and .cbt-page, so it cannot be a descendant selector */
.cbt.cbt-page{display:block;padding:20px clamp(20px,4vw,56px);overflow:auto}
.cbt.cbt-page > *{max-width:1040px}
.cbt .cbt-head-row{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.cbt .cbt-head-row h2{margin:0}
.cbt .cbt-keys{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--ui-text-secondary)}
.cbt .cbt-loading{display:flex;align-items:center;gap:6px;color:var(--ui-text-secondary)}
.cbt .cbt-error{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:8px 0}
/* instructions page: meta chips, section labels, hairline-divided guidance rows */
.cbt .cbt-sep{margin:16px 0}
.cbt .cbt-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.cbt .cbt-section{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ui-text-secondary);margin:24px 0 8px}
.cbt .cbt-how{border:1px solid var(--ui-stroke-secondary);border-radius:8px;overflow:hidden}
.cbt .cbt-how-row{padding:9px 12px;font-size:12.5px;line-height:1.55;color:var(--ui-text-primary)}
.cbt .cbt-how-row+.cbt-how-row{border-top:1px solid var(--ui-stroke-secondary)}
.cbt .cbt-keys{margin-top:16px}

/* Dialogs are portalled to the document body, so they are NOT inside .cbt and every
   .cbt-scoped rule above stops at the dialog edge. These rules hang off .cbt-dlg
   itself, or the content would inherit the browser's centred table defaults. */
.cbt-dlg .cbt-desc{margin:0 0 14px}
.cbt-dlg .cbt-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0}
.cbt-dlg .cbt-sub{color:var(--ui-text-secondary);font-size:12px}
.cbt-dlg p{margin:0}
.cbt-dlg p + p{margin-top:8px}
.cbt-dlg table{width:100%;border-collapse:collapse;table-layout:fixed;margin:16px 0 14px}
.cbt-dlg th,.cbt-dlg td{text-align:left;padding:9px 12px 9px 0;border-bottom:1px solid var(--ui-stroke-secondary);font-size:12.5px}
.cbt-dlg th{font-size:11.5px;font-weight:600;color:var(--ui-text-secondary);padding-bottom:8px}
.cbt-dlg th:last-child,.cbt-dlg td:last-child{padding-right:0}
.cbt-dlg .num{text-align:right;font-variant-numeric:tabular-nums;width:86px}
.cbt-dlg .cbt-paper-q{margin:8px 0}
.cbt-dlg .cbt-paper-q p{font-size:13px;margin:0}

/* tables: one left edge, right gutter only, tabular figures for counts */
.cbt table{width:100%;border-collapse:collapse}
.cbt th,.cbt td{text-align:left;padding:8px 16px 8px 0;border-bottom:1px solid var(--ui-stroke-secondary);font-size:12.5px;vertical-align:middle}
.cbt th{font-weight:600;color:var(--ui-text-secondary);padding-top:0}
.cbt th:last-child,.cbt td:last-child{padding-right:0}
.cbt .num{text-align:right;font-variant-numeric:tabular-nums}
.cbt .right{text-align:right}
.cbt .right .cbt-row{justify-content:flex-end;flex-wrap:nowrap;gap:6px}
.cbt .cbt-caption{caption-side:bottom;text-align:left;padding-top:8px}

/* home: a paper and its history */
.cbt .cbt-card{border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:16px;margin-bottom:16px}
.cbt .cbt-card-head{display:flex;align-items:flex-start;gap:16px;justify-content:space-between}
.cbt .cbt-card-title{min-width:0;display:flex;flex-direction:column;gap:4px}
.cbt .cbt-card-title h3{margin:0;font-size:14px}
.cbt .cbt-card-actions{flex:0 0 auto}
.cbt .cbt-card-body{margin-top:12px}
.cbt .cbt-stat-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--ui-text-secondary);margin-top:4px}
.cbt .cbt-warn-count{display:inline-flex;align-items:center;gap:4px;color:var(--ui-text-warn,var(--ui-text-secondary))}

/* score */
.cbt .cbt-score{font-size:34px;line-height:1.1;font-weight:600;font-variant-numeric:tabular-nums}
.cbt .cbt-score.pos{color:var(--ui-success)}
.cbt .cbt-score.neg{color:var(--ui-red)}

/* the paper */
.cbt .cbt-qtext{font-size:16px;margin:0 0 16px}
.cbt .opt{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--ui-stroke-secondary);border-radius:6px;margin-bottom:8px;cursor:pointer}
.cbt .opt:hover{background:var(--chrome-action-hover)}
.cbt .opt.sel{border-color:var(--ui-accent)}
.cbt .opt-body{display:flex;flex-direction:column;gap:8px;min-width:0}
.cbt .cbt-review-head{justify-content:flex-start;padding:8px 0;border-bottom:1px solid var(--ui-stroke-secondary);flex-wrap:nowrap}
.cbt .cbt-review-body{padding:8px 0 12px 20px;max-width:820px}
.cbt .cbt-ans{display:flex;gap:8px;font-size:13px;margin-top:4px}
.cbt .cbt-ans-k{color:var(--ui-text-secondary);min-width:110px}
.cbt .hit{color:var(--ui-success)}
.cbt .miss{color:var(--ui-red)}
.cbt .cbt-pre{white-space:pre-wrap;word-break:break-word;font-size:11.5px;color:var(--ui-text-secondary);margin:6px 0 0}
.cbt .cbt-paper-q{margin:8px 0}
.cbt .cbt-paper-q p{font-size:13px;margin:0}

/* shell */
.cbt-shell{display:grid;height:100%;min-height:0;
  --cols:minmax(0,1fr) 358px;
  --rows:minmax(44px,auto) minmax(40px,auto) minmax(0,1fr) minmax(48px,auto);
  --areas:"head head" "tabs pal" "body pal" "act pal";
  grid-template-columns:var(--cols);grid-template-rows:var(--rows);grid-template-areas:var(--areas);}
.cbt-shell.single-sec{--rows:minmax(44px,auto) minmax(0,1fr) minmax(48px,auto);
  --areas:"head head" "body pal" "act pal";}
.cbt-shell.pal-collapsed{--cols:minmax(0,1fr);--areas:"head" "tabs" "body" "act"}
.cbt-shell.pal-collapsed.single-sec{--rows:minmax(44px,auto) minmax(0,1fr) minmax(48px,auto);--areas:"head" "body" "act"}
.cbt-head{display:flex;align-items:center;gap:8px;padding:0 20px;min-height:44px;border-bottom:1px solid var(--ui-stroke-secondary)}
.cbt .cbt-head-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.cbt .timer{font-variant-numeric:tabular-nums;font-size:13px;font-weight:600}
.cbt .timer.low{color:var(--ui-text-warn,var(--ui-accent))}
.cbt .timer.crit{color:var(--ui-red)}
.cbt .cbt-tabs{padding:0 20px;border-bottom:1px solid var(--ui-stroke-secondary);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;display:flex;align-items:center}
.cbt-qbody{max-width:820px;margin:0;padding:20px 20px 40px;font-size:15px;line-height:1.6;overflow:auto}
.cbt .cbt-qbody p{max-width:none}

/* palette */
.cbt-pal-wrap{position:relative;display:flex;flex-direction:column;min-height:0;height:100%;border-left:1px solid var(--ui-stroke-secondary)}
.cbt .cbt-pal-head{padding:12px}
.cbt .pal-title{display:flex;align-items:center;gap:8px}
.cbt .pal-title strong{font-size:13px}
.cbt .cbt-pal-scroll{overflow:auto;min-height:0;flex:1;padding:0 12px 12px}
.cbt .cbt-pal-grid{display:grid;grid-template-columns:repeat(10,28px);gap:6px;justify-content:center;padding:8px 0}
.cbt .pal-sec-head{display:flex;align-items:baseline;justify-content:space-between;margin:8px 0 4px;font-size:12px;color:var(--ui-text-secondary)}
.cbt .cbt-chip{height:26px;min-width:28px;padding:0 4px;display:inline-flex;align-items:center;justify-content:center;gap:1px;font:inherit;font-size:11.5px;font-variant-numeric:tabular-nums;border-radius:4px;border:1px solid var(--ui-stroke-secondary);background:transparent;color:var(--ui-text-secondary);cursor:pointer}
.cbt .cbt-chip:hover{background:var(--chrome-action-hover);color:var(--ui-text-primary)}
.cbt .cbt-chip.s-not-answered{border-color:var(--ui-red);background:color-mix(in srgb,var(--ui-red) 16%,transparent)}
.cbt .cbt-chip.s-answered{border-color:var(--ui-success);background:color-mix(in srgb,var(--ui-success) 16%,transparent);color:var(--ui-text-primary)}
.cbt .cbt-chip.s-marked{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 20%,transparent);color:var(--ui-text-primary)}
.cbt .cbt-chip.s-answered-marked{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 22%,transparent);color:var(--ui-text-primary)}
.cbt .cbt-chip .tick{color:var(--ui-success);font-weight:700;font-size:9px}
.cbt{--cbt-mark:color-mix(in srgb,#8b5cf6 82%,var(--ui-text-primary))}
.cbt .legend{display:flex;flex-direction:column;gap:4px;margin:8px 0 0;font-size:11.5px;color:var(--ui-text-secondary)}
.cbt .legend .item{display:flex;align-items:center;gap:6px}
.cbt .legend .sw{width:11px;height:11px;border-radius:3px;border:1px solid var(--ui-stroke-secondary);flex:0 0 auto;position:relative}
.cbt .legend .sw.err{border-color:var(--ui-red);background:color-mix(in srgb,var(--ui-red) 16%,transparent)}
.cbt .legend .sw.ok{border-color:var(--ui-success);background:color-mix(in srgb,var(--ui-success) 16%,transparent)}
.cbt .legend .sw.acc{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 20%,transparent)}
.cbt .legend .sw.acc2{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 22%,transparent)}
.cbt .legend .sw.acc2::after{content:'✓';position:absolute;inset:0;font-size:8px;line-height:11px;text-align:center;color:var(--ui-success)}
.cbt .legend .sw.current{box-shadow:0 0 0 2px var(--ui-accent)}
.cbt .legend .n{margin-left:auto;font-variant-numeric:tabular-nums}

/* action bar: one row when the bar is wide enough, a filled grid when it is not */
.cbt-actions{padding:10px 20px;border-top:1px solid var(--ui-stroke-secondary);container-type:inline-size}
.act-bar{display:flex;gap:12px;row-gap:10px;align-items:center;flex-wrap:wrap}
.act-group{display:flex;gap:8px;align-items:center;min-width:0}
.act-group.nav{margin-left:auto}
.cbt .save-slot{min-width:52px;display:inline-flex;align-items:center;font-size:12px}
.cbt .save-state{color:var(--ui-text-secondary)}
.cbt .save-state.ok{color:var(--ui-success)}
.cbt .save-state.err{color:var(--ui-red)}
@container (max-width: 690px) {
  .act-bar{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
  .act-bar .act-group{display:contents}
  .act-bar .act-group.nav{margin-left:0}
  .act-bar button{width:100%;min-width:0!important;justify-content:center}
  .act-bar button[data-span="2"]{grid-column:span 2}
  .act-bar button[data-span="3"]{grid-column:span 3}
  .cbt-actions{position:relative}
  .act-bar .save-slot{position:absolute;left:20px;bottom:calc(100% + 4px);margin:0;padding:2px 8px;border:1px solid var(--ui-stroke-secondary);border-radius:999px;background:var(--ui-surface-background);box-shadow:var(--shadow-nous,none);z-index:2}
}

/* figures, tables and notes inside a question */
.cbt .media-fig{margin:0 0 16px}
.cbt .media-fig img{display:block;max-width:100%;max-height:min(60vh,520px);height:auto;border:1px solid var(--ui-stroke-secondary);border-radius:6px;cursor:zoom-in}
.cbt .media-fig figcaption{font-size:12px;color:var(--ui-text-secondary);margin-top:6px}
.cbt .media-missing{display:flex;align-items:center;gap:6px;padding:8px 12px;border:1px dashed var(--ui-stroke-secondary);border-radius:6px;font-size:12px;color:var(--ui-text-secondary)}
.cbt .media-wrap{max-width:100%;overflow-x:auto}
.cbt .media-table{border-collapse:collapse;margin:0 0 16px;font-size:12.5px}
.cbt .media-table th,.cbt .media-table td{border:1px solid var(--ui-stroke-secondary);padding:6px 12px;white-space:nowrap;font-variant-numeric:tabular-nums}
.cbt .media-table caption{caption-side:bottom;text-align:left;font-size:12px;color:var(--ui-text-secondary);padding-top:6px}
.cbt .media-note{font-size:12px;color:var(--ui-text-secondary);border-left:2px solid var(--ui-stroke-secondary);padding-left:12px;margin:0 0 16px}
.cbt .zoom{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--ui-scrim,rgba(0,0,0,.8));cursor:zoom-out}
.cbt .zoom img{max-width:100%;max-height:calc(100% - 56px);object-fit:contain;border-radius:6px}
.cbt .zoom .zoom-close{position:absolute;top:14px;right:14px}
.cbt .zoom-hint{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-size:12px;color:#fff;opacity:.85}

/* narrow: a pane, or a page dragged short */
.cbt-shell.narrow{position:relative;--cols:minmax(0,1fr);--areas:"head" "tabs" "body" "act";--rows:auto auto minmax(0,1fr) auto}
.cbt-shell.narrow.single-sec{--areas:"head" "body" "act";--rows:auto minmax(0,1fr) auto}
.cbt-shell.narrow .cbt-head{padding:0 12px}
.cbt-shell.narrow .cbt-qbody{padding:16px 16px 20px}
.cbt-shell.narrow .cbt-tabs{padding:0 12px}
.cbt-shell.narrow .cbt-pal.as-drawer{position:absolute;right:0;top:0;bottom:auto;width:min(340px,88%);max-height:min(560px,calc(100% - 150px));overflow:auto;z-index:30;background:var(--ui-surface-background);border-left:1px solid var(--ui-stroke-secondary);box-shadow:var(--shadow-nous,none)}
.cbt-shell.narrow .cbt-pal.as-drawer .cbt-pal-grid{grid-template-columns:repeat(8,28px)}

@media (prefers-reduced-motion: reduce){
  .cbt *{transition:none!important;animation:none!important}
}
`;

async function rest(path, opts) {
  const r = await ctxRest(path, opts)
  return r
}
let ctxRest = () => { throw new Error('register not called') }
let ctxStorage = null
let ctxRunAction = null
let activeAttemptId = null

// The status-bar timer lives outside the page and cannot read React state, so the
// active attempt needs a tiny subscription: without it the chip only appears when
// the host happens to re-render for an unrelated reason.
const attemptListeners = new Set()

function announceActiveAttempt() {
  for (const fn of attemptListeners) { try { fn() } catch { /* a dead listener must not block the rest */ } }
}

async function setActiveAttempt(id) {
  activeAttemptId = id || null
  try {
    if (id) await ctxStorage.set('activeAttempt', id)
    else await ctxStorage.remove('activeAttempt')
  } catch {}
  announceActiveAttempt()
}

function useActiveAttempt() {
  const [id, setId] = useState(activeAttemptId)
  useEffect(() => {
    const sync = () => setId(activeAttemptId)
    attemptListeners.add(sync)
    sync()
    return () => { attemptListeners.delete(sync) }
  }, [])
  return id
}

async function readActiveAttempt() {
  if (activeAttemptId) return activeAttemptId
  try {
    const v = await ctxStorage.get('activeAttempt')
    if (v) activeAttemptId = v
    return v || null
  } catch { return null }
}

// ── assisted mode is a SIDE PANE ────────────────────────────────────────────
// The whole point of an assisted sitting is asking the tutor a doubt mid-exam,
// so the chat must stay on screen. `host.openWorkspace` docks a plugin pane into
// the main zone and reveals it; docking to the RIGHT of `workspace` is what makes
// exam and chat sit side by side instead of sharing one tab strip.
const EXAM_PANE_ID = 'cbt-exam:exam'
let closeExamPane = null

function goToChat() {
  const sid = host.state?.activeSessionId?.get?.()
  host.navigate(sid ? `/${encodeURIComponent(sid)}` : '/')
}

// A pane can't show the result page, so finishing from the pane hands the page a
// pending view before navigating there (the page reads it once, at mount).
let pendingResult = null

function showResult(attemptId) {
  pendingResult = attemptId || null
  host.navigate('/cbt')
}

function openExamPane(attemptId, onFinished) {
  if (typeof host.openWorkspace !== 'function') return false   // older desktop
  const finish = () => {
    const dispose = closeExamPane
    closeExamPane = null
    try { dispose?.() } catch {}
    onFinished?.()
  }
  try { closeExamPane?.() } catch {}
  closeExamPane = host.openWorkspace(EXAM_PANE_ID, {
    dock: { pane: 'workspace', pos: 'right' },
    // No headerVeto: keep the pane's own tab so there is a visible ✕ to close it
    // (closing the pane does NOT end the attempt — the status-bar timer and the
    // Home table's Resume bring it back).
    minWidth: '26rem',
    title: 'CBT Exam',
    onClose: () => { closeExamPane = null },
    render: () => jsx(ExamPane, { attemptId, onFinished: finish }),
  })
  return true
}

// Measured, not guessed: a 26rem pane squeezed by the default 358px palette
// column would leave the question body ~120px wide, so below 780px the palette
// becomes an overlay drawer and the shell drops to one column.
function ExamPane({ attemptId, onFinished }) {
  const ref = useRef(null)
  const [narrow, setNarrow] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width ?? 0
      if (w > 0) setNarrow(w < 780)
    })
    ro.observe(el)
    // belt and braces: a window drag also emits resize, and a stale observer must
    // never leave the paper laid out for a width it no longer has
    const onResize = () => {
      const w = rootRef.current?.getBoundingClientRect().width ?? 0
      if (w > 0) setSelfNarrow(w < 780)
    }
    window.addEventListener('resize', onResize)
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize) }
  }, [])
  return jsxs('div', {
    ref,
    style: { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' },
    children: [
      jsx('style', { key: 'css', children: CSS }),
      jsx(CbtExam, {
        key: 'exam',
        attemptId,
        inPane: true,
        narrow,
        onResult: onFinished,
        onHome: onFinished,
      }),
    ],
  })
}

const QTYPE_LABEL = { mcq: 'MCQ', msq: 'MSQ', nat: 'Numerical' }

// the app ships the codicon set app-wide; icons here are for scanning, the label
// still carries the meaning
// The app's own icon set, addressed by the names this file already uses. Explicit
// rather than dynamic so a typo fails here instead of rendering nothing.
const ICON_FOR = {
  save: 'Save', bookmark: 'Bookmark', bookmarkOn: 'BookmarkFilled',
  'chevron-left': 'ChevronLeft', 'chevron-right': 'ChevronRight',
  clear: 'X', 'clear-all': 'X', check: 'Check', trash: 'Trash2', close: 'X', book: 'Book',
  alert: 'AlertTriangle', clock: 'Clock', refresh: 'RefreshCw',
}
function icon(name, className) {
  const C = icons[ICON_FOR[name] || 'Check']
  return jsx(C, { className, 'aria-hidden': 'true' })
}

// A figure's src is either an http(s) URL or a path inside the pack's asset dir.
// Relative ones come back through the plugin's own route, so the browser fetches
// them from the same origin — an <img> cannot read the gateway's filesystem.
function mediaSrc(examId, src) {
  const clean = String(src || '')
  if (/^https?:\/\//i.test(clean)) return clean
  const path = clean.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `/api/plugins/cbt-exam/packs/${encodeURIComponent(examId)}/assets/${path}`
}

// A figure that 404s (or is unreadable) otherwise collapses to a broken-image

// A figure that 404s (or is unreadable) otherwise collapses to a broken-image
// sliver; show a placeholder with the alt text so the question still makes sense.
function MediaFigure({ src, alt, caption }) {
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(false)
  // capture phase: while a figure is enlarged, Esc closes the figure and not the
  // paper dialog sitting behind it
  useEffect(() => {
    if (!zoom) return undefined
    const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); setZoom(false) } }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [zoom])
  return jsxs('figure', { className: 'media-fig', children: [
    failed
      ? jsxs('div', { className: 'media-missing', children: [
          jsx(Codicon, { name: 'file-media', size: 14 }),
          jsx('span', { children: alt ? `Figure unavailable — ${alt}` : 'Figure unavailable' }),
        ] })
      : jsx(Tip, { label: alt ? `${alt} — click to enlarge` : 'Click to enlarge', children:
          jsx('img', {
            src, alt: alt || '', loading: 'lazy',
            onError: () => setFailed(true),
            onClick: e => { e.preventDefault(); e.stopPropagation(); setZoom(true) },
          }) }),
    caption ? jsx('figcaption', { children: caption }) : null,
    zoom
      ? jsxs('div', {
          className: 'zoom', onClick: () => setZoom(false), role: 'dialog', 'aria-modal': 'true', 'aria-label': alt || 'Figure',
          children: [
            jsx('img', { src, alt: alt || '' }),
            jsx(Button, {
              type: 'button', variant: 'floating', size: 'icon-sm', className: 'zoom-close',
              'aria-label': 'Close figure', onClick: () => setZoom(false),
              children: jsx(Codicon, { name: 'close', size: 16 }),
            }),
            jsxs('div', { className: 'zoom-hint', children: ['Click anywhere or press ', jsx('span', { className: 'kbd', children: 'Esc' }), ' to close'] }),
          ],
        })
      : null,
  ] })
}

// A long question keeps its scroll position when the paper moves on, which lands
// you halfway down the next stem. Every question change starts at the top.
function ScrollToTop({ dep, targetRef }) {
  useEffect(() => {
    const el = targetRef.current
    if (el) el.scrollTop = 0
  }, [dep])
  return null
}

// Question bodies carry more than text: a diagram, a data table, or a note that
// only makes sense with the figure. Each block renders as its own element so a
// long paper reads like a paper.
function mediaNode(blocks, examId, keyPrefix = 'media') {
  if (!Array.isArray(blocks) || !blocks.length) return null
  return blocks.map((b, i) => {
    const key = `${keyPrefix}-${i}`
    if (b && b.type === 'table') {
      return jsx('div', { key, className: 'media-wrap', children: jsxs('table', { className: 'media-table', children: [
        b.caption ? jsx('caption', { children: b.caption }) : null,
        Array.isArray(b.head) && b.head.length
          ? jsx('thead', { children: jsx('tr', { children: b.head.map((h, hi) => jsx('th', { key: hi, children: String(h) })) }) })
          : null,
        jsx('tbody', { children: (b.rows || []).map((row, ri) =>
          jsx('tr', { key: ri, children: (row || []).map((cell, ci) => jsx('td', { key: ci, children: String(cell) })) })) }),
      ] }) })
    }
    if (b && b.type === 'text') {
      return jsx('p', { key, className: 'media-note', children: b.text })
    }
    return jsx(MediaFigure, { key, src: mediaSrc(examId, b?.src), alt: b?.alt || '', caption: b?.caption })
  })
}


// A section may override the pattern's marking. Older agent halves omit the
// per-section marks entirely (they only shipped attempt_limit), so fall back to
// the pattern before ever printing "+undefined / undefined" at the user.
function sectionMarks(section, pattern) {
  const pick = (k) => section?.[k] ?? pattern?.[k] ?? null
  return { correct: pick('marks_correct'), wrong: pick('marks_wrong') }
}

function marksLabel(section, pattern) {
  const m = sectionMarks(section, pattern)
  if (m.correct == null && m.wrong == null) return '—'
  const fmt = (v) => (v == null ? '?' : v > 0 ? `+${v}` : String(v))
  return `${fmt(m.correct)} / ${fmt(m.wrong)}`
}
// Short labels + a right-aligned count in a fixed grid: the key used to reflow
// every time a count changed width, which is what made the panel feel jumpy.
const LEGEND = [
  ['', 'Not visited', 'Not opened yet'],
  ['err', 'Not answered', 'Visited, left blank'],
  ['ok', 'Answered', 'Answer saved'],
  ['acc', 'Marked', 'Flagged for review, no answer'],
  ['acc2', 'Answered + marked', 'Answered and flagged — counts'],
]

function legendNode(counts) {
  return jsx('div', { className: 'legend', children: [
    ...LEGEND.map(([cls, label, hint], i) =>
      jsx(Tip, { label: hint, children: jsxs('span', { className: 'item', children: [
        jsx('span', { className: `sw ${cls}` }),
        jsx('span', { className: 'lbl', children: label }),
        counts ? jsx('span', { className: 'n', children: counts[i] }) : null,
      ] }) }, label)),
    jsxs('span', { className: 'item', children: [
      jsx('span', { className: 'sw current' }),
      jsx('span', { className: 'lbl', children: 'Current' }),
    ] }),
  ] })
}

function fmtWhen(s) {
  if (!s) return '—'
  return new Date(s * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// "12 min ago" reads better in a history list than a timestamp; the exact time
// stays one hover away.
function relTime(s) {
  if (!s) return '—'
  const d = Math.max(0, Date.now() / 1000 - s)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)} min ago`
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} d ago`
  return fmtWhen(s)
}

const STATUS_LABEL = { in_progress: 'In progress', submitted: 'Submitted', abandoned: 'Discarded' }
const STATUS_CLS = { in_progress: 'acc', submitted: 'ok', abandoned: 'mut' }
const MODE_LABEL = { assisted: 'Assisted', exam: 'Exam' }

function fmtScore(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return n > 0 ? `+${n}` : String(n)
}

function fmtHMS(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${sec}`
}

// The app keeps its titlebar cluster on a contributed full page only while the
// page mounts nothing into the titleBar band (hidesFixedTitlebarClusters +
// pageOwnsTitlebar in the app's titlebar-controls). This plugin claims no
// chrome there, but another claimed band hides the toggle on OUR route too, and
// the SDK offers no queryable signal for that. So the page keeps its own
// affordance instead of reading app DOM (catalog rule 8): a mounted, always-on
// stand-in in the page's own header row. With the cluster up it reads as part
// of the header grid — the redirect Tip says what changed.
function SidebarButton() {
  if (!ctxRunAction) return null
  return jsx(Tip, {
    label: 'Show or hide the sidebar (Ctrl+B)',
    children: jsx(Button, {
      type: 'button', variant: 'ghost', size: 'icon-sm', 'aria-label': 'Show or hide the sidebar',
      onClick: () => { void ctxRunAction('view.toggleSidebar') },
      // the app's own titlebar glyph, so the stand-in matches the button it replaces
      children: jsx(Codicon, { name: 'layout-sidebar-left', size: 14 }),
    }),
  })
}

// Owns the 1 Hz tick so the exam page (question body + a 100-chip palette) does not
// re-render every second. `left` comes from the server on each poll and re-anchors.
function Countdown({ left, onExpire, compact = false }) {
  const [now, setNow] = useState(() => Date.now())
  const anchor = useRef({ at: Date.now(), left: left ?? 0 })
  const expire = useRef(onExpire)
  expire.current = onExpire
  useEffect(() => { anchor.current = { at: Date.now(), left: left ?? 0 } }, [left])
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  const shown = Math.max(0, anchor.current.left - (now - anchor.current.at) / 1000)
  const done = left != null && shown <= 0
  useEffect(() => { if (done) expire.current?.() }, [done])
  // Comfortable → low (5 min) → critical (1 min). Colour is the only thing that
  // changes, so the eye picks it up late in a paper without a layout shift.
  const urgency = done ? ' crit' : shown <= 60 ? ' crit' : shown <= 300 ? ' low' : ''
  return jsx(Tip, {
    label: done ? 'Time is up — submitting the paper' : 'Time left in this attempt',
    children: jsx('strong', {
      className: `timer${urgency}`,
      'aria-live': 'off',
      children: done ? (compact ? 'Time up' : 'Time up — submitting…') : (compact ? fmtHMS(shown) : `Remaining Time: ${fmtHMS(shown)}`),
    }),
  })
}

// Stage text in whichever composer is live. `submit(null, …)` is a no-op on a
// fresh chat, so a draft is the reliable path; submit is the fallback for an older
// desktop without setDraft.
async function stageInChat(text) {
  const sid = host.state.activeSessionId.get() ?? null
  let staged = false
  try { staged = host.composer.setDraft ? await host.composer.setDraft(sid, text) : false } catch { staged = false }
  if (!staged) { try { host.composer.submit?.(sid, text) } catch {} }
  host.composer.focus(null)
}

// Staging text is useless if the composer is not on screen — every caller that
// wants the user to send something goes to the chat first, then stages.
async function goToChatAndStage(text) {
  goToChat()
  await new Promise(done => setTimeout(done, 300))     // let the chat mount its composer
  await stageInChat(text)
}

// One click to add a paper. A plugin cannot push a skill into a live session, and
// plugin skills are namespaced and absent from the agent's skill index, so the turn
// has to name it exactly: an unnamed "add a paper" would never find it.
const SOURCE_PROMPT = 'Load the skill cbt-exam:pyq-sourcing and help me add a paper. '
  + 'Ask me which exam and which year first — one question at a time — then find the '
  + 'official paper, validate it and file it.'

// Send the turn straight into a chat — never through the composer draft, so the
// prompt cannot end up sitting in the input box as well as being sent. The retry
// window is long on purpose: a fresh chat mounts its composer asynchronously, and
// giving up early is what used to fall back to pasting the text.
async function launchSourcing() {
  goToChat()
  await new Promise(done => setTimeout(done, 250))
  const hadSession = !!host.state.activeSessionId.get()
  if (!hadSession) {
    try { host.newChat?.() } catch { /* older desktop without newChat */ }
    await new Promise(done => setTimeout(done, 500))
  }
  for (let i = 0; i < 30; i++) {
    const addr = host.state.activeSessionId.get() || 'new'
    try {
      if (host.composer.submit?.(addr, SOURCE_PROMPT)) {
        // belt and braces: a surface that echoed the text into its own draft would
        // otherwise leave a duplicate waiting for Enter
        try { await host.composer.setDraft?.(addr, '') } catch { /* nothing to clear */ }
        return true
      }
    } catch { /* composer not mounted yet */ }
    await new Promise(done => setTimeout(done, 250))
  }
  host.notify?.({ kind: 'error', message: 'Could not start the sourcing chat — the composer never mounted.' })
  return false
}

async function primeAssistedChat(attemptId) {
  await goToChatAndStage('Load the skill cbt-exam:exam-assist — I am starting an assisted CBT exam (attempt '
    + attemptId + '). Answer my doubts using the live question context file.')
}

// One door for "start a paper", shared by the instructions page and Retake: it
// creates the attempt, then either docks it in a side pane (assisted) or hands the
// id back so the caller can show it full page. Returns null when a pane took it.
async function startAttempt(pack, mode) {
  const r = await rest('/attempts', { method: 'POST', body: { exam_id: pack.exam_id, mode } })
  await setActiveAttempt(r.attempt.id)
  const paned = mode === 'assisted' && openExamPane(r.attempt.id, () => showResult(r.attempt.id))
  if (paned) {
    // Assisted: the exam lives in the side pane, the chat keeps the main pane, so a
    // doubt can be asked without leaving the paper.
    await primeAssistedChat(r.attempt.id)
    return null
  }
  return r.attempt.id
}

// A load failure with no next step is a dead end; every one of them gets a Retry.
// The app has no inline error banner primitive (only the full ErrorState page), so
// an inline failure is a destructive badge plus the retry next to it.
function ErrorBox({ what, onRetry }) {
  return jsxs('div', { className: 'cbt-error', children: [
    jsxs('div', { className: 'cbt-row', children: [
      jsx(Badge, { variant: 'destructive', size: 'xs', children: `${what} failed` }),
      jsx('span', { className: 'cbt-sub', children: 'The plugin backend did not answer — is cbt-exam enabled and the gateway up?' }),
    ] }),
    onRetry
      ? jsx(Button, { type: 'button', variant: 'outline', size: 'sm', onClick: onRetry, children: 'Retry' })
      : null,
  ] })
}

// Keyboard band for the paper. Its own component so the listener can be attached
// after all of CbtExam's hooks (which sit above its loading/error returns).
function ExamKeys({ enabled, onKeyDown }) {
  useEffect(() => {
    if (!enabled) return undefined
    const handler = e => onKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onKeyDown])
  return null
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
      const id = await startAttempt(pack, mode)
      if (id) onBegin(id)              // exam mode, or a desktop without the pane API
    } catch (e) { host.notifyError?.(`Could not start exam: ${e?.message || e}`); setStarting(false) }
  }
  const marks = marksLabel(pack.pattern.sections[0] || {}, pack.pattern)
  const duration = `${hours ? hours + ' h ' : ''}${mins} min`
  return jsxs('div', { className: 'cbt cbt-page', children: [
    jsxs('div', { className: 'cbt-head-row', children: [
      jsx(SidebarButton, {}),
      jsx('h2', { children: `Instructions — ${pack.title || pack.exam_id}` }),
      jsx(Badge, { variant: mode === 'assisted' ? 'outline' : 'muted', children: mode === 'assisted' ? 'Assisted' : 'Exam' }),
    ] }),
    jsx(Separator, { className: 'cbt-sep' }),
    jsxs('div', { className: 'cbt-meta', children: [
      jsx(Badge, { variant: 'outline', children: duration }),
      jsx(Badge, { variant: 'outline', children: `${pack.questions.length} questions` }),
      types.map(t => jsx(Badge, { variant: 'outline', key: t, children: QTYPE_LABEL[t] || t })),
      marks ? jsx(Badge, { variant: 'outline', children: marks }) : null,
    ] }),
    jsx('div', { className: 'cbt-section', children: 'Pattern' }),
    jsxs('table', { className: 'cbt-table', children: [
      jsx('thead', { children: jsx('tr', { children: ['Section', 'Questions', 'To attempt', 'Marks'].map((h, i) => jsx('th', { key: h, className: i ? 'num' : undefined, children: h })) }) }),
      jsx('tbody', { children: pack.pattern.sections.map(s => jsxs('tr', { key: s.id, children: [
        jsx('td', { children: s.title }),
        jsx('td', { className: 'num', children: String(s.question_count) }),
        jsx('td', { className: 'num', children: s.attempt_limit ? `first ${s.attempt_limit}` : 'all' }),
        jsx('td', { className: 'num', children: marksLabel(s, pack.pattern) }),
      ] })) }),
    ] }),
    jsx(Separator, { className: 'cbt-sep' }),
    jsx('div', { className: 'cbt-section', children: 'How the paper works' }),
    jsx('div', { className: 'cbt-how', children: [
      'Select an answer, then Save to stay or Save & Next to move on. Leaving a question without saving keeps the pick on screen but does not record it.',
      'Only answers are evaluated — marking a question for review without answering it does not score.',
      'The question map shows each question’s state; click a number to jump there.',
      `The timer starts when you begin and runs ${duration}. At zero the paper submits itself.`,
      mode === 'assisted'
        ? 'The paper opens in a pane beside your chat, so you can ask doubts while you work.'
        : 'Full page, nothing else competing for the screen. Start an assisted attempt instead if you want the chat beside the paper.',
    ].map((t, i) => jsx('div', { className: 'cbt-how-row', key: i, children: t })) }),
    jsxs('div', { className: 'cbt-row', style: { marginTop: 24 }, children: [
      jsx(Button, { variant: 'default', size: 'default', loading: starting, onClick: begin, children: starting ? 'Starting…' : 'I am ready to begin' }),
      jsx(Button, { variant: 'ghost', size: 'default', disabled: starting, onClick: onBack, children: 'Back' }),
    ] }),
    jsx(Separator, { className: 'cbt-sep', style: { marginTop: 24 } }),
    jsxs('div', { className: 'cbt-keys', children: [
      'Keys inside the paper: ',
      jsx(Kbd, { children: '1–9' }), ' answer · ',
      jsx(Kbd, { children: '←/→' }), ' move · ',
      jsx(Kbd, { children: 'S' }), ' save · ',
      jsx(Kbd, { children: 'M' }), ' mark · ',
      jsx(Kbd, { children: 'Enter' }), ' save & next · ',
      jsx(Kbd, { children: 'Esc' }), ' close paper',
    ] }),
  ] })
}

// One paper, its numbers, and its own attempt history. History is scoped to the
// paper because a flat list of every attempt ever made stops being readable the
// moment a second paper arrives.
function ExamCard({ pack, attempts, onStart, onResume, onViewResult }) {
  const qc = useQueryClient()
  const live = attempts.filter(a => a.status === 'in_progress')
  // attempts arrive after the first render, so "open when there is history" cannot be
  // an initial value — it would be computed against an empty list and stay closed.
  // null = follow the data; a click pins the user's choice.
  const [open, setOpen] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showWarn, setShowWarn] = useState(false)

  const isOpen = open === null ? attempts.length > 0 : open
  const kept = attempts.filter(a => showDiscarded || a.status !== 'abandoned')
  const rank = a => (a.status === 'in_progress' ? 0 : 1)
  const ordered = [...kept].sort((x, y) =>
    rank(x) - rank(y) || (y.submitted_at || y.started_at || 0) - (x.submitted_at || x.started_at || 0))
  const shown = showAll ? ordered : ordered.slice(0, 6)
  const hidden = ordered.length - shown.length
  const discarded = attempts.length - attempts.filter(a => a.status !== 'abandoned').length
  const scores = attempts.map(a => a.score).filter(v => typeof v === 'number')
  const best = scores.length ? Math.max(...scores) : null
  const last = attempts.reduce((n, a) => Math.max(n, a.submitted_at || a.started_at || 0), 0)

  // A route this build asks for and the server does not serve means the dashboard is
  // still running the plugin it loaded at boot — its Python routes are mounted once, so a
  // plugin updated on disk keeps answering with the old route table. The bare "Not Found"
  // that comes back is a restart instruction, not a bug report.
  const routeGone = 'the dashboard is running an older build of this plugin — restart the dashboard, then retry'
  const failed = (what, e) => {
    const msg = String(e?.message ?? e)
    return /(^|[^0-9])404([^0-9]|$)|not found/i.test(msg) ? `${what} failed: ${routeGone}` : `${what} failed: ${msg}`
  }
  const del = async id => {
    setBusy(true)
    try {
      await rest(`/attempts/${id}`, { method: 'DELETE' })
      setConfirmDel(null)
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
    } catch (e) { host.notifyError?.(failed('Delete', e)) }
    setBusy(false)
  }
  const clearDiscarded = async () => {
    setBusy(true)
    try {
      await rest('/attempts/prune', { method: 'POST', body: { exam_id: pack.exam_id } })
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
    } catch (e) { host.notifyError?.(failed('Clear', e)) }
    setBusy(false)
  }

  const marks = [...new Set((pack.sections || [])
    .map(s => sectionMarks(s, pack.pattern || {}))
    .filter(m => m.correct != null)
    .map(m => marksLabel({ marks_correct: m.correct, marks_wrong: m.wrong }, {})))]
  const meta = [
    pack.year ? String(pack.year) : null,
    pack.invalid ? null : `${pack.question_count} questions`,
    pack.invalid ? null : `${pack.duration_minutes ?? '?'} min`,
    marks.length ? marks.join(' · ') : null,
  ].filter(Boolean).join(' · ')

  return jsxs('section', { className: 'cbt-card', children: [
    jsxs('div', { className: 'cbt-card-head', children: [
      jsxs('div', { className: 'cbt-card-title', children: [
        jsxs('div', { className: 'cbt-row', children: [
          jsx('h3', { children: pack.title || pack.exam_id }),
          pack.invalid ? jsx(Badge, { variant: 'destructive', children: 'invalid' }) : null,
          pack.warnings?.length
            ? jsx(Tip, { label: showWarn ? 'Hide the warnings' : 'Show what was flagged', children:
                jsx(Button, {
                  variant: 'outline', size: 'micro', 'aria-expanded': showWarn,
                  onClick: () => setShowWarn(v => !v),
                  children: jsxs('span', { className: 'cbt-warn-count', children: [
                    icon('alert', 'size-3'),
                    `${pack.warnings.length} warning${pack.warnings.length === 1 ? '' : 's'}`,
                  ] }),
                }) })
            : null,
        ] }),
        jsx('div', { className: 'cbt-sub', children: pack.invalid
          ? String(pack.invalid).replace(/^invalid pack:\s*/, '')
          : meta }),
        pack.provenance && !pack.invalid ? jsx('div', { className: 'cbt-sub', children: pack.provenance }) : null,
        // open warnings push the card down instead of reflowing the title row
        showWarn && pack.warnings?.length
          ? jsx('ul', { className: 'cbt-list', children: pack.warnings.slice(0, 12).map((w, i) => jsx('li', { key: i, children: w })) })
          : null,
        attempts.length
          ? jsxs('div', { className: 'cbt-stat-row', children: [
              jsx('span', { children: `${attempts.length} attempt${attempts.length === 1 ? '' : 's'}` }),
              discarded ? jsx('span', { children: `· ${discarded} discarded` }) : null,
              best != null ? jsx('span', { children: `· best ${fmtScore(best)}` }) : null,
              last ? jsx('span', { children: `· last ${relTime(last)}` }) : null,
            ] })
          : null,
      ] }),
      jsx('div', { className: 'cbt-card-actions', children: pack.invalid ? null : jsxs('div', { className: 'cbt-row', children: [
        live.length
          ? jsx(Button, { variant: 'default', size: 'sm', onClick: () => onResume(live[0].id, live[0].mode), children: 'Resume' })
          : null,
        jsx(Tip, { label: 'Side pane beside the chat — ask doubts while you answer', children:
          jsx(Button, {
            variant: live.length ? 'secondary' : 'default', size: 'sm',
            onClick: () => onStart(pack, 'assisted'), children: 'Start assisted',
          }) }),
        jsx(Tip, { label: 'Full page, no chat, no hints', children:
          jsx(Button, {
            variant: 'secondary', size: 'sm',
            onClick: () => onStart(pack, 'exam'), children: 'Start exam',
          }) }),
      ] }) }),
    ] }),
    attempts.length
      ? jsxs('div', { className: 'cbt-card-body', children: [
          jsxs('div', { className: 'cbt-row', style: { marginBottom: 8 }, children: [
            jsx(Button, {
              variant: 'ghost', size: 'sm', 'aria-expanded': isOpen,
              onClick: () => setOpen(!isOpen),
              children: [jsx(Codicon, { key: 'c', name: isOpen ? 'chevron-down' : 'chevron-right', size: 12 }),
                isOpen ? 'Hide history' : `History · ${ordered.length}`],
            }),
            jsx('span', { style: { flex: 1 } }),
            discarded
              ? jsx(Button, {
                  variant: 'ghost', size: 'sm',
                  onClick: () => setShowDiscarded(v => !v),
                  children: showDiscarded ? 'Hide discarded' : `Show ${discarded} discarded`,
                })
              : null,
            discarded && showDiscarded
              ? jsx(Tip, { label: 'Delete every discarded attempt of this paper', children:
                  jsx(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: () => void clearDiscarded(), children: 'Clear discarded' }) })
              : null,
          ] }),
          isOpen ? jsxs('table', { className: 'cbt-table', children: [
            jsx('thead', { children: jsx('tr', { children: ['Mode', 'Status', 'Score', 'When', ''].map(h => jsx('th', { key: h, children: h })) }) }),
            jsx('tbody', { children: shown.map(a => jsxs('tr', { key: a.id, children: [
              jsx('td', { children: jsx(Badge, { variant: 'outline', size: 'xs', children: MODE_LABEL[a.mode] || a.mode }) }),
              jsx('td', { children: jsx(Badge, {
                variant: a.status === 'in_progress' ? 'default' : a.status === 'submitted' ? 'muted' : 'outline',
                size: 'xs',
                children: STATUS_LABEL[a.status] || a.status,
              }) }),
              jsx('td', { className: a.score == null ? 'num muted' : 'num', children: fmtScore(a.score) }),
              jsx('td', { className: 'muted', children: jsx(Tip, { label: fmtWhen(a.submitted_at || a.started_at), children: jsx('span', { children: relTime(a.submitted_at || a.started_at) }) }) }),
              jsx('td', { className: 'right', children: confirmDel === a.id
                ? jsxs('div', { className: 'cbt-row', children: [
                    jsx('span', { className: 'cbt-sub', children: 'Delete this attempt?' }),
                    jsx(Button, { variant: 'destructive', size: 'xs', disabled: busy, onClick: () => void del(a.id), children: busy ? 'Deleting…' : 'Delete' }),
                    jsx(Button, { variant: 'ghost', size: 'xs', disabled: busy, onClick: () => setConfirmDel(null), children: 'Cancel' }),
                  ] })
                : jsxs('div', { className: 'cbt-row', children: [
                    a.status === 'in_progress'
                      ? jsx(Button, { variant: 'default', size: 'xs', onClick: () => onResume(a.id, a.mode), children: 'Resume' })
                      : a.status === 'abandoned'
                        ? jsx(Tip, { label: 'This attempt was thrown away — nothing was graded', children:
                            jsx(Button, { variant: 'ghost', size: 'xs', onClick: () => onViewResult(a.id), children: 'Details' }) })
                        : jsx(Button, { variant: 'outline', size: 'xs', onClick: () => onViewResult(a.id), children: 'Result' }),
                    jsx(Tip, { label: 'Delete this attempt permanently', children:
                      jsx(Button, { variant: 'ghost', size: 'xs', onClick: () => setConfirmDel(a.id), children: icon('trash', 'size-3') }) }),
                  ] }) }),
            ] })) }),
            hidden > 0
              ? jsx('caption', { className: 'cbt-caption', children: jsx(Button, {
                  variant: 'ghost', size: 'xs', onClick: () => setShowAll(true),
                  children: `Show ${hidden} more`,
                }) })
              : null,
          ] }) : null,
        ] })
      : jsx('div', { className: 'cbt-sub', style: { marginTop: 8 }, children: 'No attempts yet.' }),
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
  // Sourcing is an agent job, not a form — but the turn it starts must not be a
  // template the user has to edit before sending.
  const source = () => { void launchSourcing() }
  const packList = packs.data?.packs || []
  const all = hist.data?.attempts || []
  const liveCount = all.filter(a => a.status === 'in_progress').length
  return jsxs('div', { className: 'cbt cbt-page', children: [
    jsxs('div', { className: 'cbt-head-row', children: [
      jsx(SidebarButton, {}),
      jsx('h2', { children: 'CBT Exams' }),
      jsx('span', { className: 'cbt-sub cbt-inline', children: liveCount ? `${liveCount} attempt${liveCount === 1 ? '' : 's'} running` : 'exam-agnostic practice — any CBT, pattern is data' }),
      jsx('span', { style: { flex: 1 } }),
      jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => { packs.refetch(); hist.refetch() }, children: 'Refresh' }),
      jsx(Tip, { label: 'Opens a chat prompt for the agent — fill in the exam and year, it fetches, checks and files the paper', children:
        jsx(Button, { variant: 'outline', size: 'sm', onClick: source, children: 'Source more papers' }) }),
    ] }),
    packs.isLoading
      ? jsx('div', { className: 'cbt-loading', children: [jsx(Codicon, { name: 'loading', size: 14, spinning: true }), ' Loading papers…'] })
      : packs.isError
        ? jsx(ErrorBox, { what: 'Loading packs', onRetry: () => packs.refetch() })
        : (packList.length === 0
          ? jsxs('div', { children: [
              jsx(EmptyState, { title: 'No papers yet', description: 'Ask the agent to source a previous-year paper — it files itself here once validated.' }),
              jsx(Button, { variant: 'default', size: 'sm', onClick: source, children: 'Source a paper' }),
            ] })
          : packList.map(p => jsx(ExamCard, {
              key: p.exam_id,
              pack: p,
              attempts: all.filter(a => a.exam_id === p.exam_id),
              onStart: start,
              onResume,
              onViewResult,
            }))),
    hist.isError ? jsx(ErrorBox, { what: 'Loading attempts', onRetry: () => hist.refetch() }) : null,
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

// Submitting is irreversible, so it asks in a dialog that shows the same picture
// the question map does — what is answered, what is flagged, what is still blank.
function SubmitDialog({ stats, unanswered, submitting, onCancel, onSubmit, onDiscard }) {
  const totals = stats.reduce((n, s) => ({
    total: n.total + s.total,
    answered: n.answered + s.answered + s.answered_marked,
    marked: n.marked + s.marked + s.answered_marked,
    blank: n.blank + s.not_answered + s.not_visited,
  }), { total: 0, answered: 0, marked: 0, blank: 0 })
  return jsx(Dialog, {
    open: true,
    onOpenChange: open => { if (!open) onCancel() },
    children: jsxs(DialogContent, {
      className: 'cbt-dlg', 'aria-describedby': undefined,
      children: [
        jsxs(DialogHeader, { children: [
          jsx(DialogTitle, { children: 'Submit the paper?' }),
          jsx(DialogDescription, { className: 'cbt-desc', children: 'This cannot be undone.' }),
        ] }),
        jsxs('div', { className: 'cbt-row cbt-gap-sm', children: [
          jsx(Badge, { variant: 'outline', children: `${totals.total} questions` }),
          jsx(Badge, { variant: 'success', children: `${totals.answered} answered` }),
          totals.marked
            ? jsx(Tip, { label: 'Flagged for review — a flagged question can also be answered', children:
                jsx(Badge, { variant: 'muted', children: `${totals.marked} marked` }) })
            : null,
          totals.blank ? jsx(Badge, { variant: 'destructive', children: `${totals.blank} unanswered` }) : null,
        ] }),
        jsxs('table', { className: 'cbt-table', children: [
          jsx('thead', { children: jsx('tr', { children: [
            jsx('th', { children: 'Section' }),
            jsx('th', { className: 'num', children: 'Answered' }),
            jsx('th', { className: 'num', children: jsx(Tip, { label: 'Flagged for review — can also be answered, so it does not add up with the other columns', children: jsx('span', { children: 'Marked' }) }) }),
            jsx('th', { className: 'num', children: jsx(Tip, { label: 'Visited but no answer saved', children: jsx('span', { children: 'Blank' }) }) }),
            jsx('th', { className: 'num', children: jsx(Tip, { label: 'Never opened', children: jsx('span', { children: 'Not visited' }) }) }),
          ] }) }),
          jsx('tbody', { children: stats.map(x => jsxs('tr', { key: x.id, children: [
            jsx('td', { children: [x.title, x.limit ? jsx('span', { className: 'cbt-sub', children: ` · first ${x.limit} count` }) : null] }),
            jsx('td', { className: 'num', children: String(x.answered + x.answered_marked) }),
            jsx('td', { className: 'num', children: String(x.marked + x.answered_marked) }),
            jsx('td', { className: 'num', children: String(x.not_answered) }),
            jsx('td', { className: 'num', children: String(x.not_visited) }),
          ] })) }),
        ] }),
        jsx('p', { className: 'cbt-sub', children: unanswered
          ? `${unanswered} unanswered (blank + not visited) will score 0 — a blank never carries a negative mark.`
          : 'Every question has an answer saved.' }),
        jsxs(DialogFooter, { children: [
          jsx(Button, {
            variant: 'default', size: 'default', loading: submitting, onClick: onSubmit,
            children: [icon('check', 'size-3.5'), submitting ? 'Submitting…' : 'Submit paper'],
          }),
          jsx(Button, { variant: 'secondary', size: 'default', disabled: submitting, autoFocus: true, onClick: onCancel, children: 'Keep answering' }),
          jsx('span', { style: { flex: 1 } }),
          jsx(Tip, { label: 'Throw this attempt away — it is not graded', children:
            jsx(Button, {
              variant: 'destructive', size: 'default', disabled: submitting, onClick: onDiscard,
              children: [icon('trash', 'size-3.5'), 'Discard'],
            }) }),
        ] }),
      ],
    }),
  })
}

function CbtExam({ attemptId, onResult, onHome, onClose, inPane = false, narrow = false }) {
  const q = useQuery({ queryKey: ['cbt', 'attempt', attemptId], queryFn: () => rest(`/attempts/${attemptId}`), refetchInterval: 30000 })
  const qc = useQueryClient()
  const [curSec, setCurSec] = useState(null)
  const [curQid, setCurQid] = useState(null)
  const [palCollapsed, setPalCollapsed] = useState(inPane)
  const [showPaper, setShowPaper] = useState(false)
  const [sel, setSel] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [subDone, setSubDone] = useState(false)
  // A page can be dragged narrow too (a browser window, a split tab). The pane
  // passed `narrow` in; measuring here means both paths adapt.
  const rootRef = useRef(null)
  const bodyRef = useRef(null)
  const [selfNarrow, setSelfNarrow] = useState(false)
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width ?? 0
      if (w > 0) setSelfNarrow(w < 780)
    })
    ro.observe(el)
    // belt and braces: a window drag also emits resize, and a stale observer must
    // never leave the paper laid out for a width it no longer has
    const onResize = () => {
      const w = rootRef.current?.getBoundingClientRect().width ?? 0
      if (w > 0) setSelfNarrow(w < 780)
    }
    window.addEventListener('resize', onResize)
    return () => { ro.disconnect(); window.removeEventListener('resize', onResize) }
  }, [])
  const isNarrow = narrow || selfNarrow
  useEffect(() => { if (isNarrow) setPalCollapsed(true) }, [isNarrow])
  const [saveState, setSaveState] = useState(null)      // null | 'saving' | 'saved' | 'err'
  const saveTimer = useRef(0)
  useEffect(() => () => clearTimeout(saveTimer.current), [])
  const serverLeft = q.data?.remaining_seconds ?? null
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
  const doDiscard = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await rest(`/attempts/${attemptId}/abandon`, { method: 'POST' })
      await setActiveAttempt(null)
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
      onHome()
    } catch (e) {
      host.notifyError?.(`Discard failed: ${e?.message || e}`)
      setSubmitting(false)
    }
  }
  // Re-sync the input with what the server saved for the question on screen. The
  // dependency is the saved value itself, so an unsaved pick survives the 30 s poll;
  // and it never fires for a question that is no longer current.
  const savedForShown = curQid ? q.data?.attempt?.answers?.[curQid] : undefined
  useEffect(() => {
    if (!q.data || q.data.attempt?.status !== 'in_progress') return
    if (curQid && !q.data.pack.questions.some(x => x.id === curQid)) return
    const saved = curQid ? q.data.attempt.answers?.[curQid] : undefined
    setSel(saved === undefined || saved === null ? null : saved)
  }, [curQid, savedForShown])
  if (q.isLoading) return jsx('div', { className: 'cbt cbt-page', children: jsx('div', { className: 'cbt-loading', children: [jsx(Codicon, { name: 'loading', size: 14, spinning: true }), ' Loading…'] }) })
  if (q.isError) return jsx('div', { className: 'cbt cbt-page', children: jsx(ErrorBox, { what: 'Loading attempt', onRetry: () => q.refetch() }) })
  const { attempt, pack } = q.data
  const qmap = Object.fromEntries(pack.questions.map(x => [x.id, x]))
  const sections = pack.pattern.sections
  // Where to land: the explicit pick, else the server's `current` — so reopening the
  // panel (or resuming from Home) reopens the question you were actually on.
  const resumeId = qmap[attempt.current] ? attempt.current : null
  const activeSecId = curSec || (resumeId ? qmap[resumeId].section : sections[0].id)
  const curIdResolved = qmap[curQid] ? curQid
    : (resumeId || (pack.questions.find(x => x.section === activeSecId) || pack.questions[0]).id)
  const cur = qmap[curIdResolved]
  const answered = attempt.answers || {}
  const marked = attempt.marked || []
  const visited = attempt.visited || []
  const secQs = sid => pack.questions.filter(x => x.section === sid)
  const patchPath = `/attempts/${attemptId}`
  const goTo = async qid => {
    if (!qid || qid === curIdResolved) return
    setCurQid(qid); setCurSec(qmap[qid].section)
    try { adopt(await rest(patchPath, { method: 'PATCH', body: { visited: [qid], current: qid } })) } catch {}
  }
  const neighbors = () => {
    const all = pack.questions.map(x => x.id)
    const i = all.indexOf(curIdResolved)
    return { back: all[i - 1], next: all[i + 1] }
  }
  const toggleMark = qid => (marked.includes(qid) ? marked.filter(x => x !== qid) : [...marked, qid])
  // Every write reports itself: 'saving' → 'saved' (fades after a moment) or 'err'.
  // Without this a PATCH that fails on a flaky link looks identical to a saved answer.
  const settle = () => {
    setSaveState('saved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState(null), 1800)
  }
  const act = async kind => {
    if (submitting) return
    setSaveState('saving')
    try {
      if (kind === 'clear') {
        adopt(await rest(patchPath, { method: 'PATCH', body: { answers: { [curIdResolved]: null } } }))
        setSel(null)
        settle()
        return
      }
      const leave = neighbors()
      // Walking without saving: record where we are and where we are going. `current`
      // is what the exam-assist tutor reads, so it has to move with the screen.
      if (kind === 'back' || kind === 'next') {
        const target = leave[kind]
        adopt(await rest(patchPath, { method: 'PATCH', body: target
          ? { visited: [curIdResolved, target], current: target }
          : { visited: [curIdResolved], current: curIdResolved } }))
        if (target) { setCurQid(target); setCurSec(qmap[target].section) }
        settle()
        return
      }
      // Each of the four write buttons must do something the others don't:
      //   Save            save, stay
      //   Save & Next     save, advance
      //   Save & Mark     save + flag, stay      (previously advanced, same as below)
      //   Mark & Next     flag, advance, don't save a half-made pick
      const body = { visited: [curIdResolved] }
      if (kind !== 'markNext') body.answers = { [curIdResolved]: sel }
      if (kind === 'saveMark' || kind === 'markNext') body.marked = toggleMark(curIdResolved)
      const target = (kind === 'saveNext' || kind === 'markNext') ? leave.next : null
      if (target) {
        body.visited = [curIdResolved, target]
        body.current = target
      }
      adopt(await rest(patchPath, { method: 'PATCH', body }))
      if (target) { setCurQid(target); setCurSec(qmap[target].section) }
      settle()
    } catch (e) {
      setSaveState('err')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setSaveState(null), 4000)
      host.notifyError?.(`${kind} failed: ${e?.message || e}`)
    }
  }
  if (attempt.status !== 'in_progress') {
    return jsxs('div', { className: 'cbt cbt-page', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('p', { className: 'cbt-sub', children: 'This attempt is submitted.' }),
      jsxs('div', { className: 'cbt-row', children: [
        jsx(Button, { variant: 'default', size: 'sm', onClick: () => onResult(attemptId), children: 'Open result' }),
        onHome ? jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => onHome(), children: 'Home' }) : null,
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
    const on = kind === 'mcq' ? sel === i : (Array.isArray(sel) && sel.includes(i))
    const figs = cur.option_media?.[i]
    const input = kind === 'mcq'
      ? jsx('input', { type: 'radio', name: curIdResolved, checked: on, onChange: () => setSel(i) })
      : jsx('input', { type: 'checkbox', checked: on, onChange: () => setSel(on ? sel.filter(x => x !== i) : [...(sel || []), i]) })
    return jsxs('label', { key: i, className: `opt${on ? ' sel' : ''}`, children: [
      input,
      jsxs('span', { className: 'opt-body', children: [
        jsx('span', { children: `${String.fromCharCode(65 + i)}) ${text}` }),
        figs ? mediaNode(figs, pack.exam_id, `opt${i}`) : null,
      ] }),
    ] })
  }
  const qIndex = pack.questions.findIndex(x => x.id === curIdResolved) + 1
  const curAnswered = (() => {
    const v = answered[curIdResolved]
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
  })()
  const submitStats = sections.map(s => {
    const qs = secQs(s.id)
    const st = { not_visited: 0, not_answered: 0, answered: 0, marked: 0, answered_marked: 0 }
    for (const x of qs) {
      const c = chipState(x.id, answered, visited, marked)
      if (c === 's-not-visited') st.not_visited++
      else if (c === 's-not-answered') st.not_answered++
      else if (c === 's-answered') st.answered++
      else if (c === 's-marked') st.marked++
      else st.answered_marked++
    }
    return { title: s.title, id: s.id, total: qs.length, limit: s.attempt_limit || null, ...st }
  })
  const unansweredTotal = pack.questions.length
    - pack.questions.filter(x => {
        const v = answered[x.id]
        return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
      }).length
  // Keyboard band. Typing in the NAT field must not eat the letters, so only Enter
  // is honoured while a field has focus; modifiers are left to the app.
  const onKey = e => {
    if (showPaper) { if (e.key === 'Escape') { e.preventDefault(); setShowPaper(false) } return }
    if (confirming) { if (e.key === 'Escape') { e.preventDefault(); setConfirming(false) } return }
    const t = e.target
    const tag = (t?.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) {
      if (e.key === 'Enter') { e.preventDefault(); void act('saveNext') }
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = (e.key || '').toLowerCase()
    if (/^[1-9]$/.test(k) && cur.options?.length) {
      const i = Number(k) - 1
      if (i < cur.options.length) {
        e.preventDefault()
        if (cur.type === 'msq') {
          setSel(prev => {
            const a = Array.isArray(prev) ? prev : []
            return a.includes(i) ? a.filter(x => x !== i) : [...a, i]
          })
        } else setSel(i)
      }
      return
    }
    if (k === 'arrowright' || k === 'n') { e.preventDefault(); void act('next') }
    else if (k === 'arrowleft' || k === 'p') { e.preventDefault(); void act('back') }
    else if (k === 's') { e.preventDefault(); void act('saveStay') }
    else if (k === 'm') { e.preventDefault(); void act('saveMark') }
    else if (k === 'enter') { e.preventDefault(); void act('saveNext') }
  }
  const multiSection = sections.length > 1
  return jsxs('div', { ref: rootRef, className: `cbt cbt-shell${palCollapsed ? ' pal-collapsed' : ''}${isNarrow ? ' narrow' : ''}${multiSection ? '' : ' single-sec'}`, children: [
    jsx(ExamKeys, { enabled: true, onKeyDown: onKey }),
    jsx(ScrollToTop, { dep: curIdResolved, targetRef: bodyRef }),
    jsxs('div', { className: 'cbt-head', style: { gridArea: 'head' }, children: [
      inPane ? null : jsx(SidebarButton, {}),
      jsx(Tip, { label: pack.title || pack.exam_id, children:
        jsx('strong', { className: 'cbt-head-title', children: pack.title || pack.exam_id }) }),
      isNarrow ? null : jsx(Badge, { variant: attempt.mode === 'assisted' ? 'outline' : 'muted', children: attempt.mode === 'assisted' ? 'Assisted' : 'Exam' }),
      jsx('span', { style: { flex: 1 } }),
      isNarrow
        ? jsx(Tip, { label: 'Question paper', children:
            jsx(Button, { variant: 'ghost', size: 'icon-sm', 'aria-label': 'Question paper', onClick: () => setShowPaper(v => !v), children: icon('book', 'size-4') }) })
        : jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => setShowPaper(v => !v), children: [icon('book', 'size-4'), 'Question Paper'] }),
      // The terminal action belongs in the persistent chrome: it used to sit in the
      // question map, so folding the map took submitting away with it.
      jsx(Tip, { label: confirming ? 'Confirmation is open' : 'Review the counts, then submit the paper', children:
        jsx(Button, {
          variant: 'default', size: 'sm',
          disabled: submitting || confirming,
          'aria-label': 'Submit the paper',
          onClick: () => { setConfirming(true); setPalCollapsed(true) },
          children: [icon('check', 'size-4'), 'Submit'],
        }) }),
      jsx(Countdown, { left: serverLeft, compact: isNarrow, onExpire: () => { void doSubmit() } }),
      // the panel toggle is the last thing in the header — it governs the panel on
      // the right, so it sits on the right of everything else
      jsx(Tip, { label: palCollapsed ? 'Show the question map' : 'Hide the question map', children:
        jsx(Button, {
          variant: 'ghost', size: 'icon-sm',
          'aria-expanded': !palCollapsed,
          'aria-label': palCollapsed ? 'Show the question map' : 'Hide the question map',
          onClick: () => setPalCollapsed(v => !v),
          children: jsx(Codicon, { name: 'layout-sidebar-right', size: 14 }),
        }) }),
    ] }),
    multiSection ? jsx('div', { className: 'cbt-tabs', style: { gridArea: 'tabs' }, children:
      jsx(SegmentedControl, {
        value: activeSecId,
        onChange: sid => jumpSection(sid),
        sizing: 'content',
        options: sections.map(sec => {
          const qs = secQs(sec.id)
          const done = qs.filter(x => {
            const v = answered[x.id]
            return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
          }).length
          return { id: sec.id, label: `${sec.title} ${done}/${qs.length}` }
        }),
      }) }) : null,
    jsx('div', { ref: bodyRef, className: 'cbt-qbody', style: { gridArea: 'body' }, children: [
      jsxs('div', { className: 'cbt-row cbt-gap-sm', style: { marginBottom: 12 }, children: [
        jsx('span', { className: 'cbt-sub', children: `Question ${qIndex} of ${pack.questions.length} · ${QTYPE_LABEL[cur.type] || cur.type}` }),
        cur.type !== 'nat'
          ? jsx('span', { className: 'cbt-sub', children: `+${cur.marks_correct ?? secMeta.marks_correct} / ${cur.marks_wrong ?? secMeta.marks_wrong}` })
          : null,
        marked.includes(curIdResolved) ? jsx(Badge, { variant: 'muted', size: 'xs', children: 'Marked' }) : null,
        jsx(Badge, { variant: curAnswered ? 'success' : 'outline', size: 'xs', children: curAnswered ? 'Answered' : 'Not answered' }),
      ] }),
      jsx('p', { className: 'cbt-qtext', children: cur.text }),
      mediaNode(cur.media, pack.exam_id, 'q'),
      cur.type === 'nat'
        ? jsx('input', {
            type: 'text', inputMode: 'decimal', placeholder: 'Your answer',
            value: sel == null ? '' : String(sel),
            onChange: e => setSel(e.target.value),
          })
        : cur.options.map((o, i) => optRow(i, o, cur.type)),
    ] }),
    !palCollapsed && jsx('div', { className: `cbt-pal${isNarrow ? ' as-drawer' : ''}`, style: { gridArea: 'pal' }, children: [
      jsx('div', { className: 'cbt-pal-wrap', children: [
        jsx('div', { className: 'cbt-pal-inner', style: { display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }, children: [
          jsxs('div', { className: 'cbt-pal-head', children: [
            jsxs('div', { className: 'pal-title', children: [
              jsx('strong', { children: 'Question map' }),
              jsx('span', { className: 'muted', children: `${secCounts[2] + secCounts[4]} of ${secQs(activeSecId).length} answered` }),
              jsx('span', { style: { flex: 1 } }),
              jsx(Tip, { label: 'Hide the question map', children:
                jsx(Button, {
                  variant: 'ghost', size: 'icon-xs', 'aria-label': 'Hide the question map',
                  onClick: () => setPalCollapsed(true),
                  children: icon('close', 'size-3.5'),
                }) }),
            ] }),
            legendNode(secCounts),
            secMeta.attempt_limit
              ? jsx('div', { style: { fontSize: 12, color: counted >= secMeta.attempt_limit ? 'var(--ui-accent)' : 'var(--ui-text-secondary)' }, children: `Attempted ${counted} / ${secMeta.attempt_limit} counted — further answers in this section don't score` })
              : null,
          ] }),
          jsx('div', { className: 'cbt-pal-scroll', children: sections.map(s => {
            const qs = secQs(s.id)
            const done = qs.filter(x => {
              const v = answered[x.id]
              return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
            }).length
            return jsxs('div', { key: s.id, className: 'cbt-pal-group', children: [
              jsxs('div', { className: 'pal-sec-head', children: [
                jsx('strong', { children: s.title }),
                jsx('span', { children: `${done}/${qs.length}` }),
              ] }),
              jsx('div', { className: 'cbt-pal-grid', children: secQs(s.id).map((x, i) => {
                const st = chipState(x.id, answered, visited, marked)
                return jsx('button', {
                  key: x.id, type: 'button',
                  className: `cbt-chip ${st}`,
                  style: x.id === curIdResolved ? { outline: '2px solid var(--ui-accent)', outlineOffset: '1px' } : undefined,
                  'aria-label': `Question ${i + 1} of ${s.title}`,
                  onClick: () => goTo(x.id),
                  children: st === 's-answered-marked'
                    ? [String(i + 1), jsx('span', { key: 't', className: 'tick', children: '✓' })]
                    : String(i + 1),
                })
              }) }),
            ] })
          }) }),
        ] }),

      ] }),
    ] }),
    jsx('div', { className: 'cbt-actions', style: { gridArea: 'act' }, children: jsx('div', { className: 'act-bar', children: [
      // Three groups, in the order you use them: answer · review · navigate.
      jsxs('span', { key: 'g-answer', className: 'act-group', children: [
        jsx(Tip, { key: 'sv-t', label: 'Save the answer and stay (S)', children:
          jsx(Button, { variant: 'secondary', size: 'sm', 'data-span': '3', loading: saveState === 'saving',
            onClick: () => void act('saveStay'), children: [icon('save', 'size-4'), 'Save'] }) }),
        jsx(Tip, { key: 'sn-t', label: 'Save and move to the next question (Enter)', children:
          jsx(Button, { variant: 'default', size: 'sm', 'data-span': '3', loading: saveState === 'saving',
            onClick: () => void act('saveNext'), children: [icon('save', 'size-4'), 'Save & Next'] }) }),
      ] }),
      jsxs('span', { key: 'g-review', className: 'act-group', children: [
        jsx(Tip, { key: 'sm-t', label: marked.includes(curIdResolved) ? 'Remove the review flag — stays here (M)' : 'Flag this question for review — stays here (M)', children:
          jsx(Button, {
            variant: marked.includes(curIdResolved) ? 'chip' : 'secondary', size: 'sm', 'data-span': '2',
            'aria-pressed': marked.includes(curIdResolved),
            onClick: () => void act('saveMark'),
            children: [icon(marked.includes(curIdResolved) ? 'bookmarkOn' : 'bookmark', 'size-4'), marked.includes(curIdResolved) ? 'Unmark' : 'Mark'],
          }) }),
        jsx(Tip, { key: 'mn-t', label: 'Flag for review and move on', children:
          jsx(Button, {
            variant: 'secondary', size: 'sm', 'data-span': '2',
            onClick: () => void act('markNext'),
            children: [icon('bookmark', 'size-4'), marked.includes(curIdResolved) ? 'Unmark & Next' : 'Mark & Next'],
          }) }),
        jsx(Tip, { key: 'cr-t', label: 'Remove the saved answer for this question', children:
          jsx(Button, { variant: 'ghost', size: 'sm', 'data-span': '2',
            onClick: () => void act('clear'), children: [icon('clear', 'size-4'), 'Clear'] }) }),
      ] }),
      saveState
        ? jsx('span', {
            key: 'ss', className: 'save-slot', role: 'status',
            children: jsx('span', {
              className: `save-state${saveState === 'saved' ? ' ok' : saveState === 'err' ? ' err' : ''}`,
              children: saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Not saved — retry',
            }),
          })
        : null,
      // nav pair travels as one unit and sits at the far right
      jsxs('span', { key: 'nav', className: 'act-group nav', children: [
        jsx(Tip, { key: 'bk-t', label: 'Previous question (←)', children:
          jsx(Button, { variant: 'secondary', size: 'sm', 'data-span': '3',
            onClick: () => void act('back'), children: [icon('chevron-left', 'size-4'), 'Back'] }) }),
        jsx(Tip, { key: 'nx-t', label: 'Next question (→)', children:
          jsx(Button, { variant: 'secondary', size: 'sm', 'data-span': '3',
            onClick: () => void act('next'), children: ['Next', icon('chevron-right', 'size-4')] }) }),
      ] }),
    ] }) }),
    confirming && jsx(SubmitDialog, {
      stats: submitStats, unanswered: unansweredTotal, submitting,
      onCancel: () => setConfirming(false),
      onSubmit: () => void doSubmit(),
      onDiscard: () => void doDiscard(),
    }),
    showPaper && jsx(Dialog, {
      open: true,
      onOpenChange: open => { if (!open) setShowPaper(false) },
      children: jsxs(DialogContent, {
        className: 'cbt-dlg cbt-paper',
        children: [
          jsxs(DialogHeader, { children: [
            jsx(DialogTitle, { children: pack.title || pack.exam_id }),
            jsx(DialogDescription, { className: 'cbt-desc', children: 'A read-only copy of the paper. Close with Esc.' }),
          ] }),
          ...sections.map(s => jsxs('div', { key: s.id, children: [
            jsx('h3', { children: s.title }),
            ...secQs(s.id).map((x, i) => jsxs('div', { key: x.id, className: 'cbt-paper-q', children: [
              jsx('p', { children: [jsx('strong', { children: `${i + 1}. ` }), x.text] }),
              mediaNode(x.media, pack.exam_id, `paper-${x.id}`),
            ] })),
          ] })),
        ],
      }),
    }),
  ] })
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
  return jsxs('div', { children: [
    jsx('p', { children: d.overall_comment }),
    (d.sections || []).map((s, i) => jsx('p', { key: i, className: 'muted', children: `${s.section_id}: ${s.comment}` })),
    (d.weak_topics || []).length
      ? jsxs('div', { children: [
          jsx('h4', { children: 'Weak topics' }),
          jsx('ul', { className: 'list', children: d.weak_topics.map((w, i) =>
            jsxs('li', { key: i, children: [`${w.topic} `, jsx('span', { className: 'muted', children: `· ${w.priority} priority` })] })) }),
        ] })
      : null,
    (d.wrong_answer_notes || []).length
      ? jsxs('div', { children: [
          jsx('h4', { children: 'Where it slipped' }),
          ...d.wrong_answer_notes.map((n, i) => jsx('p', { key: i, className: 'note', children: [jsx('strong', { children: `${n.question_id}: ` }), n.note] })),
        ] })
      : null,
    (d.study_plan || []).length
      ? jsxs('div', { children: [
          jsx('h4', { children: 'Study plan' }),
          jsx('ol', { className: 'list', children: d.study_plan.map((s, i) => jsx('li', { key: i, children: s })) }),
        ] })
      : null,
  ] })
}

function CbtResult({ attemptId, onHome, onRetake }) {
  const q = useQuery({ queryKey: ['cbt', 'attempt', attemptId], queryFn: () => rest(`/attempts/${attemptId}`) })
  const qc = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [evalBusy, setEvalBusy] = useState(false)
  const [evalError, setEvalError] = useState(null)
  const [evalTried, setEvalTried] = useState(false)
  // `force` re-runs the LLM; without it the server returns the stored evaluation and
  // the call is free, so opening a result twice never costs a second model call.
  const runEval = async force => {
    if (evalBusy) return
    setEvalBusy(true); setEvalError(null)
    try {
      const ev = await rest(`/attempts/${attemptId}/evaluate${force ? '?force=true' : ''}`, { method: 'POST' })
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
      void runEval(false)
    }
  }, [q.data?.attempt?.evaluation, q.data?.attempt?.status, evalTried, evalBusy])
  const discuss = () => {
    const a = q.data?.attempt
    void stageInChat(`Discuss my CBT attempt: ${q.data.pack.title || q.data.pack.exam_id} — score ${a.result.score} (correct ${a.result.totals.correct}, wrong ${a.result.totals.wrong}, skipped ${a.result.totals.skipped}). The full review and AI evaluation are in the cbt-exam plugin result page.`)
  }
  if (q.isLoading) return jsx('div', { className: 'cbt cbt-page', children: jsx('div', { className: 'cbt-loading', children: [jsx(Codicon, { name: 'loading', size: 14, spinning: true }), ' Loading…'] }) })
  if (q.isError || !q.data) return jsx('div', { className: 'cbt cbt-page', children: jsx(ErrorBox, { what: 'Loading result', onRetry: () => q.refetch() }) })
  const { attempt, pack } = q.data
  if (attempt.status !== 'submitted' || !attempt.result) {
    const why = attempt.status === 'abandoned'
      ? 'This attempt was discarded — it was never graded and its answer key is not shown.'
      : 'This attempt is still in progress — resume it to finish.'
    return jsxs('div', { className: 'cbt cbt-page', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('p', { className: 'cbt-sub', children: why }),
      jsx(Button, { variant: 'outline', size: 'sm', onClick: () => onHome(), children: 'Back to home' }),
    ] })
  }
  const r = attempt.result
  const qmap = Object.fromEntries(pack.questions.map(x => [x.id, x]))
  const rows = r.questions.filter(row => filter === 'all' || row.verdict === filter)
  const total = (r.totals.correct || 0) + (r.totals.wrong || 0) + (r.totals.skipped || 0) + (r.totals.not_counted || 0)
  const pct = total ? Math.round((1000 * (r.totals.correct || 0)) / total) / 10 : 0
  return jsxs('div', { className: 'cbt cbt-page', children: [
    jsxs('div', { className: 'cbt-head-row', children: [
      jsx(SidebarButton, {}),
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx(Badge, { variant: attempt.mode === 'assisted' ? 'outline' : 'muted', children: MODE_LABEL[attempt.mode] || attempt.mode }),
      jsx(Tip, { label: fmtWhen(attempt.submitted_at), children:
        jsx('span', { className: 'cbt-sub', children: `submitted ${relTime(attempt.submitted_at)}` }) }),
      jsx('span', { style: { flex: 1 } }),
      onRetake ? jsx(Tip, { label: `New ${MODE_LABEL[attempt.mode] || attempt.mode} attempt on this paper`, children:
        jsx(Button, { variant: 'default', size: 'sm', onClick: () => onRetake(pack, attempt.mode), children: 'Retake' }) }) : null,
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => onHome(), children: 'All exams' }),
    ] }),
    jsx('div', { className: 'cbt-label', children: 'Score' }),
    jsx('div', { className: `cbt-score${r.score > 0 ? ' pos' : r.score < 0 ? ' neg' : ''}`, children: fmtScore(r.score) }),
    jsxs('div', { className: 'row sub', children: [
      jsx('span', { className: 'cbt-sub', children: `${r.totals.correct} of ${total} correct · ${pct}%` }),
      (() => {
        // marking can be set on the pattern or overridden per section; show the one
        // that actually applied to this paper
        const w = pack.pattern?.marks_wrong ?? pack.pattern?.sections?.[0]?.marks_wrong
        return w < 0 ? jsx('span', { className: 'cbt-sub', children: `· ${w} per wrong answer` }) : null
      })(),
      jsx('span', { style: { flex: 1 } }),
      ['correct', 'wrong', 'skipped', 'not_counted'].map(k =>
        jsx(Badge, {
          key: k, size: 'xs',
          variant: k === 'correct' ? 'success' : k === 'wrong' ? 'destructive' : k === 'skipped' ? 'muted' : 'outline',
          children: `${VERDICT_LABEL[k]} ${r.totals[k]}`,
        })),
    ] }),
    pack.pattern.sections.length > 1 ? jsx('h3', { children: 'Sections' }) : null,
    pack.pattern.sections.length > 1 && jsxs('table', { children: [
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
    jsx('h3', { children: 'AI evaluation' }),
    evalBusy
      ? jsxs('div', { className: 'cbt-row cbt-sub', children: [
          jsx(Codicon, { name: 'loading', size: 14, spinning: true }),
          'Analysing your attempt — this calls the model once and takes a few seconds.',
        ] })
      : evalError
        ? jsxs('div', { children: [
            jsxs('div', { className: 'cbt-row', children: [
              jsx(Badge, { variant: 'destructive', size: 'xs', children: 'AI evaluation failed' }),
              jsx(Button, { variant: 'outline', size: 'sm', onClick: () => void runEval(false), children: 'Retry' }),
              jsx(Button, { variant: 'ghost', size: 'sm', onClick: discuss, children: 'Discuss with the agent instead' }),
            ] }),
            jsxs('details', { style: { marginTop: 8 }, children: [
              jsx('summary', { className: 'cbt-sub cbt-clickable', children: 'What the model said' }),
              jsx('pre', { className: 'cbt-pre', children: evalError }),
            ] }),
          ] })
        : attempt.evaluation
          ? jsxs('div', { children: [
              evaluationCard(attempt.evaluation.data),
              jsxs('div', { className: 'cbt-row', style: { marginTop: 12 }, children: [
                jsx('span', { className: 'cbt-sub', children: `via ${attempt.evaluation.provider || '?'}/${attempt.evaluation.model || '?'} · ${fmtWhen(attempt.evaluation.generated_at)}` }),
                jsx('span', { style: { flex: 1 } }),
                jsx(Button, { variant: 'outline', size: 'sm', disabled: evalBusy, onClick: () => void runEval(true), children: 'Re-analyse' }),
                jsx(Button, { variant: 'ghost', size: 'sm', onClick: discuss, children: 'Discuss in chat' }),
              ] }),
            ] })
          : jsxs('div', { className: 'cbt-row', children: [
              jsx('span', { className: 'cbt-sub', children: 'No evaluation yet.' }),
              jsx(Button, { variant: 'outline', size: 'sm', onClick: () => void runEval(false), children: 'Analyse this attempt' }),
              jsx(Button, { variant: 'ghost', size: 'sm', onClick: discuss, children: 'Discuss in chat' }),
            ] }),
    jsxs('div', { className: 'cbt-row', style: { marginTop: 24 }, children: [
      jsx('h3', { style: { margin: 0 }, children: 'Review' }),
      jsx('span', { className: 'cbt-sub', children: `${rows.length} shown` }),
      jsx('span', { style: { flex: 1 } }),
      jsx(SegmentedControl, {
        value: filter,
        onChange: f => setFilter(f),
        sizing: 'content',
        options: [['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Skipped'], ['not_counted', 'Not counted']].map(([f, label]) => ({
          id: f,
          label: f === 'all' ? `${label} ${r.questions.length}` : `${label} ${r.totals[f] ?? 0}`,
        })),
      }),
    ] }),
    jsx('div', { style: { marginTop: 8 }, children: rows.map(row => {
      const qq = qmap[row.id]
      const expanded = open === row.id
      const isMarked = (attempt.marked || []).includes(row.id)
      const skipped = row.verdict === 'skipped'
      return jsxs('div', { key: row.id, className: 'review-row', children: [
        jsx('div', {
          className: 'cbt-row cbt-review-head', role: 'button', tabIndex: 0, 'aria-expanded': expanded,
          onClick: () => setOpen(expanded ? null : row.id),
          onKeyDown: e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(expanded ? null : row.id) }
          },
          children: [
            jsx(Codicon, { name: expanded ? 'chevron-down' : 'chevron-right', size: 12 }),
            jsx('strong', { children: row.id }),
            jsx(Badge, {
              size: 'xs',
              variant: row.verdict === 'correct' ? 'success' : row.verdict === 'wrong' ? 'destructive' : row.verdict === 'skipped' ? 'muted' : 'outline',
              children: `${VERDICT_LABEL[row.verdict]}${row.awarded ? ` (${row.awarded})` : ''}`,
            }),
            isMarked ? jsx(Badge, { size: 'xs', variant: 'muted', children: 'Marked' }) : null,
            jsx('span', { className: 'cbt-sub', children: `${row.type.toUpperCase()} · ${row.topic || ''}` }),
            jsx('span', { style: { flex: 1 } }),
          ],
        }),
        expanded && jsxs('div', { className: 'cbt-review-body', children: [
          jsx('p', { children: qq.text }),
          mediaNode(qq.media, pack.exam_id, `rev-${row.id}`),
          (qq.options || []).map((o, i) => jsxs('div', { key: i, className: 'cbt-sub', children: [
            `${String.fromCharCode(65 + i)}) ${o}`,
            qq.option_media?.[i] ? mediaNode(qq.option_media[i], pack.exam_id, `rev-${row.id}-o${i}`) : null,
          ] })),
          jsxs('div', { className: 'cbt-ans', children: [
            jsx('span', { className: 'cbt-ans-k', children: 'Your answer' }),
            jsx('span', {
              className: skipped ? 'muted' : row.verdict === 'correct' ? 'hit' : 'miss',
              children: skipped ? 'not answered' : fmtAns(qq, attempt.answers[row.id]),
            }),
          ] }),
          jsxs('div', { className: 'cbt-ans', children: [
            jsx('span', { className: 'cbt-ans-k', children: 'Correct answer' }),
            jsx('span', { className: 'hit', children: fmtAns(qq, qq.answer) }),
          ] }),
          qq.explanation ? jsx('p', { className: 'cbt-sub', children: qq.explanation }) : null,
        ] }),
      ] })
    }) }),
  ] })
}

function CbtPage() {
  const [view, setView] = useState(() => {
    if (pendingResult) {
      const attemptId = pendingResult
      pendingResult = null
      return { name: 'result', attemptId }
    }
    return { name: 'home' }
  })
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
        void setActiveAttempt(id)          // announce it: the status-bar timer listens
        // Assisted attempts are a side pane, not this page — opening CBT Exams must not
        // bounce the user to chat. The Home table's Resume opens the pane; exam-mode
        // attempts keep the old behaviour of landing straight in the paper.
        if (live.attempt.mode !== 'assisted') {
          setView(v => (v.name === 'home' ? { name: 'exam', attemptId: id } : v))
        }
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
      onResume: (id, mode) => {
        // Assisted attempts reopen in the side pane so the chat stays available;
        // exam-mode attempts get the full page (nothing to ask, full concentration).
        if (mode === 'assisted' && openExamPane(id, () => showResult(id))) {
          void setActiveAttempt(id)
          goToChat()
          return
        }
        void setActiveAttempt(id)
        setView({ name: 'exam', attemptId: id })
      },
      onViewResult: id => setView({ name: 'result', attemptId: id }),
    }),
    view.name === 'instructions' && jsx(CbtInstructions, {
      pack: view.pack, mode: view.mode,
      onBegin: id => setView({ name: 'exam', attemptId: id }),
      onBack: () => setView({ name: 'home' }),
    }),
    view.name === 'exam' && jsx(CbtExam, { key: view.attemptId, attemptId: view.attemptId, onResult: id => setView({ name: 'result', attemptId: id }), onHome: () => setView({ name: 'home' }) }),
    view.name === 'result' && jsx(CbtResult, {
      key: view.attemptId,
      attemptId: view.attemptId,
      onHome: () => setView({ name: 'home' }),
      // one click from a result to another go at the same paper, same mode
      onRetake: async (pack, mode) => {
        try {
          const id = await startAttempt(pack, mode)
          if (id) setView({ name: 'exam', attemptId: id })
        } catch (e) { host.notifyError?.(`Could not start: ${e?.message || e}`) }
      },
    }),
  ] })
}

function TimerChip() {
  const id = useActiveAttempt()
  const q = useQuery({
    queryKey: ['cbt', 'attempt', id || 'none'],
    queryFn: () => rest(`/attempts/${id}`),
    enabled: !!id,
    refetchInterval: 30000,
  })
  const a = q.data?.attempt
  if (!id || !a || a.status !== 'in_progress') return null
  return jsx(Tip, {
    label: 'Open the running attempt',
    children: jsx(Button, {
      variant: 'ghost', size: 'micro', 'aria-label': 'Open the running attempt',
      onClick: () => host.navigate('/cbt'),
      children: [jsx(Codicon, { key: 'c', name: 'watch', size: 12 }), fmtHMS(q.data.remaining_seconds)],
    }),
  })
}

export default {
  id: 'cbt-exam',
  name: 'CBT Exams',
  defaultEnabled: false,
  register(ctx) {
    ctxRest = (p, o) => ctx.rest(p, o)
    ctxStorage = ctx.storage
    ctxRunAction = ctx.runAction ? (id) => ctx.runAction(id) : null
    // Hydrate the stored attempt once at boot: the status-bar countdown is mounted
    // outside this page and otherwise stays blank until CBT Exams is opened.
    void readActiveAttempt().then(() => announceActiveAttempt())
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/cbt' }, render: () => jsx(CbtPage, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: '/cbt', label: 'CBT Exams', codicon: 'checklist' } },
      { id: 'open', area: PALETTE_AREA, data: { id: 'cbt.open', label: 'Open CBT Exams', keywords: ['cbt', 'exam', 'mock'], run: () => host.navigate('/cbt') } },
      { id: 'timer', area: STATUSBAR_AREAS.right, render: () => jsx(TimerChip, {}) },
    ])
  },
}
