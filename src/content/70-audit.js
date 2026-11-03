/*
 * Canvas Studio Dark Mode — contrast audit (diagnostics).
 *
 * CAPD.audit() walks a themed document and reports ink that does not stand
 * out from the surface behind it: text below WCAG 2.1 AA (4.5:1, or 3:1
 * for large text) and SVG shapes below 3:1, the WCAG bar for graphics.
 *
 * It exists because of a class of bug no stylesheet check can see: an icon
 * registered as raw SVG markup with no fill anywhere paints in SVG's
 * default black.  Nothing in the CSSOM or the DOM mentions a colour, so
 * only the rendered result shows a black glyph on a dark button.  Reading
 * computed styles is the one place both the ink and the surface are known.
 *
 * The audit reads computed styles only, changes nothing, and skips the
 * designer canvas exactly as the theme does.  Run it from a themed frame's
 * console (CAPD.audit(), CAPD.audit({ limit: 20 })); the standalone bundle
 * exposes it the same way.  UMD-style so the pure helpers and the walk
 * itself are unit-tested under node with a mock document.
 */
(function (root, factory) {
  'use strict';
  const ns = (root.CAPD = root.CAPD || {});
  const color = ns.color || (typeof require === 'function' ? require('./10-color.js') : null);
  const api = factory(color, ns);
  if (typeof module === 'object' && module.exports) module.exports = api;
  ns.audit = api.audit;
  ns.inspect = api.inspect;
  ns.auditUtil = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (color, CAPD) {
  'use strict';

  /* Computed colours are serialised as rgb()/rgba(); anything else (color(),
     oklch(), keywords) is reported as unknown rather than guessed. */
  const RGB_RE = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;
  function parseComputed(s) {
    if (typeof s !== 'string') return null;
    const m = RGB_RE.exec(s.trim());
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  /** Source-over compositing of `fg` onto an opaque `bg`. */
  function over(fg, bg) {
    const a = fg.a === undefined ? 1 : fg.a;
    if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }

  /** Composite `layers` (top first) onto the opaque `base`. */
  function composite(layers, base) {
    let out = base;
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return out;
  }

  /** WCAG 2.1 text threshold: 3:1 for large text, else 4.5:1 (7:1 at AAA). */
  function textThreshold(fontSizePx, fontWeight, level) {
    const w = typeof fontWeight === 'string' ? (fontWeight === 'bold' || fontWeight === 'bolder' ? 700 : parseInt(fontWeight, 10) || 400) : fontWeight || 400;
    const large = fontSizePx >= 24 || (w >= 700 && fontSizePx >= 18.66);
    if (large) return 3;
    return level === 'AAA' ? 7 : 4.5;
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'HTML', 'BR', 'WBR', 'OPTION', 'OPTGROUP', 'DATALIST', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO']);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line,text,tspan,use';
  /* Shapes inside these are not painted where they stand. */
  const NOT_PAINTED = 'defs,mask,clipPath,pattern,symbol,marker,linearGradient,radialGradient,filter';
  const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'number', 'password', '']);

  /**
   * @param {object} [options]
   *   root     Document to audit (default: document)
   *   limit    maximum number of issue groups returned (default 40)
   *   minText  contrast bar for normal text (default 4.5; large text is 3)
   *   minIcon  contrast bar for SVG shapes (default 3)
   *   exclude  selector for subtrees to skip (default: the canvas limit)
   *   getComputedStyle  override for tests
   */
  function audit(options) {
    const o = options || {};
    const doc = o.root || (typeof document !== 'undefined' ? document : null);
    if (!doc) return { error: 'no document' };
    const win = doc.defaultView || root;
    const getCS = o.getComputedStyle || ((el) => win.getComputedStyle(el));
    const exclude = o.exclude !== undefined ? o.exclude : ((CAPD && CAPD.CANVAS_LIMIT_SELECTOR) || '');
    const minText = o.minText || 4.5;
    const minIcon = o.minIcon || 3;
    const limit = o.limit || 40;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const csCache = new Map();
    const cs = (el) => { let v = csCache.get(el); if (!v) { v = getCS(el); csCache.set(el, v); } return v; };
    const parentOf = (el) => el.parentElement || (el.parentNode && el.parentNode.host) || null;

    const opacityCache = new Map();
    function opacityChain(el) {
      if (!el) return 1;
      if (opacityCache.has(el)) return opacityCache.get(el);
      const own = parseFloat(cs(el).opacity);
      const v = (Number.isNaN(own) ? 1 : own) * opacityChain(parentOf(el));
      opacityCache.set(el, v);
      return v;
    }

    let base = parseComputed(cs(doc.documentElement).backgroundColor);
    if (!base || base.a < 1) {
      const body = doc.body && parseComputed(cs(doc.body).backgroundColor);
      base = base && base.a > 0 ? over(base, body && body.a >= 1 ? body : { r: 255, g: 255, b: 255, a: 1 }) : (body && body.a >= 1 ? body : { r: 255, g: 255, b: 255, a: 1 });
    }

    /* Surface behind an element: its ancestors' background colours, bottom-up
       until an opaque one.  A gradient contributes its colour stops (text
       must read on each of them); an image makes the result uncertain,
       which the report says. */
    const STOP_RE = /rgba?\([^)]*\)/g;
    const backdropCache = new Map();
    function backdropOf(el) {
      if (!el) return { color: base, stops: null, uncertain: false };
      if (backdropCache.has(el)) return backdropCache.get(el);
      const st = cs(el);
      const bg = parseComputed(st.backgroundColor);
      const bi = st.backgroundImage && st.backgroundImage !== 'none' ? st.backgroundImage : '';
      const hasUrl = /url\(/.test(bi);
      let result;
      if (bg && bg.a >= 1) result = { color: bg, stops: null, uncertain: false };
      else {
        const up = backdropOf(parentOf(el));
        const tint = bg && bg.a > 0 ? bg : null;
        result = {
          color: tint ? over(tint, up.color) : up.color,
          stops: up.stops && tint ? up.stops.map((s) => over(tint, s)) : up.stops,
          uncertain: up.uncertain,
        };
      }
      if (hasUrl) result = { ...result, uncertain: true };
      else if (bi) {
        const stops = (bi.match(STOP_RE) || []).map(parseComputed).filter(Boolean);
        if (stops.length) result = { ...result, stops: stops.map((s) => over(s, result.color)) };
        else result = { ...result, uncertain: true };
      }
      backdropCache.set(el, result);
      return result;
    }

    /** The lowest contrast of `ink` over any of the backdrop's surfaces (colour, or each gradient stop). */
    function worstOn(ink, bd) {
      const surfaces = bd.stops && bd.stops.length ? bd.stops : [bd.color];
      let worst = null;
      for (const surface of surfaces) {
        const eff = over(ink, surface);
        const ratio = color.contrast(eff, surface);
        if (!worst || ratio < worst.ratio) worst = { ratio, eff, surface };
      }
      return worst;
    }

    const groups = new Map();
    let checked = 0;
    const unmeasured = { backgroundImages: 0, images: 0, unknownColors: 0 };

    function hintFor(el) {
      const parts = [];
      const id = el.getAttribute('id');
      if (id) parts.push('#' + id);
      for (const a of ['data-icon-name', 'aria-label', 'title', 'name', 'data-testid', 'role']) {
        const v = el.getAttribute(a);
        if (v) { parts.push(`[${a}="${v.slice(0, 40)}"]`); break; }
      }
      const cls = (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (cls.length) parts.push('.' + cls.join('.'));
      return parts.join('');
    }

    function report(kind, el, ink, surface, ratio, min, text, uncertain) {
      const hint = hintFor(el);
      const inkHex = color.toHex({ r: Math.round(ink.r), g: Math.round(ink.g), b: Math.round(ink.b) });
      const surfHex = color.toHex({ r: Math.round(surface.r), g: Math.round(surface.g), b: Math.round(surface.b) });
      const key = `${kind}|${el.tagName}|${hint}|${inkHex}|${surfHex}`;
      let g = groups.get(key);
      if (!g) { g = { kind, tag: el.tagName.toLowerCase(), hint, text: (text || '').trim().slice(0, 40), ink: inkHex, surface: surfHex, ratio: +ratio.toFixed(2), min, count: 0, uncertain: !!uncertain }; groups.set(key, g); }
      g.count++;
      if (ratio < g.ratio) g.ratio = +ratio.toFixed(2);
    }

    function visible(el, st) {
      if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.right <= 0 || r.bottom <= 0) return false; // screen-reader-only / off-canvas tricks
      return true;
    }

    function ownText(el) {
      const kids = el.childNodes;
      let s = '';
      for (let i = 0; i < kids.length; i++) if (kids[i].nodeType === 3) s += kids[i].nodeValue;
      return /\S/.test(s) ? s : '';
    }

    function inkOf(el, st) {
      const fill = parseComputed(st.webkitTextFillColor);
      if (fill) return fill;
      return parseComputed(st.color);
    }

    // Below this effective opacity an element is hidden on purpose (hover
    // affordances such as list row check circles), not badly coloured.
    const HIDDEN_OPACITY = 0.1;

    // Icon fonts (Fluent v8's <i data-icon-name>, Monaco's codicons) draw
    // glyphs from the Private Use Area: graphics, judged by the 3:1 bar.
    const PUA_ONLY = /^[\s\uE000-\uF8FF]+$/;

    function checkText(el, st, text, kind) {
      if (PUA_ONLY.test(text)) { kind = 'icon'; }
      const ink = inkOf(el, st);
      if (!ink) { unmeasured.unknownColors++; return; }
      if (ink.a === 0) return; // deliberately invisible text
      const op = opacityChain(el);
      if (op < HIDDEN_OPACITY) return;
      const bd = backdropOf(el);
      const w = worstOn({ ...ink, a: ink.a * op }, bd);
      const min = kind === 'icon' ? minIcon : Math.min(minText, textThreshold(parseFloat(st.fontSize) || 16, st.fontWeight)) === 3 ? 3 : minText;
      checked++;
      if (w.ratio < min) report(kind, el, w.eff, w.surface, w.ratio, min, text, bd.uncertain);
      else if (bd.uncertain) noteOverImage(el, text);
    }

    /* Text drawn over a background image cannot be measured: a light
       artwork behind light text looks fine to every colour check.  List it so
       a person can look. */
    const overImage = new Map();
    function noteOverImage(el, text) {
      let p = el, image = '';
      while (p && p.nodeType === 1) {
        const bi = cs(p).backgroundImage;
        if (bi && bi !== 'none' && /url\(/.test(bi)) { const m = /url\(["']?([^"')]*)/.exec(bi); image = m ? m[1].split(/[?#]/)[0].split('/').pop().slice(0, 60) : 'image'; break; }
        p = parentOf(p);
      }
      const key = hintFor(el) + '|' + image;
      const g = overImage.get(key);
      if (g) g.count++;
      else overImage.set(key, { tag: el.tagName.toLowerCase(), hint: hintFor(el), text: (text || '').trim().slice(0, 40), image, count: 1 });
    }

    /* The colour a shape paints with (fill, or stroke for lines and
       fill-less outlines), its alpha folded in; null when it paints nothing. */
    function paintOf(sh, st, op) {
      const tag = sh.tagName.toLowerCase();
      let ink = parseComputed(st.fill);
      let alpha = parseFloat(st.fillOpacity);
      if (!ink || ink.a === 0 || alpha === 0 || tag === 'line' || tag === 'polyline') {
        ink = parseComputed(st.stroke);
        alpha = parseFloat(st.strokeOpacity);
        if (!ink || ink.a === 0 || alpha === 0) { if (st.fill && st.fill !== 'none' && !parseComputed(st.fill)) unmeasured.unknownColors++; return null; }
      }
      const shapeOp = parseFloat(st.opacity);
      const a = ink.a * (Number.isNaN(alpha) ? 1 : alpha) * (Number.isNaN(shapeOp) ? 1 : shapeOp) * op;
      if (a < HIDDEN_OPACITY) return null; // hover markers and the like, shown on demand
      return { ...ink, a };
    }

    const edges = (r) => {
      const left = r.left !== undefined ? r.left : r.right - r.width;
      const top = r.top !== undefined ? r.top : r.bottom - r.height;
      return { left, top, right: left + r.width, bottom: top + r.height };
    };

    /* A <use> renders a copy of a symbol elsewhere in the document, which
       has no computed style of its own to read.  Approximate the copy's
       paint: the theme's adapted value when the inline processor marked the
       shape, else its fill / stroke attribute, else what it inherits from
       the <use>. */
    function useShapes(useEl, op) {
      const ref = (useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '').trim();
      if (ref[0] !== '#') return [];
      let target = null;
      try { target = doc.getElementById(ref.slice(1)); } catch (e) { target = null; }
      if (!target) return [];
      const ust = cs(useEl);
      const r = useEl.getBoundingClientRect();
      const out = [];
      const list = target.querySelectorAll ? [target, ...target.querySelectorAll(SHAPES)] : [target];
      for (const sh of list) {
        if (sh.tagName && sh.tagName.toLowerCase() === 'symbol') continue;
        const marks = (sh.getAttribute('data-capd-inline') || '').split(/\s+/);
        const pick = (prop) => {
          if (marks.includes(prop) && sh.style) { const v = color.parse(sh.style.getPropertyValue('--capd-i-' + prop).trim()); if (v && v.a > 0) return v; }
          const a = sh.getAttribute(prop);
          if (a && a !== 'none' && !/currentcolor|inherit/i.test(a)) { const c = color.parse(a); return c ? { r: c.r, g: c.g, b: c.b, a: c.a } : null; }
          if (a === 'none') return null;
          return parseComputed(prop === 'fill' ? ust.fill : ust.stroke);
        };
        // fill and stroke both count: a two-tone outline icon (white fill,
        // dark outline) becomes a dark fill under a light outline
        for (const ink of [pick('fill'), pick('stroke')]) {
          if (ink && ink.a * op >= HIDDEN_OPACITY) out.push({ paint: { ...ink, a: ink.a * op }, area: 0, box: edges(r), fromUse: true });
        }
      }
      return out;
    }

    function checkSvg(el) {
      const op = opacityChain(el);
      if (op < HIDDEN_OPACITY) return;
      const bd = backdropOf(parentOf(el) || el);
      const box = el.getBoundingClientRect();
      const boxArea = box.width * box.height;
      const shapes = [];
      const usePaints = []; // a <use> copy has no geometry to read: judged by its most visible paint
      const all = el.querySelectorAll(SHAPES);
      for (let i = 0; i < all.length; i++) {
        const sh = all[i];
        if (sh.tagName.toLowerCase() === 'use') { usePaints.push(...useShapes(sh, op)); continue; }
        if (sh.closest && sh.closest(NOT_PAINTED)) continue;
        const st = cs(sh);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        const r = sh.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) continue;
        // Chart furniture: gridlines, axis lines and tick marks are hairlines
        // that charts draw faint on purpose in every theme.  Only in drawings
        // of chart size; a small icon's strokes are its content.
        if (box.width >= 100 && box.height >= 100 && Math.min(r.width, r.height) <= 2) continue;
        const paint = paintOf(sh, st, op);
        if (paint) shapes.push({ paint, area: r.width * r.height, box: edges(r) });
      }
      // A shape covering most of the drawing is a plate (a badge's circle, a
      // chart's plot area): the shapes that sit on it are judged against it,
      // and the plate itself is a background, not ink.  A label beside a long
      // bar does not sit on the bar, so containment decides, not order.
      const isPlate = (sp) => boxArea && sp.area >= 0.6 * boxArea;
      const plates = shapes.filter(isPlate);
      let worst = null;
      for (const sp of shapes) {
        if (isPlate(sp)) continue;
        const cx = (sp.box.left + sp.box.right) / 2, cy = (sp.box.top + sp.box.bottom) / 2;
        const under = plates.filter((pl) => cx >= pl.box.left && cx <= pl.box.right && cy >= pl.box.top && cy <= pl.box.bottom);
        const onPlates = (s0) => under.reduce((acc, pl) => over(pl.paint, acc), s0);
        const w = worstOn(sp.paint, { color: onPlates(bd.color), stops: bd.stops ? bd.stops.map(onPlates) : null });
        checked++;
        if (!worst || w.ratio < worst.ratio) worst = w;
      }
      if (usePaints.length) {
        let best = null;
        for (const sp of usePaints) {
          const w = worstOn(sp.paint, bd);
          checked++;
          if (!best || w.ratio > best.ratio) best = w;
        }
        if (!worst || best.ratio < worst.ratio) worst = best;
      }
      if (worst && worst.ratio < minIcon) report('icon', el, worst.eff, worst.surface, worst.ratio, minIcon, el.getAttribute('aria-label') || '', bd.uncertain);
    }

    function walk(scope) {
      const all = scope.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el.shadowRoot) walk(el.shadowRoot);
        if (SKIP_TAGS.has(el.tagName)) continue;
        if (el.hasAttribute && el.hasAttribute(CAPD.STYLE_ATTR || 'data-capd-style')) continue;
        if (exclude && el.closest && el.closest(exclude)) continue;
        const isSvgRoot = el.namespaceURI === SVG_NS && el.tagName.toLowerCase() === 'svg' && !el.ownerSVGElement;
        if (el.namespaceURI === SVG_NS && !isSvgRoot) continue; // shapes are checked from their root
        const st = cs(el);
        if (!visible(el, st)) continue;
        if (isSvgRoot) { checkSvg(el); continue; }
        if (st.backgroundImage && st.backgroundImage !== 'none' && /url\(/.test(st.backgroundImage)) unmeasured.backgroundImages++;
        if (el.tagName === 'IMG') { unmeasured.images++; continue; }
        if ((el.tagName === 'INPUT' && TEXT_INPUTS.has((el.getAttribute('type') || '').toLowerCase())) || el.tagName === 'TEXTAREA') {
          if (el.value) checkText(el, st, el.value, 'input');
          continue;
        }
        const text = ownText(el);
        if (text) checkText(el, st, text, 'text');
      }
    }
    walk(doc);

    const issues = [...groups.values()].sort((a, b) => b.count - a.count || a.ratio - b.ratio);
    const textOverImages = [...overImage.values()].sort((a, b) => b.count - a.count).slice(0, limit);
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return { checked, issueGroups: issues.length, issues: issues.slice(0, limit), textOverImages, unmeasured, ms: Math.round(t1 - t0) };
  }

  /* ------------------------------------------------------------------ */
  /* inspect(): what an element is and which rules colour it (debugging) */
  /* ------------------------------------------------------------------ */
  const INSPECT_PROPS = ['color', 'fill', 'stroke', 'background-color', 'background-image', 'background', 'filter', 'mask', 'mask-image', '-webkit-mask', '-webkit-mask-image', 'opacity', 'fill-opacity', 'stroke-opacity'];
  const ATTR_ALLOW = ['id', 'role', 'aria-label', 'aria-hidden', 'aria-checked', 'aria-pressed', 'title', 'data-icon-name', 'data-testid', 'viewBox', 'fill', 'stroke', 'style', 'width', 'height', 'd'];
  const clip = (s, n) => (s == null ? s : String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

  function srcInfo(src) {
    if (!src) return null;
    if (/^data:/i.test(src)) {
      const comma = src.indexOf(',');
      const head = src.slice(0, comma);
      let body = src.slice(comma + 1);
      try { body = /;base64/i.test(head) ? atob(body) : decodeURIComponent(body); } catch (e) { /* keep raw */ }
      return clip(head + ',' + body, 500);
    }
    try { const u = new URL(src, location.href); return u.origin + u.pathname; } catch (e) { return clip(src, 120); }
  }

  function describe(el, getCS, sheets) {
    const st = getCS(el);
    const attrs = {};
    for (const a of ATTR_ALLOW) { const v = el.getAttribute(a); if (v != null) attrs[a] = clip(v, a === 'style' || a === 'd' ? 160 : 80); }
    const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    const r = el.getBoundingClientRect();
    const out = {
      tag: el.tagName.toLowerCase(), cls: clip(cls, 160), attrs,
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      css: {
        color: st.color, fill: st.fill, stroke: st.stroke, bg: st.backgroundColor,
        bgImage: clip(st.backgroundImage, 300), filter: st.filter, mask: clip(st.webkitMaskImage || st.maskImage, 200),
        opacity: st.opacity, display: st.display, content: st.content && st.content !== 'normal' ? clip(st.content, 40) : undefined,
      },
    };
    if (el.tagName === 'IMG' || el.tagName.toLowerCase() === 'image') out.src = srcInfo(el.getAttribute('src') || el.getAttribute('href'));
    if (el.tagName.toLowerCase() === 'svg') out.html = clip(el.outerHTML, 600);
    for (const pseudo of ['::before', '::after']) {
      const ps = getCS(el, pseudo);
      if (ps && ps.content && ps.content !== 'none' && ps.content !== 'normal') out[pseudo] = { content: clip(ps.content, 40), color: ps.color, bg: ps.backgroundColor, bgImage: clip(ps.backgroundImage, 300), mask: clip(ps.webkitMaskImage || ps.maskImage, 200), filter: ps.filter };
    }
    out.rules = matchedRules(el, sheets);
    return out;
  }

  function ownerLabel(sheet) {
    const n = sheet.ownerNode;
    if (!n) return 'constructed';
    const capd = n.getAttribute && n.getAttribute('data-capd-style');
    if (capd) return 'CAPD:' + capd;
    if (n.tagName === 'LINK') { try { return 'link:' + new URL(sheet.href).pathname.split('/').slice(-2).join('/'); } catch (e) { return 'link'; } }
    const marks = [...n.attributes].filter((a) => /^data-(merge|make|load|aphrodite|emotion)|^id$|^class$/.test(a.name)).map((a) => a.name + (a.value ? '=' + a.value.slice(0, 12) : ''));
    return 'style' + (marks.length ? '[' + marks.join(' ') + ']' : '');
  }

  function matchedRules(el, sheets) {
    const out = [];
    const visit = (rules, sheet, wrap) => {
      for (let i = 0; i < rules.length && out.length < 40; i++) {
        const r = rules[i];
        if (r.selectorText === undefined && r.cssRules) {
          const name = r.constructor ? r.constructor.name.replace(/^CSS|Rule$/g, '') : '';
          visit(r.cssRules, sheet, wrap + (name ? '@' + name + ' ' : ''));
          continue;
        }
        if (!r.selectorText || !r.style) continue;
        let hit = false;
        try { hit = el.matches(r.selectorText); } catch (e) { /* :scope etc. outside @scope */ try { hit = el.matches(r.selectorText.replace(/:scope/g, ':root')); } catch (e2) { hit = false; } }
        if (!hit) continue;
        const decls = [];
        for (const p of INSPECT_PROPS) {
          const v = r.style.getPropertyValue(p);
          if (v) decls.push(p + ':' + clip(v, 140) + (r.style.getPropertyPriority(p) ? '!' : ''));
        }
        if (decls.length) out.push(clip(ownerLabel(sheet) + ' ' + wrap + r.selectorText, 160) + ' { ' + decls.join('; ') + ' }');
      }
    };
    for (const sheet of sheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      visit(rules, sheet, '');
    }
    return out;
  }

  /**
   * Describe the elements at a point (frame CSS pixels) or matching a
   * selector, with the colour-bearing rules that apply to each.  Used through
   * the diagnostics bridge, which only answers when the user has switched on
   * "Developer diagnostics".
   */
  function inspect(options) {
    const o = options || {};
    const doc = o.root || document;
    const win = doc.defaultView;
    const getCS = (el, pseudo) => win.getComputedStyle(el, pseudo || null);
    const sheets = [...doc.styleSheets, ...(doc.adoptedStyleSheets || [])];
    let targets = [];
    if (o.selector) targets = [...doc.querySelectorAll(o.selector)].slice(0, o.max || 3);
    else if (typeof o.x === 'number') {
      const stack = doc.elementsFromPoint(o.x, o.y).slice(0, o.depth || 3);
      targets = stack;
      // the icon inside the topmost element, if any
      const top = stack[0];
      if (top && top.querySelectorAll) for (const d of top.querySelectorAll('svg,img,i,[class*="icon" i]')) { if (!targets.includes(d)) targets.push(d); if (targets.length >= 6) break; }
    }
    const result = targets.map((el) => describe(el, getCS, sheets));
    if (o.ancestors && targets[0]) {
      let p = targets[0].parentElement, n = 0;
      while (p && n++ < o.ancestors) { result.push({ ancestor: n, ...describe(p, getCS, sheets) }); p = p.parentElement; }
    }
    return result;
  }

  return { audit, inspect, parseComputed, over, composite, textThreshold };
});
