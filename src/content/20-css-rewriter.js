/*
 * Dark Mode for Power Platform — CSSOM rewriter.
 *
 * Walks a stylesheet's rules and produces an override stylesheet containing
 * only the colour-bearing declarations, each mapped to its dark counterpart.
 * Custom properties that hold colours are re-emitted as typed variants
 * (--capd-bg-*, --capd-fg-*, --capd-bd-*, --capd-sh-*) and every var()
 * reference inside a colour property is retargeted to the variant that fits
 * the property's role.  Fluent UI v9 design tokens are excluded here because
 * the static token layer redefines them with Fluent's own dark values.
 *
 * UMD-style so it is testable under node with a mock CSSOM.
 */
(function (root, factory) {
  'use strict';
  const ns = (root.CAPD = root.CAPD || {});
  const color = ns.color || (typeof require === 'function' ? require('./10-color.js') : null);
  const api = factory(color, ns.PROP_KIND);
  if (typeof module === 'object' && module.exports) module.exports = api;
  ns.rewriter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (color, PROP_KIND_IN) {
  'use strict';

  const PROP_KIND = PROP_KIND_IN || {
    'color': 'fg', 'caret-color': 'fg', 'text-decoration-color': 'fg', 'text-emphasis-color': 'fg',
    '-webkit-text-fill-color': 'fg', '-webkit-text-stroke-color': 'fg', 'fill': 'fg', 'stroke': 'fg',
    'lighting-color': 'fg', 'flood-color': 'fg', 'stop-color': 'fg', 'accent-color': 'fg',
    'background-color': 'bg', 'background': 'bg', 'background-image': 'bg',
    'border-color': 'bd', 'border-top-color': 'bd', 'border-right-color': 'bd', 'border-bottom-color': 'bd', 'border-left-color': 'bd',
    'border-block-start-color': 'bd', 'border-block-end-color': 'bd', 'border-inline-start-color': 'bd', 'border-inline-end-color': 'bd',
    'border': 'bd', 'border-top': 'bd', 'border-right': 'bd', 'border-bottom': 'bd', 'border-left': 'bd',
    'outline-color': 'bd', 'outline': 'bd', 'column-rule-color': 'bd', 'column-rule': 'bd',
    'border-image': 'bd', 'border-image-source': 'bd',
    'box-shadow': 'sh', 'text-shadow': 'sh', 'filter': 'sh',
    'scrollbar-color': 'bg',
  };

  const KINDS = ['bg', 'fg', 'bd', 'sh'];

  /**
   * Colour-bearing shorthands, each with one colour longhand it sets.  When
   * a shorthand's value contains var(), the browser cannot split it at parse
   * time: every longhand reports an empty "pending substitution" value and
   * only the shorthand itself, read by name, returns the declared text.
   * Iterating a declaration block yields longhands only, so without this
   * list `background: var(--x)` or `border: 1px solid var(--y)` would never
   * be rewritten (React Flow's controls in the Power Automate designer were
   * white on white because of exactly that).
   */
  const VAR_SHORTHANDS = [
    ['background', 'background-color', 'bg'],
    ['border', 'border-top-color', 'bd'],
    ['border-color', 'border-top-color', 'bd'],
    ['border-top', 'border-top-color', 'bd'],
    ['border-right', 'border-right-color', 'bd'],
    ['border-bottom', 'border-bottom-color', 'bd'],
    ['border-left', 'border-left-color', 'bd'],
    ['border-block', 'border-block-start-color', 'bd'],
    ['border-block-start', 'border-block-start-color', 'bd'],
    ['border-block-end', 'border-block-end-color', 'bd'],
    ['border-block-color', 'border-block-start-color', 'bd'],
    ['border-inline', 'border-inline-start-color', 'bd'],
    ['border-inline-start', 'border-inline-start-color', 'bd'],
    ['border-inline-end', 'border-inline-end-color', 'bd'],
    ['border-inline-color', 'border-inline-start-color', 'bd'],
    ['outline', 'outline-color', 'bd'],
    ['column-rule', 'column-rule-color', 'bd'],
    ['text-decoration', 'text-decoration-color', 'fg'],
    ['text-emphasis', 'text-emphasis-color', 'fg'],
    ['-webkit-text-stroke', '-webkit-text-stroke-color', 'fg'],
    // SharePoint's list rows draw their dividers as a border-image gradient
    ['border-image', 'border-image-source', 'bd'],
  ];
  /*
   * For a border-like shorthand only its colour is the theme's business.
   * Re-emitting the whole shorthand (as an !important override, later in the
   * document) also re-asserts its width and style over the page's own later
   * rules: SharePoint's command-bar buttons are Fluent buttons whose reset
   * style says `border: var(--strokeWidthThin) solid var(--colorNeutralStroke1)`
   * and whose atomic classes then set every border width to 0, so the copy
   * drew a box around each of them.  So these are rewritten into their colour
   * longhand alone.  `background` is not on this list: a var() there may hold
   * an image or a gradient, which background-color cannot take.
   */
  const COLOR_LONGHAND = {
    'border': 'border-color', 'border-top': 'border-top-color', 'border-right': 'border-right-color',
    'border-bottom': 'border-bottom-color', 'border-left': 'border-left-color',
    'border-block': 'border-block-color', 'border-block-start': 'border-block-start-color', 'border-block-end': 'border-block-end-color',
    'border-inline': 'border-inline-color', 'border-inline-start': 'border-inline-start-color', 'border-inline-end': 'border-inline-end-color',
    'outline': 'outline-color', 'column-rule': 'column-rule-color',
    'text-decoration': 'text-decoration-color', 'text-emphasis': 'text-emphasis-color', '-webkit-text-stroke': '-webkit-text-stroke-color',
  };
  const NOT_COLOR_WORD_RE = /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset|auto|thin|medium|thick|underline|overline|line-through|blink|wavy|filled|open|dot|circle|double-circle|triangle|sesame|from-font|inherit|initial|unset|revert|revert-layer)$/i;
  const SIZE_VAR_RE = /width|thick|thin|size|style|radius|offset|spacing|weight/i;
  const COLORISH_NAME_RE = /colou?r|background|foreground|border|fill|stroke|shadow|accent|brand|theme|highlight|outline|\bbg\b|\bfg\b|tint|shade|overlay|surface|ink|paper/i;
  const BORDER_SIDES = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
  const TRANSPARENT_RE = /^(transparent|rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\))$/i;
  const VAR_RE = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/;

  /** Top-level space-separated tokens of a CSS value (spaces inside parentheses don't split). */
  function topLevelTokens(value) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of value) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && /\s/.test(ch)) { if (cur) out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  /**
   * The colour token of a border-like shorthand: null when it has none,
   * undefined when that cannot be told.  A value that is one var() alone is
   * the latter: the variable may hold the whole border (SharePoint's grid
   * shell: `border: var(--sp-grid-outer-shell-border, 1px solid ...)`).
   */
  function colorToken(value) {
    const found = [];
    const tokens = topLevelTokens(value);
    if (tokens.length === 1 && tokens[0].startsWith('var(')) return undefined;
    for (const tok of tokens) {
      if (NOT_COLOR_WORD_RE.test(tok) || /^[-+.\d]/.test(tok) || /^(calc|min|max|clamp)\(/i.test(tok)) continue;
      if (tok.startsWith('var(')) {
        const name = (VAR_RE.exec(tok) || [])[1] || '';
        if (SIZE_VAR_RE.test(name) && !/colou?r/i.test(name)) continue; // --strokeWidthThin
        found.push(tok);
      } else if (/^currentcolor$/i.test(tok) || color.containsColor(tok)) found.push(tok);
    }
    return found.length === 1 ? found[0] : found.length ? undefined : null;
  }

  /** `prop: value` pairs of a declaration block's text (semicolons inside parentheses or quotes don't split). */
  function splitDeclarations(text) {
    const out = [];
    let depth = 0, quote = '', cur = '';
    const flush = () => {
      const i = cur.indexOf(':');
      if (i > 0) out.push([cur.slice(0, i).trim().toLowerCase(), cur.slice(i + 1).trim()]);
      cur = '';
    };
    for (const ch of String(text || '')) {
      if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ';' && depth === 0) { flush(); continue; }
      cur += ch;
    }
    flush();
    return out;
  }

  /**
   * A recoloured copy of an @keyframes rule, or '' when it holds no colour
   * to change.  An animation outranks every normal declaration, so a colour
   * it sets survives the overrides: SharePoint fades its selected-items
   * command bar in to `background-color: var(--ms-semanticColors-listBackground)`
   * with fill-mode both, and the bar stayed white.  The copy keeps every
   * declaration, colour or not, because the last @keyframes of a name
   * replaces the earlier ones whole; the overrides come after the page's
   * sheets, so the copy is the one that runs.
   */
  function rewriteKeyframes(rule, ctx) {
    const frames = rule.cssRules || [];
    let changed = false;
    const parts = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const decls = splitDeclarations(frame.style && frame.style.cssText).map(([prop, value]) => {
        const kind = PROP_KIND[prop];
        const rewritten = kind && color.rewriteValue(kind, value, ctx.opts, (expr, k) => rewriteVar(expr, k, ctx));
        if (rewritten && rewritten !== value) { changed = true; return `${prop}:${rewritten}`; }
        return `${prop}:${value}`;
      });
      parts.push(`${frame.keyText}{${decls.join(';')}}`);
    }
    if (!changed) return '';
    const name = /^-?[A-Za-z_][\w-]*$/.test(rule.name) ? rule.name : JSON.stringify(String(rule.name));
    return `@keyframes ${name}{${parts.join('')}}`;
  }

  function typedName(kind, varName) {
    return `--capd-${kind}-${varName.slice(2)}`;
  }

  /**
   * Rewrite a single var() expression for the given role.  Nested fallbacks
   * are handled recursively; excluded (Fluent token) names are left alone.
   *
   * The typed variant exists only where the page gave the variable a colour.
   * Where it gave it something else, the page's own value has to come next,
   * before the fallback: SharePoint sets --sp-cmd-barWrapper-border-bottom
   * to `none`, and skipping straight to the fallback (`1px solid ...`) drew
   * a border the page had switched off.
   */
  function rewriteVar(expr, kind, ctx) {
    const m = VAR_RE.exec(expr);
    if (!m) return expr;
    const name = m[1];
    if (ctx.isExcludedVar && ctx.isExcludedVar(name, kind)) return expr;
    let fallback = m[2];
    if (fallback !== undefined) {
      const fb = color.rewriteValue(kind, fallback, ctx.opts, (v, k) => rewriteVar(v, k, ctx));
      if (fb) fallback = fb;
      return `var(${typedName(kind, name)}, var(${name}, ${fallback}))`;
    }
    return `var(${typedName(kind, name)}, var(${name}))`;
  }

  function valueLooksColorish(name, value) {
    if (color.containsColor(value)) return true;
    if (value.includes('var(') && COLORISH_NAME_RE.test(name)) return true;
    return false;
  }

  /**
   * Produce the override declarations for one CSSStyleDeclaration-like
   * object.  Returns [prop, value, important, pageImportant] tuples.
   *
   * Every override is !important (it has to beat the page's own rules), so
   * the page's own !important no longer outranks its normal declarations
   * inside the override layer.  Declarations the page marks !important are
   * therefore flagged (pageImportant) and re-asserted even when their value
   * needs no change (transparent, inherit...): rewriteRules emits them with
   * a specificity boost so they keep winning, as they do in the page.
   * Studio cancels a Fluent button's white background with its own
   * `background-color: transparent !important`; without this the dark copy
   * of the white won and every property label sat on a grey chip.
   */
  function rewriteDeclarations(style, ctx) {
    const out = [];
    const seen = new Set();
    const n = style.length;
    for (let i = 0; i < n; i++) {
      const prop = style[i];
      if (!prop) continue;
      seen.add(prop);
      const value = style.getPropertyValue(prop);
      if (!value) continue;
      if (prop.startsWith('--')) {
        if (ctx.isExcludedVar && ctx.isExcludedVar(prop)) continue;
        const v = value.trim();
        if (!valueLooksColorish(prop, v)) continue;
        for (const kind of KINDS) {
          const rewritten = color.rewriteValue(kind, v, ctx.opts, (expr, k) => rewriteVar(expr, k, ctx)) || v;
          out.push([typedName(kind, prop), rewritten, false]);
        }
        continue;
      }
      const kind = PROP_KIND[prop];
      if (!kind) continue;
      const pageImportant = style.getPropertyPriority(prop) === 'important';
      const rewritten = color.rewriteValue(kind, value, ctx.opts, (expr, k) => rewriteVar(expr, k, ctx));
      if (rewritten && rewritten !== value) out.push([prop, rewritten, true, pageImportant]);
      else if (pageImportant) out.push([prop, value, true, true]);
    }
    // Shorthands declared with var(): their longhands read as empty above.
    for (const [shorthand, longhand, kind] of VAR_SHORTHANDS) {
      if (seen.has(shorthand)) continue;              // already handled (only mock CSSOMs list shorthands)
      if (style.getPropertyValue(longhand)) continue; // longhand has a real value: handled above
      const value = style.getPropertyValue(shorthand);
      if (!value || value.indexOf('var(') === -1) continue;
      const pageImportant = style.getPropertyPriority(shorthand) === 'important';
      const colorProp = COLOR_LONGHAND[shorthand];
      const tok = colorProp ? colorToken(value) : undefined;
      if (tok === null) continue; // no colour in it (`border: var(--w) solid`): nothing to recolour
      const [prop, text] = tok ? [colorProp, tok] : [shorthand, value]; // ambiguous: the whole shorthand, as before
      const rewritten = color.rewriteValue(kind, text, ctx.opts, (expr, k) => rewriteVar(expr, k, ctx));
      if (rewritten && rewritten !== text) out.push([prop, rewritten, true, pageImportant]);
      else if (pageImportant) out.push([prop, text, true, true]);
    }
    // The Neon style draws an edge and a halo on bordered controls.  A rule
    // that makes all four borders transparent says this element has none
    // (Fluent buttons restyled as menu items and toggles, such as the
    // solution explorer's sidebar), so it marks the element and the glow
    // leaves it alone.  The marks are registered as non-inheriting, so a
    // borderless container does not switch off the controls inside it.
    if (ctx.opts && ctx.opts.look === 'neon' && BORDER_SIDES.every((p) => TRANSPARENT_RE.test(style.getPropertyValue(p).trim()))) {
      out.push(['--capd-edge', 'transparent', false], ['--capd-halo', 'none', false]);
    }
    return out;
  }

  /**
   * Split a selector list on top-level commas (ignoring commas inside
   * parentheses, brackets and strings).
   */
  function splitSelectorList(text) {
    const out = [];
    let depth = 0, quote = null, start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
    }
    out.push(text.slice(start));
    return out;
  }

  const ROOT_COMPOUND_RE = /^(\s*)(html|:root)(?=$|[\s>+~.:#[])/i;

  /**
   * Inside `@scope (:root) to (...)` every selector is matched relative to
   * the scoping root, so a selector that starts with `html` or `:root` can
   * never match (the root is not its own descendant).  Rewrite that leading
   * compound to `:scope`, which does match the root.
   */
  function scopeSelector(selectorText) {
    if (!/html|:root/i.test(selectorText)) return selectorText;
    return splitSelectorList(selectorText).map((sel) => sel.replace(ROOT_COMPOUND_RE, '$1:scope')).join(',');
  }

  /* Three ID-level :not()s outrank any normal page selector in practice,
     while keeping the relative order among the page's own !important rules. */
  const IMPORTANT_BOOST = ':not(#capd-i):not(#capd-i):not(#capd-i)';
  const PSEUDO_ELEMENT_RE = /((?:::?(?:before|after|first-line|first-letter)|::[\w-]+(?:\([^)]*\))?)+)\s*$/i;

  /** The selector with the boost added to each compound that is matched (before any pseudo-element). */
  function boostSelector(selectorText) {
    return splitSelectorList(selectorText).map((sel) => {
      const m = PSEUDO_ELEMENT_RE.exec(sel);
      if (!m) return sel.replace(/\s*$/, '') + IMPORTANT_BOOST;
      return sel.slice(0, m.index).replace(/\s*$/, '') + IMPORTANT_BOOST + m[1];
    }).join(',');
  }

  function serializeDecls(decls) {
    return decls.map(([p, v, imp]) => `${p}:${v}${imp ? ' !important' : ''};`).join('');
  }

  /**
   * Recursively rewrite a list of CSS rules.  Returns the override CSS text
   * (possibly empty).  `ctx.onForeign(url, media)` is invoked for @import
   * targets whose rules cannot be read (cross-origin).
   */
  function rewriteRules(rules, ctx, depth, hops, conds) {
    depth = depth || 0;
    conds = conds || [];
    hops = (hops || 0) + 1;
    if (depth > 12 || hops > 40) return '';
    const parts = [];
    const len = rules.length;
    for (let i = 0; i < len; i++) {
      const rule = rules[i];
      const type = rule.type; // CSSRule.STYLE_RULE === 1 etc.
      try {
        if (type === 1 /* STYLE_RULE */) {
          const decls = rewriteDeclarations(rule.style, ctx);
          let inner = '';
          if (rule.cssRules && rule.cssRules.length) inner = rewriteRules(rule.cssRules, ctx, depth + 1);
          // (nested rules carry relative selectors and keep depth + 1)
          if (decls.length || inner) {
            const selector = ctx.scoped && depth === 0 ? scopeSelector(rule.selectorText) : rule.selectorText;
            const normal = decls.filter((d) => !d[3]);
            const important = decls.filter((d) => d[3]);
            if (normal.length || inner) parts.push(`${selector}{${serializeDecls(normal)}${inner}}`);
            if (important.length) parts.push(`${boostSelector(selector)}{${serializeDecls(important)}}`);
          }
        } else if (type === 4 /* MEDIA_RULE */) {
          const cond = `@media ${rule.conditionText || rule.media.mediaText}`;
          const inner = rewriteRules(rule.cssRules, ctx, depth, hops, conds.concat(cond));
          if (inner) parts.push(`${cond}{${inner}}`);
        } else if (type === 12 /* SUPPORTS_RULE */) {
          const cond = `@supports ${rule.conditionText}`;
          const inner = rewriteRules(rule.cssRules, ctx, depth, hops, conds.concat(cond));
          if (inner) parts.push(`${cond}{${inner}}`);
        } else if (type === 7 /* KEYFRAMES_RULE */) {
          const kf = rewriteKeyframes(rule, ctx);
          // @keyframes is not allowed inside @scope: when the output will be
          // scoped, hand it out separately (with its @media / @supports).
          if (kf && ctx.keyframes) ctx.keyframes.push(conds.reduceRight((text, cond) => `${cond}{${text}}`, kf));
          else if (kf) parts.push(kf);
        } else if (type === 3 /* IMPORT_RULE */) {
          const sheet = rule.styleSheet;
          let inner = null;
          if (sheet) {
            const mt = rule.media && rule.media.mediaText;
            try { inner = rewriteRules(sheet.cssRules, ctx, depth, hops, mt ? conds.concat(`@media ${mt}`) : conds); }
            catch (e) { if (ctx.onForeign) ctx.onForeign(rule.href, rule.media && rule.media.mediaText); }
          }
          if (inner) {
            const mt = rule.media && rule.media.mediaText;
            parts.push(mt ? `@media ${mt}{${inner}}` : inner);
          }
        } else if (type === 0 && rule.cssRules && (rule.constructor && /Container|Layer|Scope|StartingStyle/.test(rule.constructor.name))) {
          // @container keeps its condition; @layer / @scope / @starting-style are flattened.
          const name = rule.constructor.name;
          const cond = name === 'CSSContainerRule' ? `@container ${rule.conditionText}` : null;
          const inner = rewriteRules(rule.cssRules, ctx, depth, hops, cond ? conds.concat(cond) : conds);
          if (inner) {
            if (name === 'CSSContainerRule') parts.push(`@container ${rule.conditionText}{${inner}}`);
            else parts.push(inner);
          }
        } else if (type === 0 && rule.style && !rule.selectorText) {
          // CSSNestedDeclarations: bare declarations inside a nested parent.
          const decls = rewriteDeclarations(rule.style, ctx);
          if (decls.length) parts.push(serializeDecls(decls));
        }
        // font-face (5), page (6), namespace (10), counter-style (11),
        // font-feature-values (14), property (0) etc. are intentionally ignored.
      } catch (e) {
        if (ctx.onError) ctx.onError(e, rule);
      }
    }
    return parts.join('');
  }

  /**
   * Rewrite a whole stylesheet.  Throws if the sheet's rules are not
   * readable (cross-origin) — callers fetch the text and retry with a
   * constructed CSSStyleSheet.
   */
  function rewriteSheet(sheet, ctx) {
    const rules = sheet.cssRules; // may throw SecurityError
    return rewriteRules(rules, ctx, 0);
  }

  /**
   * Wrap override CSS so it never reaches the designer canvas.  Keyframes
   * collected by rewriteRules (ctx.keyframes) follow the scope, outside it.
   */
  function scoped(css, limitSelector, keyframes) {
    const after = keyframes && keyframes.length ? keyframes.join('') : '';
    if (!css) return after;
    if (!limitSelector) return css + after;
    return `@scope (:root) to (${limitSelector}){${css}}${after}`;
  }

  return { PROP_KIND, KINDS, VAR_SHORTHANDS, colorToken, splitDeclarations, rewriteKeyframes, boostSelector, typedName, rewriteVar, rewriteDeclarations, rewriteRules, rewriteSheet, serializeDecls, scoped, scopeSelector, splitSelectorList };
});
