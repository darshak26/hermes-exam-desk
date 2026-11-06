// cbt-exam — exam-agnostic CBT practice panel (route /cbt)
import { host, ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, STATUSBAR_AREAS, useQuery, useQueryClient } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useRef, useState } from 'react'

const CSS = `
.cbt{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--ui-text-primary,#222);font:13px/1.5 var(--font-sans,system-ui)}
/* Exam convention: violet = flagged for review. The theme accent is neutral grey in
   most themes here, so marked gets its own hue. It is a fixed violet mixed toward the
   theme foreground, which keeps it legible on both light and dark instead of being a
   literal that only works in one. */
.cbt{--cbt-mark:color-mix(in srgb, #8b5cf6 82%, var(--ui-text-primary, #161616))}
.cbt *{box-sizing:border-box}
.cbt .muted{color:var(--ui-text-secondary,#666)}
/* Spacing scale: 4 8 12 16 24 32. Every padding/gap/margin below is a step or a
   half-step of it; horizontal text starts on one left edge: 20px page gutter,
   table cells carry only a right gutter so column text stays on that edge. */
/* page container: block flow, so a stray button is never stretched to full width */
.cbt.pad{display:block;padding:24px;overflow:auto}
.cbt h2{font-size:17px;line-height:1.35;font-weight:600;margin:0 0 16px}
.cbt.pad > .row.head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.cbt.pad > .row.head h2{margin:0}
.cbt.pad > .row.head *{overflow-wrap:anywhere}
.cbt .muted + .muted{margin-top:4px}
.cbt table{border-collapse:collapse;width:100%}
.cbt th,.cbt td{text-align:left;padding:8px 16px 8px 0;border-bottom:1px solid var(--ui-stroke-secondary,#ccc);font-size:12.5px;vertical-align:middle}
.cbt th:last-child,.cbt td:last-child{padding-right:0;text-align:right}
.cbt td:last-child .row,.cbt td:last-child{justify-content:flex-end}
.cbt td:last-child .row{flex-wrap:nowrap}
.cbt th{color:var(--ui-text-secondary,#666);font-weight:600;padding-top:0}
.cbt td .row{gap:8px}
.cbt button{font:inherit;color:inherit;background:transparent;border:1px solid var(--ui-stroke-secondary,#ccc);border-radius:6px;padding:0 12px;height:26px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}
.cbt button:hover:not(:disabled){background:color-mix(in srgb,currentColor 7%,transparent)}
/* a tinted outline still reads as "hovered" — the app's solid pairing is what makes
   a button look like THE action: --dt-primary-solid with its own foreground */
.cbt button.primary{border-color:var(--dt-primary-solid, var(--ui-accent));background:var(--dt-primary-solid, var(--ui-accent));color:var(--dt-primary-solid-foreground, #fff);font-weight:600}
.cbt button.primary:hover:not(:disabled){filter:brightness(1.12)}
.cbt button:disabled{opacity:.5;cursor:default}
.cbt .cbt-icon-btn{width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;border:0;background:transparent;border-radius:5px;color:var(--ui-muted-foreground,#6b7280);cursor:pointer;transition:background-color .12s ease,color .12s ease}
.cbt .cbt-icon-btn:hover{background:var(--ui-control-hover-background,rgba(127,127,127,.16));color:var(--ui-foreground,inherit)}
.cbt .cbt-icon-btn:active{background:var(--ui-control-active-background,rgba(127,127,127,.24))}
.cbt .cbt-icon-btn:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.cbt .cbt-icon-btn .codicon{font-size:14px;line-height:1}
.cbt .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cbt .badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:1px solid var(--ui-stroke-secondary);font-size:11px;line-height:1;white-space:nowrap}
.cbt .badge.assisted{border-color:var(--ui-accent);color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 10%,transparent)}
.cbt .badge.fill{border-color:var(--ui-accent);color:var(--ui-text-primary);background:color-mix(in srgb,var(--ui-accent) 24%,transparent);font-weight:600}
.cbt .seg{display:inline-flex;border:1px solid var(--ui-stroke-secondary);border-radius:6px;overflow:hidden}
.cbt .seg button{border:0;border-radius:0;height:26px;padding:0 12px;color:var(--ui-text-secondary)}
.cbt .seg button + button{border-left:1px solid var(--ui-stroke-secondary)}
.cbt .seg button.on{background:color-mix(in srgb,var(--ui-accent) 26%,transparent);color:var(--ui-text-primary);font-weight:600;box-shadow:inset 0 0 0 1px var(--ui-accent)}
.cbt td.num{font-variant-numeric:tabular-nums}
.cbt .badge.err{border-color:var(--ui-red, var(--ui-danger, #f87171));color:var(--ui-red, var(--ui-danger, #f87171))}
.cbt .badge.ok{border-color:var(--ui-success, #10b981);color:var(--ui-success, #10b981)}
.cbt .badge.acc{border-color:var(--ui-accent);color:var(--ui-accent)}
.cbt .badge.mut{border-color:var(--ui-stroke-secondary);color:var(--ui-text-secondary)}
.cbt button.badge{height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:400;gap:0;line-height:1}
.cbt .warn-list{margin:8px 0 0;font-size:12px;color:var(--ui-text-secondary)}
/* result headline + review diff */
.cbt .score{font-size:34px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums;margin:8px 0 12px}
.cbt .score.pos{color:var(--ui-success, #10b981)}
.cbt .score.neg{color:var(--ui-red, var(--ui-danger, #f87171))}
.cbt .sub{margin:0 0 12px}
.cbt .review-row{border-top:1px solid var(--ui-stroke-secondary)}
.cbt .review-row > .row{padding:10px 8px;margin:0 -8px;border-radius:6px}
.cbt .review-row > .row:hover{background:color-mix(in srgb,currentColor 5%,transparent)}
.cbt .review-row > .row:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px}
.cbt .ans{display:flex;gap:10px;align-items:baseline;margin:0 0 6px}
.cbt .ans .k{min-width:104px;font-weight:600}
.cbt .ans .miss{color:var(--ui-red, var(--ui-danger, #f87171))}
.cbt .ans .hit{color:var(--ui-success, #10b981)}
/* live save feedback in the action bar */
.cbt .save-state{font-size:12px;color:var(--ui-text-secondary)}
.cbt .save-state.ok{color:var(--ui-success, #10b981)}
.cbt .save-state.err{color:var(--ui-red, var(--ui-danger, #f87171))}
/* countdown urgency */
.cbt strong.timer{font-variant-numeric:tabular-nums;white-space:nowrap}
.cbt strong.timer.low{color:var(--ui-warning, #d97706)}
.cbt strong.timer.crit{color:var(--ui-red, var(--ui-danger, #f87171))}
/* question-paper modal: the header must stay put while the paper scrolls */
.cbt .modal-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:12px;
  margin:-20px -20px 12px;padding:12px 20px;background:var(--ui-surface-background,#fff);
  border-bottom:1px solid var(--ui-stroke-secondary)}
.cbt .kbd{font-size:11px;padding:0 5px;border-radius:4px;border:1px solid var(--ui-stroke-secondary);color:var(--ui-text-secondary)}
.cbt .dlg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:60}
.cbt .dlg-box{background:var(--ui-surface-background,#fff);color:var(--ui-text-primary);width:min(560px,92%);max-height:80vh;overflow:auto;border-radius:10px;padding:0;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.cbt .dlg-box .modal-head{margin:0;padding:14px 20px;border-bottom:1px solid var(--ui-stroke-secondary)}
.cbt .dlg-body{padding:16px 20px 20px}
/* fixed layout + one width for every count column: the header sits over its number
   instead of hugging the left edge of a column that overflows the dialog */
.cbt .dlg-box table{table-layout:fixed;width:100%}
.cbt .dlg-box th,.cbt .dlg-box td{padding:8px 8px 8px 0;white-space:normal}
.cbt .dlg-box th.num,.cbt .dlg-box td.num{text-align:right;width:84px;font-variant-numeric:tabular-nums}
.cbt .dlg-box th:last-child,.cbt .dlg-box td:last-child{padding-right:0}
/* one paper = one card: title, numbers, then its own history */
.cbt .card{border:1px solid var(--ui-stroke-secondary);border-radius:10px;padding:16px;margin:0 0 16px}
.cbt .card-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between}
.cbt .card-actions{flex:0 0 auto}
.cbt .card-body{margin-top:12px;border-top:1px solid var(--ui-stroke-secondary);padding-top:12px}
.cbt .stat{display:flex;gap:12px;font-size:12px;color:var(--ui-text-secondary);margin-top:6px;align-items:baseline}
.cbt .stat > span + span::before{content:'·';margin-right:12px;color:var(--ui-text-quaternary)}
.cbt button.ghost{border-color:transparent;background:transparent;padding:0 6px;height:22px;font-size:12px;color:var(--ui-text-secondary)}
.cbt button.ghost:hover:not(:disabled){background:color-mix(in srgb,currentColor 7%,transparent);color:var(--ui-text-primary)}
.cbt button.ghost.danger{margin-left:8px}
.cbt button.ghost.danger:hover:not(:disabled){color:var(--ui-red, var(--ui-danger, #f87171));background:color-mix(in srgb,var(--ui-red, #f87171) 10%,transparent)}
.cbt .card table th{padding-top:0}
.cbt .card caption{padding-top:8px}
.cbt .legend{display:grid;grid-template-columns:1fr 1fr;column-gap:12px;row-gap:3px;font-size:11.5px;color:var(--ui-text-secondary);margin:0 0 12px}
.cbt .legend .item{display:flex;align-items:center;gap:7px;min-width:0;height:16px}
.cbt .legend .lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cbt .legend .n{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--ui-text-quaternary)}
.cbt .legend .sw{flex:0 0 auto;margin-right:0}
.cbt .lg{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--ui-text-secondary);margin:10px 0}
.cbt .lg .item{display:flex;align-items:center}
.cbt .sw{width:12px;height:12px;border-radius:3px;margin-right:6px;border:1px solid var(--ui-stroke-secondary);display:inline-block}
.cbt .sw.err{border-color:var(--ui-red, var(--ui-danger, #f87171));background:color-mix(in srgb,var(--ui-red, var(--ui-danger, #f87171)) 18%,transparent)}
.cbt .sw.ok{border-color:var(--ui-success, #10b981);background:color-mix(in srgb,var(--ui-success, #10b981) 18%,transparent)}
.cbt .sw.acc{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 20%,transparent)}
.cbt .sw.current{box-shadow:0 0 0 2px var(--ui-accent);border-color:transparent;background:transparent}
.cbt .sw.acc2{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 22%,transparent);position:relative}
.cbt .sw.acc2::after{content:'✓';position:absolute;inset:0;font-size:9px;line-height:11px;text-align:center;color:var(--ui-success, #10b981);font-weight:700}
.cbt h3{font-size:13px;line-height:1.4;margin:24px 0 8px}
.cbt p{margin:0 0 16px;max-width:70ch}
.cbt p.note{margin:0 0 8px}
.cbt h4{font-size:12.5px;margin:16px 0 8px;font-weight:600}
.cbt h4:first-child{margin-top:0}
.cbt .list{margin:0 0 16px;padding-left:18px}
.cbt .list li{margin:0 0 6px}
.cbt p:last-child{margin-bottom:0}
.cbt input[type=text]{font:inherit;color:inherit;background:var(--ui-surface-background,#fff);border:1px solid var(--ui-stroke-secondary,#ccc);border-radius:6px;padding:6px 10px;min-width:280px}
.cbt .opt{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--ui-stroke-secondary,#ccc);border-radius:8px;margin:0 0 10px;cursor:pointer;background:var(--ui-surface-background,#fff);line-height:1.5}
.cbt .opt input{margin:2px 0 0}
.cbt .opt-body{display:flex;flex-direction:column;gap:8px;min-width:0}
/* figures and data tables from the paper itself */
.cbt .media-fig{margin:0 0 16px}
.cbt .media-fig img{display:block;max-width:100%;height:auto;border:1px solid var(--ui-stroke-secondary);border-radius:8px;background:var(--ui-surface-background,#fff)}
.cbt .media-missing{display:flex;gap:8px;align-items:center;justify-content:center;min-height:120px;padding:16px;border:1px dashed var(--ui-stroke-secondary);border-radius:8px;color:var(--ui-text-secondary);font-size:12px;text-align:center}
.cbt .media-fig figcaption{margin-top:6px;font-size:12px;color:var(--ui-text-secondary)}
.cbt .media-note{font-size:13px;color:var(--ui-text-secondary)}
.cbt .media-table{width:auto;max-width:100%;margin:0 0 16px;border-collapse:collapse;font-size:13px}
.cbt .media-table caption{caption-side:top;text-align:left;font-size:12px;color:var(--ui-text-secondary);padding:0 0 6px}
.cbt .media-table th,.cbt .media-table td{border:1px solid var(--ui-stroke-secondary);padding:6px 12px;font-variant-numeric:tabular-nums;vertical-align:top}
.cbt .media-table th{background:color-mix(in srgb,currentColor 5%,transparent);font-weight:600;text-align:left}
.cbt .opt .media-fig{margin:0}
/* a figure inside an option is a thumbnail; a missing one must not blow the option
   card up to twice its neighbours' height */
.cbt .opt .media-missing{min-height:0;padding:8px 10px;font-size:11.5px;justify-content:flex-start}
.cbt .opt .media-fig img{max-height:170px;width:auto}
.cbt .media-table td:first-child{white-space:nowrap}
.cbt .opt.sel{border-color:var(--ui-accent)}
/* options span the reading column so their right edge matches the question text */
.cbt .opt{text-align:left;max-width:100%}
.cbt .cbt-qbody p{max-width:none}
.cbt-shell{display:grid;height:100%;min-height:0;
  grid-template-columns:minmax(0,1fr) 358px;
  /* auto (not fixed px) rows: in a narrow pane the head wraps to two lines and the
     action row wraps to two, and a fixed row clips the overflow off the pane. */
  grid-template-rows:minmax(44px,auto) minmax(40px,auto) minmax(0,1fr) minmax(48px,auto);
  grid-template-areas:"head head" "tabs pal" "body pal" "act pal";}
.cbt-pal-grid{display:grid;grid-template-columns:repeat(10,28px);gap:6px;justify-content:center;padding:12px}
.cbt .cbt-chip{height:24px;font-size:11.5px;font-variant-numeric:tabular-nums;border-radius:4px;border:1px solid var(--ui-stroke-secondary)}
.cbt .cbt-chip.s-not-visited{background:transparent;color:var(--ui-text-secondary)}
.cbt .cbt-chip.s-not-answered{border-color:var(--ui-red, var(--ui-danger, #f87171));background:color-mix(in srgb,var(--ui-red, var(--ui-danger, #f87171)) 16%,transparent)}
.cbt .cbt-chip.s-answered{border-color:var(--ui-success, #10b981);background:color-mix(in srgb,var(--ui-success, #10b981) 16%,transparent)}
.cbt .cbt-chip.s-marked{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 20%,transparent)}
.cbt .cbt-chip.s-answered-marked{border-color:var(--cbt-mark);background:color-mix(in srgb,var(--cbt-mark) 22%,transparent)}
.cbt .cbt-chip .tick{color:var(--ui-success, #10b981);font-weight:700;font-size:9px;margin-left:1px;vertical-align:1px}
.cbt-qbody{max-width:820px;margin:0;padding:20px 20px 40px;font-size:15px;line-height:1.6;overflow:auto}
.cbt-actions{display:flex;gap:16px;row-gap:10px;align-items:center;padding:10px 20px;flex-wrap:wrap;border-top:1px solid var(--ui-stroke-secondary);background:var(--ui-surface-background,#fff)}
.cbt .act-group{display:flex;gap:8px;align-items:center;min-width:0}
.cbt .act-group.nav{margin-left:auto}
.cbt-actions .ask{display:flex;flex-direction:column;gap:2px;min-width:0}
.cbt .cbt-actions button{height:30px;gap:6px;padding:0 9px}
.cbt .cbt-actions button .codicon{font-size:14px;opacity:.9}
.cbt .cbt-actions button.on{border-color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 18%,transparent);color:var(--ui-text-primary);font-weight:600}
.cbt .cbt-actions button.clear{color:var(--ui-text-secondary)}
.cbt .cbt-actions button.clear:hover:not(:disabled){color:var(--ui-red, var(--ui-danger, #f87171));border-color:color-mix(in srgb,var(--ui-red, #f87171) 45%,var(--ui-stroke-secondary))}
.cbt button.danger{color:var(--ui-red, var(--ui-danger, #f87171));border-color:color-mix(in srgb,var(--ui-red, #f87171) 45%,var(--ui-stroke-secondary))}
.cbt button.danger:hover:not(:disabled){background:color-mix(in srgb,var(--ui-red, #f87171) 12%,transparent)}
.cbt-actions button{text-align:left;justify-content:flex-start}
/* Folded: the panel is simply not there — no 24px rail, no chevron hovering at
   the screen edge. The header toggle (always in the same place) brings it back. */
.cbt-shell.pal-collapsed{grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "tabs" "body" "act"}
.cbt-head{display:flex;align-items:center;gap:12px;padding:0 20px;min-height:44px;border-bottom:1px solid var(--ui-stroke-secondary)}
.cbt .cbt-head-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cbt .submit-head{border-color:color-mix(in srgb,var(--ui-accent) 55%,var(--ui-stroke-secondary));font-weight:600}
.cbt .submit-head:hover:not(:disabled){background:color-mix(in srgb,var(--ui-accent) 14%,transparent)}
.cbt-tabs{display:flex;gap:4px;padding:0 8px;border-bottom:1px solid var(--ui-stroke-secondary);overflow:hidden}
.cbt-tabs button{height:34px;border:none;border-bottom:2px solid transparent;border-radius:0;padding:0 12px}
.cbt-tabs button.on{border-bottom-color:var(--ui-accent);color:var(--ui-accent)}
.cbt-pal{display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--ui-stroke-secondary)}
.cbt-pal-head{padding:12px 12px 8px}
.cbt-pal-scroll{flex:1;overflow:auto}
.cbt-pal-group{margin:8px 0}
.cbt-pal-group h4{font-size:11px;margin:12px 12px 6px;color:var(--ui-text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.cbt .icon-btn{width:24px;height:24px;padding:0;border:0;background:transparent;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;color:var(--ui-text-secondary);flex:0 0 auto}
.cbt .icon-btn:hover:not(:disabled){background:var(--ui-control-hover-background,rgba(127,127,127,.16));color:var(--ui-text-primary)}
.cbt .icon-btn .codicon{font-size:14px;line-height:1}
.cbt-pal-wrap{position:relative;display:flex;flex-direction:column;min-height:0;height:100%}
/* Narrow (side-pane) layout: one column, palette becomes an overlay drawer so the
   question keeps its full width instead of being squeezed by a fixed 358px column. */
.cbt-shell.narrow{position:relative;grid-template-columns:minmax(0,1fr);grid-template-areas:"head" "tabs" "body" "act";
  grid-template-rows:auto auto minmax(0,1fr) auto}
.cbt .pal-sec-head{display:flex;align-items:baseline;gap:8px;margin:12px 12px 6px}
.cbt .pal-sec-head strong{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ui-text-secondary)}
.cbt .pal-sec-head span{font-size:11px;font-variant-numeric:tabular-nums;color:var(--ui-text-quaternary);margin-left:auto}
.cbt .pal-title{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.cbt .pal-title strong{font-size:12px}
.cbt .pal-title .muted{font-size:11px;font-variant-numeric:tabular-nums}
.cbt .save-slot{min-width:52px;display:inline-flex;justify-content:flex-start;font-size:12px;margin-left:-6px}
.cbt-shell.narrow .cbt-pal.as-drawer{position:absolute;right:0;top:0;bottom:auto;width:min(340px,88%);max-height:min(560px,calc(100% - 150px));overflow:auto;z-index:30;background:var(--ui-surface-background,#fff);border-left:1px solid var(--ui-stroke-secondary);box-shadow:-10px 0 30px rgba(0,0,0,.22)}
/* 10 columns need 358px; the drawer is 340 — 8 columns fit with padding. */
.cbt-shell.narrow .cbt-pal.as-drawer .cbt-pal-grid{grid-template-columns:repeat(8,28px)}
.cbt-pal-close{display:none}
.cbt-shell.narrow .cbt-pal.as-drawer .cbt-pal-close{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;font-size:12px;line-height:1;border-radius:4px;flex:0 0 auto}
.cbt-shell.narrow .cbt-qbody{padding:16px 16px 20px}
.cbt-shell.narrow .cbt-head{padding:0 12px;gap:8px}
.cbt-shell.narrow .cbt-head-title{flex:1 1 auto}
.cbt-shell.narrow .cbt-actions{padding:12px 16px}
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
const icon = name => jsx('i', { key: name, className: `codicon codicon-${name}`, 'aria-hidden': 'true' })

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
// sliver; show a placeholder with the alt text so the question still makes sense.
function MediaFigure({ src, alt, caption }) {
  const [failed, setFailed] = useState(false)
  return jsxs('figure', { className: 'media-fig', children: [
    failed
      ? jsxs('div', { className: 'media-missing', children: [
          jsx('i', { className: 'codicon codicon-file-media', 'aria-hidden': 'true' }),
          jsx('span', { children: alt ? `Figure unavailable — ${alt}` : 'Figure unavailable' }),
        ] })
      : jsx('img', { src, alt: alt || '', loading: 'lazy', onError: () => setFailed(true) }),
    caption ? jsx('figcaption', { children: caption }) : null,
  ] })
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
      jsxs('span', { key: label, className: 'item', title: hint, children: [
        jsx('span', { className: `sw ${cls}` }),
        jsx('span', { className: 'lbl', children: label }),
        counts ? jsx('span', { className: 'n', children: counts[i] }) : null,
      ] })),
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

// The app drops its ENTIRE titlebar cluster on a plugin page when any plugin
// claims the titlebar band (`pageOwnsTitlebar` in the app's titlebar-controls),
// which takes the sidebar toggle with it. The in-page twin below only exists for
// that case — when the real toggle IS on screen a second one just shoves the
// heading out of line, so measure instead of assuming.
function appTitlebarTogglePresent() {
  const left = document.querySelector('[data-titlebar-cluster="left"]')
  if (!left) return false
  const box = left.getBoundingClientRect()
  // present AND on screen: a cluster the app rendered but hid is just as gone
  return box.width > 0 && box.height > 0 && Boolean(left.querySelector('button'))
}

function useAppTitlebarToggle() {
  const [present, setPresent] = useState(true)     // assume present until measured
  useEffect(() => {
    let raf = 0
    const check = () => { raf = 0; setPresent(appTitlebarTogglePresent()) }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(check) }
    check()
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return present
}

function SidebarButton() {
  const appHasToggle = useAppTitlebarToggle()
  if (!ctxRunAction || appHasToggle) return null
  return jsx('button', {
    type: 'button',
    className: 'cbt-icon-btn',
    title: 'Show / hide the sidebar (Ctrl+B)',
    'aria-label': 'Show or hide the sidebar',
    onClick: () => { void ctxRunAction('view.toggleSidebar') },
    // the app's own titlebar glyph (20px codicon set is loaded app-wide), so the
    // stand-in is indistinguishable from the button it replaces
    children: jsx('i', { className: 'codicon codicon-layout-sidebar-left', 'aria-hidden': 'true' }),
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
  return jsx('strong', {
    className: `timer${urgency}`,
    'aria-live': 'off',
    title: done ? 'Time is up — submitting the paper' : 'Time left in this attempt',
    children: done ? (compact ? 'Time up' : 'Time up — submitting…') : (compact ? fmtHMS(shown) : `Remaining Time: ${fmtHMS(shown)}`),
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
function ErrorBox({ what, onRetry }) {
  return jsxs('div', { className: 'row', children: [
    jsx('span', { className: 'badge err', children: `${what} failed` }),
    jsx('span', { className: 'muted', children: 'The plugin backend did not answer — is cbt-exam enabled and the gateway up?' }),
    onRetry ? jsx('button', { type: 'button', onClick: onRetry, children: 'Retry' }) : null,
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
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('div', { className: 'row head', children: [
      jsx(SidebarButton, {}),
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
        jsx('td', { children: marksLabel(s, pack.pattern) }),
      ] })) }) ] }),
    jsx('h3', { children: 'How the paper works' }),
    jsx('ul', { className: 'list', children: [
      'Select an answer, then Save to stay or Save & Next to move on. Leaving a question without saving keeps the pick on screen but does not record it.',
      'Only answers are evaluated — marking a question for review without answering it does not score.',
      'The palette shows each question’s state; click a number to jump there.',
      `The timer starts when you begin and runs ${hours ? hours + ' h ' : ''}${mins} min. At zero the paper submits itself.`,
      mode === 'assisted'
        ? 'The paper opens in a pane beside your chat, so you can ask doubts while you work.'
        : 'Full page, nothing else competing for the screen. Start an assisted attempt instead if you want the chat beside the paper.',
    ].map((t, i) => jsx('li', { key: i, children: t })) }),
    jsx('div', { className: 'row', style: { marginTop: 24 }, children: [
      jsx('button', { type: 'button', className: 'primary', disabled: starting, onClick: begin, children: starting ? 'Starting…' : 'I am ready to begin' }),
      jsx('button', { type: 'button', disabled: starting, onClick: onBack, children: 'Back' }),
    ] }),
    jsx('div', { className: 'muted', style: { marginTop: 8, fontSize: 12 }, children: [
      'Keys inside the paper: ',
      jsx('span', { className: 'kbd', children: '1–9' }), ' answer · ',
      jsx('span', { className: 'kbd', children: '←/→' }), ' move · ',
      jsx('span', { className: 'kbd', children: 'S' }), ' save · ',
      jsx('span', { className: 'kbd', children: 'M' }), ' mark · ',
      jsx('span', { className: 'kbd', children: 'Enter' }), ' save & next · ',
      jsx('span', { className: 'kbd', children: 'Esc' }), ' close paper',
    ] }),
  ] })
}

// One paper, its numbers, and its own attempt history. History is scoped to the
// paper because a flat list of every attempt ever made stops being readable the
// moment a second paper arrives.
function ExamCard({ pack, attempts, onStart, onResume, onViewResult }) {
  const qc = useQueryClient()
  const live = attempts.filter(a => a.status === 'in_progress')
  const [open, setOpen] = useState(live.length > 0)
  const [showAll, setShowAll] = useState(false)
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showWarn, setShowWarn] = useState(false)

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

  const del = async id => {
    setBusy(true)
    try {
      await rest(`/attempts/${id}`, { method: 'DELETE' })
      setConfirmDel(null)
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
    } catch (e) { host.notifyError?.(`Delete failed: ${e?.message || e}`) }
    setBusy(false)
  }
  const clearDiscarded = async () => {
    setBusy(true)
    try {
      await rest('/attempts/prune', { method: 'POST', body: { exam_id: pack.exam_id } })
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
    } catch (e) { host.notifyError?.(`Clear failed: ${e?.message || e}`) }
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

  return jsxs('section', { className: 'card', children: [
    jsxs('div', { className: 'card-head', children: [
      jsxs('div', { style: { minWidth: 0 }, children: [
        jsxs('div', { className: 'row', children: [
          jsx('h3', { style: { margin: 0 }, children: pack.title || pack.exam_id }),
          pack.invalid ? jsx('span', { className: 'badge err', children: 'invalid' }) : null,
          pack.warnings?.length
            ? jsx('button', {
                type: 'button', className: 'badge err',
                'aria-expanded': showWarn,
                title: showWarn ? 'Hide the warnings' : 'Show what was flagged',
                onClick: () => setShowWarn(v => !v),
                children: `${pack.warnings.length} warning${pack.warnings.length === 1 ? '' : 's'}`,
              })
            : null,
        ] }),
        jsx('div', { className: 'muted', children: pack.invalid
          ? String(pack.invalid).replace(/^invalid pack:\s*/, '')
          : meta }),
        pack.provenance && !pack.invalid ? jsx('div', { className: 'muted', style: { fontSize: 12 }, children: pack.provenance }) : null,
        // open warnings push the card down instead of reflowing the title row
        showWarn && pack.warnings?.length
          ? jsx('ul', { className: 'list warn-list', children: pack.warnings.slice(0, 12).map((w, i) => jsx('li', { key: i, children: w })) })
          : null,
        attempts.length
          ? jsxs('div', { className: 'row stat', children: [
              jsx('span', { children: `${attempts.length} attempt${attempts.length === 1 ? '' : 's'}` }),
              discarded ? jsx('span', { children: `${discarded} discarded` }) : null,
              best != null ? jsx('span', { children: `best score ${fmtScore(best)}` }) : null,
              last ? jsx('span', { children: `last ${relTime(last)}` }) : null,
              live.length ? jsx('span', { className: 'badge fill', children: 'live now' }) : null,
            ] })
          : null,
      ] }),
      jsx('div', { className: 'card-actions', children: pack.invalid ? null : jsxs('span', { className: 'row', children: [
        live.length
          ? jsx('button', { type: 'button', className: 'primary', onClick: () => onResume(live[0].id, live[0].mode), children: 'Resume' })
          : null,
        jsx('button', {
          type: 'button', className: live.length ? '' : 'primary',
          title: 'Side pane beside the chat — ask doubts while you answer',
          onClick: () => onStart(pack, 'assisted'), children: 'Start assisted',
        }),
        jsx('button', {
          type: 'button', title: 'Full page, no chat, no hints',
          onClick: () => onStart(pack, 'exam'), children: 'Start exam',
        }),
      ] }) }),
    ] }),
    attempts.length
      ? jsxs('div', { className: 'card-body', children: [
          jsxs('div', { className: 'row', style: { marginBottom: 8 }, children: [
            jsx('button', {
              type: 'button', className: 'ghost', 'aria-expanded': open,
              onClick: () => setOpen(v => !v),
              children: open ? '▾ Hide history' : `▸ History · ${ordered.length}`,
            }),
            jsx('span', { style: { flex: 1 } }),
            discarded
              ? jsx('button', {
                  type: 'button', className: 'ghost',
                  onClick: () => setShowDiscarded(v => !v),
                  children: showDiscarded ? 'Hide discarded' : `Show ${discarded} discarded`,
                })
              : null,
            discarded && showDiscarded
              ? jsx('button', { type: 'button', className: 'ghost', disabled: busy, title: 'Delete every discarded attempt of this paper', onClick: () => void clearDiscarded(), children: 'Clear discarded' })
              : null,
          ] }),
          open ? jsxs('table', { children: [
            jsx('thead', { children: jsx('tr', { children: ['Mode', 'Status', 'Score', 'When', ''].map(h => jsx('th', { key: h, children: h })) }) }),
            jsx('tbody', { children: shown.map(a => jsxs('tr', { key: a.id, children: [
              jsx('td', { children: jsx('span', { className: `badge ${a.mode === 'assisted' ? 'assisted' : ''}`, children: MODE_LABEL[a.mode] || a.mode }) }),
              jsx('td', { children: jsx('span', { className: `badge ${a.status === 'in_progress' ? 'fill' : STATUS_CLS[a.status] || 'mut'}`, children: STATUS_LABEL[a.status] || a.status }) }),
              jsx('td', { className: a.score == null ? 'muted num' : 'num', title: a.score == null ? 'not scored' : `score ${fmtScore(a.score)}`, children: fmtScore(a.score) }),
              jsx('td', { className: 'muted', title: fmtWhen(a.submitted_at || a.started_at), children: relTime(a.submitted_at || a.started_at) }),
              jsx('td', { children: confirmDel === a.id
                ? jsxs('span', { className: 'row', children: [
                    jsx('span', { className: 'muted', children: 'Delete this attempt?' }),
                    jsx('button', { type: 'button', disabled: busy, onClick: () => void del(a.id), children: busy ? 'Deleting…' : 'Delete' }),
                    jsx('button', { type: 'button', disabled: busy, onClick: () => setConfirmDel(null), children: 'Cancel' }),
                  ] })
                : jsxs('span', { className: 'row', children: [
                    a.status === 'in_progress'
                      ? jsx('button', { type: 'button', className: 'primary', onClick: () => onResume(a.id, a.mode), children: 'Resume' })
                      : a.status === 'abandoned'
                        ? jsx('button', { type: 'button', title: 'This attempt was thrown away — nothing was graded', onClick: () => onViewResult(a.id), children: 'Details' })
                        : jsx('button', { type: 'button', onClick: () => onViewResult(a.id), children: 'Result' }),
                    jsx('button', { type: 'button', className: 'ghost danger', title: 'Delete this attempt permanently', onClick: () => setConfirmDel(a.id), children: 'Delete' }),
                  ] }) }),
            ] })) }),
            hidden > 0
              ? jsx('caption', { style: { captionSide: 'bottom', textAlign: 'left' }, children: jsx('button', {
                  type: 'button', className: 'ghost', onClick: () => setShowAll(true),
                  children: `Show ${hidden} more`,
                }) })
              : null,
          ] }) : null,
        ] })
      : jsx('div', { className: 'muted', style: { marginTop: 8 }, children: 'No attempts yet.' }),
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
  const source = async () => {
    // Sourcing is an agent job, not a form: hand the user a prompt with the two
    // blanks to fill and let the skill do the fetching, validation and filing.
    await goToChatAndStage('Load the skill cbt-exam:pyq-sourcing and source <EXAM NAME> <YEAR> previous-year questions into the CBT plugin.')
  }
  const packList = packs.data?.packs || []
  const all = hist.data?.attempts || []
  const liveCount = all.filter(a => a.status === 'in_progress').length
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('div', { className: 'row head', children: [
      jsx(SidebarButton, {}),
      jsx('h2', { children: 'CBT Exams' }),
      jsx('span', { className: 'muted', children: liveCount ? `${liveCount} attempt${liveCount === 1 ? '' : 's'} running` : 'exam-agnostic practice — any CBT, pattern is data' }),
      jsx('span', { style: { flex: 1 } }),
      jsx('button', { type: 'button', onClick: () => { packs.refetch(); hist.refetch() }, children: 'Refresh' }),
      jsx('button', { type: 'button', title: 'Opens a chat prompt for the agent — fill in the exam and year, it fetches, checks and files the paper', onClick: source, children: 'Source more papers' }),
    ] }),
    packs.isLoading
      ? jsx('div', { className: 'muted', children: 'loading packs…' })
      : packs.isError
        ? jsx(ErrorBox, { what: 'Loading packs', onRetry: () => packs.refetch() })
        : (packList.length === 0
          ? jsxs('div', { children: [
              jsx('p', { className: 'muted', children: 'No papers yet. Ask the agent to source a previous-year paper — it files itself here once validated.' }),
              jsx('button', { type: 'button', onClick: source, children: 'Source a paper' }),
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
  return jsx('div', {
    className: 'dlg', role: 'presentation', onClick: onCancel,
    children: jsxs('div', {
      className: 'dlg-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Submit the paper',
      onClick: e => e.stopPropagation(),
      children: [
        jsxs('div', { className: 'modal-head', children: [
          jsx('strong', { children: 'Submit the paper?' }),
          jsx('span', { className: 'muted', style: { fontSize: 12 }, children: 'this cannot be undone' }),
          jsx('span', { style: { flex: 1 } }),
          jsx('span', { className: 'kbd', children: 'Esc' }),
          jsx('button', {
            type: 'button', className: 'icon-btn', title: 'Close without submitting',
            'aria-label': 'Close without submitting', onClick: onCancel,
            children: icon('close'),
          }),
        ] }),
        jsxs('div', { className: 'dlg-body', children: [
        jsxs('div', { className: 'row', style: { marginBottom: 14 }, children: [
          jsx('span', { className: 'badge', children: `${totals.total} questions` }),
          jsx('span', { className: 'badge ok', children: `${totals.answered} answered` }),
          totals.marked
            ? jsx('span', { className: 'badge acc', title: 'Flagged for review — a flagged question can also be answered', children: `${totals.marked} marked` })
            : null,
          totals.blank ? jsx('span', { className: 'badge err', children: `${totals.blank} unanswered` }) : null,
        ] }),
        jsxs('table', { children: [
          jsx('thead', { children: jsx('tr', { children: [
            jsx('th', { children: 'Section' }),
            jsx('th', { className: 'num', children: 'Answered' }),
            jsx('th', { className: 'num', title: 'Flagged for review — can also be answered, so it does not add up with the other columns', children: 'Marked' }),
            jsx('th', { className: 'num', title: 'Visited but no answer saved', children: 'Blank' }),
            jsx('th', { className: 'num', title: 'Never opened', children: 'Not visited' }),
          ] }) }),
          jsx('tbody', { children: stats.map(x => jsxs('tr', { key: x.id, children: [
            jsx('td', { children: [x.title, x.limit ? jsx('span', { className: 'muted', children: ` · first ${x.limit} count` }) : null] }),
            jsx('td', { className: 'num', children: String(x.answered + x.answered_marked) }),
            jsx('td', { className: 'num', children: String(x.marked + x.answered_marked) }),
            jsx('td', { className: 'num', children: String(x.not_answered) }),
            jsx('td', { className: 'num', children: String(x.not_visited) }),
          ] })) }),
        ] }),
        jsx('p', { className: 'muted', style: { marginTop: 12, marginBottom: 0 }, children: unanswered
          ? `${unanswered} unanswered (blank + not visited) will score 0 — a blank never carries a negative mark.`
          : 'Every question has an answer saved.' }),
        jsxs('div', { className: 'row', style: { marginTop: 20 }, children: [
          jsx('button', { type: 'button', className: 'primary', disabled: submitting, onClick: onSubmit, children: [icon('check'), submitting ? 'Submitting…' : 'Submit paper'] }),
          jsx('button', { type: 'button', disabled: submitting, autoFocus: true, onClick: onCancel, children: 'Keep answering' }),
          jsx('span', { style: { flex: 1 } }),
          jsx('button', { type: 'button', className: 'danger', disabled: submitting, title: 'Throw this attempt away — it is not graded', onClick: onDiscard, children: [icon('trash'), 'Discard'] }),
        ] }),
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
  if (q.isLoading) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'loading…' }) })
  if (q.isError) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'could not load attempt' }) })
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
  return jsxs('div', { ref: rootRef, className: `cbt cbt-shell${palCollapsed ? ' pal-collapsed' : ''}${isNarrow ? ' narrow' : ''}`, children: [
    jsx(ExamKeys, { enabled: true, onKeyDown: onKey }),
    jsxs('div', { className: 'cbt-head', style: { gridArea: 'head' }, children: [
      inPane ? null : jsx(SidebarButton, {}),
      jsx('strong', { className: 'cbt-head-title', title: pack.title || pack.exam_id, children: pack.title || pack.exam_id }),
      isNarrow ? null : jsx('span', { className: `badge ${attempt.mode === 'assisted' ? 'assisted' : ''}`, children: attempt.mode === 'assisted' ? 'Assisted' : 'Exam' }),
      jsx('span', { style: { flex: 1 } }),
      isNarrow
        ? jsx('button', { type: 'button', className: 'icon-btn', title: 'Question paper', 'aria-label': 'Question paper', onClick: () => setShowPaper(v => !v), children: jsx('i', { className: 'codicon codicon-book', 'aria-hidden': 'true' }) })
        : jsx('button', { type: 'button', onClick: () => setShowPaper(v => !v), children: 'Question Paper' }),
      // The terminal action belongs in the persistent chrome: it used to sit in the
      // question map, so folding the map took submitting away with it.
      jsx('button', {
        type: 'button', className: 'submit-head',
        disabled: submitting || confirming,
        'aria-label': 'Submit the paper',
        title: confirming ? 'Confirmation is open below' : 'Review the counts, then submit the paper',
        onClick: () => { setConfirming(true); setPalCollapsed(true) },
        children: [icon('check'), 'Submit'],
      }),
      jsx(Countdown, { left: serverLeft, compact: isNarrow, onExpire: () => { void doSubmit() } }),
      // the panel toggle is the last thing in the header — it governs the panel on
      // the right, so it sits on the right of everything else
      jsx('button', {
        type: 'button', className: 'icon-btn',
        'aria-expanded': !palCollapsed,
        title: palCollapsed ? 'Show the question map' : 'Hide the question map',
        onClick: () => setPalCollapsed(v => !v),
        children: jsx('i', { className: 'codicon codicon-layout-sidebar-right', 'aria-hidden': 'true' }),
      }),
    ] }),
    jsx('div', { className: 'cbt-tabs', style: { gridArea: 'tabs' }, children: sections.map(s => {
      const qs = secQs(s.id)
      const done = qs.filter(x => {
        const v = answered[x.id]
        return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
      }).length
      return jsx('button', {
        key: s.id, type: 'button', className: s.id === activeSecId ? 'on' : '',
        title: `${s.title}: ${done} of ${qs.length} answered`,
        onClick: () => jumpSection(s.id),
        children: `${s.title} · ${done}/${qs.length}`,
      })
    }) }),
    jsx('div', { className: 'cbt-qbody', style: { gridArea: 'body' }, children: [
      jsxs('div', { className: 'row', style: { gap: 10, marginBottom: 12 }, children: [
        jsx('span', { className: 'muted', children: `Question ${qIndex} of ${pack.questions.length} · ${QTYPE_LABEL[cur.type] || cur.type}` }),
        cur.type !== 'nat'
          ? jsx('span', { className: 'muted', children: `+${cur.marks_correct ?? secMeta.marks_correct} / ${cur.marks_wrong ?? secMeta.marks_wrong}` })
          : null,
        marked.includes(curIdResolved) ? jsx('span', { className: 'badge acc', children: 'Marked' }) : null,
        jsx('span', { className: `badge ${curAnswered ? 'ok' : 'mut'}`, children: curAnswered ? 'Answered' : 'Not answered' }),
      ] }),
      jsx('p', { style: { fontSize: 16, marginTop: 0, marginBottom: 16 }, children: cur.text }),
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
              jsx('button', {
                type: 'button', className: 'icon-btn',
                title: 'Hide the question map',
                'aria-label': 'Hide the question map',
                onClick: () => setPalCollapsed(true),
                children: jsx('i', { className: 'codicon codicon-close', 'aria-hidden': 'true' }),
              }),
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
                  title: `Question ${i + 1}`,
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
    jsx('div', { className: 'cbt-actions', style: { gridArea: 'act' }, children: [
      // Three groups, in the order you use them: answer · review · navigate.
      jsxs('span', { key: 'g-answer', className: 'act-group', children: [
        jsx('button', { key: 'sv', type: 'button', onClick: () => void act('saveStay'), title: 'Save the answer and stay (S)', children: [icon('save'), 'Save'] }),
        jsx('button', { key: 'sn', type: 'button', className: 'primary', onClick: () => void act('saveNext'), title: 'Save and move to the next question (Enter)', children: [icon('save'), 'Save & Next'] }),
      ] }),
      jsxs('span', { key: 'g-review', className: 'act-group', children: [
        jsx('button', {
          key: 'sm', type: 'button', className: marked.includes(curIdResolved) ? 'on' : '', style: { minWidth: 96 },
          title: 'Flag this question for review — stays here (M)',
          onClick: () => void act('saveMark'),
          children: [icon('bookmark'), marked.includes(curIdResolved) ? 'Unmark' : 'Mark'],
        }),
        jsx('button', {
          key: 'mn', type: 'button', style: { minWidth: 150 },
          title: 'Flag for review and move on',
          onClick: () => void act('markNext'),
          children: [icon('bookmark'), marked.includes(curIdResolved) ? 'Unmark & Next' : 'Mark & Next'],
        }),
        jsx('button', { key: 'cr', type: 'button', className: 'clear', onClick: () => void act('clear'), title: 'Remove the saved answer for this question', children: [icon('discard'), 'Clear'] }),
      ] }),
      // fixed-width slot: the indicator appearing must not shift the nav group
      jsx('span', {
        key: 'ss', className: 'save-slot', role: 'status',
        children: saveState
          ? jsx('span', {
              className: `save-state${saveState === 'saved' ? ' ok' : saveState === 'err' ? ' err' : ''}`,
              children: saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Not saved — retry',
            })
          : null,
      }),
      // nav pair travels as one unit and sits at the far right
      jsxs('span', { key: 'nav', className: 'act-group nav', children: [
        jsx('button', { key: 'bk', type: 'button', onClick: () => void act('back'), title: 'Previous question (←)', children: [icon('chevron-left'), 'Back'] }),
        jsx('button', { key: 'nx', type: 'button', onClick: () => void act('next'), title: 'Next question (→)', children: ['Next', icon('chevron-right')] }),
      ] }),
    ] }),
    confirming && jsx(SubmitDialog, {
      stats: submitStats, unanswered: unansweredTotal, submitting,
      onCancel: () => setConfirming(false),
      onSubmit: () => void doSubmit(),
      onDiscard: () => void doDiscard(),
    }),
    showPaper && jsxs('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
      onClick: () => setShowPaper(false),
      role: 'presentation',
      children: [jsx('div', {
        role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Question paper',
        style: { background: 'var(--ui-surface-background)', color: 'var(--ui-text-primary)', maxWidth: 760, width: '90%', maxHeight: '80%', overflow: 'auto', borderRadius: 8, padding: 20 },
        onClick: e => e.stopPropagation(),
        children: [
          jsx('div', { className: 'row modal-head', children: [
            jsx('strong', { children: pack.title || pack.exam_id }),
            jsx('span', { className: 'muted', style: { fontSize: 12 }, children: 'read-only copy' }),
            jsx('span', { style: { flex: 1 } }),
            jsx('span', { className: 'kbd', children: 'Esc' }),
            jsx('button', { type: 'button', onClick: () => setShowPaper(false), children: 'Close' }),
          ] }),
          ...sections.map(s => jsxs('div', { key: s.id, children: [
            jsx('h3', { children: s.title }),
            ...secQs(s.id).map((x, i) => jsxs('div', { key: x.id, style: { margin: '8px 0' }, children: [
              jsx('p', { style: { margin: 0, fontSize: 13 }, children: [jsx('strong', { children: `${i + 1}. ` }), x.text] }),
              mediaNode(x.media, pack.exam_id, `paper-${x.id}`),
            ] })),
          ] })),
        ],
      })],
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
  if (q.isLoading) return jsx('div', { className: 'cbt pad', children: jsx('div', { className: 'muted', children: 'loading…' }) })
  if (q.isError) return jsx('div', { className: 'cbt pad', children: jsx(ErrorBox, { what: 'Loading result', onRetry: () => q.refetch() }) })
  if (!q.data) return jsx('div', { className: 'cbt pad', children: jsx(ErrorBox, { what: 'Loading result', onRetry: () => q.refetch() }) })
  const { attempt, pack } = q.data
  if (attempt.status !== 'submitted' || !attempt.result) {
    const why = attempt.status === 'abandoned'
      ? 'This attempt was discarded — it was never graded and its answer key is not shown.'
      : 'This attempt is still in progress — resume it to finish.'
    return jsxs('div', { className: 'cbt pad', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('p', { className: 'muted', children: why }),
      jsx('button', { type: 'button', onClick: () => onHome(), children: 'Back to home' }),
    ] })
  }
  const r = attempt.result
  const qmap = Object.fromEntries(pack.questions.map(x => [x.id, x]))
  const rows = r.questions.filter(row => filter === 'all' || row.verdict === filter)
  const total = (r.totals.correct || 0) + (r.totals.wrong || 0) + (r.totals.skipped || 0) + (r.totals.not_counted || 0)
  const pct = total ? Math.round((1000 * (r.totals.correct || 0)) / total) / 10 : 0
  return jsxs('div', { className: 'cbt pad', children: [
    jsx('div', { className: 'row head', children: [
      jsx(SidebarButton, {}),
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx('span', { className: `badge ${attempt.mode === 'assisted' ? 'assisted' : ''}`, children: MODE_LABEL[attempt.mode] || attempt.mode }),
      jsx('span', { className: 'muted', title: fmtWhen(attempt.submitted_at), children: `submitted ${relTime(attempt.submitted_at)}` }),
      jsx('span', { style: { flex: 1 } }),
      onRetake ? jsx('button', { type: 'button', className: 'primary', title: `New ${MODE_LABEL[attempt.mode] || attempt.mode} attempt on this paper`, onClick: () => onRetake(pack, attempt.mode), children: 'Retake' }) : null,
      jsx('button', { type: 'button', onClick: () => onHome(), children: 'All exams' }),
    ] }),
    jsx('div', { className: 'muted', style: { fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', marginTop: 8 }, children: 'Score' }),
    jsx('div', { className: `score${r.score > 0 ? ' pos' : r.score < 0 ? ' neg' : ''}`, children: fmtScore(r.score) }),
    jsxs('div', { className: 'row sub', children: [
      jsx('span', { className: 'muted', children: `${r.totals.correct} of ${total} correct · ${pct}%` }),
      (() => {
        // marking can be set on the pattern or overridden per section; show the one
        // that actually applied to this paper
        const w = pack.pattern?.marks_wrong ?? pack.pattern?.sections?.[0]?.marks_wrong
        return w < 0 ? jsx('span', { className: 'muted', children: `· ${w} per wrong answer` }) : null
      })(),
      jsx('span', { style: { flex: 1 } }),
      ['correct', 'wrong', 'skipped', 'not_counted'].map(k =>
        jsxs('span', { key: k, className: `badge ${VERDICT_CLS[k]}`, title: VERDICT_LABEL[k], children: [`${VERDICT_LABEL[k]} `, jsx('strong', { children: String(r.totals[k]) })] })),
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
      ? jsx('div', { className: 'row muted', children: [
          jsx('i', { className: 'codicon codicon-loading codicon-modifier-spin', 'aria-hidden': 'true' }),
          'Analysing your attempt — this calls the model once and takes a few seconds.',
        ] })
      : evalError
        ? jsxs('div', { children: [
            jsxs('div', { className: 'row', children: [
              jsx('span', { className: 'badge err', children: 'AI evaluation failed' }),
              jsx('button', { type: 'button', onClick: () => void runEval(false), children: 'Retry' }),
              jsx('button', { type: 'button', onClick: discuss, children: 'Discuss with the agent instead' }),
            ] }),
            jsxs('details', { style: { marginTop: 8 }, children: [
              jsx('summary', { className: 'muted', style: { cursor: 'pointer', fontSize: 12 }, children: 'What the model said' }),
              jsx('pre', { className: 'muted', style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11.5, margin: '6px 0 0' }, children: evalError }),
            ] }),
          ] })
        : attempt.evaluation
          ? jsxs('div', { children: [
              evaluationCard(attempt.evaluation.data),
              jsxs('div', { className: 'row', style: { marginTop: 12 }, children: [
                jsx('span', { className: 'muted', children: `via ${attempt.evaluation.provider || '?'}/${attempt.evaluation.model || '?'} · ${fmtWhen(attempt.evaluation.generated_at)}` }),
                jsx('span', { style: { flex: 1 } }),
                jsx('button', { type: 'button', disabled: evalBusy, onClick: () => void runEval(true), children: 'Re-analyse' }),
                jsx('button', { type: 'button', onClick: discuss, children: 'Discuss in chat' }),
              ] }),
            ] })
          : jsxs('div', { className: 'row', children: [
              jsx('span', { className: 'muted', children: 'No evaluation yet.' }),
              jsx('button', { type: 'button', onClick: () => void runEval(false), children: 'Analyse this attempt' }),
              jsx('button', { type: 'button', onClick: discuss, children: 'Discuss in chat' }),
            ] }),
    jsxs('div', { className: 'row', style: { marginTop: 24 }, children: [
      jsx('h3', { style: { margin: 0 }, children: 'Review' }),
      jsx('span', { className: 'muted', children: `${rows.length} shown` }),
      jsx('span', { style: { flex: 1 } }),
      jsx('div', { className: 'seg', children: [['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Skipped'], ['not_counted', 'Not counted']].map(([f, label]) =>
        jsx('button', {
          key: f, type: 'button', className: filter === f ? 'on' : '', 'aria-pressed': filter === f,
          onClick: () => setFilter(f),
          children: f === 'all' ? `${label} ${r.questions.length}` : `${label} ${r.totals[f] ?? 0}`,
        })) }),
    ] }),
    jsx('div', { style: { marginTop: 8 }, children: rows.map(row => {
      const qq = qmap[row.id]
      const expanded = open === row.id
      const isMarked = (attempt.marked || []).includes(row.id)
      const skipped = row.verdict === 'skipped'
      return jsxs('div', { key: row.id, className: 'review-row', children: [
        jsx('div', {
          className: 'row', role: 'button', tabIndex: 0, 'aria-expanded': expanded,
          onClick: () => setOpen(expanded ? null : row.id),
          onKeyDown: e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(expanded ? null : row.id) }
          },
          style: { cursor: 'pointer' },
          children: [
            jsx('strong', { children: row.id }),
            jsx('span', { className: `badge ${VERDICT_CLS[row.verdict]}`, children: `${VERDICT_LABEL[row.verdict]}${row.awarded ? ` (${row.awarded})` : ''}` }),
            isMarked ? jsx('span', { className: 'badge acc', children: 'Marked' }) : null,
            jsx('span', { className: 'muted', children: `${row.type.toUpperCase()} · ${row.topic || ''}` }),
            jsx('span', { style: { flex: 1 } }),
            jsx('span', { className: 'muted', children: expanded ? '▾' : '▸' }),
          ],
        }),
        expanded && jsxs('div', { style: { marginTop: 4, marginBottom: 12, maxWidth: 820 }, children: [
          jsx('p', { children: qq.text }),
          mediaNode(qq.media, pack.exam_id, `rev-${row.id}`),
          (qq.options || []).map((o, i) => jsxs('div', { key: i, className: 'muted', children: [
            `${String.fromCharCode(65 + i)}) ${o}`,
            qq.option_media?.[i] ? mediaNode(qq.option_media[i], pack.exam_id, `rev-${row.id}-o${i}`) : null,
          ] })),
          jsxs('div', { className: 'ans', style: { marginTop: 8 }, children: [
            jsx('span', { className: 'k', children: 'Your answer' }),
            jsx('span', {
              className: skipped ? 'muted' : row.verdict === 'correct' ? 'hit' : 'miss',
              children: skipped ? 'not answered' : fmtAns(qq, attempt.answers[row.id]),
            }),
          ] }),
          jsxs('div', { className: 'ans', children: [
            jsx('span', { className: 'k', children: 'Correct answer' }),
            jsx('span', { className: 'hit', children: fmtAns(qq, qq.answer) }),
          ] }),
          qq.explanation ? jsx('p', { className: 'muted', style: { marginTop: 8 }, children: qq.explanation }) : null,
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
