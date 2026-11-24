/**
 * dsh-usage-rings — subscription quota as ring gauges in the composer dock.
 *
 * The host half (index.js) publishes the Magpie quota snapshot on
 * /api/dsh-usage-rings/status; this module renders one compact ring per
 * provider next to the host's own context meter, in the same 20px stats row.
 * Clicking a ring refreshes; hovering shows the per-window breakdown.
 */
window.__ModuleLoader__.load({
  id: 'dsh-usage-rings',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;

    const STYLE_ID = 'dsh-usage-rings-style';
    const SIZE = 14;
    const STROKE = 2;
    const RADIUS = (SIZE - STROKE) / 2;
    const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
    const REFRESH_MS = 60000;

    const PROVIDERS = [
      { key: 'codex', label: 'Codex' },
      { key: 'antigravity', label: 'Gemini' },
    ];

    const CSS = `[data-composer-dock]:has(.ur-context-anchor) > span[style*="--dsh-context"]{display:none!important}
[data-composer-dock]:has(.ur-row){width:100%;max-width:var(--dsh-composer-card-max-width);align-items:center;justify-content:flex-start}
.ur-row{display:inline-flex;order:20;margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
.ur-item-text{gap:6px;padding:1px 8px;border-radius:var(--dsw-radius-sm);font-size:13px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:flex-start;font-variant-numeric:tabular-nums}
.ur-item-text[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.ur-item-text:hover{color:var(--dsw-alias-label-secondary)}
.ur-item{position:relative;display:inline-flex;align-items:center;justify-content:flex-start;gap:5px;height:20px;padding:0 2px;min-width:72px;font-variant-numeric:tabular-nums;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));cursor:pointer}
.ur-item:hover,.ur-item[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.ur-item:focus-visible{outline:1px solid var(--dsw-alias-border-l3);outline-offset:2px}
.ur-name{font-size:10px;font-weight:400;letter-spacing:.01em;color:var(--dsw-alias-label-tertiary)}
.ur-ring{display:block;flex:none;transform:rotate(-90deg)}
.ur-track{stroke:var(--dsw-alias-border-l2);fill:none}
.ur-value{fill:none;stroke-linecap:round;transition:stroke-dashoffset .3s ease}
.ur-pct{font:inherit;color:inherit;display:inline-block;text-align:left}
.ur-anchor{display:inline-flex;flex:none}
.ur-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;max-width:calc(100vw - 24px);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;margin:0;font-size:12px;line-height:20px;position:fixed;overflow:hidden auto;text-align:left;white-space:normal}
@position-try --ur-quota-window{position-area:none;top:max(12px,var(--dsh-frame-overlay-top,12px));bottom:max(12px,calc(anchor(top) + 8px));left:12px;right:12px;margin:0;align-self:safe end;justify-self:safe end}
@position-try --ur-quota-opposite{top:max(12px,calc(anchor(bottom) + 8px));bottom:12px;align-self:start}
@position-try --ur-quota-wide-opposite{top:max(12px,calc(anchor(bottom) + 8px));bottom:12px;left:12px;right:12px;align-self:start;justify-self:safe end}
@position-try --ur-quota-tall{position-area:none;top:max(12px,var(--dsh-frame-overlay-top,12px));bottom:12px;left:max(12px,anchor(left));right:12px;margin:0;align-self:safe start;justify-self:start}
@position-try --ur-quota-viewport{position-area:none;inset:max(12px,var(--dsh-frame-overlay-top,12px)) 12px 12px;margin:0;align-self:safe start;justify-self:safe end}
.ur-heading{display:flex;align-items:center;gap:6px}
.ur-heading-label{color:var(--dsw-alias-label-tertiary)}
.ur-heading-value{margin-left:auto;color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums}
.ur-subtitle{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.ur-bar{display:flex;gap:1px;height:4px;margin:10px 0 12px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);overflow:hidden}
.ur-bar span{display:block;height:100%;border-radius:1px;background:var(--meter-tint,var(--dsw-alias-label-tertiary))}
.ur-group-title{padding-top:9px;margin-top:8px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px}
.ur-rows{margin:6px 0 0}
.ur-line{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:2px 0}
.ur-line-name{min-width:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
.ur-reset{display:block;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-line b{flex:none;color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums}
.ur-note{padding:6px 0;color:var(--dsw-alias-label-tertiary)}
.ur-segbar{display:flex;height:6px;margin:8px 0 10px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l2)}
.ur-segbar span{height:100%;transform-origin:left center;animation:ur-grow .5s cubic-bezier(.2,.8,.2,1) both}
.ur-foot{margin:10px 0 0;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px}
.ur-stats{position:relative;display:inline-flex;align-items:center;min-width:0}
.ur-stats-button{display:inline-flex;align-items:center;justify-content:flex-start;gap:5px;height:20px;padding:0 4px;font-variant-numeric:tabular-nums;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:var(--dsh-content-font-size-secondary,13px);cursor:pointer;white-space:nowrap}
.ur-stats-button:hover,.ur-stats-button[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.ur-stats-button:focus-visible{outline:1px solid var(--dsw-alias-border-l3);outline-offset:2px}
.ur-stats-panel{z-index:1100;box-sizing:border-box;overflow:auto;margin:0;background:var(--dsw-specific-menu);box-shadow:var(--dsw-elevation-prominent);border-radius:var(--dsw-radius-lg);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1)}
@position-try --ur-stats-window{top:max(12px,var(--dsh-frame-overlay-top,12px));bottom:max(12px,calc(anchor(top) + 8px));left:12px;right:12px;align-self:safe end;justify-self:safe end}
@position-try --ur-stats-below{top:max(12px,calc(anchor(bottom) + 8px));bottom:12px;left:12px;right:12px;align-self:start;justify-self:safe end}
@position-try --ur-stats-viewport{inset:max(12px,var(--dsh-frame-overlay-top,12px)) 12px 12px;align-self:safe start;justify-self:safe end}
.ur-stats-panel .ur-heading{padding-bottom:10px;margin-bottom:8px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:14px;font-weight:600}
.ur-stats-panel .ur-line{font-size:13px}
.ur-stats-bar{height:6px;margin:10px 0 4px;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden}
.ur-stats-bar span{display:block;height:100%;background:var(--dsw-alias-brand-primary)}
.ur-stats-explain{margin:12px 0 0;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:normal}
.ur-route b{max-width:64%;overflow-wrap:anywhere;text-align:right;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums}
.ur-model{padding:6px 0}
.ur-model .ur-line{padding:0}
.ur-model .ur-line-name{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ur-model-bar{height:3px;margin:5px 0 3px;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden}
.ur-model-bar span{display:block;height:100%;background:var(--dsw-alias-label-tertiary)}
.ur-model-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.ur-panel{width:min(300px,100vw - 24px);padding:12px 12px 10px;animation:ur-pop .16s cubic-bezier(.2,.8,.2,1) both}
.ur-stats-panel{width:min(320px,100vw - 24px)}
@keyframes ur-pop{from{opacity:0;transform:translateY(6px) scale(.99)}}
.ur-head{display:flex;gap:8px}
.ur-head-title{font-weight:600;color:var(--dsw-alias-label-primary)}
.ur-head-meta{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.ur-hero{display:flex;align-items:center}
.ur-gauge{position:relative;width:56px;height:56px;flex:none}
.ur-gauge-val{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;font-weight:600;line-height:1;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ur-gauge-cap{margin-top:3px;font-size:9px;font-weight:400;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary)}
.ur-arc{fill:none;stroke-linecap:round}
.ur-arc-track{stroke:var(--dsw-alias-border-l2)}
.ur-arc-val{animation:ur-arc-in .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes ur-arc-in{from{stroke-dashoffset:var(--ur-circ)}}
.ur-legend{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.ur-legend-row{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-legend-row b{margin-left:auto;color:var(--dsw-alias-label-secondary);font-weight:500;font-variant-numeric:tabular-nums}
.ur-legend-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ur-dot{width:6px;height:6px;border-radius:999px;flex:none}
.ur-tiles{display:grid;grid-template-columns:1fr 1fr;margin:10px 0 0}
.ur-tile{border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-interactive-bg-hover)}
.ur-tile-k{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-tile-v{margin-top:2px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.ur-sec{display:flex;align-items:baseline;gap:8px;margin:12px 0 4px;border-top:1px solid var(--dsw-alias-border-l2)}
.ur-sec-title{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-sec-meta{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.ur-route-row{display:flex;align-items:baseline;gap:8px;margin:0 0 2px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ur-route-row b{margin-left:auto;max-width:68%;text-align:right;font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.ur-meter{height:5px;margin:5px 0 3px;border-radius:999px;background:var(--dsw-alias-border-l2);overflow:hidden}
.ur-meter span{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-label-tertiary);transform-origin:left center;animation:ur-grow .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes ur-grow{from{transform:scaleX(0)}}
.ur-mrow{padding:3px 0 5px}
.ur-mrow-top{display:flex;align-items:baseline;gap:8px;min-width:0;font-size:12px}
.ur-mrow-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.ur-mrow-val{margin-left:auto;flex:none;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ur-mrow-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
.ur-mrow-subs{margin:2px 0 2px 10px;padding-left:8px;border-left:1px solid var(--dsw-alias-border-l2)}
.ur-mrow-sub{padding:2px 0}
.ur-mrow-subname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.ur-wrow-top{display:flex;align-items:baseline;gap:8px;font-size:12px}
.ur-wrow-name{color:var(--dsw-alias-label-secondary)}
.ur-wrow-val{margin-left:auto;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ur-wrow-reset{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-panel .ur-note{padding:4px 0;font-size:12px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}
/* Shared visual hierarchy: one headline, one chart, compact supporting details. */
.ur-panel{padding:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);line-height:1.5}
.ur-head{margin:0 0 18px;align-items:baseline}
.ur-head-title{font-size:14px;letter-spacing:.01em}
.ur-head-meta{font-size:11px}
.ur-hero{gap:16px;margin:0 0 18px}
.ur-feature-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.ur-feature-note{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:4px}
.ur-metric{margin:0 0 18px}
.ur-metric-value{font-size:30px;line-height:1.1;letter-spacing:-.04em;font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ur-metric-countdown{margin-left:10px;font-size:14px;font-weight:500;letter-spacing:0;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;vertical-align:2px}
.ur-metric-unit{margin-left:8px;font-size:14px;font-weight:500;letter-spacing:0;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;vertical-align:2px}
.ur-meter-main{margin:12px 0 0;height:5px}
.ur-chart-caption{display:flex;justify-content:space-between;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-time-chart{margin:0 0 16px}
.ur-quota-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0}
.ur-quota-group{margin-top:9px}
.ur-quota-group-name{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:4px}
.ur-quota-ring-row{display:flex;align-items:center;gap:8px;margin:7px 0}
.ur-quota-ring-row .ur-ring{flex:none}
.ur-quota-ring-body{flex:1;min-width:0}
.ur-quota-ring-line{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ur-quota-ring-pct{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ur-quota-ring-reset{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-quota-description{display:flex;flex-direction:column;gap:2px;min-width:0}
.ur-quota-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.ur-quota-reset{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ur-quota-amount{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.ur-checkin{flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:1;cursor:pointer}
.ur-checkin:hover{color:var(--dsw-alias-label-primary)}
.ur-checkin:disabled{opacity:.5;cursor:wait}
.ur-oq-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch}
.ur-oq-grid.ur-oq-single{grid-template-columns:minmax(0,1fr)}
.ur-oq-card{display:flex;flex-direction:column;min-width:0;transition:border-color .2s,box-shadow .2s,transform .2s}
.ur-oq-head{display:flex;flex-wrap:wrap;align-items:center;column-gap:8px;row-gap:8px;min-width:0;min-height:24px}
.ur-checkin{order:1}
.ur-oq-title{order:1;flex:0 1 auto}
.ur-oq-time{order:2}
.ur-oq-head>.ur-oq-account,.ur-oq-head>.ur-oq-switch{order:3;flex:1 0 100%;max-width:100%}
.ur-oq-head>.ur-oq-account{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}
.ur-oq-switch-name{flex:1;text-align:left;overflow-wrap:anywhere}
.ur-oq-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ur-oq-account{flex:1 1 auto;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ur-oq-switch{display:flex;align-items:center;gap:6px;flex:0 1 auto;min-width:0;max-width:100%;font:inherit;cursor:pointer;transition:background .15s,border-color .15s,transform .12s}
.ur-oq-switch-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ur-oq-switch-idx{flex:none;font-variant-numeric:tabular-nums}
.ur-oq-time{margin-left:auto;flex:none;font-variant-numeric:tabular-nums}
.ur-oq-bars{justify-content:space-evenly}
.ur-vcol{flex-direction:column;min-width:0}
.ur-vcol[data-warn] .ur-vcol[data-toggle]{cursor:pointer}
.ur-vcol[data-toggle]:focus-visible{outline:1px solid var(--dsw-alias-label-tertiary);outline-offset:2px}
.ur-expire{color:var(--ap-orange)}
.ur-vcol-track{align-items:flex-end}
@keyframes ur-grow-y{from{transform:scaleY(0)}}
@keyframes ur-swap{from{opacity:0;filter:blur(6px)}}
.ur-oq-card{animation:ur-swap .32s cubic-bezier(.2,.8,.2,1) both}
@keyframes ur-pop{from{opacity:0;filter:blur(4px);transform:translateY(5px) scale(.96)}}
.ur-vcol-name,.ur-vcol-sub{animation:ur-swap .3s ease-out both}
.ur-oq-switch:active{transform:scale(.97)}
.ur-oq-switch:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-bg-l1,#fff),0 0 0 4px var(--dsw-alias-border-l2)}
@media (prefers-reduced-motion:reduce){.ur-oq-card,.ur-vcol-pct,.ur-vcol-name,.ur-vcol-sub{animation:none}.ur-oq-switch:active{transform:none}}
.ur-vcol-name{margin-top:10px;overflow-wrap:anywhere;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:100%}
.ur-vcol-sub{margin-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ur-vcol-reset{line-height:1.25;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.ur-oq-reset{font-variant-numeric:tabular-nums;white-space:nowrap}
.ur-oq-balance{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;flex:1}
.ur-oq-bal-v{font-variant-numeric:tabular-nums}
.ur-oq-bal-k{line-height:1.25}
@media (max-width:460px){.ur-oq-grid{grid-template-columns:minmax(0,1fr)}}
/* Apple HIG: SF type scale, system colors, inset-grouped rows with hairlines, capsule progress */.ur-panel{--ap-font:-apple-system,BlinkMacSystemFont,'SF Pro Text','PingFang SC',sans-serif;--ap-label:rgba(0,0,0,.88);--ap-sec:rgba(60,60,67,.6);--ap-ter:rgba(60,60,67,.3);--ap-fill:rgba(120,120,128,.16);--ap-sep:rgba(60,60,67,.18);--ap-card:#fff;--ap-green:#34C759;--ap-orange:#FF9500;--ap-red:#FF3B30;--ap-blue:#007AFF;font-family:var(--ap-font);-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme:dark){.ur-panel{--ap-label:rgba(255,255,255,.92);--ap-sec:rgba(235,235,245,.6);--ap-ter:rgba(235,235,245,.3);--ap-fill:rgba(120,120,128,.32);--ap-sep:rgba(84,84,88,.6);--ap-card:#1C1C1E;--ap-green:#30D158;--ap-orange:#FF9F0A;--ap-red:#FF453A;--ap-blue:#0A84FF}}
.ur-oq-grid{gap:10px}
.ur-oq-title{color:var(--ap-label)}
.ur-oq-head>.ur-oq-account{letter-spacing:-.08px}
.ur-checkin{width:22px;height:22px;border:0;border-radius:11px;background:var(--ap-fill);color:var(--ap-blue);font-weight:600}
.ur-checkin:hover{background:var(--ap-fill);opacity:.8}
.ur-oq-switch{letter-spacing:-.08px;color:var(--ap-label)}
.ur-oq-switch:hover{opacity:.85}
.ur-vcol{row-gap:6px}
.ur-vcol+.ur-vcol{box-shadow:inset 0 .5px 0 var(--ap-sep)}
.ur-vcol-name{letter-spacing:-.08px}
.ur-vcol-pct{font-variant-numeric:tabular-nums}
.ur-vcol-sub,.ur-vcol-reset{font-size:12px;line-height:16px;color:var(--ap-sec)}
.ur-oq-bal-v{color:var(--ap-label)}
/* visual language adapted from transitions.dev 'Prediction card': soft-shadow surfaces, 12px tiles, tinted left-to-right fills, pill switcher */.ur-oq-grid{gap:12px}
.ur-oq-card{padding:16px;border:0;border-radius:18px;background:var(--dsw-alias-bg-l1,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 8px 32px -6px rgba(0,0,0,.07),0 1px 3px rgba(0,0,0,.04)}
.ur-oq-card:hover{transform:none;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 10px 36px -6px rgba(0,0,0,.09),0 1px 3px rgba(0,0,0,.05)}
.ur-oq-time{line-height:16px}
.ur-oq-head>.ur-oq-account{line-height:16px;height:auto}
.ur-oq-switch{min-height:30px;height:auto;padding:3px 3px 3px 12px;border:0;border-radius:40px;background:rgba(0,0,0,.04);box-shadow:none;font-size:13px;font-weight:500}
.ur-oq-switch:hover{background:rgba(0,0,0,.06)}
.ur-oq-switch-idx{border-radius:40px}
.ur-oq-bars{display:flex;flex-direction:column;align-items:stretch;margin-top:14px}
.ur-vcol{position:relative;align-items:center;max-width:none;flex:none;min-height:48px;padding:7px 12px;border-radius:12px;background:rgba(0,0,0,.03);overflow:hidden;text-align:left}
.ur-vcol:hover{background:rgba(0,0,0,.05)}
.ur-vcol-track{margin:0;box-shadow:none;display:block;pointer-events:none}
.ur-vcol-fill{position:absolute;width:100%;height:100%;filter:none;box-shadow:none;transform:scaleX(var(--p,0));transform-origin:left center;transition:transform .45s cubic-bezier(.2,.8,.2,1),background .3s;animation:ur-grow-x .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes ur-grow-x{from{transform:scaleX(0)}}
.ur-vcol-name{position:relative;margin:0;min-height:0;display:block;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ur-vcol-sub{position:relative;margin:0;text-align:left}
.ur-vcol-reset{position:relative;margin-top:2px;font-size:11px;text-align:left}
.ur-vcol-pct{position:relative}
.ur-oq-reset{line-height:16px}
@media (prefers-color-scheme:dark){.ur-oq-card{box-shadow:0 0 0 1px rgba(255,255,255,.08),0 8px 32px -6px rgba(0,0,0,.5)}.ur-vcol,.ur-oq-switch{background:rgba(255,255,255,.05)}.ur-vcol:hover,.ur-oq-switch:hover{background:rgba(255,255,255,.08)}.ur-oq-switch-idx{box-shadow:0 1px 1px rgba(0,0,0,.24),inset 0 0 0 1px rgba(255,255,255,.06)}}
@media (prefers-reduced-motion:reduce){.ur-vcol-fill{animation:none;transition:none}}
.ur-reset-cards{border-top:1px solid var(--dsw-alias-border-l2);margin-top:12px;padding-top:10px}
.ur-reset-header{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;padding:2px 0;cursor:pointer;font:inherit;text-align:left}
.ur-reset-header:hover .ur-reset-title{color:var(--dsw-alias-label-primary)}
.ur-reset-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.ur-reset-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:auto;font-variant-numeric:tabular-nums}
.ur-reset-chevron{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .15s}
.ur-reset-chevron.ur-open{transform:rotate(180deg)}
.ur-reset-account{margin-top:8px}
.ur-reset-account-name{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font-size:11px;margin-bottom:4px}
.ur-reset-card{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0}
.ur-reset-time{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.ur-reset-action{flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:11px;line-height:1;padding:4px 10px}
.ur-reset-action:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ur-reset-confirm{display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-interactive-bg-hover)}
.ur-reset-confirm-text{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.ur-reset-confirm-actions{display:flex;align-items:center;gap:8px;flex:none}
.ur-reset-cancel{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;line-height:1;padding:4px 10px}
.ur-reset-cancel:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ur-disclosure{border-top:1px solid var(--dsw-alias-border-l2);margin-top:12px;padding-top:12px}
.ur-disclosure summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;list-style:none;display:flex;align-items:center;justify-content:space-between}
.ur-disclosure summary::-webkit-details-marker{display:none}
.ur-disclosure summary::after{content:'+';font-size:16px;font-weight:400;color:var(--dsw-alias-label-tertiary)}
.ur-disclosure[open] summary::after{content:'−'}
.ur-disclosure .ur-sec{border:0;margin-top:4px;padding-top:8px}
.ur-sec{margin-top:16px;padding-top:14px}
.ur-sec-title{font-weight:600;letter-spacing:.02em}
.ur-wrow{padding:7px 0}
.ur-wrow-val{font-size:13px}
.ur-tiles{gap:8px}
.ur-tile{padding:9px 10px}
.ur-foot{line-height:1.6}
/* Restrict the composer treatment to the card paired with this dock. */
[data-composer-card]:has(+ [data-composer-dock] .ur-row){border:1px solid var(--dsw-alias-border-l2);border-radius:16px;transition:border-color .15s ease,box-shadow .15s ease}
[data-composer-card]:has(+ [data-composer-dock] .ur-row):focus-within{border-color:var(--dsw-alias-border-l3);box-shadow:0 0 0 2px var(--dsw-alias-interactive-bg-hover)}
/* A quiet, consistent family of controls beneath the composer. */
[data-composer-dock]:has(.ur-row){gap:2px;flex-wrap:wrap;row-gap:4px;align-items:center;justify-content:flex-start}
.ur-row{gap:2px;min-width:0;align-items:center;justify-content:center}
.ur-item,.ur-item-text,.ur-stats-button{box-sizing:border-box;min-width:0;height:28px;padding:0 6px;gap:5px;border:1px solid transparent;border-radius:var(--dsw-radius-md,8px);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;transition:background .15s ease,border-color .15s ease,color .15s ease}
.ur-item:hover,.ur-item-text:hover,.ur-stats-button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ur-item[aria-expanded="true"],.ur-item-text[aria-expanded="true"],.ur-stats-button[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.ur-item,.ur-item-text,.ur-stats-button{align-items:center}
.ur-item svg,.ur-item-text svg,.ur-stats-button svg{flex:none;display:block;align-self:center}
/* Match the host StatsPills 12px/20px typography across both reading and label
   without inner flex boxes so digits, Latin, CJK and icons share one centre
   and baseline. */
.ur-name,.ur-pct{font:inherit;line-height:inherit;letter-spacing:normal;color:inherit;display:inline-block}
@media (prefers-reduced-motion:reduce){.ur-item,.ur-item-text,.ur-stats-button,.ur-value{transition:none}.ur-panel,.ur-segbar span,.ur-meter span,.ur-vcol-fill,.ur-arc-val{animation:none}}
/* polish: vertical centering, no overlap with footer, low-quota emphasis */.ur-vcol{grid-template-areas:'name pct' 'sub pct' 'reset reset';align-content:center;row-gap:2px;min-height:46px;padding:8px 12px}
.ur-oq-bars{margin-bottom:14px}
.ur-oq-reset{border-top:1px solid var(--dsw-alias-border-l2)}
.ur-oq-balance{gap:2px}
/* minimal: flat surfaces, one hairline, no shadows/tints/motion, thin underline bar */.ur-oq-grid{gap:8px}
.ur-oq-card,.ur-oq-card:hover{padding:14px 16px;border-radius:10px;background:transparent;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);transform:none;animation:none}
.ur-oq-title{font-size:13px;line-height:18px;font-weight:600;letter-spacing:0}
.ur-oq-time{color:var(--dsw-alias-label-tertiary)}
.ur-oq-head>.ur-oq-account{font-size:12px;margin-top:-6px;color:var(--dsw-alias-label-tertiary)}
.ur-oq-switch,.ur-oq-switch:hover{min-height:0;padding:0;border:0;background:none;box-shadow:none;font-size:12px;font-weight:400;color:var(--dsw-alias-label-tertiary);margin-top:-6px}
.ur-oq-switch:hover{color:var(--dsw-alias-label-primary)}
.ur-oq-switch-idx{height:auto;line-height:inherit;padding:0;background:none;box-shadow:none;font-size:12px;color:inherit}
.ur-oq-bars{margin:12px 0 0}
.ur-vcol,.ur-vcol:hover{min-height:0;padding:0;border-radius:0;background:none;box-shadow:none}
.ur-vcol-track{position:relative;inset:auto;height:2px;border-radius:1px;background:var(--dsw-alias-border-l2);overflow:hidden}
.ur-vcol-fill{inset:0;border-radius:1px}
.ur-vcol-name{font-weight:400}
.ur-vcol-pct{animation:none}
.ur-oq-reset{margin-top:auto;padding-top:12px;border:0;box-shadow:none;text-align:left;color:var(--dsw-alias-label-tertiary)}
.ur-oq-balance{padding:12px 0 0}
.ur-oq-bal-v{letter-spacing:-.02em}
/* emphasis: remaining % is the hero number; labels/meta recede */.ur-oq-title{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.ur-oq-time{font-size:10px;opacity:.7}
.ur-oq-head>.ur-oq-account,.ur-oq-switch{font-size:11px}
.ur-vcol,.ur-vcol:hover{grid-template-areas:'name pct' 'sub pct' 'bar bar';align-items:end;row-gap:4px}
.ur-vcol-pct{font-size:24px;font-weight:600;letter-spacing:-.03em;color:var(--dsw-alias-label-primary)}
.ur-vcol-name{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.ur-vcol-sub{font-size:10px;line-height:12px;color:var(--dsw-alias-label-tertiary)}
.ur-vcol:not(:has(.ur-vcol-sub)) .ur-vcol-name{grid-row:1/span 2;align-self:end;padding-bottom:4px}
.ur-vcol-track{margin-top:2px}
.ur-oq-reset{font-size:10px}
.ur-oq-bal-k{font-size:11px;color:var(--dsw-alias-label-tertiary)}
/* single focus: only the tightest quota per card is big; everything else is quiet body text */.ur-vcol-pct{font-size:13px;line-height:16px;font-weight:500;letter-spacing:0;color:var(--dsw-alias-label-secondary)}
.ur-vcol-fill{background:var(--dsw-alias-label-tertiary)}
.ur-vcol[data-hero] .ur-vcol-pct{font-size:28px;line-height:32px;font-weight:600;letter-spacing:-.03em;color:var(--dsw-alias-label-primary)}
.ur-vcol[data-hero] .ur-vcol-name{color:var(--dsw-alias-label-primary)}
.ur-vcol[data-hero] .ur-vcol-fill{background:var(--dsw-alias-label-primary)}
.ur-vcol[data-low] .ur-vcol-pct{color:var(--ap-red)}
.ur-vcol[data-low] .ur-vcol-fill{background:var(--ap-red)}
.ur-oq-bars{gap:10px}
.ur-oq-bal-v{font-size:28px;line-height:32px;font-weight:600}
/* step: one panel-level update time; smaller currency symbol */.ur-oq-top{margin:0 2px 8px;text-align:right;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.ur-oq-bal-cur{font-size:.6em;font-weight:500;margin-right:2px}
/* fix: reset line wraps instead of clipping; uniform card layout: % on right, full-width bar */.ur-oq-reset{white-space:normal;overflow:visible;text-overflow:clip;font-size:11px;line-height:1.4;text-align:left}
.ur-vcol{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'name pct' 'sub pct' 'track track' 'reset reset';column-gap:8px}
.ur-vcol-name{grid-area:name}
.ur-vcol-sub{grid-area:sub}
.ur-vcol-pct{align-self:end}
.ur-vcol-track{grid-area:track;width:100%;max-width:none;justify-self:stretch}
.ur-vcol-reset{grid-area:reset;white-space:normal}
/* fix: bars stay visible after toggle; consistent row layout */.ur-vcol,.ur-vcol:hover,.ur-vcol:active,.ur-vcol:focus,.ur-vcol[aria-expanded]{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'name pct' 'sub pct' 'track track' 'reset reset';align-items:end;column-gap:8px;row-gap:2px;min-height:0;padding:8px 0;background:none;overflow:visible}
.ur-vcol .ur-vcol-track{grid-area:track;position:relative;display:block;inset:auto;width:100%;height:3px;margin-top:4px;border-radius:2px;background:var(--dsw-alias-border-l2);overflow:hidden;opacity:1;visibility:visible}
.ur-vcol .ur-vcol-fill{position:absolute;inset:0;display:block;width:100%;height:100%;transform:scaleX(var(--p,0));transform-origin:left center;animation:none;transition:none;opacity:1;visibility:visible}
.ur-vcol-pct{grid-area:pct;justify-self:end;text-align:right;line-height:1}
/* smaller check-in button */.ur-oq-head .ur-checkin,.ur-checkin{width:16px;height:16px;min-width:0;min-height:0;padding:0;flex:none;border-radius:8px;font-size:9px;line-height:16px;align-self:center}
/* align first quota row across cards: header always reserves title+account height; rows start at top */.ur-oq-head{min-height:40px;align-content:flex-start}.ur-oq-bars{justify-content:flex-start}
`;

    const percentOf = (win) => {
      if (win?.remaining !== null && win?.remaining !== undefined) return win.remaining;
      if (win?.used !== null && win?.used !== undefined) return Math.max(0, Math.min(100, 100 - win.used));
      return null;
    };

    const usableWindows = (provider) =>
      (provider?.windows ?? [])
        .map((win) => ({ name: win.name, pct: percentOf(win), resetsAt: win.resetsAt, readAt: win.readAt }))
        .filter((win) => win.pct !== null);

    const tightest = (windows) =>
      windows.reduce((worst, win) => (worst === null || win.pct < worst.pct ? win : worst), null);

    const toneOf = (pct) => {
      if (pct === null) return 'var(--dsw-alias-label-tertiary)';
      if (pct <= 10) return 'var(--dsw-alias-state-error-primary)';
      if (pct <= 30) return 'var(--dsw-alias-state-warn-label, var(--dsw-alias-state-error-primary))';
      return 'var(--dsw-alias-label-secondary)';
    };

    // Countdown to a reset: ≥24h → "X天Y小时", otherwise "X小时Y分" (or "Y分").
    const formatLeft = (iso) => {
      const ms = Date.parse(iso ?? '') - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) return '';
      const mins = Math.floor(ms / 60000);
      const d = Math.floor(mins / 1440), hr = Math.floor((mins % 1440) / 60), m = mins % 60;
      if (d > 0) return hr ? `${d}天${hr}小时` : `${d}天`;
      if (hr > 0) return m ? `${hr}小时${m}分` : `${hr}小时`;
      return `${Math.max(1, m)}分`;
    };
    const resetLabel = (iso) => {
      const at = formatReset(iso);
      if (!at) return '';
      const left = formatLeft(iso);
      return left ? `${at} 重置（${left}）` : `${at} 重置`;
    };
    const formatReset = (iso) => {
      const ts = Date.parse(iso ?? '');
      if (!Number.isFinite(ts)) return '';
      const date = new Date(ts);
      const two = (n) => String(n).padStart(2, '0');
      const today = new Date();
      const sameDay =
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();
      return sameDay
        ? `${two(date.getHours())}:${two(date.getMinutes())}`
        : `${date.getMonth() + 1}/${date.getDate()} ${two(date.getHours())}:${two(date.getMinutes())}`;
    };

    const formatRemaining = (iso) => {
      const ts = Date.parse(iso ?? '');
      if (!Number.isFinite(ts)) return '';
      const ms = ts - Date.now();
      if (ms <= 0) return '已过重置时间，等待更新';
      const minutes = Math.ceil(ms / 60000);
      if (minutes < 60) return `${minutes}分钟`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        const restMin = minutes % 60;
        return restMin ? `${hours}小时${restMin}分` : `${hours}小时`;
      }
      const days = Math.floor(hours / 24);
      const restHours = hours % 24;
      return restHours ? `${days}天${restHours}小时` : `${days}天`;
    };

    const unitLabel = (u) => ({ credits: ' 积分', credit: ' 积分', h: ' 小时', hours: ' 小时', hr: ' 小时' }[String(u).trim().toLowerCase()] ?? u);

    const windowLabel = (name) => name
      .replace('Agent hours', '智能体时长')
      .replace('Image generation', '图像生成')
      .replace('Total credits', '总积分')
      .replace('Extra credits', '额外积分')
      .replace('Credits', '积分')
      .replace('5 hours', '5小时')
      .replace('7 days', '7天');

    const providerLabel = (name) => ({
      workbuddy: 'WorkBuddy',
      'workbuddy-ai': 'WorkBuddy AI',
      doubao: '豆包',
      deepseek: 'DeepSeek',
      'aws-quick': 'AWS Quick',
    }[name] || name);

    // Display-only mask; mirrors quotas.js maskAccount (the raw id is still needed for RPC).
    const maskName = (value) => {
      if (typeof value !== 'string' || !value.trim()) return '';
      const text = value.trim();
      const email = text.match(/^(.{1,3})[^@]*(@.+)$/u);
      if (email) return `${email[1]}…${email[2]}`.slice(0, 40);
      const chars = [...text];
      return chars.length <= 4 ? `${chars[0]}…` : `${chars.slice(0, 2).join('')}…${chars.slice(-2).join('')}`;
    };

    const round = (pct) => Math.max(0, Math.min(100, Math.round(pct)));
    const formatPercent = (pct) => pct > 0 && pct < 0.5 ? '<1%' : `${round(pct)}%`;

    function Ring({ pct, tone }) {
      const drawn = pct === null ? 0 : round(pct);
      return h(
        'svg',
        { className: 'ur-ring', width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}`, 'aria-hidden': true },
        h('circle', { className: 'ur-track', cx: SIZE / 2, cy: SIZE / 2, r: RADIUS, strokeWidth: STROKE }),
        pct === null
          ? null
          : h('circle', {
              className: 'ur-value',
              cx: SIZE / 2,
              cy: SIZE / 2,
              r: RADIUS,
              strokeWidth: STROKE,
              stroke: tone || toneOf(drawn),
              strokeDasharray: CIRCUMFERENCE,
              strokeDashoffset: CIRCUMFERENCE * (1 - drawn / 100),
            }),
      );
    }

    function ResetCards({ rpc, onRefresh }) {
      const [accounts, setAccounts] = React.useState(null);
      const [expanded, setExpanded] = React.useState(false);
      const [selected, setSelected] = React.useState(null);
      const [status, setStatus] = React.useState('');
      const read = React.useCallback(async (signal) => {
        try {
          const result = await rpc.call('/api', 'dsh-usage-rings/reset-cards', {}, signal);
          if (signal?.aborted) return;
          if (!result?.ok || !Array.isArray(result.value?.accounts)) throw new Error('unavailable');
          setAccounts(result.value.accounts);
        } catch { if (!signal?.aborted) setStatus('重置卡读取失败'); }
      }, [rpc]);
      React.useEffect(() => { const controller = new AbortController(); void read(controller.signal); return () => controller.abort(); }, [read]);
      const useCard = async () => {
        if (!selected || status === '正在使用…') return;
        setStatus('正在使用…');
        try {
          const result = await rpc.call('/api', 'dsh-usage-rings/use-reset-card', selected, new AbortController().signal);
          if (!result?.ok || !result.value?.ok) throw new Error('failed');
          setStatus('操作已提交，请刷新额度核对结果'); setSelected(null);
          await read(new AbortController().signal); onRefresh();
        } catch { setStatus('使用失败，请到 Magpie 核对账户与重置卡状态'); }
      };
      const total = accounts?.reduce((sum, account) => sum + (Number.isFinite(account.count) ? account.count : 0), 0);
      const earliest = accounts?.map(account => account.until).filter(value => Number.isFinite(Date.parse(value ?? ''))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
      const chevron = h('svg', { className: expanded ? 'ur-reset-chevron ur-open' : 'ur-reset-chevron', viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
        h('path', { d: 'M4 6l4 4 4-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }));
      return h('div', { className: 'ur-reset-cards' },
        h('button', { type: 'button', className: 'ur-reset-header', 'aria-expanded': expanded, onClick: () => setExpanded(v => !v) },
          h('span', { className: 'ur-reset-title' }, '重置卡'),
          h('span', { className: 'ur-reset-meta' }, accounts ? `${total} 张${earliest ? ` · 最早 ${formatReset(earliest)} 到期` : total ? ' · 到期时间未知' : ''}` : '读取中'),
          chevron),
        expanded && accounts ? accounts.map((account) => h('div', { className: 'ur-reset-account', key: account.user },
          h('div', { className: 'ur-reset-account-name' }, maskName(account.user)),
          account.each?.length ? account.each.map((card) => h('div', { className: 'ur-reset-card', key: card.id },
            h('span', { className: 'ur-reset-time' }, card.until ? `${formatReset(card.until)} 到期` : '到期时间未知'),
            h('button', { type: 'button', className: 'ur-reset-action', onClick: () => setSelected({ user: account.user, credit: card.id }) }, '使用'))) : h('div', { className: 'ur-note' }, `${account.count} 张 · ${account.until ? `${formatReset(account.until)} 到期` : '到期时间或卡片明细未知'}`))) : null,
        selected ? h('div', { className: 'ur-reset-confirm' }, h('span', { className: 'ur-reset-confirm-text' }, `确认使用 ${selected.user} 的重置卡？`), h('span', { className: 'ur-reset-confirm-actions' },
          h('button', { type: 'button', className: 'ur-reset-cancel', onClick: () => setSelected(null) }, '取消'),
          h('button', { type: 'button', className: 'ur-reset-action', onClick: useCard, disabled: status === '正在使用…' }, status === '正在使用…' ? '使用中…' : '确认使用'))) : null,
        status && !selected ? h('div', { className: 'ur-note', role: 'status' }, status) : null);
    }

    function ProviderRing({ label, provider, onRefresh, rpc, requestState = 'ready' }) {
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const buttonRef = React.useRef(null);
      const anchorName = `--ur-quota-${React.useId().replaceAll(':', '')}`;
      const position = usePanelPosition(rootRef, 300, open);
      const windows = usableWindows(provider).filter((win) => label !== 'Codex' || win.name !== 'Image generation');
      const primaryWindows = label === 'Gemini' ? windows.filter((win) => win.name.startsWith('Gemini ·')) : windows;
      const fallbackWindows = label === 'Gemini' ? windows.filter((win) => win.name.startsWith('Gemini 4 Argon ·')) : [];
      const fiveHour = primaryWindows.find((win) => win.name === '5 hours' || win.name.endsWith(' · 5 hours'));
      const weekly = primaryWindows.find((win) => win.name === '7 days' || win.name.endsWith(' · 7 days'));
      const target = fiveHour ?? tightest(primaryWindows) ?? tightest(fallbackWindows);
      const targetLabel = fiveHour ? '5小时剩余' : target && fallbackWindows.includes(target) ? `${windowLabel(target.name)} 剩余` : '最低剩余';
      const pct = target === null ? null : target.pct;
      const exhausted = [fiveHour, weekly]
        .filter((win) => win && typeof win.pct === 'number' && win.pct <= 0)
        .sort((left, right) => (Date.parse(right.resetsAt ?? '') || 0) - (Date.parse(left.resetsAt ?? '') || 0));
      const blocked = exhausted.length ? exhausted[0] : null;
      const blockedText = blocked ? formatRemaining(blocked.resetsAt) : '';
      const ringPct = blocked ? 0 : pct;
      const primaryText = blocked ? '0%' : pct === null ? '—' : formatPercent(pct);
      const observedAt = Date.parse(provider?.readAt ?? '');
      const stale = windows.length > 0 && (!Number.isFinite(observedAt) || Date.now() - observedAt > 5 * 60 * 1000);
      const headingLabel = blocked ? `${windowLabel(blocked.name)}已用完` : targetLabel;
      const primaryWindow = blocked ?? target;
      const primaryName = primaryWindow ? windowLabel(primaryWindow.name.replace(/^(Gemini|Gemini 4 Argon|Claude & GPT) · /, '')) : '';
      const groups = label === 'Gemini'
        ? [
            { name: 'Gemini', items: windows.filter((win) => win.name.startsWith('Gemini ·')) },
            { name: 'Gemini 4 Argon', items: windows.filter((win) => win.name.startsWith('Gemini 4 Argon ·')) },
            { name: 'Claude & GPT', items: windows.filter((win) => win.name.startsWith('Claude & GPT ·')) },
          ].filter((group) => group.items.length)
        : [{ name: 'Codex', items: windows }];
      const footText = [
        requestState === 'loading' ? '正在读取额度' : '',
        requestState === 'error' ? '刷新失败' : '',
        stale ? '数据来自上一次读取' : '',
        provider?.status === 'partial' ? '部分账户额度不可用' : '',
      ].filter(Boolean).join(' · ');
      const spoken = `${label} 额度，${blocked ? `${windowLabel(blocked.name)}已用完${blockedText ? `，${blockedText}` : ''}` : pct === null ? '暂不可用' : `${targetLabel} ${formatPercent(pct)}`}`;
      // Same dismissal contract as the host context meter: outside pointer, Escape, focus return.
      React.useEffect(() => {
        if (!open) return undefined;
        const outside = (event) => {
          const path = event.composedPath();
          if (!path.includes(rootRef.current) && !path.includes(panelRef.current)) setOpen(false);
        };
        const key = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
          }
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', outside, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      // Opening refreshes in the background: the dock keeps its width, the panel reports progress.
      React.useEffect(() => {
        if (!open) return;
        if (stale || requestState === 'error') onRefresh();
      }, [open]);
      return h(
        'span',
        { className: 'ur-anchor', ref: rootRef, style: { anchorName } },
        h(
          'button',
          {
            type: 'button',
            ref: buttonRef,
            className: 'ur-item',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-label': spoken,
            onClick: () => setOpen((value) => !value),
          },
          h(Ring, { pct: ringPct }),
          h('span', { className: 'ur-pct' }, blocked && blockedText ? blockedText : primaryText),
          h('span', { className: 'ur-name' }, label),
        ),
        open && position
          ? createPortal(
              h(
                'div',
                { className: 'ur-panel', ref: panelRef, role: 'dialog', 'aria-label': spoken, style: panelStyle(position) },
                h(
                  'div',
                  { className: 'ur-head' },
                  h('span', { className: 'ur-head-title' }, `${label} 额度`),
                  h('span', { className: 'ur-head-meta' }, `${provider?.account ? `${provider.account} · ` : ''}读取于 ${formatReset(provider?.readAt) || '未知'}`),
                ),
                h('div', { className: 'ur-metric' },
                  h('div', { className: 'ur-metric-value' }, ringPct === null ? '—' : formatPercent(ringPct), blocked && blockedText ? h('span', { className: 'ur-metric-countdown' }, blockedText) : primaryName ? h('span', { className: 'ur-metric-unit' }, primaryName) : null),
                  h('div', { className: 'ur-feature-note' }, `${headingLabel}${primaryWindow?.resetsAt && formatReset(primaryWindow.resetsAt) ? ` · ${resetLabel(primaryWindow.resetsAt)}` : ''}`),
                  h('div', { className: 'ur-meter ur-meter-main', 'aria-hidden': true },
                    h('span', { style: { width: `${ringPct ?? 0}%`, background: 'var(--dsw-alias-label-tertiary)' } }))),
                windows.length === 0
                  ? h('div', { className: 'ur-note' }, requestState === 'loading' ? '正在读取额度' : provider?.status === 'unknown' ? '额度数据无法识别' : '额度暂不可用')
                  : h(
                      'div',
                      null,
                      groups.flatMap((group) => group.items.filter((win) => win !== primaryWindow).map((win) => ({ group: group.name, win }))).length
                        ? null : null,
                      groups.map((group) => {
                        const items = group.items.filter((win) => win !== primaryWindow);
                        return items.length ? h('div', { className: 'ur-quota-group', key: group.name },
                          label === 'Gemini' ? h('div', { className: 'ur-quota-group-name' }, group.name) : null,
                          ...items.map((win) => h('div', { className: 'ur-quota-ring-row', key: win.name },
                            h(Ring, { pct: win.pct, tone: toneOf(win.pct) }),
                            h('div', { className: 'ur-quota-ring-body' },
                              h('div', { className: 'ur-quota-ring-line' },
                                h('span', { className: 'ur-quota-label' }, windowLabel(win.name.replace(`${group.name} · `, ''))),
                                h('span', { className: 'ur-quota-ring-pct' }, formatPercent(win.pct))),
                              formatReset(win.resetsAt) ? h('div', { className: 'ur-quota-ring-reset' }, (win.expires ? String(resetLabel(win.resetsAt)).replace('重置', '到期') : resetLabel(win.resetsAt))) : null)))) : null;
                      }),
                    ),
                label === 'Codex' && rpc ? h(ResetCards, { rpc, onRefresh }) : null,
                footText ? h('div', { className: 'ur-note' }, footText) : null,
              ),
              document.body,
            )
          : null,
      );
    }

    const finiteNonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const duration = (ms) => {
      const seconds = ms / 1000;
      if (seconds < 60) return `${Math.round(seconds * 10) / 10}秒`;
      const whole = Math.round(seconds);
      return `${Math.floor(whole / 60)}分${whole % 60}秒`;
    };

    const formatTokens = (value) => {
      if (!Number.isFinite(value)) return '—';
      if (value >= 1e8) return `${Math.round(value / 1e8 * 100) / 100}亿`;
      if (value >= 1e4) return `${Math.round(value / 1e3) / 10}万`;
      return value.toLocaleString('zh-CN');
    };

    // 剩余额度越低越紧张：色彩分级全部取自宿主状态 token，避免自造颜色。
    const fillOf = (pct) => pct === null
      ? 'var(--dsw-alias-label-tertiary)'
      : pct <= 10
        ? 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-tertiary))'
        : pct <= 30
          ? 'var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-tertiary))'
          : 'var(--dsw-alias-state-success-primary, var(--dsw-alias-label-tertiary))';

    const GAUGE_RADIUS = 22;
    const GAUGE_CIRC = 2 * Math.PI * GAUGE_RADIUS;

    // 环形图：一份数据、一段圆弧；空值退化为空环而不是 0%。
    const gaugeChart = (pct, cap, stroke) => {
      const share = pct === null ? 0 : Math.max(0, Math.min(100, pct));
      return h('div', { className: 'ur-gauge' },
        h('svg', { width: 56, height: 56, viewBox: '0 0 56 56', 'aria-hidden': true },
          h('circle', { className: 'ur-arc ur-arc-track', cx: 28, cy: 28, r: GAUGE_RADIUS, strokeWidth: 5 }),
          h('circle', {
            className: 'ur-arc ur-arc-val', cx: 28, cy: 28, r: GAUGE_RADIUS, strokeWidth: 5,
            stroke: stroke ?? fillOf(pct),
            style: {
              '--ur-circ': `${GAUGE_CIRC}px`,
              strokeDasharray: `${GAUGE_CIRC}px`,
              strokeDashoffset: `${GAUGE_CIRC * (1 - share / 100)}px`,
              transform: 'rotate(-90deg)',
              transformOrigin: '28px 28px',
            },
          })),
        h('span', { className: 'ur-gauge-val' },
          pct === null ? '—' : `${Math.round(share)}%`,
          cap ? h('span', { className: 'ur-gauge-cap' }, cap) : null));
    };

    const routeText = (selection) => {
      if (!selection || !selection.model) return null;
      if (selection.model.includes('/') || !selection.provider) return selection.model;
      return `${selection.provider}/${selection.model}`;
    };

    // Match the host's window-only fallback when the whole-session projection is absent.
    function windowStats(nodes) {
      const turns = new Set();
      const result = { turns: 0, steps: 0, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 };
      for (const node of nodes ?? []) {
        if (node.kind === 'tool-result') {
          if (Number.isFinite(node.time) && Number.isFinite(node.callTime)) result.toolMs += Math.max(0, node.time - node.callTime);
          continue;
        }
        if (node.kind !== 'assistant') continue;
        turns.add(node.turn);
        result.steps += 1;
        const timing = node.timing;
        if (Number.isFinite(timing?.stepStartTime) && Number.isFinite(timing?.completedTime)) result.llmMs += Math.max(0, timing.completedTime - timing.stepStartTime);
        if (Number.isFinite(timing?.stepStartTime) && Number.isFinite(timing?.firstTokenTime)) {
          result.ttftMs += Math.max(0, timing.firstTokenTime - timing.stepStartTime);
          result.ttftSteps += 1;
        }
        if (Number.isFinite(timing?.completedTime) && Number.isFinite(timing?.firstTokenTime) && finiteNonnegative(node.usage?.outputTokens)) {
          result.decodeMs += Math.max(0, timing.completedTime - timing.firstTokenTime);
          result.decodeTokens += node.usage.outputTokens;
        }
      }
      result.turns = turns.size;
      return result;
    }

    const EMPTY_TAILS = Object.freeze([]);
    const EMPTY_TAIL_SOURCE = { subscribe: () => () => {}, getSnapshot: () => EMPTY_TAILS };

    const isGroupModel = (model) => typeof model === 'string' && model.startsWith('group/');

    function useMagpieRoutes(rpc, sessionId, active, refreshKey) {
      const [routeState, setRouteState] = React.useState(null);
      const controllerRef = React.useRef(null);
      React.useEffect(() => {
        setRouteState(null);
      }, [sessionId]);
      React.useEffect(() => {
        if (!active || !rpc || !sessionId) return undefined;
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setRouteState((prior) => (prior && typeof prior === 'object' ? { ...prior, loading: true, error: false } : { groups: null, lastServed: null, loading: true, error: false }));
        Promise.resolve()
          .then(() => rpc.call('/api', 'dsh-usage-rings/magpie-routes', { sessionId }, controller.signal))
          .then((response) => {
            if (controller.signal.aborted) return;
            if (response?.ok && response.value && typeof response.value === 'object') {
              setRouteState({
                groups: response.value.groups ?? {},
                lastServed: response.value.lastServed ?? null,
                loading: false,
                error: false,
              });
            } else {
              setRouteState((prior) => ({
                groups: prior?.groups ?? null,
                lastServed: prior?.lastServed ?? null,
                loading: false,
                error: true,
              }));
            }
          })
          .catch((error) => {
            if (controller.signal.aborted || error?.name === 'AbortError') return;
            setRouteState((prior) => ({
              groups: prior?.groups ?? null,
              lastServed: prior?.lastServed ?? null,
              loading: false,
              error: true,
            }));
          });
        return () => {
          controller.abort();
          controllerRef.current = null;
        };
      }, [active, rpc, sessionId, refreshKey]);
      const safe = routeState && typeof routeState === 'object' ? routeState : null;
      return {
        groups: safe?.groups ?? null,
        lastServed: safe?.lastServed ?? null,
        loading: Boolean(safe?.loading),
        error: Boolean(safe?.error),
      };
    }

    function resolveConcreteModels(rawModels, groups) {
      if (!Array.isArray(rawModels)) return { models: null, hasUnresolvedGroup: false };
      const merged = new Map();
      let hasUnresolvedGroup = false;
      const add = (provider, model, stats) => {
        const key = `${provider}\u0000${model}`;
        const prior = merged.get(key) ?? {
          provider,
          model,
          tokens: 0,
          uncachedInputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          steps: 0,
        };
        const uncached = finiteNonnegative(stats.uncachedInputTokens) ? stats.uncachedInputTokens : 0;
        const output = finiteNonnegative(stats.outputTokens) ? stats.outputTokens : 0;
        const cacheRead = finiteNonnegative(stats.cacheReadTokens) ? stats.cacheReadTokens : 0;
        const cacheWrite = finiteNonnegative(stats.cacheWriteTokens) ? stats.cacheWriteTokens : 0;
        const sumTokens = uncached + output + cacheRead + cacheWrite;
        prior.uncachedInputTokens += uncached;
        prior.outputTokens += output;
        prior.cacheReadTokens += cacheRead;
        prior.cacheWriteTokens += cacheWrite;
        prior.tokens += finiteNonnegative(stats.tokens) ? stats.tokens : sumTokens;
        prior.steps += finiteNonnegative(stats.steps) ? stats.steps : (finiteNonnegative(stats.calls) ? stats.calls : 0);
        merged.set(key, prior);
      };
      for (const entry of rawModels) {
        if (!entry) continue;
        if (!isGroupModel(entry.model)) {
          add(entry.provider, entry.model, entry);
          continue;
        }
        const children = groups?.[entry.model]?.models;
        if (Array.isArray(children) && children.length > 0) {
          for (const child of children) add(child.provider, child.model, child);
        } else {
          hasUnresolvedGroup = true;
        }
      }
      const models = [...merged.values()].sort((left, right) => right.tokens - left.tokens);
      return { models, hasUnresolvedGroup };
    }

    function resolveConcreteRoute(selection, groups, lastServed) {
      if (!selection || !selection.provider || !selection.model) return null;
      if (!isGroupModel(selection.model)) return { provider: selection.provider, model: selection.model };
      const groupLast = groups?.[selection.model]?.last;
      if (groupLast?.provider && groupLast?.model) return groupLast;
      if (lastServed?.req === selection.model && lastServed?.provider && lastServed?.model) {
        return { provider: lastServed.provider, model: lastServed.model };
      }
      const top = groups?.[selection.model]?.models?.[0];
      if (top?.provider && top?.model) return { provider: top.provider, model: top.model };
      return null;
    }

    // Replaces the host's activity seat instead of adding a second dock item.
    function ActivityStats({ useProjection, useChat, sessionId, rpc }) {
      const projected = useProjection('sessionStats');
      const modelSelection = useProjection('modelSelection');
      const usageByModel = useProjection('usageByModel');
      const tokenUsage = useProjection('tokenUsage');
      const nodes = useChat((state) => state.legacy.nodes);
      const turnOrder = useChat((state) => state.timeline.turnOrder);
      const store = useChat((state) => state.nodes);
      const latestTurn = turnOrder.at(-1);
      const source = latestTurn === undefined ? EMPTY_TAIL_SOURCE : store.turnDataSource(latestTurn, 'turn-tail');
      const tails = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
      const tailUsage = tails.at(-1)?.tokenUsage;
      const fallback = React.useMemo(() => nodes ? windowStats(nodes) : null, [nodes]);
      const stats = projected ?? fallback;
      const [open, setOpen] = React.useState(false);
      const { groups: magpieRoutes, lastServed, loading: routesLoading, error: routesError } = useMagpieRoutes(
        rpc,
        sessionId,
        open,
        usageByModel?.total,
      );
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const buttonRef = React.useRef(null);
      const anchorName = `--usage-rings-stats-${React.useId().replaceAll(':', '')}`;
      const position = usePanelPosition(rootRef, 340, open);
      React.useEffect(() => { setOpen(false); }, [sessionId]);
      React.useEffect(() => {
        if (!open) return undefined;
        const outside = (event) => {
          const path = event.composedPath();
          if (!path.includes(rootRef.current) && !path.includes(panelRef.current)) setOpen(false);
        };
        const key = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
          }
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('click', outside, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', outside, true);
          document.removeEventListener('click', outside, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      if (!stats || !finiteNonnegative(stats.steps) || stats.steps === 0) return null;
      const speed = finiteNonnegative(stats.decodeTokens) && finiteNonnegative(stats.decodeMs) && stats.decodeMs > 0
        ? stats.decodeTokens * 1000 / stats.decodeMs : null;
      const counts = finiteNonnegative(stats.turns) ? `${stats.turns}轮 · ${stats.steps}步` : `${stats.steps}步`;
      const speedText = speed === null ? null : `${Math.round(speed * 10) / 10} Tok/s`;
      const rows = [
        ['模型用时', finiteNonnegative(stats.llmMs) && stats.llmMs > 0 ? duration(stats.llmMs) : null],
        ['工具用时', finiteNonnegative(stats.toolMs) && stats.toolMs > 0 ? duration(stats.toolMs) : null],
        ['首响平均', finiteNonnegative(stats.ttftMs) && finiteNonnegative(stats.ttftSteps) && stats.ttftSteps > 0 ? duration(stats.ttftMs / stats.ttftSteps) : null],
      ].filter((row) => row[1] !== null);
      const timed = finiteNonnegative(stats.llmMs) && finiteNonnegative(stats.toolMs) ? stats.llmMs + stats.toolMs : 0;
      const modelShare = timed > 0 ? Math.round(stats.llmMs / timed * 100) : null;
      const resolvedLast = resolveConcreteRoute(modelSelection?.lastUsed, magpieRoutes, lastServed);
      const lastIsGroup = isGroupModel(modelSelection?.lastUsed?.model);
      const liveRoute = lastIsGroup
        ? (resolvedLast ? routeText(resolvedLast) : (routesLoading ? '正在识别具体模型…' : '等待关联具体模型'))
        : routeText(modelSelection?.lastUsed);
      const resolvedNext = resolveConcreteRoute(modelSelection?.next, magpieRoutes, lastServed);
      const nextRoute = isGroupModel(modelSelection?.next?.model)
        ? (resolvedNext && modelSelection?.next?.model !== modelSelection?.lastUsed?.model ? routeText(resolvedNext) : null)
        : routeText(modelSelection?.next);
      const modelTotal = usageByModel && finiteNonnegative(usageByModel.total) ? usageByModel.total : 0;
      const { models: resolvedModels, hasUnresolvedGroup } = usageByModel?.models?.length
        ? resolveConcreteModels(usageByModel.models, magpieRoutes)
        : { models: null, hasUnresolvedGroup: false };
      const resolvedTailRoutes = Array.isArray(tailUsage?.routes)
        ? [...new Set(
            tailUsage.routes
              .map((route) => resolveConcreteRoute(route, magpieRoutes, lastServed))
              .map((route) => routeText(route))
              .filter(Boolean),
          )]
        : [];
      return h('span', { className: 'ur-stats', ref: rootRef, style: { anchorName }, 'data-composer-stat': 'activity' },
        h('button', {
          type: 'button', className: 'ur-stats-button', ref: buttonRef,
          'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': `会话统计，${counts}${speedText ? `，${speedText}` : ''}`,
          onClick: () => setOpen((value) => !value),
        }, h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
          h('circle', { cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 2 }),
          h('path', { d: 'M8 8l2.5-2.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })),
          speedText ? h('span', { className: 'ur-pct' }, `${Math.round(speed * 10) / 10}`) : h('span', { className: 'ur-pct' }, counts),
          speedText ? h('span', { className: 'ur-name' }, 'Tok/s') : null),
        open && position ? createPortal(h('div', { className: 'ur-panel ur-stats-panel', ref: panelRef, role: 'dialog', 'aria-label': '会话统计', style: panelStyle(position) },
          h('div', { className: 'ur-head' },
            h('span', { className: 'ur-head-title' }, '会话统计'),
            h('span', { className: 'ur-head-meta' }, counts)),
          h('div', { className: 'ur-metric' },
            h('div', { className: 'ur-metric-value' }, speed === null ? '—' : `${Math.round(speed * 10) / 10}`),
            h('div', { className: 'ur-feature-note' }, '平均输出速率 · Tok/s')),
          modelShare === null ? null : h('div', { className: 'ur-time-chart' },
            h('div', { className: 'ur-chart-caption' }, h('span', null, '累计耗时构成'), h('span', null, `模型 ${modelShare}% · 工具 ${100 - modelShare}%`)),
            h('div', { className: 'ur-segbar', 'aria-hidden': true },
              h('span', { style: { width: `${modelShare}%`, background: 'var(--dsw-alias-chart-messages, var(--dsw-alias-label-secondary))' } }),
              h('span', { style: { width: `${100 - modelShare}%`, background: 'var(--dsw-alias-chart-tools, var(--dsw-alias-label-tertiary))' } }))),
          h('div', { className: 'ur-route-row' }, h('span', null, '正在使用'), h('b', { title: liveRoute ?? undefined }, liveRoute ?? '等待首次请求')),
          liveRoute !== null && nextRoute !== null && nextRoute !== liveRoute
            ? h('div', { className: 'ur-route-row' }, h('span', null, '下一步'), h('b', { title: nextRoute }, nextRoute)) : null,
          rows.length
            ? h('div', { className: 'ur-tiles' },
              rows.map(([name, value]) => h('div', { className: 'ur-tile', key: name },
                h('div', { className: 'ur-tile-k' }, name),
                h('div', { className: 'ur-tile-v' }, value))))
            : h('div', { className: 'ur-note' }, '暂无计时数据'),
          h('details', { className: 'ur-disclosure' }, h('summary', null, '令牌构成'), (() => {
            const buckets = tokenUsage?.totals ?? tokenUsage;
            if (!buckets) return null;
            const rows = [
              ['新输入', finiteNonnegative(buckets.uncachedInputTokens) ? buckets.uncachedInputTokens : null],
              ['缓存读', finiteNonnegative(buckets.cacheReadTokens) ? buckets.cacheReadTokens : null],
              ['缓存写', finiteNonnegative(buckets.cacheWriteTokens) ? buckets.cacheWriteTokens : null],
              ['输出', finiteNonnegative(buckets.outputTokens) ? buckets.outputTokens : null],
            ].filter((row) => row[1] !== null);
            if (!rows.length) return null;
            const sum = rows.reduce((total, row) => total + row[1], 0);
            return [
              h('div', { className: 'ur-sec', key: 'tok-sec' },
                h('span', { className: 'ur-sec-title' }, '令牌构成'),
                h('span', { className: 'ur-sec-meta' }, `${formatTokens(sum)} 令牌`)),
              h('div', { className: 'ur-rows', key: 'tok-rows' },
                rows.map(([label, value]) => h('div', { className: 'ur-legend-row', key: label },
                  h('span', { className: 'ur-legend-name' }, label),
                  h('b', null, `${formatTokens(value)} · ${shareText(value, sum)}`)))),
            ];
          })()),
          h('details', { className: 'ur-disclosure' }, h('summary', null, '本会话模型用量'),
          h('div', { className: 'ur-sec' },
            h('span', { className: 'ur-sec-title' }, '模型用量'),
            resolvedModels === null ? null : h('span', { className: 'ur-sec-meta' }, `合计 ${formatTokens(modelTotal)} 令牌`)),
          resolvedModels === null
            ? h('div', { className: 'ur-note' }, usageByModel
              ? '尚无带用量的模型记录'
              : '宿主侧投影随进程启动。重开一次 DSH 后显示；期间上方统计仍可用。')
            : h('div', null,
              resolvedModels.map((entry) => {
                const share = modelTotal > 0 ? Math.round(entry.tokens / modelTotal * 100) : 0;
                return h('div', { className: 'ur-mrow', key: `${entry.provider}/${entry.model}` },
                  h('div', { className: 'ur-mrow-top' },
                    h('span', { className: 'ur-mrow-name', title: `${entry.provider} / ${entry.model}` }, entry.model),
                    h('b', { className: 'ur-mrow-val' }, `${formatTokens(entry.tokens)} · ${share}%`)),
                  h('div', { className: 'ur-meter', 'aria-hidden': true },
                    h('span', { style: { width: `${Math.max(2, share)}%`, background: 'var(--dsw-alias-brand-primary)' } })),
                  h('div', { className: 'ur-mrow-meta', title: entry.provider },
                    `输出 ${formatTokens(entry.outputTokens)} · 缓存读 ${formatTokens(entry.cacheReadTokens)} · ${entry.steps} 步`));
              }),
              hasUnresolvedGroup
                ? h('div', { className: 'ur-note' }, routesError ? '路由明细读取失败' : routesLoading ? '正在读取具体模型…' : '部分路由明细待关联（重开一次 DSH 后补全）')
                : null)),
          tailUsage ? h('div', { className: 'ur-sec' },
            h('span', { className: 'ur-sec-title' }, '最近已加载的完整一轮')) : null,
          tailUsage ? h('div', null,
            h('div', { className: 'ur-route-row' }, h('span', null, '输出'), h('b', null, `${formatTokens(tailUsage.outputTokens)} 令牌`)),
            resolvedTailRoutes.length ? h('div', { className: 'ur-route-row' }, h('span', null, '模型'), h('b', null, resolvedTailRoutes.join('、'))) : null,
          ) : null,
          projected ? null : h('div', { className: 'ur-stats-explain' }, '计时统计仅覆盖已加载的会话记录。'),
        ), document.body) : null,
      );
    }

    const formatCompact = (value) => {
      if (!Number.isFinite(value)) return '—';
      if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
      if (value >= 1e3) return `${Math.round(value / 1e3)}K`;
      return String(Math.round(value));
    };

    const contextTone = (pct) => pct >= 85
      ? 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-primary))'
      : pct >= 60
        ? 'var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-primary))'
        : 'var(--dsw-alias-label-tertiary)';

    const usePanelPosition = (anchorRef, width, open) => {
      const [position, setPosition] = React.useState(null);
      const useMeasureEffect = React.useLayoutEffect || React.useEffect;
      useMeasureEffect(() => {
        const place = () => {
          const anchor = anchorRef.current;
          if (!anchor) return;
          const rect = anchor.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const panelWidth = Math.min(width, viewportWidth - 24);
          const left = Math.max(12, Math.min(rect.left, viewportWidth - 12 - panelWidth));
          const bottom = Math.max(12, viewportHeight - rect.top + 8);
          setPosition({ left, bottom, width: panelWidth, maxHeight: Math.max(160, viewportHeight - bottom - 12) });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [anchorRef, width, open]);
      return position;
    };

    const panelStyle = (position, extra) => position === null ? null : ({
      ...extra,
      position: 'fixed',
      left: `${position.left}px`,
      bottom: `${position.bottom}px`,
      width: `${position.width}px`,
      maxHeight: `${position.maxHeight}px`,
    });

    const shareText = (value, total) => {
      if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '—';
      const pct = value / total * 100;
      return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
    };

    const cacheHitOf = (buckets) => {
      if (!buckets) return null;
      const read = finiteNonnegative(buckets.cacheReadTokens) ? buckets.cacheReadTokens : 0;
      const uncached = finiteNonnegative(buckets.uncachedInputTokens) ? buckets.uncachedInputTokens : 0;
      const write = finiteNonnegative(buckets.cacheWriteTokens) ? buckets.cacheWriteTokens : 0;
      const prompt = read + uncached + write;
      if (prompt <= 0) return null;
      return { read, uncached, write, prompt, percent: Math.round((read / prompt) * 100) };
    };

    function CachePill({ useProjection, sessionId, rpc }) {
      const usage = useProjection('tokenUsage');
      const byModel = useProjection('usageByModel');
      const [open, setOpen] = React.useState(false);
      const { groups: magpieRoutes, loading: routesLoading, error: routesError } = useMagpieRoutes(
        rpc,
        sessionId,
        open,
        byModel?.total,
      );
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const buttonRef = React.useRef(null);
      const anchorName = `--ur-cache-${React.useId().replaceAll(':', '')}`;
      const position = usePanelPosition(rootRef, 300, open);
      const totals = cacheHitOf(usage?.totals ?? usage);
      const available = totals !== null;
      React.useEffect(() => {
        if (!available && open) setOpen(false);
      }, [available, open]);
      React.useEffect(() => {
        if (!open) return undefined;
        const outside = (event) => {
          const path = event.composedPath();
          if (!path.includes(rootRef.current) && !path.includes(panelRef.current)) setOpen(false);
        };
        const key = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
          }
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', outside, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      if (!available) return null;
      const percent = totals.percent;
      const tone = percent >= 85
        ? 'var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary))'
        : percent >= 50
          ? 'var(--dsw-alias-label-secondary)'
          : 'var(--dsw-alias-state-warn-primary, var(--dsw-alias-label-primary))';
      const segments = [
        { key: 'read', label: '缓存读', color: 'var(--dsw-alias-chart-messages, var(--dsw-alias-label-tertiary))', value: totals.read },
        { key: 'uncached', label: '未缓存输入', color: 'var(--dsw-alias-chart-tools, var(--dsw-alias-label-tertiary))', value: totals.uncached },
        { key: 'write', label: '缓存写', color: 'var(--dsw-alias-chart-system, var(--dsw-alias-label-tertiary))', value: totals.write },
      ];
      const segTotal = segments.reduce((sum, segment) => sum + segment.value, 0);
      const { models: resolvedModels, hasUnresolvedGroup } = resolveConcreteModels(byModel?.models, magpieRoutes);
      const models = (resolvedModels || [])
        .map((entry) => ({ entry, hit: cacheHitOf(entry) }))
        .filter((item) => item.hit !== null)
        .sort((left, right) => right.hit.prompt - left.hit.prompt)
        .slice(0, 4);
      const spoken = `缓存命中 ${percent}%，缓存读 ${formatCompact(totals.read)}，未缓存输入 ${formatCompact(totals.uncached)}`;
      return h(
        'span',
        { className: 'ur-anchor', ref: rootRef, style: { anchorName } },
        h(
          'button',
          {
            type: 'button',
            ref: buttonRef,
            className: 'ur-item ur-item-text',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-label': spoken,
            title: spoken,
            onClick: () => setOpen((value) => !value),
          },
          h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
            h('ellipse', { cx: 8, cy: 4.4, rx: 5, ry: 2.1, stroke: 'currentColor', strokeWidth: 1.2 }),
            h('path', { d: 'M3 4.4v7.2c0 1.16 2.24 2.1 5 2.1s5-.94 5-2.1V4.4', stroke: 'currentColor', strokeWidth: 1.2 }),
            h('path', { d: 'M3 8c0 1.16 2.24 2.1 5 2.1s5-.94 5-2.1', stroke: 'currentColor', strokeWidth: 1.2 })),
          h('span', { className: 'ur-pct' }, `${percent}%`),
          h('span', { className: 'ur-name ur-cn' }, '缓存'),
        ),
        open && position
          ? createPortal(
              h(
                'div',
                { className: 'ur-panel', ref: panelRef, role: 'dialog', 'aria-label': spoken, style: panelStyle(position) },
                h(
                  'div',
                  { className: 'ur-head' },
                  h('span', { className: 'ur-head-title' }, '缓存命中'),
                  h('span', { className: 'ur-head-meta' }, '本会话'),
                ),
                h('div', { className: 'ur-metric' },
                  h('div', { className: 'ur-metric-value' }, `${percent}%`),
                  h('div', { className: 'ur-feature-note' }, '缓存读 / 全部输入'),
                ),
                segTotal > 0 ? h('div', { className: 'ur-segbar', 'aria-hidden': true },
                  segments.map((segment) => h('span', { key: segment.key, style: { width: `${(segment.value / segTotal) * 100}%`, background: segment.color } }))) : null,
                h('div', { className: 'ur-legend' }, segments.map(segment =>
                  h('div', { className: 'ur-legend-row', key: segment.key },
                    h('span', { className: 'ur-dot', style: { background: segment.color } }),
                    h('span', { className: 'ur-legend-name' }, segment.label), h('b', null, formatCompact(segment.value))))),
                (models.length || hasUnresolvedGroup)
                  ? h('div', { className: 'ur-sec' }, h('span', { className: 'ur-sec-title' }, '各模型命中 · 输入量前 4'))
                  : null,
                models.length
                  ? h('div', { className: 'ur-rows' },
                      models.map((item) =>
                        h('div', { className: 'ur-mrow', key: `${item.entry.provider}\u0000${item.entry.model}` },
                          h('div', { className: 'ur-mrow-top' },
                            h('span', { className: 'ur-mrow-name', title: `${item.entry.provider} / ${item.entry.model}` }, item.entry.model),
                            h('b', { className: 'ur-mrow-val' }, `${item.hit.percent}%`)),
                          h('div', { className: 'ur-mrow-meta' },
                            `缓存读 ${formatCompact(item.hit.read)} · 输入 ${formatCompact(item.hit.prompt)}`))))
                  : null,
                hasUnresolvedGroup
                  ? h('div', { className: 'ur-note' }, routesError ? '路由明细读取失败' : routesLoading ? '正在读取具体模型…' : '部分路由明细待关联（重开一次 DSH 后补全）')
                  : null,
                h('div', { className: 'ur-foot' }, '命中越高，长对话重放的输入开销越低'),
              ),
              document.body,
            )
          : null,
      );
    }

    function ContextPill({ useProjection }) {
      const pressure = useProjection('contextPressure');
      const breakdown = useProjection('contextBreakdown');
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const buttonRef = React.useRef(null);
      const anchorName = `--ur-context-${React.useId().replaceAll(':', '')}`;
      const position = usePanelPosition(rootRef, 300, open);
      const used = pressure?.projectedTokens ?? pressure?.pressureTokens;
      const windowSize = pressure?.contextWindow;
      const available = Number.isFinite(used) && Number.isFinite(windowSize) && windowSize > 0;
      React.useEffect(() => {
        if (!available && open) setOpen(false);
      }, [available, open]);
      // Same dismissal contract as the host controls: outside pointer, Escape, focus return.
      React.useEffect(() => {
        if (!open) return undefined;
        const outside = (event) => {
          const path = event.composedPath();
          if (!path.includes(rootRef.current) && !path.includes(panelRef.current)) setOpen(false);
        };
        const key = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
            buttonRef.current?.focus();
          }
        };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', outside, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      if (!available) return null;
      const percent = Math.min(100, Math.round((used / windowSize) * 100));
      const tone = contextTone(percent);
      const segments = [
        { key: 'system', label: '系统提示词', color: 'var(--dsw-alias-chart-system, var(--dsw-alias-label-tertiary))', value: breakdown?.systemTokens ?? 0 },
        { key: 'tools', label: '工具定义', color: 'var(--dsw-alias-chart-tools, var(--dsw-alias-label-tertiary))', value: breakdown?.toolsTokens ?? 0 },
        { key: 'messages', label: '对话消息', color: 'var(--dsw-alias-chart-messages, var(--dsw-alias-label-tertiary))', value: breakdown?.messageTokens ?? 0 },
      ].filter((segment) => Number.isFinite(segment.value) && segment.value > 0);
      const segTotal = segments.reduce((sum, segment) => sum + segment.value, 0);
      const figures = `~${formatCompact(used)} / ${formatCompact(windowSize)}`;
      const spoken = `上下文已用 ${percent}%，${figures} 令牌`;
      return h(
        'span',
        { className: 'ur-anchor ur-context-anchor', ref: rootRef, style: { anchorName } },
        h(
          'button',
          {
            type: 'button',
            ref: buttonRef,
            className: 'ur-item',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-label': spoken,
            title: spoken,
            onClick: () => setOpen((value) => !value),
          },
          h(Ring, { pct: percent, tone }),
          h('span', { className: 'ur-pct' }, `${percent}%`),
          h('span', { className: 'ur-name ur-cn' }, '上下文'),
        ),
        open && position
          ? createPortal(
              h(
                'div',
                { className: 'ur-panel', ref: panelRef, role: 'dialog', 'aria-label': spoken, style: panelStyle(position) },
                h(
                  'div',
                  { className: 'ur-head' },
                  h('span', { className: 'ur-head-title' }, '上下文'),
                  h('span', { className: 'ur-head-meta' }, figures),
                ),
                h('div', { className: 'ur-metric' },
                  h('div', { className: 'ur-metric-value' }, `${percent}%`),
                  h('div', { className: 'ur-feature-note' }, `压缩后估算 · 剩余 ${100 - percent}%`),
                  h('div', { className: 'ur-meter ur-meter-main', 'aria-hidden': true },
                    h('span', { style: { width: `${percent}%`, background: tone } }))),
                segTotal > 0
                  ? h('div', { className: 'ur-sec' }, h('span', { className: 'ur-sec-title' }, '构成'))
                  : null,
                segTotal > 0
                  ? h('div', { className: 'ur-segbar', 'aria-hidden': true },
                      segments.map((segment) =>
                        h('span', {
                          key: segment.key,
                          style: { width: `${(segment.value / segTotal) * 100}%`, background: segment.color },
                        })))
                  : null,
                segTotal > 0
                  ? h('div', { className: 'ur-rows' },
                      segments.map((segment) =>
                        h('div', { className: 'ur-legend-row', key: segment.key },
                          h('span', { className: 'ur-dot', style: { background: segment.color } }),
                          h('span', { className: 'ur-legend-name' }, segment.label),
                          h('b', null, `${formatCompact(segment.value)} · ${shareText(segment.value, segTotal)}`))))
                  : null,
                h('div', { className: 'ur-foot' }, '已用为压缩后估算，构成为全文口径'),
              ),
              document.body,
            )
          : null,
      );
    }

    function OtherQuotas({ records, requestState, rpc, onRefresh }) {
      const [open, setOpen] = React.useState(false);
      const [checkin, setCheckin] = React.useState('');
      const runCheckin = async () => {
        if (checkin === 'running') return;
        setCheckin('running');
        try {
          const result = await rpc.call('/api', 'dsh-usage-rings/workbuddy-checkin', {}, new AbortController().signal);
          setCheckin(result?.ok && result.value?.completed ? 'finished' : result?.value?.busy ? 'busy' : 'failed');
          onRefresh();
        } catch { setCheckin('failed'); }
      };
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const buttonRef = React.useRef(null);
      // One card per provider; multiple accounts of a provider are switched in place.
      const [picked, setPicked] = React.useState({}); const [openCards, setOpenCards] = React.useState({});
      const groups = [];
      if (Array.isArray(records)) {
        const byProvider = new Map();
        for (const record of records) {
          let group = byProvider.get(record.provider);
          if (!group) { group = { provider: record.provider, items: [] }; byProvider.set(record.provider, group); groups.push(group); }
          group.items.push(record);
        }
      }
      const panelWidth = groups.length > 1 ? 560 : 320;
      const position = usePanelPosition(rootRef, panelWidth, open);
      React.useEffect(() => {
        if (!open) return undefined;
        const outside = (event) => { const path = event.composedPath(); if (!path.includes(rootRef.current) && !path.includes(panelRef.current)) setOpen(false); };
        const key = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); buttonRef.current?.focus(); } };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', key, true);
        return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); };
      }, [open]);
      return h('span', { className: 'ur-anchor', ref: rootRef },
        h('button', { type: 'button', className: 'ur-item', ref: buttonRef, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': '其他模型额度', title: '其他模型额度', onClick: () => setOpen(value => !value) },
          h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true }, h('circle', { cx: 4, cy: 4, r: 2, stroke: 'currentColor', strokeWidth: 1.4 }), h('circle', { cx: 12, cy: 4, r: 2, stroke: 'currentColor', strokeWidth: 1.4 }), h('circle', { cx: 4, cy: 12, r: 2, stroke: 'currentColor', strokeWidth: 1.4 }), h('circle', { cx: 12, cy: 12, r: 2, stroke: 'currentColor', strokeWidth: 1.4 }))),
        open && position ? createPortal(h('div', { className: 'ur-panel', ref: panelRef, role: 'dialog', 'aria-label': '其他模型额度', style: panelStyle(position) },
          !Array.isArray(records) ? h('div', { className: 'ur-note' }, requestState === 'error' ? '额度读取失败' : '其他额度暂不可用') :
          records.length === 0 ? h('div', { className: 'ur-note' }, '暂未发现其他额度') :
          [
          h('div', { key: 'grid', className: groups.length === 1 ? 'ur-oq-grid ur-oq-single' : 'ur-oq-grid' },
            groups.map((group, index) => {
              const count = group.items.length;
              const pos = Math.min(picked[group.provider] ?? 0, count - 1);
              const record = group.items[pos];
              // Single-window accounts: put every account's bar side by side, labelled by alias.
              const mergeBars = count > 1 && group.items.every((it) => it.kind !== 'balance' && it.status !== 'unavailable' && (it.windows || []).length === 1);
              const barItems = mergeBars
                ? group.items.map((it, i) => ({ win: it.windows[0], label: it.alias || it.account || `账号 ${i + 1}`, full: [it.alias, it.account].filter(Boolean).join(' · ') }))
                : [...(record.windows || [])].sort((a, b) => (/^(total\b|总)/i.test(b.name || '')) - (/^(total\b|总)/i.test(a.name || ''))).map((win) => ({ win, label: windowLabel(win.name), full: '' }));
              // Parallel accounts (e.g. AWS Quick): add a summed total row; accounts collapse behind it.
              if (mergeBars) { const ws = barItems.map((b) => b.win); if (ws.every((w) => Number.isFinite(w.amount) && Number.isFinite(w.limit) && w.limit > 0) && new Set(ws.map((w) => w.unit)).size === 1) { const used = ws.reduce((t, w) => t + w.amount, 0); const limit = ws.reduce((t, w) => t + w.limit, 0); const remaining = Math.round((1 - used / limit) * 1000) / 10; const resets = ws.map((w) => w.resetsAt).filter(Boolean).sort(); barItems.unshift({ win: { name: 'Total', used: Math.round((100 - remaining) * 10) / 10, remaining, resetsAt: resets[0] || null, amount: Math.round(used * 100) / 100, limit, unit: ws[0].unit }, label: '总计', full: '' }); } }
              const lowAccts = mergeBars && barItems.length > 1 && /^total/i.test(barItems[0].win.name || '') ? barItems.slice(1).filter(({ win }) => { const p = win.remaining ?? (win.used == null ? null : 100 - win.used); return p !== null && p <= 10; }) : [];
              const readTime = record.readAt ? formatReset(record.readAt) : '';
              const resetTimes = [...new Set(barItems.map(({ win }) => formatReset(win.resetsAt)).filter(Boolean))];
              const sharedReset = resetTimes.length === 1 ? resetTimes[0] : '';
              return h('div', { className: 'ur-oq-card', key: `${record.provider}-${index}-${pos}`, style: { animationDelay: `${index * 50}ms` } },
                h('div', { className: 'ur-oq-head' },
                  h('span', { className: 'ur-oq-title', title: readTime ? `读取于 ${readTime}` : undefined }, providerLabel(record.provider)),
                  (() => {
                    // Alias (user-chosen in Magpie) first, masked account as fallback; same slot for 1 or N accounts.
                    const label = record.alias || record.account || (count > 1 ? `账号 ${pos + 1}` : '');
                    const tip = [record.alias, record.account].filter(Boolean).join(' · ');
                    if (mergeBars) return null;
                    if (count === 1) return label ? h('span', { className: 'ur-oq-account', title: tip || undefined }, label) : null;
                    return h('button', {
                      type: 'button', className: 'ur-oq-switch',
                      title: `${tip || label}（${pos + 1}/${count}，点击切换）`,
                      'aria-label': `切换 ${providerLabel(record.provider)} 账号，当前 ${label}，第 ${pos + 1} 个，共 ${count} 个`,
                      onClick: () => setPicked((prev) => ({ ...prev, [group.provider]: (pos + 1) % count })),
                    }, h('span', { className: 'ur-oq-switch-name' }, label), h('span', { className: 'ur-oq-switch-idx' }, `⇄ ${pos + 1}/${count}`));
                  })(),
                  
                  record.provider === 'workbuddy'
                    ? h('button', { type: 'button', className: 'ur-checkin', disabled: checkin === 'running', onClick: runCheckin, title: '为所有 WorkBuddy 账号签到', 'aria-label': '为所有 WorkBuddy 账号签到' }, '✓')
                    : null),
                record.provider === 'workbuddy' && checkin
                  ? h('div', { className: 'ur-note', role: 'status' }, checkin === 'running' ? '正在请求签到…' : checkin === 'finished' ? '签到命令已完成，请查看额度确认结果' : checkin === 'busy' ? '签到请求正在进行' : '签到命令未完成')
                  : null,
                record.status === 'unavailable'
                  ? h('div', { className: 'ur-note ur-fail' }, ['读取失败', record.errorText ? `：${record.errorText}` : '', record.readAt ? ` · 上次成功 ${new Date(record.readAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''].join(''))
                  : record.kind === 'balance'
                    ? [
                        h('div', { className: 'ur-oq-balance', key: 'balance' },
                          h('b', { className: 'ur-oq-bal-v' }, (() => { const v = String(record.balance ?? '未知'); const m = /^([¥$€£])\s*(.+)$/.exec(v); return m ? [h('small', { key: 'c', className: 'ur-oq-bal-cur' }, m[1]), m[2]] : v; })()),
                          h('span', { className: 'ur-oq-bal-k' }, '可用余额')),
                        h('div', { className: 'ur-oq-reset', key: 'kind' }, '余额计费'),
                      ]
                    : record.windows?.length
                      ? [
                          h('div', { className: 'ur-oq-bars', key: 'bars' },
                            barItems.map(({ win, label, full }, i) => { if (!openCards[mergeBars ? record.provider : `${record.provider}:${record.account || ''}`]) { const ti = barItems.findIndex((it) => it.win && /^(total\b|总)/i.test(it.win.name || '')); if (ti >= 0 && i !== ti) return null; }
                              const pct = win.remaining ?? (win.used == null ? null : 100 - win.used);
                              const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
                              const fillHeight = clamped > 0 ? Math.max(4, clamped) : 0;
                              const pctText = pct === null ? '—' : formatPercent(pct);
                              const resetText = formatReset(win.resetsAt);
                              const displayText = typeof win.display === 'string' ? win.display.replace(/\s*\/\s*/g, '/').replace(/(\d),(?=\d{3})/g, '$1') : '';
                              // Non-token platforms report concrete usage, e.g. 0.05/10h agent hours.
                              const usageText = Number.isFinite(win.amount) && Number.isFinite(win.limit) && win.limit > 0
                                ? `${win.amount}/${win.limit}${typeof win.unit === 'string' ? unitLabel(win.unit) : ''}`
                                : '';
                              const name = label;
                              // Unify sub text to remaining: derive total from 'x/total' and show remaining = total*pct.
                              const remainText = (() => { const src = usageText || displayText; const m = /([\d.]+)\/([\d.]+)\s*([^\d\s]*)$/.exec(src); if (!m || pct === null) return src; const tot = Number(m[2]); const r = Math.max(0, tot - Number(m[1])); const f = (n) => String(Math.round(n * 100) / 100); return `剩 ${f(r)}/${f(tot)}${m[3] || ''}`; })();
                              const winName = windowLabel(win.name);
                              const tip = [mergeBars ? `${full || name} · ${winName}` : name, pct !== null ? `剩余 ${pctText}` : null, displayText || usageText, resetText ? (win.expires ? String(resetLabel(win.resetsAt)).replace('重置', '到期') : resetLabel(win.resetsAt)) : null].filter(Boolean).join(' · ');
                              const rem = (w) => w.remaining ?? (w.used == null ? Infinity : 100 - w.used);
                              const totalIdx = barItems.findIndex((it) => it.win && /^(total\b|总)/i.test(it.win.name || '')); const heroIdx = totalIdx >= 0 ? totalIdx : barItems.reduce((b, it, k) => rem(it.win) < rem(barItems[b].win) ? k : b, 0);
                              const ck = mergeBars ? record.provider : `${record.provider}:${record.account || ''}`; const canToggle = /^(total\b|总)/i.test(win.name || '') && barItems.length > 1; return h('div', { className: 'ur-vcol', key: `${i}-${win.name || ''}`, title: canToggle ? `${tip} · 点击${openCards[ck] ? '收起' : '展开'}明细` : tip, role: canToggle ? 'button' : undefined, tabIndex: canToggle ? 0 : undefined, 'aria-expanded': canToggle ? !!openCards[ck] : undefined, 'data-toggle': canToggle ? '' : undefined, onClick: canToggle ? () => setOpenCards((p) => ({ ...p, [ck]: !p[ck] })) : undefined, onKeyDown: canToggle ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenCards((p) => ({ ...p, [ck]: !p[ck] })); } } : undefined, 'data-low': pct !== null && pct <= 10 ? '' : undefined, 'data-warn': pct !== null && pct > 10 && pct <= 30 ? '' : undefined, 'data-hero': i === heroIdx ? '' : undefined },
                                h('span', { className: 'ur-vcol-pct' }, pctText),
                                h('div', { className: 'ur-vcol-track', 'aria-hidden': true },
                                  h('span', { className: 'ur-vcol-fill', style: { '--p': String(clamped / 100), '--c': pct === null ? 'var(--ap-ter)' : pct <= 10 ? 'var(--ap-red)' : pct <= 30 ? 'var(--ap-orange)' : 'var(--ap-green)' } })),
                                h('span', { className: 'ur-vcol-name' }, name),
                                remainText ? h('span', { className: 'ur-vcol-sub' }, remainText) : null,
                                !sharedReset && resetText ? h('span', { className: 'ur-vcol-reset' }, (win.expires ? String(resetLabel(win.resetsAt)).replace('重置', '到期') : resetLabel(win.resetsAt))) : null);
                            })),
                          (!openCards[record.provider] && lowAccts.length) ? h('div', { className: 'ur-note ur-expire', key: 'lowacct' }, lowAccts.map(({ label, win }) => `${label} 剩 ${formatPercent(win.remaining ?? 100 - win.used)}`).join(' · ')) : null,
                          (() => { const tw = (record.windows || []).find((w) => /^(total\b|总)/i.test(w.name || '')); if (!tw || !tw.resetsAt) return null; const ms = new Date(tw.resetsAt).getTime() - Date.now(); const pct = tw.remaining ?? (tw.used == null ? null : 100 - tw.used); if (!(ms > 0 && ms <= 48 * 3600e3) || pct === null || pct < 30) return null; const left = Number.isFinite(tw.amount) && Number.isFinite(tw.limit) ? `${Math.max(0, +(tw.limit - tw.amount).toFixed(2))}${typeof tw.unit === 'string' ? unitLabel(tw.unit) : ''}` : formatPercent(pct); return h('div', { className: 'ur-note ur-expire', key: 'expire' }, `额度快过期了，还剩 ${left}`); })(),
                          sharedReset ? h('div', { className: 'ur-oq-reset', key: 'reset' }, resetLabel((record.windows || []).find((w) => formatReset(w.resetsAt) === sharedReset)?.resetsAt)) : null,
                        ]
                      : h('div', { className: 'ur-note' }, '未提供额度明细'));
            }))],
          requestState === 'error' ? h('div', { className: 'ur-foot' }, '刷新失败，显示上次读取。') : null), document.body) : null);
    }

    function UsageRings({ rpc }) {
      const [snapshot, setSnapshot] = React.useState(null);
      const [requestState, setRequestState] = React.useState('loading');
      const controllerRef = React.useRef(null);

      const load = React.useCallback(() => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setRequestState('loading');
        Promise.resolve()
          .then(() => rpc.call('/api', 'dsh-usage-rings/status', {}, controller.signal))
          .then((response) => {
            if (controller.signal.aborted) return;
            if (!response?.ok || !response.value || typeof response.value !== 'object') {
              setRequestState('error');
              return;
            }
            setSnapshot(response.value);
            setRequestState('ready');
          })
          .catch((error) => {
            if (controller.signal.aborted || error?.name === 'AbortError') return;
            setRequestState('error');
            console.warn('[dsh-usage-rings] quota request failed:', error);
          });
      }, [rpc]);

      React.useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        const onFocus = () => load();
        window.addEventListener('focus', onFocus);
        return () => {
          clearInterval(timer);
          window.removeEventListener('focus', onFocus);
          controllerRef.current?.abort();
        };
      }, [load]);

      const shown = PROVIDERS.map((entry) => ({
        ...entry,
        provider: snapshot?.[entry.key],
        windows: usableWindows(snapshot?.[entry.key]),
      }));

      return h(
        'div',
        { className: 'ur-row' },
        shown.map((entry) =>
          h(ProviderRing, { key: entry.key, label: entry.label, provider: entry.provider, onRefresh: load, rpc, requestState }),
        ),
        h(OtherQuotas, { records: Array.isArray(snapshot?.others) ? [
          ...snapshot.others,
        ] : undefined, requestState, rpc, onRefresh: load }),
      );
    }

    return {
      inject: ['slots', 'connection'],
      apply(ctx) {
        ctx.effect(() => {
          const owner = `usage-rings-${Math.random().toString(36).slice(2)}`;
          let tag = document.getElementById(STYLE_ID);
          if (!tag) {
            tag = document.createElement('style');
            tag.id = STYLE_ID;
            document.head.append(tag);
          }
          // Hot reload re-applies this effect with the same id; the stylesheet
          // must be rewritten or the previous CSS would silently persist.
          tag.textContent = CSS;
          tag.dataset.owner = owner;
          return () => {
            if (tag.dataset.owner === owner) tag.remove();
          };
        }, 'usage-rings: style');

        const rpc = ctx.get('connection').rpc;
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'usage-rings:context', order: 0 },
            ContextPill,
          ),
        );
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'usage', order: 10, priority: -1, inject: () => ({ rpc }) },
            CachePill,
          ),
        );
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            { name: 'conversation.composer.dock', id: 'activity', order: 11, priority: -1, inject: () => ({ rpc }) },
            ActivityStats,
          ),
        );
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'usage-rings:quota',
              order: 20,
              inject: () => ({ rpc }),
            },
            UsageRings,
          ),
        );
      },
    };
  },
});
