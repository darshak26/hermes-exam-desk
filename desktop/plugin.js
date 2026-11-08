// exam-desk — exam-agnostic CBT practice panel (route /exam-desk)
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
.cbt-dlg tbody tr:last-child td{border-bottom:0}
.cbt-dlg .num{text-align:right;font-variant-numeric:tabular-nums;width:86px}
/* submit-dialog section counts — Section | Answered | Marked | Blank | Not visited */
.cbt-dlg .cbt-stats th:nth-child(n+2),.cbt-dlg .cbt-stats td:nth-child(n+2){width:88px}
.cbt-dlg .cbt-paper-q{margin:8px 0}
.cbt-dlg .cbt-paper-q p{font-size:13px;margin:0}

/* tables: ONE spec for the whole plugin — one left edge, right gutter only, tabular
   figures, a header that sits over its own column. Every table declares its grid so
   a header never drifts and a value never lands under the next label. */
.cbt table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.cbt th,.cbt td{text-align:left;padding:8px 16px 8px 0;border-bottom:1px solid var(--ui-stroke-secondary);font-size:12.5px;vertical-align:middle}
.cbt th{font-size:11.5px;font-weight:600;color:var(--ui-text-secondary);padding-top:0}
.cbt th:last-child,.cbt td:last-child{padding-right:0}
.cbt tbody tr:last-child td{border-bottom:0}
.cbt .num{text-align:right;font-variant-numeric:tabular-nums}
.cbt .right{text-align:right}
.cbt .right .cbt-row{justify-content:flex-end;flex-wrap:nowrap;gap:6px}
.cbt .cbt-caption{caption-side:bottom;text-align:left;padding-top:8px}
/* attempt history — Mode | Status | Score | When | actions (530px content-sized to prevent 620px gap to actions) */
.cbt .cbt-hist{table-layout:fixed;width:auto;min-width:530px}
.cbt .cbt-hist th:nth-child(1),.cbt .cbt-hist td:nth-child(1){width:84px}
.cbt .cbt-hist th:nth-child(2),.cbt .cbt-hist td:nth-child(2){width:118px}
.cbt .cbt-hist th:nth-child(3),.cbt .cbt-hist td:nth-child(3){width:76px}
.cbt .cbt-hist th:nth-child(4),.cbt .cbt-hist td:nth-child(4){width:108px}
.cbt .cbt-hist th:nth-child(5),.cbt .cbt-hist td:nth-child(5){width:144px;text-align:right}
.cbt .cbt-hist tbody tr:hover{background:var(--chrome-action-hover)}
/* instructions pattern — Section | Questions | To attempt | Marks */
.cbt .cbt-pattern{table-layout:fixed;width:auto;min-width:452px}
.cbt .cbt-pattern th:nth-child(1),.cbt .cbt-pattern td:nth-child(1){width:140px}
.cbt .cbt-pattern th:nth-child(n+2),.cbt .cbt-pattern td:nth-child(n+2){width:104px}
/* result sections — Section | Score | Max | Correct | Wrong | Skipped | Not counted */
.cbt .cbt-sec{table-layout:fixed;width:auto;min-width:640px}
.cbt .cbt-sec th:nth-child(2),.cbt .cbt-sec td:nth-child(2){width:72px}
.cbt .cbt-sec th:nth-child(3),.cbt .cbt-sec td:nth-child(3){width:64px}
.cbt .cbt-sec th:nth-child(4),.cbt .cbt-sec td:nth-child(4){width:72px}
.cbt .cbt-sec th:nth-child(5),.cbt .cbt-sec td:nth-child(5){width:68px}
.cbt .cbt-sec th:nth-child(6),.cbt .cbt-sec td:nth-child(6){width:76px}
.cbt .cbt-sec th:nth-child(7),.cbt .cbt-sec td:nth-child(7){width:96px}
/* the score pair: the number, then its ceiling in a lighter weight */
.cbt .cbt-score-pair{display:flex;align-items:baseline;gap:8px}
.cbt .cbt-score-max{font-size:19px;font-weight:600;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums}
/* result page: SCORE label, then the number and the four verdict tiles on one
   centred row, then the caption — so tiles centre on the number, not the column */
.cbt .cbt-score-strip{margin-bottom:8px}
.cbt .cbt-score-row{display:flex;align-items:center;gap:40px;flex-wrap:wrap}
.cbt .cbt-score-row .cbt-score{margin:0}
.cbt .cbt-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(80px,1fr));gap:8px}
.cbt .cbt-stat{border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}
.cbt .cbt-stat .k{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ui-text-secondary);white-space:nowrap}
.cbt .cbt-stat .v{font-size:16px;line-height:1.25;font-weight:600;font-variant-numeric:tabular-nums}
.cbt .cbt-stat.correct .v{color:var(--ui-success)}
.cbt .cbt-stat.wrong .v{color:var(--ui-red)}
/* evaluation blocks reuse the how-it-works card: label row, hairline, body row.
   Prose caps at the same measure as the review body, so a long comment does not
   run the full width of a 1440px window. */
.cbt .cbt-eval{max-width:820px}
.cbt .cbt-eval-title{font-size:12px;font-weight:600;color:var(--ui-text-secondary)}
.cbt .cbt-eval-body{font-size:12.5px;line-height:1.55}
.cbt .cbt-lead-row{justify-content:space-between;gap:16px}
.cbt .cbt-plan{margin:0;padding-left:20px}
.cbt .cbt-plan li{margin:0 0 6px}
.cbt tfoot td{font-weight:600;border-top:1px solid var(--ui-stroke-secondary);border-bottom:0;padding-top:8px}
/* Result layout: centred column of rounded cards. Every block shares the measured
   column, and inside each card content sits 20px in on the same left edge. */
.cbt.cbt-result{--rg-col:820px;max-width:var(--rg-col);margin-inline:auto;display:flex;flex-direction:column;gap:16px;box-sizing:border-box}
.cbt.cbt-result > *{max-width:100%;box-sizing:border-box}
.cbt.cbt-result .cbt-card{border:1px solid var(--ui-stroke-secondary);border-radius:10px;padding:20px;margin-bottom:0;box-sizing:border-box}
.cbt.cbt-result .cbt-card .cbt-more{padding:12px 0 0;margin-top:12px}
.cbt.cbt-result .cbt-sec{width:100%;min-width:0}
.cbt .cbt-attempt-nav{display:flex;justify-content:center;align-items:center;gap:8px;margin:0}
.cbt .cbt-attempt-pill{border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:6px 14px;font-size:12px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cbt .cbt-chart-scroll{overflow-x:auto}
.cbt .cbt-chart-scroll svg rect:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px}
.cbt .cbt-tile-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.cbt .cbt-tile{border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:12px;display:flex;flex-direction:column;min-width:0;box-sizing:border-box}
.cbt .cbt-tile-k{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ui-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbt .cbt-tile-v{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.2;margin:4px 0 2px}
.cbt .cbt-tile-d{font-size:12px;color:var(--ui-text-secondary);line-height:1.35}
.cbt .cbt-topic-list{display:flex;flex-direction:column;gap:12px}
.cbt .cbt-topic-item{display:flex;flex-direction:column;gap:6px}
.cbt .cbt-topic-row{display:flex;align-items:center;gap:12px;font-size:13px}
.cbt .cbt-topic-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cbt .cbt-topic-stat{font-variant-numeric:tabular-nums;text-align:right}
.cbt .cbt-topic-ca{width:80px;flex:0 0 80px}
.cbt .cbt-topic-acc{width:60px;flex:0 0 60px}
.cbt .cbt-topic-marks{width:72px;flex:0 0 72px}
.cbt .cbt-topic-track{height:4px;background:var(--ui-stroke-secondary);border-radius:2px;overflow:hidden}
.cbt .cbt-topic-fill{height:100%;background:var(--ui-accent);border-radius:2px}
/* review pager: centred [‹] Page 1 of 2 [›] */
.cbt .cbt-pager{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid var(--ui-stroke-secondary)}
.cbt .cbt-pager .cbt-pager-n{font-size:12px;color:var(--ui-text-secondary);font-variant-numeric:tabular-nums}
/* evaluation notes: the first few, the rest behind a count — a 160-question attempt
   can carry ~94 notes, which is a screenful of prose on its own */
.cbt .cbt-more{padding:9px 12px;font-size:12px;color:var(--ui-text-secondary);border-top:1px solid var(--ui-stroke-secondary);display:flex;align-items:center;gap:8px}
.cbt .cbt-more button{font:inherit;color:var(--ui-accent);background:none;border:0;padding:0;cursor:pointer}
.cbt .cbt-more button:hover{text-decoration:underline}
/* Scrollbars: a plugin scroller is its own element, so the app's global fade does not
   reach it and Chromium draws the platform's white bar over the dark surface. Copy the
   app's treatment (apps/desktop/src/styles.css): 0.5rem, transparent track, a rounded
   thumb that fades in while the scroller is hovered. */
/* scrollbar-width and scrollbar-color inherit, and Chromium 121+ then ignores the
   ::-webkit-scrollbar rules below and draws the platform's own bar (white on Windows).
   Reset them here so the pseudo-element styling always wins. */
.cbt.cbt-page,.cbt .cbt-qbody,.cbt .cbt-pal-scroll{scrollbar-width:auto;scrollbar-color:auto}
.cbt.cbt-page::-webkit-scrollbar,.cbt .cbt-qbody::-webkit-scrollbar,.cbt .cbt-pal-scroll::-webkit-scrollbar{width:.5rem;height:.5rem}
.cbt.cbt-page::-webkit-scrollbar-track,.cbt.cbt-page::-webkit-scrollbar-corner,
.cbt .cbt-qbody::-webkit-scrollbar-track,.cbt .cbt-qbody::-webkit-scrollbar-corner,
.cbt .cbt-pal-scroll::-webkit-scrollbar-track,.cbt .cbt-pal-scroll::-webkit-scrollbar-corner{background:transparent}
.cbt.cbt-page::-webkit-scrollbar-thumb,.cbt .cbt-qbody::-webkit-scrollbar-thumb,.cbt .cbt-pal-scroll::-webkit-scrollbar-thumb{background:transparent;border:0;border-radius:9999rem;background-clip:padding-box}
.cbt.cbt-page:hover::-webkit-scrollbar-thumb,.cbt .cbt-qbody:hover::-webkit-scrollbar-thumb,.cbt .cbt-pal-scroll:hover::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dt-scrollbar-thumb,var(--ui-text-secondary)) 18%,transparent)}
.cbt.cbt-page:hover::-webkit-scrollbar-thumb:hover,.cbt .cbt-qbody:hover::-webkit-scrollbar-thumb:hover,.cbt .cbt-pal-scroll:hover::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--dt-scrollbar-thumb,var(--ui-text-secondary)) 40%,transparent)}
.cbt.cbt-page::-webkit-scrollbar-button,.cbt .cbt-qbody::-webkit-scrollbar-button,.cbt .cbt-pal-scroll::-webkit-scrollbar-button{display:none}
@supports not selector(::-webkit-scrollbar){
  .cbt.cbt-page,.cbt .cbt-qbody,.cbt .cbt-pal-scroll{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--dt-scrollbar-thumb,var(--ui-text-secondary)) 30%,transparent) transparent}
}
/* result statistics: computed from the attempt record — nothing here is model output.
   In a 1440 window with the 260px app sidebar, the left 1fr column resolves to ~388px:
   min-width: 0 and width: 100% let the table fill its column without overflow, and
   td:nth-child(2) is proportional (~52%) so sentences wrap inside the column. */
.cbt .cbt-stats{table-layout:fixed;width:100%;min-width:0}
/* the measured column carries sentences, not single tokens — left-aligned so a
   three-line value does not hang off the right edge of its cell, and one notch
   more row padding than the numeric tables: the wrapped lines meet the hairline */
.cbt .cbt-stats td:nth-child(2){width:52%;text-align:left;font-variant-numeric:tabular-nums}
.cbt .cbt-stats td{padding-top:10px;padding-bottom:10px}
/* the dialog's counts table is portalled out of the .cbt tree — its grid lives on
   .cbt-dlg (see the dialog block below), so only the page-scoped tables are here */

/* home: a paper and its history */
.cbt .cbt-card{border:1px solid var(--ui-stroke-secondary);border-radius:8px;padding:16px;margin-bottom:16px}
.cbt .cbt-card-head{display:flex;align-items:flex-start;gap:16px;justify-content:space-between}
.cbt .cbt-card-title{min-width:0;display:flex;flex-direction:column;gap:4px}
.cbt .cbt-card-title h3{margin:0;font-size:14px}
.cbt .cbt-card-actions{flex:0 0 auto}
.cbt .cbt-card-body{margin-top:12px}
.cbt .cbt-flush{margin-left:-8px}
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
/* the control is 13px against the option's live line box — .cbt-qbody renders
   option text at 15px×1.6 = 24px (measured in the running paper, not the 13px/1.5
   the .cbt root sets) — so center it on the FIRST line: (24 − 13) / 2 = 5.5px.
   A wrapped option keeps the control on line 1 */
.cbt .opt input{flex:0 0 auto;margin:5.5px 0 0}
.cbt .cbt-review-head{justify-content:flex-start;padding:8px 0;border-bottom:1px solid var(--ui-stroke-secondary);flex-wrap:nowrap;cursor:pointer}
/* one verdict width for every row: "Skipped" and "Wrong (-0.5)" must not move the
   type/topic text that follows, so the label lives in a reserved slot */
.cbt .cbt-verdict{display:inline-flex;align-items:center;justify-content:flex-start;min-width:104px}
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
/* Shell header, tabs and body share one text edge. The shell's grid area gives all
   three the same box x, so only their own padding moves text: body 20px, head 20px
   (its first control sits there), and tabs 18px because the app's SegmentedControl
   adds 2px of inner padding to the first tab. Measured, not guessed. */
.cbt-head{display:flex;align-items:center;gap:8px;padding:0 20px;min-height:44px;border-bottom:1px solid var(--ui-stroke-secondary)}
.cbt .cbt-head-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.cbt .timer{font-variant-numeric:tabular-nums;font-size:13px;font-weight:600}
.cbt .timer.low{color:var(--ui-text-warn,var(--ui-accent))}
.cbt .timer.crit{color:var(--ui-red)}
.cbt .cbt-tabs{padding:0 20px 0 18px;border-bottom:1px solid var(--ui-stroke-secondary);overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;display:flex;align-items:center}
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
.cbt .media-table th{font-size:11.5px;font-weight:600;color:var(--ui-text-secondary)}
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
const EXAM_PANE_ID = 'exam-desk:exam'
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
  host.navigate('/exam-desk')
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
    title: 'Exam Desk',
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
  return `/api/plugins/exam-desk/packs/${encodeURIComponent(examId)}/assets/${path}`
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
const SOURCE_PROMPT = 'Load the skill exam-desk:pyq-sourcing and help me add a paper. '
  + 'Ask me which exam and which year first — one question at a time — then find the '
  + 'official paper, validate it and file it.'

// One click for the deep review. The result page keeps the AI's basic analysis; the
// per-question walkthrough and the study plan live in a chat, so this opens a FRESH
// session (a review is its own conversation, never a stray reply in yesterday's chat)
// and sends the turn rather than staging a draft — a draft left in the composer was
// the old defect. Same retry window as the sourcing button: the composer mounts late.
const REVIEW_PROMPT_BASE = 'Load the skill exam-desk:attempt-review and review my finished '
  + 'CBT attempt in detail: analyse every wrong, skipped and not-counted question, '
  + 'then build the study plan. Attempt id: '
function discussPrompt(att) { return REVIEW_PROMPT_BASE + att.id + '.' }

async function launchDiscussion(att) {
  goToChat()
  await new Promise(done => setTimeout(done, 250))
  try { host.newChat?.() } catch { /* older desktop without newChat */ }
  await new Promise(done => setTimeout(done, 500))
  for (let i = 0; i < 30; i++) {
    const addr = host.state.activeSessionId.get() || 'new'
    try {
      if (host.composer.submit?.(addr, discussPrompt(att))) {
        try { await host.composer.setDraft?.(addr, '') } catch { /* nothing to clear */ }
        return true
      }
    } catch { /* composer not mounted yet */ }
    await new Promise(done => setTimeout(done, 250))
  }
  host.notify?.({ kind: 'error', message: 'Could not start the review chat — the composer never mounted.' })
  return false
}

// Send the sourcing turn straight into a chat — never through the composer draft, so
// the prompt cannot end up sitting in the input box as well as being sent. The retry
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
  await goToChatAndStage('Load the skill exam-desk:exam-assist — I am starting an assisted CBT exam (attempt '
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
      jsx('span', { className: 'cbt-sub', children: 'The plugin backend did not answer — is exam-desk enabled and the gateway up?' }),
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
      jsx('h2', { children: `Instructions — ${pack.title || pack.exam_id}` }),
      jsx(Badge, { variant: mode === 'assisted' ? 'outline' : 'muted', children: mode === 'assisted' ? 'Assisted' : 'Exam' }),
      jsx('span', { style: { flex: 1 } }),
      jsx(SidebarButton, {}),
    ] }),
    jsx(Separator, { className: 'cbt-sep' }),
    jsxs('div', { className: 'cbt-meta', children: [
      jsx(Badge, { variant: 'outline', children: duration }),
      jsx(Badge, { variant: 'outline', children: `${pack.questions.length} questions` }),
      types.map(t => jsx(Badge, { variant: 'outline', key: t, children: QTYPE_LABEL[t] || t })),
      marks ? jsx(Badge, { variant: 'outline', children: marks }) : null,
    ] }),
    jsx('div', { className: 'cbt-section', children: 'Pattern' }),
    jsxs('table', { className: 'cbt-table cbt-pattern', children: [
      jsx('thead', { children: jsx('tr', { children: ['Section', 'Questions', 'To attempt', 'Marks'].map((h, i) => jsx('th', { key: h, className: i ? 'num' : undefined, children: h })) }) }),
      jsx('tbody', { children: pack.pattern.sections.map(s => jsxs('tr', { key: s.id, children: [
        jsx('td', { children: s.title }),
        jsx('td', { className: 'num', children: String(s.question_count) }),
        jsx('td', { className: 'num', children: s.attempt_limit ? `first ${s.attempt_limit}` : 'all' }),
        jsx('td', { className: 'num', children: marksLabel(s, pack.pattern) }),
      ] })) }),
    ] }),
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
          ? jsx('div', { className: 'cbt-stat-row', children: [
              `${attempts.length} attempt${attempts.length === 1 ? '' : 's'}`,
              discarded ? `${discarded} discarded` : null,
              best != null ? `best ${fmtScore(best)}` : null,
              last ? `last ${relTime(last)}` : null,
            ].filter(Boolean).join(' · ') })
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
              className: 'cbt-flush',
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
          isOpen ? jsxs('table', { className: 'cbt-table cbt-hist', children: [
            jsx('thead', { children: jsx('tr', { children: [
              ['Mode', ''], ['Status', ''], ['Score', 'num'], ['When', 'num'], ['', 'right'],
            ].map(([h, cls]) => jsx('th', { key: h || 'actions', className: cls || undefined, children: h })) }) }),
            jsx('tbody', { children: shown.map(a => jsxs('tr', { key: a.id, children: [
              jsx('td', { children: jsx(Badge, { variant: 'outline', size: 'xs', children: MODE_LABEL[a.mode] || a.mode }) }),
              jsx('td', { children: jsx(Badge, {
                variant: a.status === 'in_progress' ? 'default' : a.status === 'submitted' ? 'muted' : 'outline',
                size: 'xs',
                children: STATUS_LABEL[a.status] || a.status,
              }) }),
              jsx('td', { className: a.score == null ? 'num muted' : 'num', children: fmtScore(a.score) }),
              jsx('td', { className: 'num muted', children: jsx(Tip, { label: fmtWhen(a.submitted_at || a.started_at), children: jsx('span', { children: relTime(a.submitted_at || a.started_at) }) }) }),
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
      jsx('h2', { children: 'Exam Desk' }),
      jsx('span', { className: 'cbt-sub cbt-inline', children: liveCount ? `${liveCount} attempt${liveCount === 1 ? '' : 's'} running` : 'exam-agnostic practice — any CBT, pattern is data' }),
      jsx('span', { style: { flex: 1 } }),
      jsx(SidebarButton, {}),
      jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => { packs.refetch(); hist.refetch() }, children: 'Refresh' }),
      jsx(Tip, { label: 'Opens a chat prompt for the agent — fill in the exam and year, it fetches, checks and files the paper', children:
        jsx(Button, { variant: 'outline', size: 'sm', onClick: source, children: 'Source more papers' }) }),
    ] }),
    jsx(Separator, { className: 'cbt-sep' }),
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
        jsxs('table', { className: 'cbt-table cbt-stats', children: [
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

// The model answers in ids ('A', 'B'); the paper owns the human titles.
function evalSectionTitle(pack, id) {
  const s = (pack?.pattern?.sections || []).find(x =>
    x.id === id || String(x.title || '').toLowerCase().startsWith(String(id).toLowerCase()))
  return s?.title || String(id)
}

const PRIORITY_VARIANT = { high: 'destructive', medium: 'warn', low: 'muted' }

function fmtFor(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
  if (s >= 60) return `${Math.round(s / 60)} min`
  return `${s} s`
}
function fmtPct(num, den) { return den ? `${Math.round((1000 * num) / den) / 10}%` : '—' }

// Statistics — every number comes off the attempt record and the pack; nothing here
// asks a model. This is the set the standard platforms report: attempts, accuracy,
// penalty paid, over-limit waste. The columns they add that this record cannot
// support (time per question on the platforms' ideal-time lines, topper/cutoff
// comparison) stay out rather than being faked.
function ResultMetrics({ attempt, pack, tl }) {
  const r = attempt.result
  const rows = r.questions || []
  const total = rows.length
  const correct = r.totals.correct ?? 0
  const wrong = r.totals.wrong ?? 0
  const skipped = r.totals.skipped ?? 0
  const attempted = correct + wrong
  const answered = attempted
  const visited = new Set(attempt.visited || [])
  const seenBlank = rows.filter(row => row.verdict === 'skipped' && visited.has(row.id)).length
  const neverSeen = rows.filter(row => row.verdict === 'skipped' && !visited.has(row.id)).length
  const lost = rows.reduce((n, row) => n + Math.min(0, Number(row.awarded) || 0), 0)
  const wall = Math.min((attempt.submitted_at ?? 0) - (attempt.started_at ?? 0),
                        attempt.duration_seconds ?? Infinity)
  const per = answered ? (wall / answered / 60).toFixed(1) : null
  const penalty = pack.pattern.sections.some(s => (s.marks_wrong ?? 0) < 0)

  const tiles = [
    { label: 'Answered', value: `${answered}/${total}`, detail: `${fmtPct(answered, total)} of the paper` },
  ]
  if (attempted > 0) {
    tiles.push({
      label: 'Accuracy',
      value: fmtPct(correct, attempted),
      detail: correct ? `${correct} right of ${attempted} attempted` : 'no right answer recorded',
    })
  }
  if (penalty && wrong > 0) {
    tiles.push({
      label: 'Penalty paid',
      value: fmtScore(lost),
      detail: `${wrong} wrong answer${wrong === 1 ? '' : 's'}`,
    })
  }

  // With the behaviour stream, dwell is real: per-question time, mind changes, doubts.
  // Without it (an attempt recorded before the stream existed) the wall clock is the
  // only truth, and the row says exactly that. Sub-second median dwell (machine-speed
  // retries, a corrupted stream) hides the row: a "median 0s" line would be noise.
  const t = (tl && tl.totals) || null
  if (t && t.events) {
    if (t.median_spent != null && t.median_spent > 0) {
      tiles.push({
        label: 'Time on question',
        value: fmtFor(t.median_spent),
        detail: `median; longest ${fmtFor(t.longest_spent)} over ${t.covered} touched`,
      })
    }
    for (const [sid, sec] of Object.entries(tl.sections || {})) {
      if (sec.dwell) {
        tiles.push({
          label: `Time in section ${sid}`,
          value: fmtFor(sec.dwell),
          detail: `across ${sec.questions} questions`,
        })
      }
    }
    if (t.changed) {
      tiles.push({
        label: 'Mind changes',
        value: String(t.changed),
        detail: 'answers changed after a first save',
      })
    }
    if (t.doubts) {
      tiles.push({
        label: 'Asked the tutor',
        value: String(t.doubts),
        detail: `asked during the sitting`,
      })
    }
  } else if (wall != null && isFinite(wall)) {
    tiles.push({
      label: 'Pace',
      value: fmtFor(wall),
      detail: `wall clock for ${answered} answer${answered === 1 ? '' : 's'}${per ? ` — ${per} min each` : ''} (per-question times are not recorded)`,
    })
  }

  if (skipped) {
    tiles.push({
      label: 'Seen but skipped',
      value: String(seenBlank),
      detail: `opened and then left blank`,
    })
  }
  tiles.push({
    label: 'Never reached',
    value: String(neverSeen),
    detail: 'questions never visited',
  })

  for (const s of pack.pattern.sections) {
    if (!s.attempt_limit) continue
    const counted = rows.filter(row => row.section === s.id && row.verdict !== 'not_counted').length
    const wasted = rows.filter(row => row.section === s.id && row.verdict === 'not_counted').length
    if (wasted) {
      tiles.push({
        label: `Over the limit (${s.id})`,
        value: String(wasted),
        detail: `beyond the first ${s.attempt_limit} — graded 0`,
      })
    } else if (counted < s.attempt_limit) {
      tiles.push({
        label: `Under the limit (${s.id})`,
        value: `${counted}/${s.attempt_limit}`,
        detail: `${s.attempt_limit - counted} allowed answers unused`,
      })
    }
  }

  return jsx('div', {
    className: 'cbt-tile-grid',
    children: tiles.map(tile => jsxs('div', {
      className: 'cbt-tile',
      key: tile.label,
      children: [
        jsx('div', { className: 'cbt-tile-k', children: tile.label }),
        jsx('div', { className: 'cbt-tile-v', children: tile.value }),
        tile.detail ? jsx('div', { className: 'cbt-tile-d', children: tile.detail }) : null,
      ],
    })),
  })
}

// Topic roll-up sorted by marks: the biggest losses to the top. A question lands
// under the topic its pack gives it; blanks count as skips there, so a topic whose
// rows are all blank shows '—' like any unmeasured metric.
function topicRoll(rows, questions) {
  const roll = new Map()
  for (const row of rows) {
    const q = questions.find(x => x.id === row.id) || {}
    const t = String(q.topic || '—')
    const cur = roll.get(t) || { q: 0, attempted: 0, correct: 0, wrong: 0, skipped: 0, awarded: 0 }
    cur.q++; cur.correct += (row.verdict === 'correct' ? 1 : 0); cur.awarded += Number(row.awarded) || 0
    if (row.verdict !== 'not_counted' && row.verdict !== 'skipped') cur.attempted++
    if (row.verdict === 'wrong') cur.wrong++
    if (row.verdict === 'skipped') cur.skipped++
    roll.set(t, cur)
  }
  return [...roll.entries()].map(([topic, cur]) => ({ topic, ...cur }))
    .sort((a, b) => a.awarded - b.awarded || b.skipped - a.skipped || a.topic.localeCompare(b.topic))
}

function ResultTopics({ attempt, pack }) {
  const [allTopics, setAllTopics] = useState(false)
  const topics = topicRoll((attempt.result || {}).questions || [], pack.questions || [])
  if (topics.length <= 1) return null                       // one topic across the paper is no roll-up
  const maxAwardedInRoll = Math.max(0, ...topics.map(t => Number(t.awarded) || 0))
  const showTopics = allTopics ? topics : topics.slice(0, 6)
  return jsxs('div', { className: 'cbt-card', children: [
    jsx('div', { className: 'cbt-section', style: { margin: '0 0 12px' }, children: 'Topics' }),
    jsx('div', { className: 'cbt-topic-list', children: showTopics.map(cur => {
      const fillPct = maxAwardedInRoll > 0 && cur.awarded > 0
        ? Math.min(100, Math.max(0, (cur.awarded / maxAwardedInRoll) * 100))
        : 0
      return jsxs('div', { key: cur.topic, className: 'cbt-topic-item', children: [
        jsxs('div', { className: 'cbt-topic-row', children: [
          jsx('span', { className: 'cbt-topic-name', title: cur.topic, children: cur.topic }),
          jsx('span', { className: 'cbt-topic-stat cbt-topic-ca', children: `${cur.correct}/${cur.attempted}` }),
          jsx('span', { className: 'cbt-topic-stat cbt-topic-acc', children: cur.attempted ? fmtPct(cur.correct, cur.attempted) : '—' }),
          jsx('span', { className: `cbt-topic-stat cbt-topic-marks${cur.awarded > 0 ? ' hit' : cur.awarded < 0 ? ' miss' : ''}`, children: fmtScore(cur.awarded) }),
        ] }),
        jsx('div', { className: 'cbt-topic-track', children:
          fillPct > 0 ? jsx('div', { className: 'cbt-topic-fill', style: { width: `${fillPct}%` } }) : null }),
      ] })
    }) }),
    topics.length > 6
      ? jsx('div', { className: 'cbt-more', children:
          jsx('button', {
            type: 'button',
            'aria-expanded': allTopics,
            onClick: () => setAllTopics(v => !v),
            children: allTopics ? 'Show fewer topics' : `Show all ${topics.length} topics`,
          }) })
      : null,
  ] })
}

// The result page carries the BASIC analysis only: overall comment, sections, weak
// topics. Per-question notes and the 2-week plan are the chat's job ("Discuss in
// chat" opens a session loaded with the attempt-review skill), and the per-question
// review rows below already carry your answer vs the key.
function EvaluationCard({ d, pack }) {
  if (!d) return null
  const sections = d.sections || []
  const topics = d.weak_topics || []
  return jsxs('div', { className: 'cbt-eval', children: [
    d.overall_comment
      ? jsxs('div', { className: 'cbt-how', children: [
          jsx('div', { className: 'cbt-how-row', children: d.overall_comment }),
        ] })
      : null,
    sections.length
      ? jsxs('div', { children: [
          jsx('div', { className: 'cbt-section', children: 'By section' }),
          jsx('div', { className: 'cbt-how', children: sections.map((s, i) =>
            jsxs('div', { className: 'cbt-how-row', key: i, children: [
              jsx('div', { className: 'cbt-eval-title', children: evalSectionTitle(pack, s.section_id) }),
              jsx('div', { className: 'cbt-eval-body', children: s.comment }),
            ] })) }),
        ] })
      : null,
    topics.length
      ? jsxs('div', { children: [
          jsx('div', { className: 'cbt-section', children: 'Weak topics' }),
          jsx('div', { className: 'cbt-how', children: topics.map((w, i) =>
            jsxs('div', { className: 'cbt-how-row cbt-lead-row', key: i, children: [
              jsx('span', { children: w.topic }),
              jsx(Badge, { size: 'xs', variant: PRIORITY_VARIANT[String(w.priority || '').toLowerCase()] || 'muted', children: w.priority }),
            ] })) }),
        ] })
      : null,
  ] })
}

// ── Bar chart: marks per attempt ─────────────────────────────────────────────
// Geometry is declared, not eyeballed: one slot per attempt, never narrower than SLOT px,
// and the slot widens with the band so a handful of attempts fills the row instead of
// huddling at the left edge. Past the point where SLOT no longer fits, the chart scrolls
// sideways rather than shrinking bars. Each value sits in one fixed row above the plot
// (not on its own bar), so a negative bar or a bar on the max line cannot collide with it.
function AttemptsChart({ seq, selectedId, onSelect }) {
  const BAR_W = 28, BAR_GAP = 12, SLOT = 40, PLOT_H = 160
  const VALUE_H = 20, BASELINE_H = 24, AXIS_W = 44
  const n = seq.length
  const scores = seq.map(a => a.score ?? 0)
  // The scale spans zero, so this paper's negative marking draws below the zero line.
  const scaleMin = Math.min(0, ...scores)
  const scaleMax = Math.max(0, ...scores)
  const range = scaleMax - scaleMin || 1
  // The band's own width, measured — bars spread over it instead of stacking left.
  const wrapRef = useRef(null)
  const [avail, setAvail] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setAvail(el.clientWidth || 0)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const plotW = Math.max(avail > AXIS_W ? avail - AXIS_W : 0, n * SLOT)
  const slotW = plotW / Math.max(1, n)
  const svgW = AXIS_W + plotW
  const svgH = VALUE_H + PLOT_H + BASELINE_H
  const yOf = v => VALUE_H + PLOT_H - ((v - scaleMin) / range) * PLOT_H
  const zeroY = yOf(0)
  const selIdx = seq.findIndex(a => a.id === selectedId)
  const ticks = []
  for (const v of [scaleMax, 0, scaleMin]) {
    const label = fmtScore(v)
    if (!ticks.some(t => t.label === label)) ticks.push({ y: yOf(v), label })
  }

  const bars = seq.map((a, i) => {
    const v = a.score ?? 0
    const isSel = a.id === selectedId
    const base = v < 0 ? 'var(--ui-red)' : 'var(--ui-accent)'
    const fill = isSel ? base : `color-mix(in srgb, ${base} 35%, transparent)`
    // A zero-scoring attempt still gets a 2px mark, or it would not be clickable.
    const h = v === 0 ? 2 : Math.abs(yOf(v) - zeroY)
    const y = v === 0 ? zeroY - 1 : Math.min(yOf(v), zeroY)
    const cx = AXIS_W + i * slotW + slotW / 2          // the slot's centre
    const x = cx - BAR_W / 2
    return jsxs('g', { key: a.id, children: [
      jsx('text', {
        // Just above the bar's own top edge: above zero for a negative bar, which is
        // where that bar starts. Never below the plot, so the label row cannot collide
        // with the attempt numbers underneath.
        x: cx, y: Math.max(12, (v >= 0 ? yOf(v) : zeroY) - 6), textAnchor: 'middle',
        style: { fontSize: '11px', fill: 'var(--ui-text-secondary)', fontVariantNumeric: 'tabular-nums', fontWeight: isSel ? 600 : 400 },
        children: fmtScore(v),
      }),
      jsx('rect', {
        x, y, width: BAR_W, height: h, rx: 2,
        style: { fill, cursor: 'pointer', stroke: isSel ? base : 'none', strokeWidth: 1 },
        role: 'button', tabIndex: 0,
        'aria-label': `Attempt ${i + 1}, ${fmtScore(v)} marks`,
        'aria-current': isSel ? 'true' : undefined,
        onClick: () => onSelect(a.id),
        onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(a.id) } },
      }),
      jsx('text', {
        x: cx, y: VALUE_H + PLOT_H + 16, textAnchor: 'middle',
        style: { fontSize: '11px', fill: 'var(--ui-text-secondary)', fontVariantNumeric: 'tabular-nums' },
        children: String(i + 1),
      }),
    ] })
  })

  return jsxs('div', { className: 'cbt-card', children: [
    jsxs('div', { style: { marginBottom: 12 }, children: [
      jsx('div', { className: 'cbt-section', style: { margin: 0 }, children: 'Marks per attempt' }),
      jsx('div', { className: 'cbt-sub', style: { marginTop: 2 }, children: `${n} submitted attempt${n === 1 ? '' : 's'} of this paper — click a bar to open it` }),
    ] }),
    jsx('div', { className: 'cbt-chart-scroll', ref: wrapRef, children:
      jsxs('svg', { width: svgW, height: svgH, role: 'group', 'aria-label': 'Marks per attempt', style: { display: 'block' }, children: [
        ...ticks.map(t =>
          jsxs('g', { key: `tick-${t.label}`, children: [
            jsx('line', {
              x1: AXIS_W, y1: t.y, x2: svgW, y2: t.y,
              style: { stroke: 'var(--ui-stroke-secondary)', strokeWidth: 1 },
            }),
            jsx('text', {
              x: AXIS_W - 6, y: t.y + 4, textAnchor: 'end',
              style: { fontSize: '11px', fill: 'var(--ui-text-secondary)', fontVariantNumeric: 'tabular-nums' },
              children: t.label,
            }),
          ] })),
        ...bars,
      ] }) }),
    selIdx >= 0
      ? jsx('div', { className: 'cbt-sub', style: { marginTop: 8, fontVariantNumeric: 'tabular-nums' },
          children: `Attempt ${selIdx + 1}: ${fmtScore(seq[selIdx].score ?? 0)} marks — the bars are every graded attempt, oldest first.` })
      : jsx('div', { className: 'cbt-sub', style: { marginTop: 8 },
          children: 'This attempt was never graded — click a bar to open a graded one.' }),
  ] })
}

function CbtResult({ attemptId, onHome, onRetake }) {
  // ── selected attempt state (local, not in view) ────────────────────────────
  const [selectedId, setSelectedId] = useState(attemptId)
  const qc = useQueryClient()

  // ── load the entry attempt to derive exam_id ───────────────────────────────
  const entryQ = useQuery({ queryKey: ['cbt', 'attempt', attemptId], queryFn: () => rest(`/attempts/${attemptId}`) })
  const examId = entryQ.data?.attempt?.exam_id ?? null

  // ── load siblings for this exam ────────────────────────────────────────────
  const siblingsQ = useQuery({
    queryKey: ['cbt', 'attempts', examId],
    queryFn: () => rest(`/attempts?exam_id=${encodeURIComponent(examId)}&limit=500`),
    enabled: !!examId,
  })

  // ── submitted sequence, oldest first (the chronological ordering) ──────────
  // Filtered here as well as on the server: a dashboard still running the previous
  // build ignores ?exam_id and answers with every paper's attempts, and this page
  // must not draw another exam's marks as this one's.
  const allSiblings = (siblingsQ.data?.attempts || []).filter(a => !examId || a.exam_id === examId)
  const seq = allSiblings
    .filter(a => a.status === 'submitted')
    .sort((a, b) => (a.submitted_at || 0) - (b.submitted_at || 0) || a.id.localeCompare(b.id))

  // ── load the selected attempt's full data ──────────────────────────────────
  const q = useQuery({ queryKey: ['cbt', 'attempt', selectedId], queryFn: () => rest(`/attempts/${selectedId}`) })

  // ── review list state — reset on attempt switch ────────────────────────────
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [page, setPage] = useState(0)
  const [evalBusy, setEvalBusy] = useState(false)
  const [evalError, setEvalError] = useState(null)
  const [evalTried, setEvalTried] = useState(false)
  // Analysis is a section the reader opens: default closed so the numbers tell the
  // story first and the model call happens only once someone asks for it.
  const [showEval, setShowEval] = useState(false)
  // Switching attempts resets the review list and the analysis panel: page 3 of one
  // attempt's wrong answers is not page 3 of another's, and an open analysis belongs
  // to the attempt it was run on.
  const prevSelRef = useRef(selectedId)
  useEffect(() => {
    if (prevSelRef.current !== selectedId) {
      setFilter('all'); setPage(0); setOpen(null)
      setShowEval(false); setEvalError(null)
      prevSelRef.current = selectedId
    }
  }, [selectedId])

  // `force` re-runs the LLM; without it the server returns the stored evaluation and
  // the call is free, so opening a result twice never costs a second model call.
  const runEval = async force => {
    if (evalBusy) return
    setEvalBusy(true); setEvalError(null)
    try {
      const ev = await rest(`/attempts/${selectedId}/evaluate${force ? '?force=true' : ''}`, { method: 'POST' })
      const d = q.data
      qc.setQueryData(['cbt', 'attempt', selectedId], { ...d, attempt: { ...d.attempt, evaluation: ev } })
      setEvalTried(true)
      qc.invalidateQueries({ queryKey: ['cbt', 'attempts'] })
    } catch (e) { setEvalError(e?.message || String(e)) }
    setEvalBusy(false)
  }
  const discuss = () => {
    const a = q.data?.attempt
    if (!a) return
    // Detail is a chat's job: this opens a fresh review session with a turn that
    // loads the attempt-review skill — it never stages a draft.
    void launchDiscussion(a)
  }

  // ── arrow navigation helpers ───────────────────────────────────────────────
  const selSeqIdx = seq.findIndex(a => a.id === selectedId)
  const goPrev = () => { if (selSeqIdx > 0) setSelectedId(seq[selSeqIdx - 1].id) }
  const goNext = () => { if (selSeqIdx < seq.length - 1) setSelectedId(seq[selSeqIdx + 1].id) }

  // Keyboard: ArrowLeft/ArrowRight switch when not in an input/textarea/select/contenteditable
  useEffect(() => {
    const handler = e => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [seq, selectedId])

  // ── shell: the part that belongs to the EXAM, not to one attempt ────────────
  // Title, arrows and chart come from the exam's own record, so they stay on screen
  // while a switch is in flight. Swapping the attempt body must never blank the page
  // the reader clicked on, and a chart that disappears on click teaches nothing.
  const entryAttempt = entryQ.data?.attempt || null
  const pack = entryQ.data?.pack || null
  if (!pack) return jsx('div', { className: 'cbt cbt-page', children: jsx('div', { className: 'cbt-loading', children: [jsx(Codicon, { name: 'loading', size: 14, spinning: true }), ' Loading…'] }) })

  const selAtt = selSeqIdx >= 0 ? seq[selSeqIdx] : null
  const shell = body => jsxs('div', { className: 'cbt cbt-page cbt-result', children: [
    jsxs('div', { className: 'cbt-head-row', children: [
      jsx('h2', { children: pack.title || pack.exam_id }),
      jsx(Badge, { variant: entryAttempt?.mode === 'assisted' ? 'outline' : 'muted', children: MODE_LABEL[entryAttempt?.mode] || entryAttempt?.mode || '' }),
      jsx('span', { style: { flex: 1 } }),
      jsx(SidebarButton, {}),
      onRetake && entryAttempt ? jsx(Tip, { label: `New ${MODE_LABEL[entryAttempt.mode] || entryAttempt.mode} attempt on this paper`, children:
        jsx(Button, { variant: 'default', size: 'sm', onClick: () => onRetake(pack, entryAttempt.mode), children: 'Retake' }) }) : null,
      jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => onHome(), children: 'All exams' }),
    ] }),
    // One attempt at a time: the arrows walk the papers' graded attempts in the order
    // they were submitted, and clamp at both ends rather than wrap.
    jsxs('div', { className: 'cbt-attempt-nav', children: [
      jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', disabled: selSeqIdx <= 0, 'aria-label': 'Previous attempt', onClick: goPrev, children: icon('chevron-left', 'size-4') }),
      // The pill names the ATTEMPT; the exam's name is the heading above it. Keeping
      // the title out of both places is what stops the page saying it twice.
      jsx('div', { className: 'cbt-attempt-pill', children: selAtt
        ? `Attempt ${selSeqIdx + 1} of ${seq.length} · ${fmtWhen(selAtt.submitted_at)} · ${MODE_LABEL[selAtt.mode] || selAtt.mode}`
        : 'not a graded attempt' }),
      jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', disabled: seq.length === 0 || selSeqIdx >= seq.length - 1, 'aria-label': 'Next attempt', onClick: goNext, children: icon('chevron-right', 'size-4') }),
    ] }),
    seq.length > 0 ? jsx(AttemptsChart, { seq, selectedId, onSelect: id => setSelectedId(id) }) : null,
    ...body,
  ] })

  // The attempt body itself: pending, failed, ungraded, or the full result.
  if (!q.data) {
    return shell([
      jsx('div', { className: 'cbt-card', children: q.isError
        ? jsx(ErrorBox, { what: 'Loading result', onRetry: () => q.refetch() })
        : jsxs('div', { className: 'cbt-row cbt-sub', children: [jsx(Codicon, { name: 'loading', size: 14, spinning: true }), ' Loading this attempt…'] })
      }),
    ])
  }
  const attempt = q.data.attempt

  // ── not-submitted stub (abandoned / in-progress) with arrows + chart ───────
  if (attempt.status !== 'submitted' || !attempt.result) {
    const why = attempt.status === 'abandoned'
      ? 'This attempt was discarded — it was never graded and its answer key is not shown.'
      : 'This attempt is still in progress — resume it to finish.'
    return shell([
      jsx('div', { className: 'cbt-card', children: [
        jsx('p', { className: 'cbt-sub', style: { margin: '0 0 12px' }, children: why }),
        jsx(Button, { variant: 'outline', size: 'sm', onClick: () => onHome(), children: 'Back to home' }),
      ] }),
    ])
  }

  const r = attempt.result
  // A failure survives the reload now (the server stores it on the attempt), so the
  // panel shows the same reason next time instead of a bare "No evaluation yet."
  const evalFailure = evalError || (attempt.evaluation_error && attempt.evaluation_error.message) || null
  const qmap = Object.fromEntries(pack.questions.map(x => [x.id, x]))
  // Full marks per section, from the marking each question actually carried. A row the
  // grader left out ('not counted') contributes nothing, so the ceiling matches the score.
  const marksOf = row => (row.verdict === 'not_counted' ? 0 : (Array.isArray(row.marks) ? row.marks[0] : 0))
  const maxBySection = {}
  for (const row of r.questions) maxBySection[row.section] = (maxBySection[row.section] || 0) + marksOf(row)
  const maxTotal = r.questions.reduce((n, row) => n + marksOf(row), 0)
  const penalties = [...new Set(pack.pattern.sections.map(s => s.marks_wrong).filter(w => typeof w === 'number'))]
  const rows = r.questions.filter(row => filter === 'all' || row.verdict === filter)
  // 25 a page: a 160-question review is 7 pages of 25 rows instead of one 5,800 px list,
  // and an ordinary 37-question paper still reads in two short screens.
  const REVIEW_PAGE = 25
  const pageCount = Math.max(1, Math.ceil(rows.length / REVIEW_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const shownFrom = safePage * REVIEW_PAGE
  const shownTo = Math.min(shownFrom + REVIEW_PAGE, rows.length)
  const pageRows = rows.slice(shownFrom, shownTo)
  const total = (r.totals.correct || 0) + (r.totals.wrong || 0) + (r.totals.skipped || 0) + (r.totals.not_counted || 0)
  const pct = total ? Math.round((1000 * (r.totals.correct || 0)) / total) / 10 : 0
  return shell([
    // Card 3 — Score, then the statistics measured from the record. One card: both
    // answer "how did this sitting go", and two boxes for one subject read as two.
    jsxs('div', { className: 'cbt-card', children: [
      jsx('div', { className: 'cbt-section', style: { margin: '0 0 12px' }, children: 'Score' }),
      jsxs('div', { className: 'cbt-score-row', children: [
        jsxs('div', { className: 'cbt-score-pair', children: [
          jsx('div', { className: `cbt-score${r.score > 0 ? ' pos' : r.score < 0 ? ' neg' : ''}`, children: fmtScore(r.score) }),
          maxTotal ? jsx('span', { className: 'cbt-score-max', children: `/ ${maxTotal}` }) : null,
        ] }),
        jsx('div', { className: 'cbt-stat-grid', children: ['correct', 'wrong', 'skipped', 'not_counted'].map(k =>
          jsxs('div', { className: `cbt-stat ${k}`, children: [
            jsx('span', { className: 'k', children: VERDICT_LABEL[k] }),
            jsx('span', { className: 'v', children: String(r.totals[k] ?? 0) }),
          ] }, k)) }),
      ] }),
      jsx('div', { className: 'cbt-sub', style: { marginTop: 12 }, children: [
        `${r.totals.correct} of ${total} questions correct · ${pct}%`,
        penalties.length === 1 && penalties[0] < 0 ? ` · ${penalties[0]} for each wrong answer` : '',
        penalties.length > 1 ? ' · negative marking differs by section — see the table' : '',
      ] }),
      jsx(Separator, { className: 'cbt-sep' }),
      jsxs('div', { style: { marginBottom: 12 }, children: [
        jsx('div', { className: 'cbt-section', style: { margin: 0 }, children: 'Statistics' }),
        jsx('div', { className: 'cbt-sub', style: { marginTop: 2 }, children: 'computed from the attempt record — no model involved' }),
      ] }),
      jsx(ResultMetrics, { attempt, pack, tl: q.data?.stats }),
    ] }),
    // Card 4 — Sections
    pack.pattern.sections.length > 1
      ? jsxs('div', { className: 'cbt-card', children: [
          jsx('div', { className: 'cbt-section', style: { margin: '0 0 12px' }, children: 'Sections' }),
          jsxs('table', { className: 'cbt-table cbt-sec', children: [
            jsx('thead', { children: jsx('tr', { children: ['Section', 'Score', 'Max', 'Correct', 'Wrong', 'Skipped', 'Not counted'].map((h, i) => jsx('th', { key: h, className: i ? 'num' : undefined, children: h === 'Max'
              ? jsx(Tip, { label: 'Full marks for the section — each question carries its own marks, so a paper of 6 questions can be worth 9', children: jsx('span', { children: 'Max' }) })
              : h })) }) }),
            jsx('tbody', { children: pack.pattern.sections.map(s => {
              const st = r.sections[s.id] || {}
              return jsxs('tr', { key: s.id, children: [
                jsxs('td', { children: [
                  jsx(Badge, { variant: 'outline', size: 'xs', children: s.id }),
                  ' ',
                  s.title,
                ] }),
                jsx('td', { className: `num${st.score > 0 ? ' hit' : st.score < 0 ? ' miss' : ''}`, children: st.score == null ? '—' : fmtScore(st.score) }),
                jsx('td', { className: 'num muted', children: String(maxBySection[s.id] ?? '—') }),
                jsx('td', { className: 'num', children: String(st.correct ?? 0) }),
                jsx('td', { className: 'num', children: String(st.wrong ?? 0) }),
                jsx('td', { className: 'num', children: String(st.skipped ?? 0) }),
                jsx('td', { className: 'num', children: String(st.not_counted ?? 0) }),
              ] })
            }) }),
            jsx('tfoot', { children: jsxs('tr', { children: [
              jsx('td', { children: 'Total' }),
              jsx('td', { className: 'num', children: fmtScore(r.score) }),
              jsx('td', { className: 'num', children: String(maxTotal || '—') }),
              jsx('td', { className: 'num', children: String(r.totals.correct ?? 0) }),
              jsx('td', { className: 'num', children: String(r.totals.wrong ?? 0) }),
              jsx('td', { className: 'num', children: String(r.totals.skipped ?? 0) }),
              jsx('td', { className: 'num', children: String(r.totals.not_counted ?? 0) }),
            ] }) }),
          ] }),
        ] })
      : null,
    // Card 6 — Topics
    jsx(ResultTopics, { attempt, pack }),
    // Card 7 — AI Overview
    jsxs('div', { className: 'cbt-card', children: [
      jsxs('div', { className: 'cbt-row', children: [
        jsx('div', { className: 'cbt-section', style: { margin: 0 }, children: 'AI Overview' }),
        jsx(Badge, { variant: 'muted', size: 'xs', children: 'model output' }),
        jsx('span', { style: { flex: 1 } }),
        jsx(Button, { variant: 'ghost', size: 'sm', onClick: discuss, children: 'Discuss in chat' }),
        attempt.evaluation
          ? jsx(Button, { variant: 'outline', size: 'sm', onClick: () => setShowEval(v => !v),
              children: showEval ? 'Hide analysis' : 'Show analysis' })
          : jsx(Button, { variant: 'outline', size: 'sm', disabled: evalBusy,
              onClick: () => { setShowEval(true); void runEval(false) }, children: 'Analyse this attempt' }),
      ] }),
      // A closed card still has to say what it would open, and whether opening it is
      // free: a stored analysis is served from the attempt, a new one costs a model call.
      !showEval
        ? jsx('div', { className: 'cbt-sub', style: { marginTop: 12 }, children: attempt.evaluation
            ? `Saved analysis from ${fmtWhen(attempt.evaluation.generated_at)} — open it for the per-section notes and the weak topics.`
            : 'The analysis runs once, on demand — nothing on this page depends on it.' })
        : null,
      pack.key_status && pack.key_status !== 'official'
        ? jsx('div', { className: 'cbt-row cbt-sub', style: { marginTop: 12 }, children:
            `This run was graded against a ${pack.key_status} answer key — read the marks and notes as indicative, not as a measure of your preparation.` })
        : null,
      showEval && jsxs('div', { children: [
        evalBusy
          ? jsxs('div', { className: 'cbt-row cbt-sub', style: { marginTop: 12 }, children: [
              jsx(Codicon, { name: 'loading', size: 14, spinning: true }),
              'Analysing your attempt — this calls the model once and takes a few seconds.',
            ] })
          : evalFailure
            ? jsxs('div', { children: [
                jsxs('div', { className: 'cbt-row', style: { marginTop: 12 }, children: [
                  jsx(Badge, { variant: 'destructive', size: 'xs', children: 'AI evaluation failed' }),
                  attempt.evaluation_error && !evalError
                    ? jsx('span', { className: 'cbt-sub', children: `recorded ${relTime(attempt.evaluation_error.at)}` })
                    : null,
                  jsx(Button, { variant: 'outline', size: 'sm', onClick: () => void runEval(false), children: 'Retry' }),
                ] }),
                jsxs('details', { style: { marginTop: 8 }, children: [
                  jsx('summary', { className: 'cbt-sub cbt-clickable', children: 'What the model said' }),
                  jsx('pre', { className: 'cbt-pre', children: evalFailure }),
                ] }),
              ] })
            : attempt.evaluation
              ? jsxs('div', { children: [
                  jsx(EvaluationCard, { d: attempt.evaluation.data, pack }),
                  jsxs('div', { className: 'cbt-row', style: { marginTop: 12 }, children: [
                    jsx('span', { className: 'cbt-sub', children: `via ${attempt.evaluation.provider || '?'}/${attempt.evaluation.model || '?'} · ${fmtWhen(attempt.evaluation.generated_at)}` }),
                    jsx('span', { style: { flex: 1 } }),
                    jsx(Button, { variant: 'outline', size: 'sm', disabled: evalBusy, onClick: () => void runEval(true), children: 'Re-analyse' }),
                  ] }),
                ] })
              : null,
      ] }),
    ] }),
    // Card 8 — Questions
    jsxs('div', { className: 'cbt-card', children: [
      jsxs('div', { className: 'cbt-row', children: [
        jsx('div', { className: 'cbt-section', style: { margin: 0 }, children: 'Questions' }),
        jsx('span', { style: { flex: 1 } }),
        jsx('span', { className: 'cbt-sub', style: { fontVariantNumeric: 'tabular-nums' }, children: rows.length
          ? `${shownFrom + 1}–${shownTo} of ${rows.length}`
          : 'nothing here' }),
        jsx(SegmentedControl, {
          value: filter,
          onChange: f => { setFilter(f); setPage(0); setOpen(null) },
          sizing: 'content',
          options: [['all', 'All'], ['wrong', 'Wrong'], ['skipped', 'Skipped'], ['not_counted', 'Not counted']].map(([f, label]) => ({
            id: f,
            label: f === 'all' ? `${label} ${r.questions.length}` : `${label} ${r.totals[f] ?? 0}`,
          })),
        }),
      ] }),
      jsx('div', { style: { marginTop: 12 }, children: pageRows.map(row => {
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
              // Fixed-width verdict slot: the badge widths differ by up to 20px
              // ("Skipped" vs "Wrong (-0.5)"), and a row whose verdict label changes
              // must not shift the type/topic text of its neighbours.
              jsx('span', { className: 'cbt-verdict', children: jsx(Badge, {
                size: 'xs',
                variant: row.verdict === 'correct' ? 'success' : row.verdict === 'wrong' ? 'destructive' : row.verdict === 'skipped' ? 'muted' : 'outline',
                children: `${VERDICT_LABEL[row.verdict]}${row.awarded ? ` (${row.awarded})` : ''}`,
              }) }),
              jsx('span', { className: 'cbt-sub', children: `${row.type.toUpperCase()} · ${row.topic || ''}` }),
              isMarked ? jsx(Badge, { size: 'xs', variant: 'muted', children: 'Marked' }) : null,
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
      pageCount > 1
        ? jsxs('div', { className: 'cbt-pager', children: [
            jsx(Button, {
              type: 'button', variant: 'ghost', size: 'sm', disabled: safePage === 0,
              'aria-label': 'Previous page',
              onClick: () => { setPage(Math.max(0, safePage - 1)); setOpen(null) },
              children: icon('chevron-left', 'size-4'),
            }),
            jsx('span', { className: 'cbt-pager-n', children: `Page ${safePage + 1} of ${pageCount}` }),
            jsx(Button, {
              type: 'button', variant: 'ghost', size: 'sm', disabled: safePage >= pageCount - 1,
              'aria-label': 'Next page',
              onClick: () => { setPage(Math.min(pageCount - 1, safePage + 1)); setOpen(null) },
              children: icon('chevron-right', 'size-4'),
            }),
          ] })
        : null,
    ] }),
  ])
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
        // Assisted attempts are a side pane, not this page — opening Exam Desk must not
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
      onClick: () => host.navigate('/exam-desk'),
      children: [jsx(Codicon, { key: 'c', name: 'watch', size: 12 }), fmtHMS(q.data.remaining_seconds)],
    }),
  })
}

export default {
  id: 'exam-desk',
  name: 'Exam Desk',
  defaultEnabled: false,
  register(ctx) {
    ctxRest = (p, o) => ctx.rest(p, o)
    ctxStorage = ctx.storage
    ctxRunAction = ctx.runAction ? (id) => ctx.runAction(id) : null
    // Hydrate the stored attempt once at boot: the status-bar countdown is mounted
    // outside this page and otherwise stays blank until Exam Desk is opened.
    void readActiveAttempt().then(() => announceActiveAttempt())
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: '/exam-desk' }, render: () => jsx(CbtPage, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: '/exam-desk', label: 'Exam Desk', codicon: 'checklist' } },
      { id: 'open', area: PALETTE_AREA, data: { id: 'exam-desk.open', label: 'Open Exam Desk', keywords: ['exam desk', 'cbt', 'exam', 'mock'], run: () => host.navigate('/exam-desk') } },
      { id: 'timer', area: STATUSBAR_AREAS.right, render: () => jsx(TimerChip, {}) },
    ])
  },
}
