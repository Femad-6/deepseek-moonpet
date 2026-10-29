/**
 * dsh-moonpet — browser half.
 *
 * Served verbatim from `/dsh-moonpet/client.js` and injected into the web
 * app's index document. Everything lives inside one IIFE that owns a single
 * fixed-position stage; no framework, no build step.
 *
 * Interaction model
 *   hover 立绘     -> the settings button fades in at the art's top-right corner
 *   click 立绘     -> random voice + random art + the dialogue box shows the line
 *   drag  立绘     -> moves the widget; the anchor (nearest edges) is persisted
 *   turn ends      -> the dialogue box reports 消耗 token / 花费 ￥ for that turn
 */
;(function () {
  'use strict'

  const previous = window.__dshMoonPetWidget
  // `true` is what every build before 2.3.2 left behind; an object is this
  // build's marker and carries whether the startup that claimed the document
  // actually finished. A *failed* attempt must not lock the document out — a host
  // that injects this script twice only gets a second chance if the first one
  // handed the flag back.
  if (previous === true || (previous && previous.failed !== true)) return
  window.__dshMoonPetWidget = { failed: false }

  // One widget per screen, not per document.
  //
  // The host injects this script into every document it serves, and
  // `__dshMoonPetWidget` is per-window. If the page ever nests another served
  // document (an iframe that goes through the same tap), each document boots
  // its own widget — both anchored to the bottom-right of their own viewport,
  // i.e. drawn on top of one another at different animation phases. The front
  // one looks fine; the one behind looks like a stuttering second body.
  //
  // So: when we are a nested document AND the top document (same origin) already
  // has a widget, stand down. A cross-origin top cannot be read, and there we
  // keep the old behaviour rather than silently dropping the widget.
  try {
    if (window.top !== window.self && window.top.document.querySelector('.dmp-root')) return
  } catch {
    // cross-origin parent: cannot tell, so carry on
  }

  const ROUTE = '/dsh-moonpet'
  const API = `${ROUTE}/api`
  const UI = `${ROUTE}/asset/ui`
  const GAP = 10 // breathing room between art and dialogue box
  const DRAG_SLOP = 5 // px of movement below which a pointer gesture is a click
  const TURN_POLL_MS = 1000
  const STATE_POLL_MS = 60000
  // The turn receipt holds longer than a voice line: it appears on its own, and
  // two numbers that just changed are worth a second look.
  const COST_HOLD_SECONDS = 5
  const MONEY_SYMBOL = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥', GBP: '£' }
  const SCALE_MIN = 1
  const SCALE_MAX = 10

  /**
   * Fallback plate geometry, replaced by `/api/bootstrap`. Kept in sync with
   * `assets/ui/dialog.json` by scripts/verify.mjs.
   */
  const DEFAULT_DIALOG_GEO = {
    image: { width: 1200, height: 700 },
    crop: { x: 0, y: 0, w: 1, h: 1 },
    inset: { left: 0.06, right: 0.06, top: 0.09, bottom: 0.07 },
    footer: { heightRatio: 0.42, maxWidthRatio: 0.9 },
    radius: 12,
    logoShare: 1,
  }

  // ── tiny helpers ──────────────────────────────────────────────────────────
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
  const $ = (tag, className) => {
    const el = document.createElement(tag)
    if (className) el.className = className
    return el
  }
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

  function money(amount, currency) {
    const n = Number(amount)
    if (!Number.isFinite(n)) return '--'
    const symbol = MONEY_SYMBOL[String(currency || 'CNY').toUpperCase()] || `${currency || ''} `
    return `${symbol}${n.toFixed(2)}`
  }

  // Small local SVGs share one stroke and scale across all controls.
  const ICONS = {
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    chevron: '<path d="m8 5 7 7-7 7"/>',
    settings: '<path d="m9 3-.7 2.1-2 .9-2.1-.4-2 3.4 1.4 1.7v2.6L2.2 15l2 3.4 2.1-.4 2 .9L9 21h4l.7-2.1 2-.9 2.1.4 2-3.4-1.4-1.7v-2.6l1.4-1.7-2-3.4-2.1.4-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  }
  function icon(name) {
    return `<svg class="dmp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`
  }

  // ── state ─────────────────────────────────────────────────────────────────
  const state = {
    config: null,
    packs: { spritePacks: [], voicePacks: [] },
    dialog: DEFAULT_DIALOG_GEO,
    // Which plate `dialog` describes: 'bundled' (shipped artwork), 'blank' (the
    // plain plate that ships with the plugin) or 'user' (an image installed from
    // the settings panel).
    plateSource: 'bundled',
    balance: null,
    ofm: null,
    today: null,
    // The host's spend ledger: `todayTokens` / `totalTokens` are counted from the
    // real usage in the session event stream, not derived from the balance.
    ledger: null,
    turnSeq: 0,
    sprite: null, // { file, url, aspect }
    pet: null,
    voice: null, // { clip, ja, zh }
    // Whether the dialogue box is currently on screen. Separate from the
    // `dialogEnabled` setting: the box has its own show -> type -> hide cycle.
    dialogShown: false,
    // Which sheet the box is showing:
    //   'line'   a voice line (what a click on the art produces)
    //   'cost'   the turn receipt (what a finished conversation produces)
    //   'wallet' 余额 / 今日已用 — reached by clicking the box itself
    sheet: 'line',
    cost: { tokens: null, amount: null },
    panelOpen: false,
    hover: false,
  }

  const cfg = () => state.config || {}
  const packOf = (list, id) => (list || []).find((p) => p.id === id) || null

  // ── styles ────────────────────────────────────────────────────────────────
  const CSS = `
.dmp-root{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;
  font-family:"Segoe UI","Microsoft YaHei",system-ui,-apple-system,sans-serif;user-select:none;-webkit-user-select:none}
.dmp-root *{box-sizing:border-box}
.dmp-stage{position:absolute;left:0;top:0;width:0;height:0;transition:transform .13s ease}
.dmp-root.dmp-dragging .dmp-stage{transition:none}

/* 立绘 */
.dmp-sprite{position:absolute;left:0;top:0;overflow:hidden;pointer-events:auto;cursor:grab;
  touch-action:none}
.dmp-root.dmp-dragging .dmp-sprite{cursor:grabbing}
.dmp-pet-label{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:5px 12px;
  border-radius:16px;background:rgba(32,24,45,.84);color:#fff;font-size:12px;white-space:nowrap;
  pointer-events:none;box-shadow:0 2px 8px #0003}
.dmp-pet-label[hidden]{display:none}
@keyframes dmp-pet-breathe{50%{transform:translateY(-3px)}}
@keyframes dmp-pet-work{25%{transform:rotate(-.7deg)}75%{transform:rotate(.7deg)}}
@keyframes dmp-pet-hop{50%{transform:translateY(-7px)}}
.dmp-root[data-pet-status="idle"] .dmp-sprite{animation:dmp-pet-breathe 4s ease-in-out infinite}
.dmp-root[data-pet-status="thinking"] .dmp-sprite{animation:dmp-pet-breathe 2.5s ease-in-out infinite}
.dmp-root[data-pet-status="working"] .dmp-sprite{animation:dmp-pet-work 2s ease-in-out infinite;transform-origin:50% 90%}
.dmp-root[data-pet-status="waiting"] .dmp-sprite{animation:dmp-pet-breathe 1.6s ease-in-out infinite}
.dmp-root[data-pet-status="done"] .dmp-sprite{animation:dmp-pet-hop .65s ease-in-out 3}
.dmp-root[data-pet-status="error"] .dmp-sprite-img,
.dmp-root[data-pet-status="stopped"] .dmp-sprite-img,
.dmp-root[data-pet-status="offline"] .dmp-sprite-img{filter:saturate(.55)}
.dmp-root.dmp-dragging .dmp-sprite{animation:none}
@keyframes dmp-touch{35%{transform:translateY(2px) scale(1.025,.975)}70%{transform:translateY(-4px) scale(.99,1.01)}}
.dmp-root.dmp-touch .dmp-sprite{animation:dmp-touch .48s ease-out;transform-origin:50% 90%}
@media(prefers-reduced-motion:reduce){.dmp-root .dmp-sprite{animation:none!important}}
/* The shadow hangs off the image itself: a filter on the clipping box would
   cast a rectangle instead of the character's silhouette. */
.dmp-sprite-img{position:absolute;display:block;pointer-events:none;-webkit-user-drag:none;
  filter:drop-shadow(0 5px 12px rgba(0,0,0,.2))}
.dmp-root.dmp-hidden .dmp-sprite{display:none}
/* Hiding the art hides its read-out too: a lone chip with no character under it
   looks like a bug rather than a setting. */
.dmp-root.dmp-hidden .dmp-badge{display:none}
/* No art loaded yet: keep the plate visible but stop the empty box from
   swallowing clicks. */
.dmp-root.dmp-nosprite .dmp-sprite{display:none}

/* 设定按钮（右上角，仅悬浮显示） */
/* pointer-events follows visibility: an invisible button that still accepts
   clicks would swallow presses aimed at the art underneath it. */
.dmp-gear{position:absolute;width:30px;height:30px;padding:0;border:none;background:transparent;
  cursor:pointer;pointer-events:none;opacity:0;transform:scale(.8);transition:opacity .16s ease,transform .16s ease;
  z-index:6;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))}
.dmp-root.dmp-hover .dmp-gear,.dmp-gear.dmp-gear-open{opacity:1;transform:scale(1);pointer-events:auto}
.dmp-gear img{display:block;width:100%;height:100%;-webkit-user-drag:none}
.dmp-gear:hover{transform:scale(1.12)}

/* 对话框 */
.dmp-dialog{position:absolute;transform-origin:50% 50%;pointer-events:none;opacity:0;
  transition:opacity .18s ease,transform .18s cubic-bezier(.34,1.3,.64,1)}
/* The box is only clickable while it is actually on screen — it is the control
   that swaps the sheet (voice line / receipt / balance). A hidden box must stay
   click-through, or it becomes an invisible shield over the art. */
.dmp-root.dmp-dialog-on .dmp-dialog{opacity:1;pointer-events:auto;cursor:pointer}
/* Only the bottom slice of the artwork is shown: the plate is cropped, so the
   logo keeps its size instead of shrinking along with the empty white area. */
.dmp-dialog-plate{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;
  box-shadow:0 6px 20px rgba(0,0,0,.2)}
.dmp-dialog-img{position:absolute;display:block;-webkit-user-drag:none}
/* Insets are written in px by applyLayout(), derived from the plate geometry. */
.dmp-dialog-body{position:absolute;display:flex;flex-direction:column}
.dmp-line{flex:1 1 auto;min-height:0;color:#111;text-align:center;overflow:hidden;
  display:flex;align-items:flex-start;word-break:break-word;white-space:pre-wrap}
.dmp-line-inner{width:100%}
/* Shown only when a line cannot fit even at the minimum size — the plate is too
   small for it. Communicates truncation instead of looking like an overlap. */
.dmp-line-clipped{-webkit-mask-image:linear-gradient(to bottom,#000 70%,transparent 100%);
  mask-image:linear-gradient(to bottom,#000 70%,transparent 100%)}
.dmp-caret{display:inline-block;width:.42em;height:.9em;margin-left:.06em;vertical-align:-.06em;
  background:#6b7fd7;opacity:.75;animation:dmp-blink .9s steps(1,end) infinite}
@keyframes dmp-blink{0%,50%{opacity:.75}50.01%,100%{opacity:0}}
.dmp-foot{flex:0 0 auto;display:flex;flex-direction:column;justify-content:flex-end;gap:.18em;
  font-weight:600;letter-spacing:.01em}
/* Each figure is an unbreakable unit and the rows wrap *between* units, so a
   narrow box can never split "余额" away from its amount onto another line. */
.dmp-cost,.dmp-wallet{display:flex;flex-wrap:wrap;justify-content:center;
  column-gap:.85em;row-gap:.02em}
.dmp-cost>*,.dmp-wallet>*{white-space:nowrap}
.dmp-kv{display:inline-flex;align-items:baseline}
/* Both figure sheets read as plain black, exactly like the voice line: they are
   read-outs, not status colours, and the old pink/lilac pair only stayed legible
   against the white plate thanks to a dark text-shadow — which smudged the
   glyphs. Weight alone carries the emphasis now. */
.dmp-cost,.dmp-wallet{color:#242424}
.dmp-cost b{font-weight:700}

.dmp-cost.dmp-cost-off{display:none}
.dmp-wallet.dmp-wallet-off{display:none}
.dmp-focus-start{align-self:flex-start;border:1px solid #3777a0;border-radius:.5em;padding:.2em .6em;
  background:#d8efff;color:#153650;font:inherit;line-height:1.3;cursor:pointer;white-space:nowrap}
.dmp-focus-start[hidden]{display:none}
.dmp-focus-start:disabled{opacity:.5;cursor:wait}
.dmp-focus-start:focus-visible{outline:2px solid #3777a0;outline-offset:2px}
/* In "voice line" mode the box carries nothing but the line, so the strip is
   removed entirely and the text gets the whole plate. */
.dmp-foot.dmp-foot-off{display:none}
.dmp-line.dmp-line-off{display:none}
/* Receipt / balance sheets: the strip *is* the content. It is capped to the top
   share of the plate that clears the logo in the bottom-right corner, and the
   figures are centred inside that band. */
.dmp-foot.dmp-foot-full{flex:0 0 auto;justify-content:center;max-width:none;overflow:hidden}
.dmp-wallet .dmp-k{color:#828282;font-weight:500;margin-right:.15em}

/* 余额条：挂在立绘下方的一行常驻读数。
   The wallet sheet above is reached by clicking the box and is gone again three
   seconds later, so this chip is what makes the figures readable at a glance
   without touching anything. It is a sibling of the art box, never a child of
   it: the art box clips its overflow to the cropped silhouette.
   The dark translucent pill is deliberate — it has to stay legible over light
   and dark GUI themes alike, neither of which it can rely on. */
.dmp-badge{position:absolute;left:0;top:0;display:flex;justify-content:center;pointer-events:none;
  z-index:1;transition:opacity .16s ease}
/* Hidden while the plate occupies the same band, so two read-outs never print
   on top of one another. */
.dmp-badge.dmp-badge-off{opacity:0}
.dmp-badge-inner{display:inline-flex;align-items:baseline;gap:.7em;padding:.26em .68em;border-radius:999px;
  background:rgba(24,26,32,.74);color:#f2f3f5;font-size:12px;font-weight:600;letter-spacing:.01em;
  box-shadow:0 2px 9px rgba(0,0,0,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  white-space:nowrap;
  /* Three figures plus a unit can outgrow the art. A flex item shrinks by
     default, which would squeeze the pill's background while the nowrap text
     spilled out of it — so the pill keeps its natural width and applyLayout()
     widens the box and pulls it back inside the viewport instead. */
  flex:0 0 auto}
.dmp-badge-k{color:#a9b0bd;font-weight:500}
/* A unit after the figure needs its own space: the CJK side bearings that give
   「余额 ¥22.81」 its breathing room do not exist between latin glyphs. */
.dmp-badge-u{color:#a9b0bd;font-weight:500;margin-left:.34em}
.dmp-badge-stale{color:#a9b0bd;font-weight:500}
.dmp-badge-err{color:#ffb4a8;font-weight:500}
.dmp-ofm-badge{display:inline-block;max-width:min(360px,50vw);overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}
.dmp-wallet>.dmp-ofm-wallet{white-space:normal;overflow-wrap:anywhere;max-height:5em;overflow:auto}

/* MoonPet: whale-blue portrait, graphite surfaces and ice-blue controls. */
.dmp-panel{--dmp-accent:#9ed8ff;--dmp-ink:#edf5ff;--dmp-muted:#95a8bf;
  position:absolute;box-sizing:border-box;width:min(352px,calc(100vw - 24px));padding:22px;border-radius:24px;
  background:#141e2b;border:1px solid #a8cfff24;box-shadow:0 24px 80px #03091499,0 1px 0 #dceeff0a inset;
  color:var(--dmp-ink);color-scheme:dark;font-size:13px;line-height:1.5;pointer-events:none;opacity:0;
  transform:translateY(6px) scale(.98);transform-origin:bottom center;transition:opacity .16s ease,transform .18s ease;
  max-height:min(84vh,740px);overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#435975 transparent;z-index:10}
.dmp-panel.dmp-panel-open{opacity:1;transform:none;pointer-events:auto}
.dmp-panel *{box-sizing:border-box}
.dmp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}
.dmp-brand{display:flex;align-items:center;gap:11px;min-width:0}
.dmp-moonmark{display:block;flex:none;width:46px;height:46px}
.dmp-moonmark img{display:block;width:100%;height:100%}
.dmp-brand strong{display:block;font-size:19px;font-weight:650;letter-spacing:.015em;color:#f3f8ff}
.dmp-brand small{display:block;color:var(--dmp-muted);font-size:11px;margin-top:2px}
.dmp-icon{display:block;flex:none;width:18px;height:18px}
.dmp-head button{display:grid;place-items:center;flex:none;width:34px;height:34px;border:1px solid #bedfff15;border-radius:11px;background:#bedfff07;color:#a6b8cd;cursor:pointer}
.dmp-head button:hover{background:#a8d9ff18;color:#fff;border-color:#a8d9ff40}
.dmp-head button:active,.dmp-step:active{transform:scale(.94)}
.dmp-section-title{font-size:11px;color:#a1c9e9;letter-spacing:.1em;font-weight:600;margin:0 0 14px}
.dmp-row{margin:0 0 18px}
.dmp-row-top{display:flex;align-items:center;gap:12px;min-height:32px}
.dmp-row-label{flex:0 0 auto;color:#e0ebf8;font-size:13px}
.dmp-row-val{margin-left:auto;font-size:12px;color:var(--dmp-accent);font-variant-numeric:tabular-nums;min-width:34px;text-align:right}
.dmp-hint{color:var(--dmp-muted);font-size:11px;margin-top:5px;line-height:1.6}
.dmp-sub{display:flex;align-items:center;gap:8px;margin-top:10px;padding:10px 12px;background:#a8d9ff05;border:1px solid #a8d9ff12;border-radius:12px;color:#a9bbd1;font-size:12px}
.dmp-range{flex:1;min-width:0;accent-color:var(--dmp-accent);height:20px;cursor:pointer}
.dmp-stepper{margin-left:auto;display:flex;align-items:center;gap:3px;border:1px solid #a8d9ff22;border-radius:12px;padding:3px;background:#0b152066}
.dmp-step{display:grid;place-items:center;width:32px;height:30px;border:0;border-radius:8px;background:transparent;color:#b8d8f0;cursor:pointer}
.dmp-step .dmp-icon{width:16px;height:16px}
.dmp-step:hover:not(:disabled){background:#a8d9ff18;color:#e1f4ff}
.dmp-step:disabled{opacity:.3;cursor:default}
.dmp-step-val{min-width:26px;text-align:center;color:#eef6ff;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.dmp-num{width:56px;min-height:32px;border:1px solid #a8d9ff22;border-radius:9px;background:#101b28;color:#e7f4ff;padding:5px 8px;font:inherit;text-align:center}
.dmp-num:disabled{opacity:.4}
.dmp-btn{margin-left:auto;border:1px solid #a8d9ff22;border-radius:10px;background:#a8d9ff08;color:#cde6fa;font-size:12px;padding:7px 13px;cursor:pointer;transition:background .15s,border-color .15s}
.dmp-btn:hover:not(:disabled){background:#a8d9ff18;border-color:#a8d9ff66}
.dmp-check{appearance:none;-webkit-appearance:none;width:38px;height:23px;flex:none;margin:0 0 0 auto;border-radius:14px;background:#445368;position:relative;cursor:pointer;transition:background .15s;box-shadow:0 0 0 1px #ffffff0c inset}
.dmp-check::after{content:'';position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#e6eef8;transition:transform .15s;box-shadow:0 1px 3px #0003}
.dmp-check:checked{background:#94cef6}
.dmp-check:checked::after{transform:translateX(15px);background:#153650}
.dmp-panel :is(button,input,select,summary):focus-visible{outline:2px solid var(--dmp-accent);outline-offset:3px}
.dmp-select{appearance:none;-webkit-appearance:none;display:block;width:100%;margin-top:8px;min-height:38px;padding:8px 32px 8px 10px;border:1px solid #a8d9ff22;border-radius:10px;background:#101b28 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16' fill='none' stroke='%239ed8ff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E") no-repeat right 10px center;color:#dbeaff;font-size:12px;text-overflow:ellipsis;cursor:pointer}
.dmp-details{border-top:1px solid #a8d9ff18;margin-top:6px;padding-top:16px}
.dmp-details summary{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;list-style:none;color:#c1d4e9;font-size:12px;min-height:30px}
.dmp-details summary:hover{color:#edf7ff;background:#a8d9ff08;border-radius:8px}
.dmp-details summary::-webkit-details-marker{display:none}
.dmp-details summary>.dmp-icon{width:15px;height:15px;color:#88a6c5;transition:transform .18s}
.dmp-details[open] summary{margin-bottom:16px}
.dmp-details[open] summary>.dmp-icon{transform:rotate(90deg)}
.dmp-panel-footer{margin-top:18px;font-size:10px;color:#859ab4;text-align:center}
.dmp-sub:has(input:disabled){opacity:.55}
.dmp-gear{display:grid;place-items:center;border-radius:50%;background:#17283beF;border:1px solid #addcff55;color:#d9efff;box-shadow:0 3px 12px #0005}
.dmp-gear .dmp-icon{width:60%;height:60%}
@media(prefers-reduced-motion:reduce){.dmp-panel,.dmp-panel *{transition:none!important}}

`
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  // ── asset bytes ───────────────────────────────────────────────────────────
  /**
   * Every picture and sound the widget draws comes through here first.
   *
   * On a busy page the browser starves its lowest-priority requests: image and
   * media loads sit `stalled` for ten seconds while `/api/turn` answers in 1-3ms,
   * and the whole queue drains at once the moment the conversation is used. That
   * is why a fresh conversation played no voice — and why a sprite swap appeared
   * to do nothing until the next message: the swap waited on an image load that
   * had not finished yet. `fetch` never lost that race, so the bytes are fetched
   * here and handed to the element as a blob URL. The plain URL is set first as a
   * fallback, so even a failed fetch degrades to the old behaviour instead of an
   * empty box.
   */
  const assetBytes = new Map()
  const ASSET_BYTES_KEEP = 10

  /** Blob URLs currently on screen — an eviction must never revoke these. */
  const shownBlobs = { sprite: null, plate: null, gear: null }
  /** Which swap owns each slot, so a late blob cannot overwrite a newer picture. */
  const artToken = { sprite: 0, plate: 0, gear: 0 }
  let voiceBlobUrl = null
  let clickBlobUrl = null

  function assetBytesFor(url, label) {
    const hit = assetBytes.get(url)
    if (hit) return hit
    const pending = fetch(url, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then((blob) => URL.createObjectURL(blob))
      .catch((err) => {
        // Fall back to letting the element fetch it directly; say why, because a
        // silent failure here is exactly the bug this path exists to avoid.
        console.warn(`[dsh-moonpet] ${label}字节读取失败，改用直连加载：${url} — ${String((err && err.message) || err)}`)
        return null
      })
    assetBytes.set(url, pending)
    if (assetBytes.size > ASSET_BYTES_KEEP) {
      const oldest = assetBytes.keys().next().value
      if (oldest !== url) {
        const stale = assetBytes.get(oldest)
        assetBytes.delete(oldest)
        Promise.resolve(stale).then((blobUrl) => {
          if (!blobUrl) return
          if (blobUrl === voiceBlobUrl || blobUrl === clickBlobUrl) return
          if (blobUrl === shownBlobs.sprite || blobUrl === shownBlobs.plate) return
          if (blobUrl === shownBlobs.gear) return
          URL.revokeObjectURL(blobUrl)
        })
      }
    }
    return pending
  }

  /** Voice and click sounds are the audio half of the same cache. */
  function audioBytesFor(url) {
    return assetBytesFor(url, '语音')
  }

  /** Draw an image from its URL at once, then from a blob once bytes arrive. */
  function showArt(slot, img, url, label) {
    const token = (artToken[slot] += 1)
    img.src = url
    assetBytesFor(url, label).then((blobUrl) => {
      // Something newer may have taken the slot while the bytes were in flight.
      if (!blobUrl || token !== artToken[slot]) return
      img.src = blobUrl
      shownBlobs[slot] = blobUrl
    })
  }

  // ── dom ───────────────────────────────────────────────────────────────────
  const root = $('div', 'dmp-root')
  const stage = $('div', 'dmp-stage')
  root.appendChild(stage)

  const spriteBox = $('div', 'dmp-sprite')
  const spriteImg = $('img', 'dmp-sprite-img')
  spriteImg.alt = ''
  spriteImg.draggable = false
  const gear = $('button', 'dmp-gear')
  gear.type = 'button'
  gear.title = 'MoonPet 设置'
  gear.setAttribute('aria-label', '打开 MoonPet 设置')
  gear.setAttribute('aria-expanded', 'false')
  gear.innerHTML = icon('settings')
  spriteBox.appendChild(spriteImg)
  spriteBox.appendChild(gear)
  const petLabel = $('span', 'dmp-pet-label')
  petLabel.hidden = true
  petLabel.setAttribute('role', 'status')
  spriteBox.appendChild(petLabel)
  stage.appendChild(spriteBox)

  // The always-on balance chip. Appended before the plate so the plate paints
  // over it when the two land in the same band.
  const badge = $('div', 'dmp-badge')
  const badgeInner = $('span', 'dmp-badge-inner')
  badge.appendChild(badgeInner)
  stage.appendChild(badge)

  const dialog = $('div', 'dmp-dialog')
  const dialogPlate = $('div', 'dmp-dialog-plate')
  const dialogImg = $('img', 'dmp-dialog-img')
  showArt('plate', dialogImg, `${UI}/dialog.png`, '对话框底图')
  dialogImg.alt = ''
  dialogImg.draggable = false
  dialogPlate.appendChild(dialogImg)
  const dialogBody = $('div', 'dmp-dialog-body')
  const lineBox = $('div', 'dmp-line')
  const lineInner = $('div', 'dmp-line-inner')
  lineBox.appendChild(lineInner)
  const foot = $('div', 'dmp-foot')
  const costLine = $('div', 'dmp-cost dmp-cost-off')
  const walletLine = $('div', 'dmp-wallet')
  const focusStart = $('button', 'dmp-focus-start')
  focusStart.type = 'button'
  focusStart.textContent = '开始专注'
  focusStart.hidden = true
  foot.appendChild(costLine)
  foot.appendChild(walletLine)
  foot.appendChild(focusStart)
  dialogBody.appendChild(lineBox)
  dialogBody.appendChild(foot)
  dialog.appendChild(dialogPlate)
  dialog.appendChild(dialogBody)
  stage.appendChild(dialog)
  const panel = $('div', 'dmp-panel')
  panel.innerHTML = `
    <header class="dmp-head"><div class="dmp-brand"><span class="dmp-moonmark"><img src="${UI}/brand.svg" alt="鲸蓝角色头像" width="44" height="44"></span><div><strong>MoonPet</strong><small>你的桌面陪伴</small></div></div><button type="button" data-act="close" aria-label="关闭设置">${icon('close')}</button></header>
    <div class="dmp-section-title">陪伴设置</div>
    <div class="dmp-row"><label class="dmp-row-top"><span class="dmp-row-label">状态联动</span><input class="dmp-check" type="checkbox" data-act="pet-enabled" role="switch"></label><div class="dmp-hint">跟随思考、执行和任务完成切换表情</div></div>
    <div class="dmp-row"><div class="dmp-row-top"><span class="dmp-row-label">宠物大小</span><span class="dmp-stepper"><button class="dmp-step" type="button" data-act="scale-dec" aria-label="缩小宠物">${icon('minus')}</button><span class="dmp-step-val" data-val="scale">5</span><button class="dmp-step" type="button" data-act="scale-inc" aria-label="放大宠物">${icon('plus')}</button></span></div></div>
    <div class="dmp-row"><label class="dmp-row-top"><span class="dmp-row-label">音量</span><input class="dmp-range" type="range" data-act="volume" min="0" max="100" step="1"><span class="dmp-row-val" data-val="volume">50%</span></label></div>
    <div class="dmp-row"><label class="dmp-row-top"><span class="dmp-row-label">自动播放语音</span><input class="dmp-check" type="checkbox" data-act="autoplay" role="switch"></label><div class="dmp-sub"><span>每</span><input class="dmp-num" type="number" data-act="autoplay-min" aria-label="自动播放间隔，分钟" min="0.5" max="240" step="0.5"><span>分钟播放一句</span></div></div>
    <details class="dmp-details"><summary><span>字幕与资源</span>${icon('chevron')}</summary>
      <div class="dmp-row"><label class="dmp-row-top"><span class="dmp-row-label">显示字幕</span><input class="dmp-check" type="checkbox" data-act="dialog-enabled" role="switch"></label></div>
      <div class="dmp-row"><div class="dmp-row-top"><span class="dmp-row-label">字幕语言</span><button class="dmp-btn" type="button" data-act="lang">英文</button></div></div>
      <div class="dmp-row"><div class="dmp-row-top"><span class="dmp-row-label">字幕大小</span><span class="dmp-stepper"><button class="dmp-step" type="button" data-act="dialog-scale-dec" aria-label="缩小字幕">${icon('minus')}</button><span class="dmp-step-val" data-val="dialog-scale">5</span><button class="dmp-step" type="button" data-act="dialog-scale-inc" aria-label="放大字幕">${icon('plus')}</button></span></div></div>
      <div class="dmp-row"><label class="dmp-row-label" for="dmp-sprite-pack">角色</label><select id="dmp-sprite-pack" class="dmp-select" data-act="sprite-pack"></select><div class="dmp-hint" data-val="sprite-pack-info"></div></div>
      <div class="dmp-row"><label class="dmp-row-label" for="dmp-voice-pack">语音包</label><select id="dmp-voice-pack" class="dmp-select" data-act="voice-pack"></select><div class="dmp-hint" data-val="voice-pack-info"></div></div>
    </details><div class="dmp-panel-footer">拖动角色即可调整位置 · 设置自动保存</div>
  `
  stage.appendChild(panel)

  const el = (act) => panel.querySelector(`[data-act="${act}"]`)
  const valEl = (name) => panel.querySelector(`[data-val="${name}"]`)
  const ui = {
    scaleDec: el('scale-dec'),
    scaleInc: el('scale-inc'),
    scaleVal: valEl('scale'),
    volume: el('volume'),
    volumeVal: valEl('volume'),
    lang: el('lang'),
    autoPlay: el('autoplay'),
    autoPlayMin: el('autoplay-min'),
    dialogScaleDec: el('dialog-scale-dec'),
    dialogScaleInc: el('dialog-scale-inc'),
    dialogScaleVal: valEl('dialog-scale'),
    dialogEnabled: el('dialog-enabled'),
    petEnabled: el('pet-enabled'),
    spritePack: el('sprite-pack'),
    spritePackInfo: valEl('sprite-pack-info'),
    voicePack: el('voice-pack'),
    voicePackInfo: valEl('voice-pack-info'),
  }

  // Start hidden; the widget is revealed once the first bootstrap answers.
  root.style.visibility = 'hidden'
  const mount = () => {
    // A previous attempt that failed left its half-built root behind: this one
    // owns the corner now.
    for (const stale of document.querySelectorAll('.dmp-root')) stale.remove()
    ;(document.body || document.documentElement).appendChild(root)
  }
  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount, { once: true })

  // ── audio ─────────────────────────────────────────────────────────────────
  let voiceAudio = null
  let clickAudio = null

  /**
   * How long a line may wait for its bytes before it is written off.
   *
   * A media element that never gets its data does not fail: it sits at
   * `networkState: LOADING` and its `play()` promise stays pending, so the box
   * looks fine and simply makes no sound. Waiting forever is worse than silence —
   * a clip that arrives ten seconds later plays into a box that has moved on.
   */
  const VOICE_READY_TIMEOUT_MS = 5000

  /** Bumped for every new line, so a slow load can never start a stale voice. */
  let voiceToken = 0
  let voiceStartTimer = null

  /**
   * Media elements fetch their own `src`, and in the DSH web app those requests
   * lose the race for the page's six HTTP/1.1 connections. `fetch` never lost it,
   * so playback uses the blob URLs from `assetBytesFor` above and stays off the
   * starved media queue entirely.
   */
  let clickWarmed = false

  /** The settings click must be instant too — it is 65KB, so warm it at boot. */
  function warmClickSound() {
    if (clickWarmed) return
    clickWarmed = true
    audioBytesFor(`${UI}/click.wav`).then((blobUrl) => {
      clickBlobUrl = blobUrl
    })
  }

  /**
   * "This line is finished" gate.
   *
   * The box must linger for `dialogHoldSeconds` after the *voice* stops — not
   * after the text stops appearing. A spoken line is routinely longer than the
   * typewriter animation, so hiding on the text alone cut the audio off
   * mid-sentence. Both signals must land before the countdown starts.
   */
  let typingFinished = false
  let voiceFinished = true
  let voiceFallbackTimer = null
  // Set when the countdown was armed by an explicit click on the box. From then
  // on the typing/voice callbacks must leave it alone — otherwise a voice that
  // happens to still be playing would silently extend the 3s the user just asked
  // for.
  let holdLatched = false

  function clearVoiceFallback() {
    if (voiceFallbackTimer) {
      clearTimeout(voiceFallbackTimer)
      voiceFallbackTimer = null
    }
    if (voiceStartTimer) {
      clearTimeout(voiceStartTimer)
      voiceStartTimer = null
    }
  }

  /** Start of a new line: nothing has finished yet. */
  function resetLineGate() {
    typingFinished = false
    voiceFinished = true // flipped to false the moment a voice actually starts
    holdLatched = false
    clearVoiceFallback()
    cancelAutoHide()
  }

  function noteTypingFinished() {
    typingFinished = true
    if (!holdLatched && voiceFinished) scheduleAutoHide()
  }

  function noteVoiceFinished() {
    clearVoiceFallback()
    voiceFinished = true
    if (!holdLatched && typingFinished) scheduleAutoHide()
  }

  function stopVoice() {
    // Supersede whatever was loading: a line that is no longer current must not
    // suddenly start playing later.
    voiceToken++
    clearVoiceFallback()
    if (!voiceAudio) return
    try {
      voiceAudio.pause()
      voiceAudio.removeAttribute('src')
      voiceAudio.load()
    } catch {
      // ignore
    }
    voiceAudio = null
  }
  document.addEventListener('moonpet:focus-alarm', stopVoice)

  /**
   * Play one line from bytes we fetched ourselves.
   *
   * `playVoice` may be called twice in a row (a click during a load, or a new line
   * arriving while the previous one was still fetching); the token makes sure only
   * the line that is still current reaches the speakers.
   */
  function startVoiceAudio(src, token) {
    if (token !== voiceToken) return
    try {
      const audio = new Audio(src)
      audio.volume = clamp(num(cfg().volume, 0.5), 0, 1)
      audio.addEventListener('ended', noteVoiceFinished, { once: true })
      audio.addEventListener('error', () => {
        console.warn('[dsh-moonpet] 语音解码或加载失败，本句按无声处理')
        noteVoiceFinished()
      }, { once: true })
      audio.addEventListener(
        'playing',
        () => {
          if (voiceStartTimer) {
            clearTimeout(voiceStartTimer)
            voiceStartTimer = null
          }
        },
        { once: true },
      )
      // Safety net: a truncated stream may never fire `ended`, and the box must not
      // be held open forever waiting for it.
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (voiceFallbackTimer) clearTimeout(voiceFallbackTimer)
          const seconds = Number.isFinite(audio.duration) ? audio.duration : 120
          voiceFallbackTimer = setTimeout(noteVoiceFinished, Math.min(seconds, 600) * 1000 + 2000)
        },
        { once: true },
      )
      voiceFallbackTimer = setTimeout(noteVoiceFinished, 120000)
      voiceAudio = audio
      voiceFinished = false
      const started = audio.play()
      if (started && typeof started.catch === 'function') {
        started.catch((err) => {
          console.warn(`[dsh-moonpet] 语音播放被拒绝（${String((err && err.name) || err)}），本句按无声处理`)
          noteVoiceFinished()
        })
      }
    } catch (err) {
      console.warn(`[dsh-moonpet] 无法创建音频元素：${String((err && err.message) || err)}`)
      noteVoiceFinished()
    }
  }

  function playVoice(url) {
    if (!url) return
    stopVoice() // bumps the token: anything still loading is now stale
    clearVoiceFallback()
    const token = voiceToken
    voiceStartTimer = setTimeout(() => {
      voiceStartTimer = null
      if (token !== voiceToken) return
      voiceToken++ // drop the pending line so it cannot sound off later
      console.warn('[dsh-moonpet] 语音迟迟没有加载出来，本句按无声处理')
      noteVoiceFinished()
    }, VOICE_READY_TIMEOUT_MS)
    audioBytesFor(url).then((blobUrl) => {
      if (token !== voiceToken) return
      if (blobUrl && voiceBlobUrl !== blobUrl) voiceBlobUrl = blobUrl
      startVoiceAudio(blobUrl || url, token)
    })
  }

  function playClick() {
    warmClickSound()
    try {
      const src = clickBlobUrl || `${UI}/click.wav`
      if (!clickAudio || clickAudio.dataset.src !== src) {
        clickAudio = new Audio(src)
        clickAudio.dataset.src = src
      }
      clickAudio.volume = clamp(num(cfg().volume, 0.5), 0, 1)
      clickAudio.currentTime = 0
      const started = clickAudio.play()
      if (started && typeof started.catch === 'function') {
        started.catch((err) => {
          console.warn(`[dsh-moonpet] 点击音播放被拒绝：${String((err && err.name) || err)}`)
        })
      }
    } catch {
      // A missing click sound must never break the settings button.
    }
  }

  function applyVolume() {
    const volume = clamp(num(cfg().volume, 0.5), 0, 1)
    if (voiceAudio) voiceAudio.volume = volume
    if (clickAudio) clickAudio.volume = volume
    document.dispatchEvent(new CustomEvent('moonpet:volume', { detail: { volume } }))
  }

  // ── Our Free Model wallet ─────────────────────────────────────────────────
  // Use the host's same-origin, authenticated fetch transport. No credentials
  // are copied from the channel pack, and no login/claim/write RPC is invoked.
  const OFM_CHANNELS = [
    ['codearts', 'CodeArts'], ['buddy', 'CodeBuddy'], ['workbuddy', 'WorkBuddy'],
    ['lobsterai', 'LobsterAI'], ['qoder', 'Qoder'], ['qodercn', 'Qoder CN'],
    ['trae', 'TRAE'], ['cline', 'Cline'], ['loomy', 'Loomy'],
    ['raccoon', 'Raccoon'], ['minimax', 'MiniMax'], ['zcode', 'ZCode'], ['gemini', 'Gemini'],
  ]
  let ofmPending = false
  let ofmRpcSeq = 0

  async function detectOfm() {
    try {
      const res = await fetch('/api/our-free-model/summary', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(5000) })
      if (res.status === 404) { state.ofm = null; return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const summary = await res.json()
      if (typeof summary.version !== 'string' || !summary.channels) { state.ofm = null; return }
      if (!state.ofm) state.ofm = { rows: [], error: '' }
      state.ofm.packState = summary.channels.state
    } catch (error) {
      // Once detected, transport failures must not switch to an unrelated wallet.
      if (state.ofm) state.ofm = { ...state.ofm, stale: true, error: `额度连接失败：${error.message}` }
    }
  }

  async function ofmRpc(method, payload) {
    const rpcId = `moonpet-${++ofmRpcSeq}`
    const res = await fetch('/api/channel-pack', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'channel-pack', payload: { method, payload } }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const reply = await res.json()
    if (reply.type !== 'server-response' || reply.rpcId !== rpcId || reply.result?.ok !== true) {
      throw new Error(reply.result?.error?.message || '额度接口响应异常')
    }
    return reply.result.value
  }

  function ofmBalanceText(id, accounts) {
    const known = accounts.filter(row => typeof row.balance?.total === 'number' && Number.isFinite(row.balance.total))
    if (!known.length) return '未提供额度'
    let text
    if (id === 'gemini') {
      // Windows and accounts are independent quotas, never add percentages.
      text = known.map((row, index) => {
        const windows = (row.balance.packages || []).filter(p => Number.isFinite(p.remaining))
        return `${known.length > 1 ? `账号${index + 1} ` : ''}${windows.map(p => `${p.name} ${p.remaining}%`).join(' / ') || '未提供配额窗口'}`
      }).join('；')
    } else {
      const total = known.reduce((sum, row) => sum + row.balance.total, 0)
      text = id === 'cline' ? `$${total.toFixed(2)}` : `${formatTokenCount(total)} ${id === 'zcode' ? 'Token' : '积分'}`
    }
    return text + (known.length < accounts.length ? '（部分未提供）' : '')
  }

  async function refreshOfmWallet() {
    if (!state.ofm || ofmPending) return
    ofmPending = true
    const wallet = state.ofm
    try {
      const result = await ofmRpc('provider.status', { providers: OFM_CHANNELS.map(([id]) => id) })
      if (!result || typeof result.statuses !== 'object' || result.statuses === null) throw new Error('渠道状态响应异常')
      const rows = await Promise.all(OFM_CHANNELS.filter(([id]) => result.statuses[id]?.accounts?.total > 0).map(async ([id, name]) => {
        try {
          const value = await ofmRpc('credits.balances', { provider: id })
          if (!Array.isArray(value?.accounts)) throw new Error('额度响应异常')
          const failed = value.accounts.some(row => !Number.isFinite(row.balance?.total))
          const previous = wallet.rows.find(row => row.id === id)
          const allFailed = !value.accounts.some(row => Number.isFinite(row.balance?.total))
          return { id, name, text: allFailed && previous ? previous.text : ofmBalanceText(id, value.accounts), stale: failed && !!previous,
            error: failed ? '部分账号未返回额度，请到 Our Free Model 设置查看原因' : '' }
        } catch (error) {
          const previous = wallet.rows.find(row => row.id === id)
          return { id, name, text: previous?.text || '额度查询失败', stale: !!previous, error: error.message }
        }
      }))
      if (state.ofm === wallet) state.ofm = { ...wallet, rows, stale: false, error: '' }
    } catch (error) {
      if (state.ofm === wallet) state.ofm = { ...wallet, stale: true, error: `额度查询失败：${error.message}` }
    } finally {
      ofmPending = false
      renderWallet()
    }
  }

  function ofmWalletText() {
    const wallet = state.ofm
    if (!wallet) return ''
    const text = wallet.rows.map(row => `${row.name} ${row.text}${row.stale ? '（缓存）' : ''}${row.error ? `［${row.error}］` : ''}`).join('；')
      || (wallet.packState === 'ready' ? '匿名免费通道：未提供额度' : '渠道额度接口尚未就绪')
    return `${text}${wallet.stale ? '（缓存）' : ''}${wallet.error ? `；${wallet.error}` : ''}`
  }

  // ── server io ─────────────────────────────────────────────────────────────
  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  let saveTimer = null
  let pendingPatch = {}

  /** Coalesce rapid slider changes into one PUT. */
  function save(patch, immediate = false) {
    pendingPatch = { ...pendingPatch, ...patch }
    if (immediate) {
      const body = pendingPatch
      pendingPatch = {}
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      return fetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d && d.config) state.config = d.config
          return d
        })
        .catch(() => null)
    }
    if (saveTimer) return Promise.resolve(null)
    saveTimer = setTimeout(() => {
      saveTimer = null
      const body = pendingPatch
      pendingPatch = {}
      fetch(`${API}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d && d.config) state.config = d.config
        })
        .catch(() => {})
    }, 220)
    return Promise.resolve(null)
  }

  // ── layout ────────────────────────────────────────────────────────────────
  /* @pure-start */
  /**
   * A token count in K / M.
   *
   * A receipt is read at a glance: "128,453" has to be parsed digit by digit,
   * "128.5K" is recognised in one look. Below 1K the number is already short
   * enough to read as it is, so it stays exact — the unit is never used to hide
   * precision that fits. Above that it is one decimal for K and two for M, with
   * trailing zeros trimmed ("2K" rather than "2.0K").
   *
   * The thresholds are the *rounded* ones on purpose: 999,950 must read "1M"
   * rather than "1000.0K", and 999.6 must read "1K" rather than "1000".
   */
  function formatTokenCount(tokens) {
    // A missing count is not a count of zero — `Number(null)` is 0, which would
    // print a confident "0 token" for a turn that never reported its usage.
    if (tokens === null || tokens === undefined || tokens === '') return '--'
    const n = Number(tokens)
    if (!Number.isFinite(n)) return '--'
    const abs = Math.abs(n)
    if (abs >= 999950) return `${trimZeros((n / 1e6).toFixed(2))}M`
    if (abs >= 999.5) return `${trimZeros((n / 1e3).toFixed(1))}K`
    return String(Math.round(n))
  }
  const trimZeros = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s)

  /**
   * Placement maths, deliberately free of DOM access so it can be exercised
   * directly: scripts/verify.mjs lifts this block out and drives every branch.
   *
   * Returns the art's top-left corner plus the dialogue box's offset *relative
   * to the art box*:
   *
   *   side "below": if the art already sits on the bottom edge the plate shares
   *                 that edge (overlapping the art); if there is a partial gap the
   *                 art is nudged up so the plate fits completely.
   *   side "above": if the art sits on the top edge the plate flips underneath it;
   *                 if there is a partial gap the art is nudged down.
   *
   * The nudge is a layout offset only — the dragged anchor is never rewritten,
   * so hiding the dialogue box returns the art to exactly where the user left it.
   */
  function computePlacement(input) {
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
    const { vw, vh, contentW, contentH, dlgW, dlgH, gap } = input
    const dialogOn = input.dialogOn !== false
    const side = input.side === 'below' ? 'below' : 'above'

    let sx = input.hx === 'left' ? input.hd : vw - input.hd - contentW
    let sy = input.vy === 'top' ? input.vd : vh - input.vd - contentH
    sx = clamp(sx, -contentW * 0.4, vw - contentW * 0.6)
    sy = clamp(sy, -contentH * 0.4, vh - contentH * 0.6)

    let dx = (contentW - dlgW) / 2 // centred on the art
    let dy = -dlgH - gap // above

    if (dialogOn) {
      if (side === 'below') {
        if (sy + contentH + gap + dlgH > vh) {
          const roomBelow = vh - (sy + contentH)
          if (roomBelow < gap) {
            // Pinned to the bottom edge: share it, overlapping the art.
            dy = contentH - dlgH
          } else {
            const pushed = clamp(vh - dlgH - gap - contentH, 0, vh)
            if (pushed < sy) {
              sy = pushed
              dy = contentH + gap
            } else {
              dy = contentH - dlgH
            }
          }
        } else {
          dy = contentH + gap
        }
      } else if (sy - gap - dlgH < 0) {
        if (sy < gap) {
          dy = contentH + gap // art pinned to the top: flip the plate underneath
        } else {
          sy = clamp(dlgH + gap, 0, Math.max(0, vh - contentH))
          dy = -dlgH - gap
        }
      }
      // Final guard: the plate must stay fully on screen.
      if (sx + dx < 0) dx = -sx
      if (sx + dx + dlgW > vw) dx = vw - sx - dlgW
      if (sy + dy < 0) dy = -sy
      if (sy + dy + dlgH > vh) dy = vh - sy - dlgH
    }
    return { sx, sy, dx, dy }
  }
  /**
   * Settings panel placement: above the art when there is room, below it
   * otherwise. The vertical clamp on the end is the important part — without it
   * a large art size pushes the panel off the bottom of the screen, and since
   * the panel holds the *only* control that shrinks the art again, the widget
   * would be stuck that way with no way back.
   */
  function computePanelPlacement(input) {
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
    const { vw, vh, contentW, contentH, panelW, panelH, sx, sy } = input
    let py = -panelH - 8 // above the art
    if (sy + py < 6) py = contentH + 8 // no room above: drop below the art
    let px = contentW - panelW // flush with the art's right edge
    if (sx + px < 6) px = 6 - sx
    if (sx + px + panelW > vw - 6) px = vw - 6 - panelW - sx
    if (sy + py + panelH > vh - 6) py = vh - 6 - panelH - sy
    if (sy + py < 6) py = 6 - sy
    return { px, py }
  }
  /**
   * How long the box lingers, in seconds.
   *
   * A voice line and the balance table follow the configured hold. The turn
   * receipt does not: nobody asked for it, it arrives while the user is still
   * reading the answer, and it replaces nothing they were looking at — so it gets
   * a fixed duration of its own instead of the usual 3s.
   */
  function computeHoldSeconds(sheet, configured, costHold) {
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
    if (sheet === 'cost') {
      const c = Number(costHold)
      return Number.isFinite(c) ? c : 5
    }
    const n = Number(configured)
    return Number.isFinite(n) ? clamp(n, 0.5, 120) : 3
  }
  /**
   * Read one `/api/turn` poll and decide whether it is a receipt to show.
   *
   * The counter is a plain "how many turns have settled since the host started"
   * number, so a page load cannot tell a turn that settled *before* it from one
   * that settles right after — and it must not print a stale receipt on every
   * refresh. Hence the alignment: the first reading (`aligned: false`) is only a
   * baseline, never a receipt. Everything that follows is a genuine new turn as
   * long as the number went up.
   *
   * Getting the baseline wrong in the other direction is just as bad, and was a
   * real bug: treating "the counter was 0 before" as "this is the baseline" threw
   * away the first turn after every DSH restart — the exact turn a user is most
   * likely to be looking at.
   */
  function readTurnPoll(prevSeq, aligned, seq, tokens, amount) {
    const s = Math.trunc(Number(seq))
    if (!Number.isFinite(s)) return { aligned, seq: prevSeq, show: false }
    if (!aligned) return { aligned: true, seq: s, show: false }
    if (s <= prevSeq) return { aligned: true, seq: prevSeq, show: false }
    const hasFigures = Number(tokens) > 0 || Number(amount) > 0
    return { aligned: true, seq: s, show: hasFigures }
  }
  /* @pure-end */

  /** Width / height of the *visible* slice of the dialogue plate. */
  function dialogAspect() {
    const geo = state.dialog || DEFAULT_DIALOG_GEO
    const crop = geo.crop || DEFAULT_DIALOG_GEO.crop
    const image = geo.image || DEFAULT_DIALOG_GEO.image
    const w = (crop.w || 1) * (image.width || 1)
    const h = (crop.h || 1) * (image.height || 1)
    return h > 0 ? w / h : 16 / 9
  }

  /** A 1..10 level as a multiplier for the art. Level 5 is the 0.5 the old percentage form meant. */
  const levelFactor = (level) => clamp(num(level, 5), SCALE_MIN, SCALE_MAX) / 10

  /**
   * The dialogue box uses its own, deliberately re-based unit.
   *
   * The first release drove it from the same /10 factor as the art, which made
   * the default box far too large. The unit is now 0.04 per level, so level 5 —
   * the default — produces exactly what the old build produced at level 2, and
   * the comfortable size sits in the middle of the range. Level 25 would be the
   * full base width. Stored configs are re-based by `migrateConfig()`.
   */
  const DIALOG_LEVEL_UNIT = 0.04
  const dialogFactor = (level) => clamp(num(level, 5), SCALE_MIN, SCALE_MAX) * DIALOG_LEVEL_UNIT

  /** Resolve every on-screen size, then ask computePlacement where things go. */
  function layout() {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const c = cfg()
    const pack = packOf(state.packs.spritePacks, c.spritePack)
    const aspect =
      state.sprite && state.sprite.aspect
        ? state.sprite.aspect
        : pack && pack.aspect
          ? pack.aspect
          : 1

    const contentH = clamp(Math.min(vh * 0.52, 620) * levelFactor(c.scale), 24, vh * 1.2)
    const contentW = clamp(contentH * aspect, 20, vw * 1.2)

    // Placement always reserves room for the box as long as the setting allows
    // it — even while the box is faded out. Re-flowing on every auto-hide would
    // make the art lurch up and down on a 3-second cycle. Switching the box off
    // entirely (the setting) is what returns the art to its dragged position.
    const dialogOn = c.dialogEnabled !== false
    // The plate is a wide strip after cropping, so the same vertical budget
    // affords a wider — and therefore sharper — box than the raw 16:9 artwork.
    const dlgW = clamp(Math.min(vw * 0.66, 1040) * dialogFactor(c.dialogScale), 70, vw * 0.96)
    const dlgH = dlgW / dialogAspect()

    const pos = c.pos || { hx: 'right', hd: 24, vy: 'bottom', vd: 24 }
    const placed = computePlacement({
      vw,
      vh,
      contentW,
      contentH,
      dlgW,
      dlgH,
      gap: GAP,
      dialogOn,
      side: c.dialogSide,
      hx: pos.hx,
      hd: num(pos.hd, 24),
      vy: pos.vy,
      vd: num(pos.vd, 24),
    })

    // Keep the settings button proportionate to the art it sits on.
    const gearSize = clamp(Math.round(contentW * 0.17), 18, 34)

    return {
      vw,
      vh,
      contentW,
      contentH,
      dlgW,
      dlgH,
      sx: placed.sx,
      sy: placed.sy,
      dx: placed.dx,
      dy: placed.dy,
      dialogOn,
      pack,
      gearSize,
    }
  }

  /**
   * The dialogue plate's inner box and the strip reserved for the footer.
   * Shared by applyLayout() and syncFooter() so the two always agree.
   */
  function dialogBox() {
    const geo = state.dialog || DEFAULT_DIALOG_GEO
    const m = layout()
    const inset = geo.inset || DEFAULT_DIALOG_GEO.inset
    // No minimum inflation here: the figure sheets derive their safe band from
    // this number, and padding it up to a floor pushed that band down over the
    // logo on the smallest plates.
    const innerH = Math.max(1, m.dlgH * (1 - num(inset.top, 0.07) - num(inset.bottom, 0.04)))
    const ratio = clamp(num((geo.footer || {}).heightRatio, 0.42), 0.15, 0.7)
    return { m, geo, innerH, footerCap: Math.max(6, Math.round(innerH * ratio)) }
  }

  function applyLayout() {
    const box = dialogBox()
    const m = box.m
    const c = cfg()
    const geo = box.geo

    stage.style.transform = `translate(${Math.round(m.sx)}px, ${Math.round(m.sy)}px)`
    spriteBox.style.width = `${m.contentW}px`
    spriteBox.style.height = `${m.contentH}px`

    // Crop away the transparent margin: the box *is* the visible area.
    const sprite = state.sprite
    const crop = (sprite && sprite.crop) || (m.pack && m.pack.crop) || { x: 0, y: 0, w: 1, h: 1 }
    const imgW = m.contentW / (crop.w || 1)
    const imgH = m.contentH / (crop.h || 1)
    spriteImg.style.width = `${imgW}px`
    spriteImg.style.height = `${imgH}px`
    spriteImg.style.left = `${-crop.x * imgW}px`
    spriteImg.style.top = `${-crop.y * imgH}px`

    gear.style.width = `${m.gearSize}px`
    gear.style.height = `${m.gearSize}px`
    gear.style.left = `${Math.max(0, m.contentW - m.gearSize)}px`
    gear.style.top = '0px'

    // The chip hangs off the art's bottom edge. Only here is `contentH` known,
    // and because it lives inside `.dmp-stage` the transform carries it along
    // when the art is dragged — no extra bookkeeping.
    //
    // It is centred on the art but may be wider than it (three figures and a
    // unit), so the box takes whichever is wider and is then pulled back inside
    // the viewport — otherwise an art pinned to the right edge gets a read-out
    // clipped in half.
    const chipW = badgeInner.offsetWidth || 0
    const badgeW = Math.max(m.contentW, chipW)
    // "Not clipped" is not enough: a pill whose rounded end touches the viewport
    // boundary reads as broken, so a visible gap is kept on both sides.
    const EDGE = 10
    // Clamp against the *usable* width, not `window.innerWidth`: that one includes
    // the vertical scrollbar, so clamping to it still lands the pill a scrollbar's
    // width past the visible area — which is exactly how the rounded end gets cut.
    const rootEl = document.documentElement
    const usableW = Math.max(1, rootEl && rootEl.clientWidth ? rootEl.clientWidth : m.vw)
    let badgeLeft = (m.contentW - badgeW) / 2
    if (m.sx + badgeLeft < EDGE) badgeLeft = EDGE - m.sx
    if (m.sx + badgeLeft + badgeW > usableW - EDGE) badgeLeft = usableW - EDGE - m.sx - badgeW
    badge.style.width = `${badgeW}px`
    badge.style.left = `${badgeLeft}px`
    const badgeH = badge.offsetHeight || 0
    const badgeGap = 6
    // Below the art by preference. A tall art — or one dragged low — leaves no
    // room down there, and clamping to the viewport edge would park the read-out
    // on the character's feet, half off-screen. So it moves above the art
    // instead, and only if that is off-screen too does it get clamped.
    let badgeTop = m.contentH + badgeGap
    if (m.sy + badgeTop + badgeH > m.vh - 4) {
      const above = -badgeH - badgeGap
      badgeTop = m.sy + above >= 4 ? above : Math.max(0, m.vh - m.sy - badgeH - 4)
    }
    badge.style.top = `${badgeTop}px`

    dialog.style.width = `${m.dlgW}px`
    dialog.style.height = `${m.dlgH}px`
    dialog.style.left = `${m.dx}px`
    dialog.style.top = `${m.dy}px`
    const visible = m.dialogOn && state.dialogShown === true
    dialog.style.opacity = visible ? String(clamp(1 - num(c.dialogOpacity, 0) / 100, 0.05, 1)) : '0'
    root.classList.toggle('dmp-dialog-on', visible)

    // With `dialogSide: 'below'` — or after the chip moved above the art — the
    // plate can claim the same band. Let the plate win while it is on screen
    // instead of printing two read-outs on top of one another; the chip is back
    // the moment it fades.
    const badgeClash = m.dy < badgeTop + badgeH && m.dy + m.dlgH > badgeTop
    badge.classList.toggle('dmp-badge-off', visible && badgeClash)
    root.classList.toggle('dmp-hidden', c.spriteVisible === false)
    root.classList.toggle('dmp-nosprite', !state.sprite)

    // Show only the bottom slice of the artwork (see assets/ui/dialog.json).
    const plateCrop = geo.crop || DEFAULT_DIALOG_GEO.crop
    const plateImgW = m.dlgW / (plateCrop.w || 1)
    const plateImgH = m.dlgH / (plateCrop.h || 1)
    dialogImg.style.width = `${plateImgW}px`
    dialogImg.style.height = `${plateImgH}px`
    dialogImg.style.left = `${-plateCrop.x * plateImgW}px`
    dialogImg.style.top = `${-plateCrop.y * plateImgH}px`
    dialogPlate.style.borderRadius = `${Math.max(0, num(geo.radius, 10))}px`

    // Text area: the plate's inner box minus the reserved footer strip.
    const inset = geo.inset || DEFAULT_DIALOG_GEO.inset
    const insetL = m.dlgW * num(inset.left, 0.05)
    const insetR = m.dlgW * num(inset.right, 0.05)
    const insetT = m.dlgH * num(inset.top, 0.07)
    const insetB = m.dlgH * num(inset.bottom, 0.04)
    dialogBody.style.left = `${insetL}px`
    dialogBody.style.right = `${insetR}px`
    dialogBody.style.top = `${insetT}px`
    dialogBody.style.bottom = `${insetB}px`

    // The footer is deliberately the chunky part of the box and is kept clear of
    // the logo in the bottom-right corner.
    //
    // It is sized to its *content*, capped by the reserved ratio — not pinned to
    // a fixed share of the box. A fixed share is smaller than two rows of text
    // once the plate gets short (level 4 and below), and because the footer is
    // bottom-aligned with nothing clipping it, the overflow spilled upwards and
    // sat on top of the dialogue line.
    const innerW = Math.max(40, m.dlgW - insetL - insetR)
    const figuresFull = foot.classList.contains('dmp-foot-full')
    // The width cap serves exactly one layout: a voice line with the small figures
    // underneath, where they have to keep clear of the logo in the bottom-right
    // corner. A figure sheet needs no cap — it *is* the content, and the vertical
    // 72% band already clears the logo. Worse, a capped flex item under
    // `align-items:stretch` is placed at the *start* of the cross axis, so the cap
    // left the strip hugging the left edge with the figures centred inside it:
    // visually off-centre in the plate. Hence 'none', not the class rule alone —
    // this inline style would have won over `.dmp-foot-full{max-width:none}`.
    foot.style.maxWidth = figuresFull
      ? 'none'
      : `${Math.round(innerW * clamp(num((geo.footer || {}).maxWidthRatio, 0.66), 0.3, 1))}px`
    const footerH = fitFooter(m.dlgW, figuresFull ? box.innerH : box.footerCap, figuresFull)
    lastFooterH = footerH

    // Re-fit the line whenever the plate *or the reserved footer strip* changed,
    // so the text keeps filling whatever is left. Skipped otherwise: a mid-typing
    // re-fit would cut the animation short on every sprite load.
    const fitKey = `${Math.round(m.dlgW)}x${Math.round(m.dlgH)}x${Math.round(footerH)}`
    if (fitKey !== lastFitKey) {
      lastFitKey = fitKey
      refitLine()
    }

    // Settings panel: above the art when there is room, otherwise below it,
    // always clamped back into view (see computePanelPlacement).
    const panelH = panel.offsetHeight || 380
    const panelW = panel.offsetWidth || 320
    const placedPanel = computePanelPlacement({
      vw: m.vw,
      vh: m.vh,
      contentW: m.contentW,
      contentH: m.contentH,
      panelW,
      panelH,
      sx: m.sx,
      sy: m.sy,
    })
    panel.style.left = `${Math.round(placedPanel.px)}px`
    panel.style.top = `${Math.round(placedPanel.py)}px`
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  function currentLine() {
    const voice = state.voice
    if (!voice) return ''
    const zh = (voice.zh || '').trim()
    const ja = (voice.ja || '').trim()
    const en = (voice.en || '').trim()
    if (cfg().lang === 'en') return en || zh || ja
    if (cfg().lang === 'zh') return zh || en || ja
    return ja || en || zh
  }

  /**
   * Auto-fit: pick the largest font size at which the whole line still fits the
   * text area, so long lines shrink to fit and short ones grow — but only up to
   * `MAX_LINE_FONT`, never to "as big as the box allows".
   *
   * The floor is deliberately very low. An earlier version refused to go below
   * 12px, which meant a long line in a short plate could not fit at all: it
   * overflowed and `overflow:hidden` cut it off exactly at the footer's top edge,
   * so the balance figures looked like they were covering the text. Better a
   * small complete line than a truncated legible one.
   */
  const MIN_LINE_FONT = 5

  /**
   * The upper end of the scale, in px.
   *
   * Filling the plate is the wrong goal for a caption: a two-character line grew
   * to 44px on a large plate, which reads as a shout rather than a line of
   * dialogue. The cap keeps short lines merely *prominent*, and it only ever binds
   * on short ones — a long line is limited by the box long before it gets here.
   */
  const MAX_LINE_FONT = 28

  /**
   * Measure with fractional precision.
   *
   * `clientHeight`/`scrollHeight` are integers, and their 1px of slack was
   * enough to let a level-9 box overflow by 1.3px — a real, if sub-pixel, clip
   * that also slipped past the truncation cue.
   */
  const lineAvail = () => lineBox.getBoundingClientRect().height
  const lineTextHeight = () => lineInner.getBoundingClientRect().height

  /**
   * Share of the plate's inner height the receipt / balance sheets may use.
   *
   * The shipped artwork carries a logo at y 72.8%–90.9%; its inner box spans
   * 7%–96%, so (72.8-7)/89 = 0.739 is the last safe fraction, which the shipped
   * geometry rounds down to 0.72. The value travels with the plate: a self-made
   * image with nothing in the corner declares 1 and the figures get the whole
   * height. Read per call, so replacing the plate takes effect immediately.
   */
  function logoShare() {
    return clamp(num((state.dialog || {}).logoShare, DEFAULT_DIALOG_GEO.logoShare), 0.2, 1)
  }

  /**
   * Commit a font size, then make sure it really fits.
   *
   * Text height jumps in whole rows as the font crosses a wrap boundary, so the
   * winning size sits right on a cliff edge. `toFixed(1)` rounds 6.19 *up* to
   * 6.2, which is enough to push one more character onto a new line and overflow
   * — that is exactly how a level-4 box ended up 4px short. Round down, then walk
   * back in 0.1px steps until the measurement agrees.
   */
  function commitLineFont(size, avail) {
    let chosen = Math.max(MIN_LINE_FONT, Math.floor(size * 10) / 10)
    lineInner.style.fontSize = `${chosen}px`
    let guard = 0
    while (chosen > MIN_LINE_FONT && lineTextHeight() > avail + 0.5 && guard++ < 120) {
      chosen = Math.round((chosen - 0.1) * 10) / 10
      lineInner.style.fontSize = `${chosen}px`
    }
    // Still overflowing at the floor means the plate is genuinely too small for
    // this line (levels 1-2 with a very long line). Fade the cut edge so it reads
    // as "there is more below" instead of looking like the footer is sitting on
    // top of the text.
    lineBox.classList.toggle('dmp-line-clipped', lineTextHeight() > avail + 0.5)
    return chosen
  }

  function fitLine() {
    if (!lineInner.textContent) return
    const avail = lineAvail()
    if (!avail || avail < 4) return
    // `avail * 0.86` is what the *box* would allow; MAX_LINE_FONT is what the line
    // is allowed to want.
    const hi = clamp(avail * 0.86, 8, MAX_LINE_FONT)
    if (hi <= MIN_LINE_FONT) {
      commitLineFont(MIN_LINE_FONT, avail)
      return
    }
    lineInner.style.fontSize = `${hi}px`
    if (lineTextHeight() <= avail + 0.5) {
      commitLineFont(hi, avail)
      return
    }
    // Binary search the largest size that still fits, then verify after rounding.
    let low = MIN_LINE_FONT
    let high = hi
    for (let i = 0; i < 9; i++) {
      const mid = (low + high) / 2
      lineInner.style.fontSize = `${mid}px`
      if (lineTextHeight() <= avail + 0.5) low = mid
      else high = mid
    }
    commitLineFont(low, avail)
  }

  let typingTimer = null
  let hideTimer = null
  let currentFullText = ''
  let lastFitKey = ''
  let lastFooterH = -1

  function stopTyping() {
    if (typingTimer) {
      clearInterval(typingTimer)
      typingTimer = null
    }
  }

  function cancelAutoHide() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  /**
   * How long the box lingers before fading out. See `computeHoldSeconds` for why
   * the receipt is the odd one out.
   */
  function holdSeconds() {
    return computeHoldSeconds(state.sheet, cfg().dialogHoldSeconds, COST_HOLD_SECONDS)
  }

  /**
   * The box is not a permanent fixture: once the line has finished appearing it
   * lingers for a moment and then gets out of the way.
   */
  function scheduleAutoHide() {
    cancelAutoHide()
    // While the settings panel is open the box stays put: otherwise it would
    // vanish mid-adjustment and you could never see what the size or opacity
    // sliders were actually doing.
    if (state.panelOpen || state.sheet === 'focus') return
    const hold = holdSeconds()
    hideTimer = setTimeout(() => {
      hideTimer = null
      hideDialog()
    }, hold * 1000)
  }

  /** Fade the box out and settle the art back to its resting pose. */
  function hideDialog() {
    state.dialogShown = false
    revertToDefaultSprite()
    applyLayout()
  }

  function showDialog() {
    if (cfg().dialogEnabled === false) return
    if (state.dialogShown === true) return
    state.dialogShown = true
    applyLayout()
  }

  /** Show the whole line at once, sized to fill the box. */
  function showLine(text) {
    stopTyping()
    currentFullText = text || ''
    lineInner.style.opacity = currentFullText ? '1' : '0.5'
    lineInner.textContent = currentFullText
    fitLine()
  }

  /** Reveal the line character by character, at the size it will end up. */
  function typeLine(text) {
    showLine(text)
    if (!currentFullText) return
    const full = currentFullText
    const delay = clamp(2200 / Math.max(1, full.length), 14, 52)
    let shown = 0
    lineInner.textContent = ''
    typingTimer = setInterval(() => {
      shown += 1
      if (shown >= full.length) {
        stopTyping()
        lineInner.textContent = full
        // Settle on the final size for whatever layout is current — the box may
        // have been resized (or the footer grown) while the animation ran.
        fitLine()
        // The text is done, but the countdown also waits for the voice to stop.
        noteTypingFinished()
        return
      }
      lineInner.innerHTML = `${escapeHtml(full.slice(0, shown))}<span class="dmp-caret"></span>`
    }, delay)
  }

  /**
   * Size the footer to the strip it was given.
   *
   * The figures have to stay legible from level 1 (a ~70px plate) to level 10,
   * so rather than one fixed proportion this picks the largest size at which the
   * wallet line and the (optional) cost line still fit inside `cap`, then reports
   * how tall the footer actually ended up.
   *
   * Height is left to the content (`height:auto`) so a short box is never given a
   * strip taller than it needs — that only starves the dialogue line.
   *
   * `full` is the receipt / balance case, where the strip fills the plate and is
   * centred by CSS. There the figures are the content, so they get a larger
   * type scale and the whole inner box as their budget.
   */
  function fitFooter(dlgW, cap, full) {
    // 'line' mode hides the strip entirely: report zero so the text gets the
    // whole plate.
    if (foot.classList.contains('dmp-foot-off')) {
      foot.style.height = '0px'
      return 0
    }
    if (!cap || cap < 6) return 0
    // The receipt / balance sheets fill the plate, but must stop above the logo:
    // its top edge sits ~73% of the way down the inner box. How much of the plate
    // that is, is part of the plate's geometry — a self-made plate with nothing
    // in the corner reports 1 and the figures get the whole height.
    const budget = full ? Math.max(6, Math.round(cap * logoShare())) : cap
    foot.style.height = 'auto'
    // Fractional, for the same reason as the line fit: `offsetHeight` is an
    // integer and its slack let the figures overflow by up to 1.5px.
    const measure = () => foot.getBoundingClientRect().height
    let hi = full ? clamp(dlgW * 0.08, 10, 34) : clamp(dlgW * 0.045, 8, 26)
    foot.style.fontSize = `${hi}px`
    if (measure() > budget + 0.5) {
      let low = 5
      let high = hi
      for (let i = 0; i < 10; i++) {
        const mid = (low + high) / 2
        foot.style.fontSize = `${mid}px`
        if (measure() <= budget + 0.5) low = mid
        else high = mid
      }
      foot.style.fontSize = `${(Math.floor(low * 10) / 10).toFixed(1)}px`
    }
    // Clamp with the box, not the font: if even the smallest readable size cannot
    // fit, the content is clipped rather than allowed to ride up over whatever is
    // beside it.
    const used = measure()
    const height = full ? budget : Math.min(used, budget)
    foot.style.height = `${height}px`
    foot.style.overflow = 'hidden'
    return height
  }

  /** Re-apply the fitted size to whatever line is current (used on resize). */
  function refitLine() {
    if (!currentFullText) return
    // Never disturb an animation in flight: the partial text would be measured as
    // if it were the whole line and the size would come out far too large. The
    // animation settles the size itself when it completes.
    if (typingTimer) return
    lineInner.textContent = currentFullText
    fitLine()
  }

  /**
   * Re-measure the footer after its content changed (the cost line appearing or
   * disappearing changes how many rows it needs, which changes how much room is
   * left for the dialogue line) and re-flow only when it actually moved.
   */
  function syncFooter() {
    const box = dialogBox()
    const full = foot.classList.contains('dmp-foot-full')
    const used = fitFooter(box.m.dlgW, full ? box.innerH : box.footerCap, full)
    if (used !== lastFooterH) applyLayout()
    else lastFooterH = used
  }

  function renderLine({ type = true } = {}) {
    const text = currentLine()
    // A new line voids any countdown left over from the previous one, and both
    // completion signals have to arrive again before the box may hide.
    resetLineGate()
    // A voice line owns the box: nothing else is on the strip.
    state.sheet = 'line'
    applySheet()
    showDialog()
    if (!text) {
      // Defensive only: renderVoiceSheet() never sends a textless voice here.
      noteTypingFinished()
      return
    }
    if (type) {
      typeLine(text) // noteTypingFinished() runs when the animation completes
    } else {
      showLine(text)
      noteTypingFinished()
    }
  }

  /**
   * Put the picked voice on screen.
   *
   * A voice that has a transcript prints its line. A voice that has none — the
   * pack ships no `script.csv` at all, or that one clip has no row — has nothing
   * to print, so the box shows 余额 / 今日已用 instead of a "（此语音没有对应台词）"
   * placeholder. Playback is unaffected either way: this only decides which of
   * the sheets goes on screen.
   *
   * `waitForVoice` leaves the countdown unarmed because a sound is about to
   * start: `noteVoiceFinished()` arms it the moment the audio ends, so a long
   * clip is never cut off mid-sentence. A silent re-render (boot, pack switch,
   * language toggle) has no audio coming, so it arms the countdown itself.
   */
  function renderVoiceSheet({ waitForVoice = false } = {}) {
    // Nothing picked yet — boot renders the widget before the first roll.
    if (!state.voice) return
    if (currentLine()) {
      renderLine()
      return
    }
    showVoiceWalletSheet({ waitForVoice })
  }

  /** A one-off message on the line sheet, for when there is nothing else to show. */
  function showNotice(text) {
    resetLineGate()
    state.sheet = 'line'
    applySheet()
    showDialog()
    showLine(text)
    noteTypingFinished()
  }

  /**
   * The always-on chip under the art.
   *
   * It reports the wallet sheet's two figures plus the running token total, and
   * it is the only read-out visible without being asked for — so it names the
   * reason when the balance cannot be read, rather than sitting on a silent `--`.
   * A missing key or an unreachable API is something the user can act on.
   *
   * The token figure is counted host-side as turns settle, so it stays meaningful
   * even when the balance call fails: it never depends on the network.
   */
  function renderBadge() {
    const balance = state.balance
    const today = state.today
    const currency = (balance && balance.currency) || 'CNY'
    const ledger = state.ledger || null
    const todayTokensPart =
      `<span><span class="dmp-badge-k">今日</span>` +
      `${escapeHtml(formatTokenCount(ledger ? ledger.todayTokens : 0))}` +
      `<span class="dmp-badge-u">token</span></span>`
    const tokenPart =
      todayTokensPart +
      `<span><span class="dmp-badge-k">累计</span>` +
      `${escapeHtml(formatTokenCount(ledger ? ledger.totalTokens : null))}` +
      `<span class="dmp-badge-u">token</span></span>`
    const ofmPart = state.ofm
      ? `<span class="dmp-ofm-badge"><span class="dmp-badge-k">Our Free Model </span>${escapeHtml(ofmWalletText())}</span>` : ''
    if (!balance || balance.ok === false) {
      const reason = balance && balance.error ? shorten(balance.error, 24) : '读取中…'
      badgeInner.innerHTML =
        `<span><span class="dmp-badge-k">余额</span>--</span>` +
        `<span class="dmp-badge-err">${escapeHtml(reason)}</span>` +
        ofmPart +
        tokenPart
      return
    }
    const stale = balance.stale ? `<span class="dmp-badge-stale">（缓存）</span>` : ''
    const todayText =
      today && Number.isFinite(Number(today.amount)) ? money(today.amount, currency) : '--'
    badgeInner.innerHTML =
      `<span><span class="dmp-badge-k">余额</span>${escapeHtml(money(balance.totalBalance, currency))}${stale}</span>` +
      `<span><span class="dmp-badge-k">今日</span>${escapeHtml(todayText)}</span>` +
      ofmPart +
      tokenPart
  }

  function renderWallet() {
    // The chip mirrors these figures, so it has to refresh on every path —
    // including the failure branch below, which returns early.
    renderBadge()
    const ofmPart = state.ofm
      ? `<span class="dmp-kv dmp-ofm-wallet"><span class="dmp-k">Our Free Model</span>${escapeHtml(ofmWalletText())}</span>` : ''
    const ledger = state.ledger || null
    const tokenWalletPart =
      `<span class="dmp-kv"><span class="dmp-k">今日 Token</span>${escapeHtml(formatTokenCount(ledger ? ledger.todayTokens : 0))}</span>` +
      `<span class="dmp-kv"><span class="dmp-k">累计 Token</span>${escapeHtml(formatTokenCount(ledger ? ledger.totalTokens : null))}</span>`
    const balance = state.balance
    const today = state.today
    if (!balance || balance.ok === false) {
      const reason = balance && balance.error ? balance.error : '读取中…'
      walletLine.innerHTML =
        `<span class="dmp-kv"><span class="dmp-k">余额</span>--</span>` +
        `<span class="dmp-kv"><span class="dmp-k">${escapeHtml(shorten(reason, 24))}</span></span>` +
        tokenWalletPart +
        ofmPart
      return
    }
    const balanceText = money(balance.totalBalance, balance.currency)
    const todayText = today && Number.isFinite(Number(today.amount)) ? money(today.amount, balance.currency) : '--'
    const stale = balance.stale ? '（缓存）' : ''
    walletLine.innerHTML =
      `<span class="dmp-kv"><span class="dmp-k">余额</span>${escapeHtml(balanceText)}${stale}</span>` +
      `<span class="dmp-kv"><span class="dmp-k">今日已用</span>${escapeHtml(todayText)}</span>` +
      tokenWalletPart +
      ofmPart
  }

  function renderCost() {
    costLine.innerHTML =
      `<span>消耗 ${escapeHtml(formatTokenCount(state.cost.tokens))} token</span>` +
      `<b>花费 ${escapeHtml(money(state.cost.amount, (state.balance && state.balance.currency) || 'CNY'))}</b>`
  }

  /**
   * Show exactly one sheet at a time.
   *
   *  - 'line'   the voice line only. The strip is removed so the text owns the
   *             whole plate (which also buys back the vertical space levels 3-4
   *             were short of).
   *  - 'cost'   the turn receipt.
   *  - 'wallet' 余额 / 今日已用, reached by clicking the box.
   *
   * For the two figure sheets the strip stops being a strip: the text area is
   * hidden outright and the figures are centred in the whole plate, so the voice
   * line is genuinely gone rather than merely pushed aside.
   */
  function applySheet() {
    const sheet = state.sheet
    const figures = sheet === 'cost' || sheet === 'wallet'
    costLine.classList.toggle('dmp-cost-off', sheet !== 'cost')
    walletLine.classList.toggle('dmp-wallet-off', sheet !== 'wallet')
    focusStart.hidden = sheet !== 'focus'
    lineBox.classList.toggle('dmp-line-off', figures)
    foot.classList.toggle('dmp-foot-off', !figures && sheet !== 'focus')
    foot.classList.toggle('dmp-foot-full', figures)
    syncFooter()
  }

  function shorten(text, max) {
    const s = String(text || '')
    return s.length > max ? `${s.slice(0, max)}…` : s
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
  }

  /** Clamp anything (including a stale percentage) into a 1..10 level. */
  function levelOf(value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return 5
    return clamp(Math.round(n), SCALE_MIN, SCALE_MAX)
  }

  function renderForm() {
    const c = cfg()
    const scaleLevel = levelOf(c.scale)
    ui.scaleVal.textContent = String(scaleLevel)
    ui.scaleDec.disabled = scaleLevel <= SCALE_MIN
    ui.scaleInc.disabled = scaleLevel >= SCALE_MAX
    ui.volume.value = String(Math.round(num(c.volume, 0.5) * 100))
    ui.volumeVal.textContent = `${Math.round(num(c.volume, 0.5) * 100)}%`
    ui.lang.textContent = ({ zh: '中文', ja: '日文', en: '英文' })[c.lang] || '中文'
    ui.autoPlay.checked = c.autoPlay === true
    ui.autoPlayMin.value = String(num(c.autoPlayMinutes, 1))
    ui.autoPlayMin.disabled = c.autoPlay !== true
    const dialogLevel = levelOf(c.dialogScale)
    ui.dialogScaleVal.textContent = String(dialogLevel)
    ui.dialogScaleDec.disabled = dialogLevel <= SCALE_MIN
    ui.dialogScaleInc.disabled = dialogLevel >= SCALE_MAX
    ui.dialogEnabled.checked = c.dialogEnabled !== false
    ui.petEnabled.checked = c.petEnabled !== false
    const spriteOptions = state.packs.spritePacks
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}（${p.spriteCount}）</option>`)
      .join('')
    if (ui.spritePack.dataset.signature !== spriteOptions) {
      ui.spritePack.dataset.signature = spriteOptions
      ui.spritePack.innerHTML = spriteOptions || '<option value="">（未找到立绘包）</option>'
    }
    ui.spritePack.value = c.spritePack || ''
    const spritePack = packOf(state.packs.spritePacks, c.spritePack)
    ui.spritePackInfo.textContent = spritePack
      ? `${spritePack.spriteCount} 个表情`
      : '把立绘包放进 ~/.dsh/dsh-moonpet/packs'

    const voiceOptions = state.packs.voicePacks
      .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}（${p.voiceCount}）</option>`)
      .join('')
    if (ui.voicePack.dataset.signature !== voiceOptions) {
      ui.voicePack.dataset.signature = voiceOptions
      ui.voicePack.innerHTML = voiceOptions || '<option value="">（未找到语音包）</option>'
    }
    ui.voicePack.value = c.voicePack || ''
    const voicePack = packOf(state.packs.voicePacks, c.voicePack)
    ui.voicePackInfo.textContent = voicePack
      ? `${voicePack.voiceCount} 句可播放语音`
      : '把语音包放进 ~/.dsh/dsh-moonpet/packs'
  }

  function renderAll() {
    renderForm()
    // Order matters: everything that changes the footer's content must run
    // before layout, and the line is rendered last so its auto-fit measures the
    // final box and its typing animation is never interrupted by a re-flow.
    renderWallet()
    renderCost()
    applySheet()
    applyLayout()
    renderVoiceSheet()
    root.style.visibility = 'visible'
  }

  // ── interactions ──────────────────────────────────────────────────────────
  let drag = null

  spriteBox.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return
    // The settings button sits inside the art box but must not start a drag.
    if (gear.contains(event.target)) return
    drag = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId }
    try {
      spriteBox.setPointerCapture(event.pointerId)
    } catch {
      // pointer capture is a nicety, not a requirement
    }
  })

  spriteBox.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return
    if (!drag.moved) {
      drag.moved = true
      root.classList.add('dmp-dragging')
      drag.startX = drag.x
      drag.startY = drag.y
      const c = cfg()
      const pos = c.pos || {}
      drag.originX = pos.hx === 'left' ? num(pos.hd, 24) : window.innerWidth - num(pos.hd, 24) - spriteBox.offsetWidth
      drag.originY = pos.vy === 'top' ? num(pos.vd, 24) : window.innerHeight - num(pos.vd, 24) - spriteBox.offsetHeight
    }
    const nx = clamp(drag.originX + (event.clientX - drag.startX), -spriteBox.offsetWidth * 0.4, window.innerWidth - spriteBox.offsetWidth * 0.6)
    const ny = clamp(drag.originY + (event.clientY - drag.startY), -spriteBox.offsetHeight * 0.4, window.innerHeight - spriteBox.offsetHeight * 0.6)
    stage.style.transform = `translate(${Math.round(nx)}px, ${Math.round(ny)}px)`
    drag.liveX = nx
    drag.liveY = ny
  })

  function endDrag(event) {
    if (!drag || (event && drag.id !== event.pointerId)) return
    const finished = drag
    drag = null
    root.classList.remove('dmp-dragging')
    if (event && event.type === 'pointercancel') return
    if (!finished.moved) {
      onSpriteClick()
      return
    }
    // Persist as a nearest-edge anchor so resizing the window keeps the art put.
    const w = spriteBox.offsetWidth
    const h = spriteBox.offsetHeight
    const x = finished.liveX !== undefined ? finished.liveX : finished.originX
    const y = finished.liveY !== undefined ? finished.liveY : finished.originY
    const pos = {
      hx: x + w / 2 < window.innerWidth / 2 ? 'left' : 'right',
      hd: Math.max(0, Math.round(x + w / 2 < window.innerWidth / 2 ? x : window.innerWidth - x - w)),
      vy: y + h / 2 < window.innerHeight / 2 ? 'top' : 'bottom',
      vd: Math.max(0, Math.round(y + h / 2 < window.innerHeight / 2 ? y : window.innerHeight - y - h)),
    }
    state.config = { ...cfg(), pos }
    applyLayout()
    save({ pos }, true)
  }

  spriteBox.addEventListener('pointerup', endDrag)
  spriteBox.addEventListener('pointercancel', endDrag)

  // Hover is tracked on the art box itself: the root is a zero-sized anchor and
  // would never receive pointer events of its own.
  spriteBox.addEventListener('pointerenter', () => {
    state.hover = true
    root.classList.add('dmp-hover')
  })
  spriteBox.addEventListener('pointerleave', () => {
    state.hover = false
    root.classList.remove('dmp-hover')
  })

  gear.addEventListener('click', (event) => {
    event.stopPropagation()
    playClick()
    togglePanel(!state.panelOpen)
  })

  // The box itself is the control that swaps the sheet. Deliberately silent:
  // switching to the balance figures is a quiet read-out, not a button press.
  // (The gear keeps its click sound — that one is an explicit button.)
  dialog.addEventListener('click', (event) => {
    event.stopPropagation()
    if (state.sheet === 'focus') return
    showWalletSheet()
  })
  focusStart.addEventListener('click', (event) => {
    event.stopPropagation()
    if (focusStart.disabled || state.focus?.status !== 'finished' || state.focus.mode !== 'break') return
    focusStart.disabled = true
    document.dispatchEvent(new Event('moonpet:focus-start'))
  })
  document.addEventListener('moonpet:focus-error', event => {
    if (state.sheet !== 'focus' || event.detail.action !== 'start') return
    focusStart.disabled = false
    showLine(`开始失败：${event.detail.message}`)
  })

  function togglePanel(open) {
    state.panelOpen = open
    gear.setAttribute('aria-expanded', String(open))
    panel.classList.toggle('dmp-panel-open', open)
    gear.classList.toggle('dmp-gear-open', open)
    if (open) {
      renderForm()
      applyLayout()
    } else if (state.dialogShown) {
      scheduleAutoHide()
    }
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!state.panelOpen) return
      if (panel.contains(event.target) || gear.contains(event.target)) return
      togglePanel(false)
    },
    true,
  )

  window.addEventListener('resize', () => {
    applyLayout()
  })

  // ── the three things a click does ─────────────────────────────────────────
  /**
   * Swap the art.
   *
   * The layout is applied at once — the box geometry comes from `state.sprite`,
   * never from the decoded bitmap — and the picture is set straight away as well,
   * so nothing here waits on a network load. A blob upgrade follows as soon as
   * the bytes are in hand, which is what makes the swap land on a fresh page
   * instead of on the next message.
   */
  function setSprite({ file, url, crop, aspect, persist = true }) {
    if (!file || !url) return
    state.sprite = { file, url, crop, aspect }
    applyLayout()
    showArt('sprite', spriteImg, url, '立绘')
    if (persist && cfg().spriteFile !== file) {
      state.config = { ...cfg(), spriteFile: file }
      save({ spriteFile: file })
    }
  }

  /**
   * Return to the pack's own resting pose once the dialogue box has gone.
   *
   * Each interaction shows a random frame, which is what makes the widget feel
   * alive — but leaving a random frame up after the line disappears looks like a
   * glitch. `spriteRevertOnHide: false` keeps whatever was last drawn.
   */
  function revertToDefaultSprite() {
    if (cfg().petEnabled !== false && state.pet && state.pet.enabled) {
      applyPet(state.pet)
      return
    }
    if (cfg().spriteRevertOnHide === false) return
    const pack = packOf(state.packs.spritePacks, cfg().spritePack)
    const file = pack && pack.defaultSprite
    if (!pack || !file) return
    if (state.sprite && state.sprite.file === file) return
    // Carry the pack's cache token: after the art on disk is replaced (a mirrored
    // pack, say) the plain URL is one the browser has already cached for a week.
    const version = pack.defaultSpriteVersion
      ? `&v=${encodeURIComponent(pack.defaultSpriteVersion)}`
      : ''
    setSprite({
      file,
      url: `${ROUTE}/asset/sprite?pack=${encodeURIComponent(pack.id)}&file=${encodeURIComponent(file)}${version}`,
      crop: pack.crop || { x: 0, y: 0, w: 1, h: 1 },
      aspect: pack.aspect || 1,
      // Not persisted: this would otherwise write the config on every hide, and
      // alternate with the random frame stored on every click.
      persist: false,
    })
  }

  async function roll(playAudio = true) {
    try {
      const c = cfg()
      const params = new URLSearchParams({
        spritePack: c.spritePack || '',
        voicePack: c.voicePack || '',
      })
      if (state.sprite && state.sprite.file) params.set('currentSprite', state.sprite.file)
      if (state.voice && state.voice.clip) params.set('currentClip', state.voice.clip)
      const data = await getJson(`${API}/next?${params.toString()}`)
      if (!data || !data.ok) return

      if (data.sprite && !(cfg().petEnabled !== false && state.pet && state.pet.enabled)) {
        const pack = packOf(state.packs.spritePacks, data.spritePack)
        const crop = data.sprite.crop || (pack && pack.crop) || { x: 0, y: 0, w: 1, h: 1 }
        const size = data.sprite.size
        const aspect = size && size.w && size.h ? (crop.w * size.w) / (crop.h * size.h) : (pack && pack.aspect) || 1
        setSprite({ file: data.sprite.file, url: data.sprite.url, crop, aspect })
      }
      if (!data.voice) {
        if (playAudio && data.sprite) showNotice(companionLine(state.pet?.status, state.focus, interactionCount++))
        // Nothing to say and nothing to swap to: a fresh install whose packs were
        // removed. That is the one case worth interrupting the user about.
        if (!data.sprite && state.packs.spritePacks.length === 0 && state.packs.voicePacks.length === 0) {
          showNotice('未找到立绘包 / 语音包，请放入 ~/.dsh/dsh-moonpet/packs/<包名>/')
        }
        return
      }
      state.voice = { clip: data.voice.clip, ja: data.voice.ja, zh: data.voice.zh, en: data.voice.en }
      // Start loading the bytes the moment the line is chosen, not when the user
      // clicks. The first click after a fresh page load is the one that used to
      // arrive silent, and this gives it the whole boot-to-click gap as a head
      // start; the cache makes the later play a no-op fetch.
      if (data.voice.url) audioBytesFor(data.voice.url)
      // A sound is only pending if one is actually going to be played, and the
      // countdown must not start before it ends.
      const willPlay = playAudio && Boolean(data.voice.url)
      renderVoiceSheet({ waitForVoice: willPlay })
      if (willPlay) playVoice(data.voice.url)
    } catch {
      // A failed roll simply leaves the previous line and art in place.
    }
  }

  function companionLine(status, focus, index = 0) {
    const lines = {
      waiting: ['有一步需要您确认，我在这里等您。'],
      error: ['这一步遇到了困难，我们一起慢慢来。', '先缓一口气，再一起看看哪里需要调整。'],
      stopped: ['停下来整理一下也很好，我陪您。'],
      offline: ['连接暂时中断了，我还在这里。'],
      done: ['这一步完成啦，辛苦了！', '又完成了一件事，给您一个小小的庆祝。'],
      thinking: ['正在认真想办法，您先放松一下。', '让我再想一想，您可以先喝口水。'],
      working: ['正在处理这一步，您安心忙自己的事。', '事情正在一点点推进，我陪您等结果。'],
      idle: ['收到您的摸摸啦，我在这里。', '今天也按自己的节奏来，我陪您。', '想歇一会儿，或再前进一步，都可以。'],
    }
    if (!['waiting','error','offline','stopped','done'].includes(status) && focus?.status === 'running' && focus.mode === 'work') {
      const minutes = Math.max(0, Math.floor((focus.settings.workMinutes * 60000 - focus.remainingMs) / 60000))
      return minutes ? `您已专注 ${minutes} 分钟。${focusEncouragement(status, focus, index)}` : '接下来这段时间，我陪您一起专注。'
    }
    const pool = lines[status] || lines.idle
    return pool[index % pool.length]
  }

  function focusEncouragement(status, focus, index) {
    const progress = 1 - focus.remainingMs / (focus.settings.workMinutes * 60000)
    const phase = progress >= .75 ? ['来到最后一段了，按自己的节奏收尾。', '最后一段也慢慢来，不用急着赶完。']
      : progress >= .5 ? ['已经过半了，您在稳稳前进。', '已经走过一半，每一点投入都算数。']
      : ['保持自己的节奏，继续加油。', '一点点积累，我陪您继续。', '慢慢进入状态就很好。']
    const activity = {
      working: ['任务正在处理中。', '这一步还在处理中。'],
      thinking: ['还在思考这一步。', '让我再想想办法。'],
      done: ['刚刚又完成了一件事！', '这一步完成了，辛苦了！'],
      error: ['任务遇到了困难，先缓口气。', '这一步不太顺利，我们一起慢慢来。'],
      offline: ['连接暂时中断了，我还在这里。'],
    }
    const pool = activity[status]
    return (pool ? pool[index % pool.length] : '') + phase[index % phase.length]
  }

  let interactionCount = 0, encouragementCount = 0, lastInteractionAt = -Infinity, touchTimer = null, interactionRevertTimer = null
  document.addEventListener('moonpet:focus-state', event => {
    state.focus = event.detail.focus
    const ready = state.focus.status === 'finished' && state.focus.mode === 'break' && state.focus.alertPending
    if (!ready && state.sheet === 'focus') {
      state.sheet = 'line'
      applySheet()
      hideDialog()
    }
    if (ready) {
      if (document.hidden || state.panelOpen || cfg().spriteVisible === false || cfg().dialogEnabled === false || state.pet?.status === 'waiting' || (state.dialogShown && state.sheet !== 'focus')) return
      if (state.sheet !== 'focus' || !state.dialogShown) {
        showNotice('休息结束啦，准备好了就开始下一轮专注吧。')
        state.sheet = 'focus'
        focusStart.disabled = false
        applySheet()
        applyLayout()
        cancelAutoHide()
      }
      return
    }
    const message = event.detail.message
    if (!message || document.hidden || state.panelOpen || state.dialogShown || cfg().spriteVisible === false || cfg().dialogEnabled === false || state.pet?.status === 'waiting') return
    const lines = {
      start: message.minutes ? `您已专注 ${message.minutes} 分钟，我陪您继续。` : '接下来这段时间，我陪您一起专注。',
      progress: `您已专注 ${message.minutes ? `${message.minutes} 分钟` : `${Math.floor(message.elapsedMs / 1000)} 秒`}。${focusEncouragement(state.pet?.status, state.focus, encouragementCount)}`,
      resume: `欢迎回来，已专注 ${message.minutes} 分钟，我们接着来。`,
      pause: '计时已暂停，放松一下，准备好了再继续。',
      finish: `您已专注 ${message.minutes} 分钟，这一轮辛苦了，起来活动一下吧。`,
      break: '现在一起休息一下，看看远处，放松肩膀。',
      rested: '休息结束了，准备好了再开始下一轮。',
    }
    showNotice(lines[message.kind])
    if (message.kind === 'progress') encouragementCount++
  })

  function onSpriteClick() {
    // Bound repeated taps: one response/voice at a time, with no audio queue.
    if (Date.now() - lastInteractionAt < 650 || document.documentElement.dataset.moonpetFocusAlert === '1') return
    lastInteractionAt = Date.now()
    root.classList.remove('dmp-touch')
    void spriteBox.offsetWidth
    root.classList.add('dmp-touch')
    clearTimeout(touchTimer)
    touchTimer = setTimeout(() => root.classList.remove('dmp-touch'), 500)
    if (cfg().petEnabled !== false && state.pet?.enabled && state.pet.status === 'idle' && state.pet.interactionSprite) {
      const sprite = state.pet.interactionSprite
      state.companionUntil = Date.now() + 1800
      const crop = sprite.crop || { x: 0, y: 0, w: 1, h: 1 }
      setSprite({ ...sprite, aspect: sprite.size ? crop.w * sprite.size.w / (crop.h * sprite.size.h) : 1, persist: false })
      clearTimeout(interactionRevertTimer)
      interactionRevertTimer = setTimeout(() => { state.companionUntil = 0; if (state.pet) applyPet(state.pet) }, 1800)
    }
    if (!state.packs.voicePacks.length) {
      stopVoice()
      showNotice(companionLine(state.pet?.status, state.focus, interactionCount++))
      return
    }
    // Explicitly selected custom voices retain their own matching transcripts.
    roll(true)
  }

  /**
   * Draw the figures and put the box on screen. False when the box is switched
   * off, in which case there is nothing to show at all.
   */
  function renderWalletSheet() {
    if (cfg().dialogEnabled === false) return false
    state.sheet = 'wallet'
    state.dialogShown = true
    renderWallet()
    applySheet()
    applyLayout()
    return true
  }

  /**
   * Clicking the box swaps it to 余额 / 今日已用 and restarts the countdown from
   * now — deliberately bypassing the typing/voice gate, because the user asked
   * for "3 seconds from this click", not "3 seconds after the voice ends".
   */
  function showWalletSheet() {
    if (!renderWalletSheet()) return
    holdLatched = true
    typingFinished = true
    voiceFinished = true
    clearVoiceFallback()
    scheduleAutoHide()
  }

  /**
   * 余额 / 今日已用 standing in for a line that does not exist.
   *
   * Same figures as a click on the box, but reached by clicking the *art* while
   * the voice pack has no transcript table, so the countdown must wait for the
   * sound that is about to start — see `renderVoiceSheet`.
   */
  function showVoiceWalletSheet({ waitForVoice = false } = {}) {
    // Clears the latch and cancels any countdown left over from the last line.
    resetLineGate()
    typingFinished = true // nothing to type; at most the audio is still pending
    if (!renderWalletSheet()) return
    if (!waitForVoice) scheduleAutoHide()
  }

  function setTurnCost(tokens, amount) {
    state.cost = { tokens, amount }
    renderCost()
  }

  function applyPet(pet) {
    if (!pet) return // Older Host: ordinary widget remains available until restart.
    // Discard a response started before the user switched to another pack.
    if (pet.sprite && pet.sprite.pack && cfg().spritePack && pet.sprite.pack !== cfg().spritePack) return
    state.pet = pet
    const enabled = cfg().petEnabled !== false && pet.enabled === true
    const labels = { idle: '待机中', thinking: '正在思考', working: '正在执行工具', waiting: '等你确认', done: '任务完成', error: '任务失败', stopped: '任务已停止', offline: '连接中断' }
    const status = Object.hasOwn(labels, pet.status) ? pet.status : 'idle'
    root.dataset.petStatus = enabled ? status : ''
    petLabel.hidden = !enabled
    petLabel.textContent = enabled ? labels[status] + (pet.activeCount > 1 ? ` · ${pet.activeCount} 个任务` : '') : ''
    if (!enabled || !pet.sprite) return
    if (state.companionUntil > Date.now() && pet.status === 'idle') return
    const sprite = pet.sprite
    if (state.sprite && state.sprite.url === sprite.url) return
    const crop = sprite.crop || { x: 0, y: 0, w: 1, h: 1 }
    const size = sprite.size
    const aspect = size && size.w && size.h ? (crop.w * size.w) / (crop.h * size.h) : 1
    setSprite({ file: sprite.file, url: sprite.url, crop, aspect, persist: false })
  }

  // ── polling ───────────────────────────────────────────────────────────────
  let polling = false
  // False until the turn counter has been read once (from bootstrap, or failing
  // that from the first poll). See readTurnPoll().
  let turnAligned = false

  /** Fold one poll into the turn state; true when it is a fresh receipt. */
  function applyTurnPoll(data) {
    if (!data || !data.ok) return false
    const r = readTurnPoll(state.turnSeq, turnAligned, data.seq, data.tokens, data.amount)
    turnAligned = r.aligned
    state.turnSeq = r.seq
    return r.show
  }

  async function pollTurn() {
    if (polling) return
    // A hidden window is not being watched, and every poll competes for the same
    // handful of connections the audio needs. Stop asking until it is visible again.
    if (document.hidden) return
    polling = true
    try {
      const data = await getJson(`${API}/turn`)
      if (data && data.ok && data.pet) applyPet(data.pet)
      if (applyTurnPoll(data)) {
        // 对话结束只报账：显示本轮消耗与花费。
        // 不播语音、不换立绘、也不重新抽台词 —— 这里是一张收据，不是又一次互动。
        setTurnCost(data.tokens, data.amount)
        state.sheet = 'cost'
        applySheet()
        showDialog()
        // Restart the linger countdown. Anything already pending belongs to the
        // line this receipt is being appended to.
        cancelAutoHide()
        if (typingFinished && voiceFinished) scheduleAutoHide()
      }
    } catch {
      if (state.pet && state.pet.enabled) applyPet({ ...state.pet, status: 'offline', sprite: null })
      // offline / server restarting: try again next tick
    } finally {
      polling = false
    }
  }

  async function refreshState() {
    try {
      if (document.hidden) return
      await detectOfm()
      void refreshOfmWallet()
      const data = await getJson(`${API}/state`)
      if (data && data.ok) {
        state.balance = data.balance
        state.today = data.today
        if (data.ledger) state.ledger = data.ledger
        renderWallet()
      }
    } catch {
      // keep the last known values
    }
  }

  // ── auto play ─────────────────────────────────────────────────────────────
  let autoTimer = null
  function scheduleAuto() {
    if (autoTimer) {
      clearTimeout(autoTimer)
      autoTimer = null
    }
    const c = cfg()
    if (c.autoPlay !== true) return
    const minutes = clamp(num(c.autoPlayMinutes, 1), 0.5, 240)
    autoTimer = setTimeout(async () => {
      autoTimer = null
      if (document.documentElement.dataset.moonpetFocusAlert === '1') { scheduleAuto(); return }
      await roll(true)
      showDialog()
      scheduleAuto()
    }, minutes * 60000)
  }

  // ── settings wiring ───────────────────────────────────────────────────────
  /**
   * A 0..1 fraction slider (volume). The stored unit is a fraction, so the
   * percentage is only ever a presentation detail.
   */
  function bindRange(input, key, display) {
    input.addEventListener('input', () => {
      const value = num(input.value, 50) / 100
      state.config = { ...cfg(), [key]: value }
      if (display) display.textContent = `${Math.round(value * 100)}%`
      applyLayout()
      save({ [key]: value })
    })
  }

  /**
   * A 0..95 slider whose stored unit *is* the percentage (dialog opacity).
   * It must not share bindRange(): dividing by 100 here stored 0.4 for a 40%
   * setting, and everywhere that read it back as a percentage rounded it to 0 —
   * the slider appeared to snap to zero no matter what you chose.
   */
  /** A 1..10 stepper. The two ends disable themselves, so the range is visible. */
  function bindStepper(decEl2, incEl2, valueEl, key) {
    const apply = (next) => {
      const value = clamp(next, SCALE_MIN, SCALE_MAX)
      state.config = { ...cfg(), [key]: value }
      if (valueEl) valueEl.textContent = String(value)
      decEl2.disabled = value <= SCALE_MIN
      incEl2.disabled = value >= SCALE_MAX
      applyLayout()
      save({ [key]: value }, true)
    }
    decEl2.addEventListener('click', () => apply(levelOf(cfg()[key]) - 1))
    incEl2.addEventListener('click', () => apply(levelOf(cfg()[key]) + 1))
  }

  bindStepper(ui.scaleDec, ui.scaleInc, ui.scaleVal, 'scale')
  bindStepper(ui.dialogScaleDec, ui.dialogScaleInc, ui.dialogScaleVal, 'dialogScale')
  bindRange(ui.volume, 'volume', ui.volumeVal)

  ui.volume.addEventListener('input', applyVolume)

  ui.lang.addEventListener('click', () => {
    const languages = ['zh', 'en', 'ja']
    const next = languages[(languages.indexOf(cfg().lang) + 1) % languages.length]
    state.config = { ...cfg(), lang: next }
    ui.lang.textContent = ({ zh: '中文', ja: '日文', en: '英文' })[next]
    renderVoiceSheet()
    save({ lang: next }, true)
  })

  ui.autoPlay.addEventListener('change', () => {
    state.config = { ...cfg(), autoPlay: ui.autoPlay.checked }
    ui.autoPlayMin.disabled = !ui.autoPlay.checked
    scheduleAuto()
    save({ autoPlay: ui.autoPlay.checked }, true)
  })

  ui.autoPlayMin.addEventListener('change', () => {
    const minutes = clamp(num(ui.autoPlayMin.value, 1), 0.5, 240)
    ui.autoPlayMin.value = String(minutes)
    state.config = { ...cfg(), autoPlayMinutes: minutes }
    scheduleAuto()
    save({ autoPlayMinutes: minutes }, true)
  })

  ui.dialogEnabled.addEventListener('change', () => {
    state.config = { ...cfg(), dialogEnabled: ui.dialogEnabled.checked }
    applyLayout()
    save({ dialogEnabled: ui.dialogEnabled.checked }, true)
  })

  ui.petEnabled.addEventListener('change', async () => {
    state.config = { ...cfg(), petEnabled: ui.petEnabled.checked }
    await save({ petEnabled: ui.petEnabled.checked }, true)
    if (state.pet) applyPet(state.pet)
    if (!ui.petEnabled.checked) revertToDefaultSprite()
    pollTurn()
  })

  ui.spritePack.addEventListener('change', async () => {
    const id = ui.spritePack.value
    state.config = { ...cfg(), spritePack: id, spriteFile: '' }
    state.sprite = null
    state.pet = null
    root.dataset.petStatus = ''
    petLabel.hidden = true
    renderForm()
    await save({ spritePack: id, spriteFile: '' }, true)
    await roll(false)
    pollTurn()
  })

  ui.voicePack.addEventListener('change', async () => {
    const id = ui.voicePack.value
    state.config = { ...cfg(), voicePack: id }
    state.voice = null
    renderForm()
    await save({ voicePack: id }, true)
    roll(false)
  })

  panel.querySelector('[data-act="close"]').addEventListener('click', () => togglePanel(false))
  panel.addEventListener('pointerdown', (event) => event.stopPropagation())
  panel.addEventListener('toggle', () => applyLayout(), true)

  // ── boot ──────────────────────────────────────────────────────────────────
  /**
   * Startup failed. Say so — in the console *and* on screen.
   *
   * The root is created `visibility:hidden` and only `renderAll()` (far below)
   * reveals it, so anything thrown on the way there used to leave an invisible
   * widget behind: nothing drawn, nothing logged, no way to tell a broken plugin
   * from a disabled one. Everything here is best-effort — this path runs when
   * something is already wrong.
   */
  function bootFailed(err) {
    const message = String((err && err.message) || err)
    try {
      console.error(`[dsh-moonpet] 挂件启动失败：${message}`, err)
    } catch {
      // a console that refuses to log must not stop the notice below
    }
    try {
      root.style.visibility = 'visible'
      showNotice(`挂件启动失败：${message.slice(0, 120)}`)
    } catch {
      // rendering the failure failed too; the console still has the reason
    }
    if (window.__dshMoonPetWidget && typeof window.__dshMoonPetWidget === 'object') {
      window.__dshMoonPetWidget.failed = true
    }
  }

  async function boot() {
    try {
      await start()
    } catch (err) {
      bootFailed(err)
    }
  }

  /** Everything `boot()` does. A throw anywhere in here is reported, not hidden. */
  async function start() {
    try {
      await detectOfm()
      void refreshOfmWallet()
      const data = await getJson(`${API}/bootstrap`)
      if (data && data.ok) {
        state.config = data.config
        state.packs = data.packs || state.packs
        if (data.pet) state.pet = data.pet
        if (data.dialog) state.dialog = data.dialog
        if (data.dialogSource) state.plateSource = data.dialogSource
        state.balance = data.balance
        state.today = data.today
        if (data.ledger) state.ledger = data.ledger
        // Bootstrap reports where the turn counter stands *now* (0 when nothing has
        // settled yet), which is all the baseline the poller needs: from here on,
        // any increase is a turn that finished while this page was open.
        if (data.turn) {
          const seq = Math.trunc(Number(data.turn.seq))
          state.turnSeq = Number.isFinite(seq) && seq > 0 ? seq : 0
          turnAligned = true
        }
      }
    } catch {
      // Fall through: the widget still renders with built-in defaults.
    }
    if (!state.config) {
      state.config = {
        scale: 5, volume: 0.5, lang: 'zh', autoPlay: false, autoPlayMinutes: 1,
        dialogScale: 5, dialogEnabled: true, dialogSide: 'above', dialogOpacity: 0,
        spritePack: '', voicePack: '', spriteFile: '', spriteVisible: true,
        voiceOrder: 'shuffle',
        pos: { hx: 'right', hd: 24, vy: 'bottom', vd: 24 },
      }
    }
    renderAll()
    if (state.pet) applyPet(state.pet)
    scheduleAuto()
    // Get the two sounds into the byte cache before they are ever needed: the
    // first click after a fresh page load is exactly when the page's connections
    // are busiest, and a media element that has to fetch then is the one that
    // arrives ten seconds late.
    warmClickSound()
    await roll(false)
    applyLayout()
    setInterval(pollTurn, TURN_POLL_MS)
    setInterval(refreshState, STATE_POLL_MS)
    pollTurn()
    refreshState()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
