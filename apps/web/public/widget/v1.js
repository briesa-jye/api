/*!
 * Briesa widget v1
 * Drop-in assessment form for a web page. No dependencies. Renders in a shadow root so the page's CSS cannot break it and it cannot break the page.
 *
 *   <script src="https://YOUR-SITE/widget/v1.js" async
 *     data-briesa-key="pk_live_..." data-briesa-api="https://YOUR-API"
 *     data-briesa-config='{"pack":"...","scenario":"..."}'></script>
 *
 * Use a PUBLISHABLE key (pk_...). Never put a secret key (bk_...) in a page. Decision support only: every result shows the pack's
 * maturity, the human review notice and the disclaimer, and the config cannot turn those off.
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";
  var JURISDICTIONS = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
  var ACRONYMS = /\b(cdd|aml|ctf|pep|peps|smr|ttr|whs|pcbu|kyc|ml|tf)\b/gi;
  var DEFAULT_ACCENT = "#5170ff";
  var RADIUS = { none: "0px", sm: "6px", md: "10px", lg: "16px" };

  // ---------------------------------------------------------------- pure helpers (also exported for tests)

  function str(v, max, fallback) {
    return typeof v === "string" && v.length > 0 ? v.slice(0, max) : (fallback === undefined ? "" : fallback);
  }
  function bool(v, fallback) { return typeof v === "boolean" ? v : fallback; }
  function words(s) { return String(s).replace(/[_-]/g, " ").replace(ACRONYMS, function (m) { return m.toUpperCase(); }); }
  function sentence(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function isHexColour(s) { return typeof s === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s); }

  /** Turns whatever the page supplied into a safe, complete config. Unknown keys are dropped; lengths and values are clamped. */
  function sanitizeConfig(raw) {
    var c = raw && typeof raw === "object" ? raw : {};
    var theme = c.theme && typeof c.theme === "object" ? c.theme : {};
    var copy = c.copy && typeof c.copy === "object" ? c.copy : {};
    var result = c.result && typeof c.result === "object" ? c.result : {};
    var questions = {};
    if (c.questions && typeof c.questions === "object") {
      Object.keys(c.questions).slice(0, 100).forEach(function (path) {
        if (!/^[A-Za-z0-9_.-]{1,100}$/.test(path) || path === "__proto__" || path === "constructor" || path === "prototype") return;
        var q = c.questions[path];
        if (!q || typeof q !== "object") return;
        questions[path] = { show: bool(q.show, true), label: str(q.label, 120), help: str(q.help, 300), value: typeof q.value === "string" ? q.value.slice(0, 200) : "" };
      });
    }
    var juris = Array.isArray(c.jurisdictions) ? c.jurisdictions.filter(function (j) { return JURISDICTIONS.indexOf(j) >= 0; }) : [];
    return {
      pack: str(c.pack, 100), scenario: str(c.scenario, 100),
      jurisdictions: juris.filter(function (j, i) { return juris.indexOf(j) === i; }),
      questions: questions,
      theme: {
        accent: isHexColour(theme.accent) ? theme.accent : DEFAULT_ACCENT,
        mode: theme.mode === "light" || theme.mode === "dark" ? theme.mode : "auto",
        radius: RADIUS[theme.radius] ? theme.radius : "md",
      },
      copy: { title: str(copy.title, 120), intro: str(copy.intro, 400), submit: str(copy.submit, 40, "Check"), brand: bool(copy.brand, true), schemaHelp: bool(copy.schemaHelp, false) },
      result: { actions: bool(result.actions, true), reasons: bool(result.reasons, true) },
    };
  }

  /** Flattens a pack's JSON Schema into form fields. Nested objects become dot paths; required-ness is inherited from the parent. */
  function flattenSchema(schema, prefix, parentRequired) {
    prefix = prefix || "";
    parentRequired = parentRequired !== false;
    var out = [];
    var req = {};
    ((schema && schema.required) || []).forEach(function (k) { req[k] = true; });
    var props = (schema && schema.properties) || {};
    Object.keys(props).forEach(function (key) {
      var prop = props[key];
      var path = prefix ? prefix + "." + key : key;
      var required = parentRequired && !!req[key];
      if (prop.type === "object") { out = out.concat(flattenSchema(prop, path, required)); return; }
      var f = { path: path, label: sentence(words(key)), required: required, description: typeof prop.description === "string" ? prop.description : "", group: prefix };
      if (prop.type === "array" && prop.items && Array.isArray(prop.items.enum)) { f.kind = "multi"; f.options = prop.items.enum.map(String); }
      else if (Array.isArray(prop.enum)) { f.kind = "enum"; f.options = prop.enum.map(String); }
      else if (prop.type === "boolean") f.kind = "boolean";
      else if (prop.type === "integer" || prop.type === "number") { f.kind = prop.type; f.min = prop.minimum; }
      else f.kind = "string";
      out.push(f);
    });
    return out;
  }

  function setPath(obj, path, value) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!Object.prototype.hasOwnProperty.call(cur, parts[i]) || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  /** Form strings to the nested inputs object the API expects. Empty answers are left out so optional questions stay absent. */
  function buildInputs(fields, values) {
    var out = {};
    fields.forEach(function (f) {
      var raw = values[f.path];
      if (raw === undefined || raw === "") return;
      if (f.kind === "boolean") setPath(out, f.path, raw === "true");
      else if (f.kind === "multi") setPath(out, f.path, String(raw).split(",").filter(Boolean));
      else if (f.kind === "integer" || f.kind === "number") { var n = Number(raw); setPath(out, f.path, isFinite(n) ? n : raw); }
      else setPath(out, f.path, raw);
    });
    return out;
  }

  /** Fields the visitor sees, in order. A question is hidden only when the page owner switched it off. */
  function visibleFields(fields, cfg) {
    return fields.filter(function (f) { var q = cfg.questions[f.path]; return !q || q.show !== false; });
  }

  /** The answers for hidden questions, taken from the config. */
  function hiddenValues(fields, cfg) {
    var v = {};
    fields.forEach(function (f) { var q = cfg.questions[f.path]; if (q && q.show === false && q.value) v[f.path] = q.value; });
    return v;
  }

  /** Required questions that are neither shown nor given a value in the config: the widget cannot work until the page owner fixes that. */
  function unanswerableFields(fields, cfg) {
    return fields.filter(function (f) { var q = cfg.questions[f.path]; return f.required && q && q.show === false && !q.value; });
  }

  function jurisdictionChoices(pack, cfg) {
    var all = (pack.jurisdictions || []).indexOf("AU") >= 0 ? JURISDICTIONS.slice() : (pack.jurisdictions || []).filter(function (j) { return JURISDICTIONS.indexOf(j) >= 0; });
    var chosen = cfg.jurisdictions.length ? all.filter(function (j) { return cfg.jurisdictions.indexOf(j) >= 0; }) : all;
    return chosen.length ? chosen : all;
  }

  function newIdempotencyKey() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") return root.crypto.randomUUID();
    return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  /** Outcome colour follows rank on its own scale: lowest neutral, highest orange, between blue then aqua (same rule as the dashboard). */
  function outcomeColour(rank, of) {
    if (of <= 1 || rank <= 0) return "#8a8a8a";
    if (rank >= of - 1) return "#d95926";
    return rank === 1 ? "#3987e5" : "#199e70";
  }

  /** Only plain https links from a rule's source are made clickable. */
  function safeUrl(u) { return typeof u === "string" && /^https:\/\//i.test(u) ? u : null; }

  // ---------------------------------------------------------------- transport

  function ApiFailure(status, code, message, retryAfter) { this.status = status; this.code = code; this.message = message; this.retryAfter = retryAfter || null; }

  /** Talks to the API over HTTPS with a publishable key. A page can pass its own transport (the dashboard preview does). */
  function httpTransport(api, key) {
    var base = String(api || "").replace(/\/+$/, "");
    function call(method, path, body, extra) {
      var headers = { Authorization: "Bearer " + key };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (extra) Object.keys(extra).forEach(function (k) { headers[k] = extra[k]; });
      return root.fetch(base + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) }).then(
        function (res) {
          return res.json().catch(function () { return null; }).then(function (data) {
            if (res.ok) return data;
            var e = (data && data.error) || {};
            throw new ApiFailure(res.status, e.code || "http_" + res.status, e.message || "Request failed.", res.headers.get("retry-after"));
          });
        },
        function () { throw new ApiFailure(0, "network_error", "Could not reach " + (base || "the API") + "."); }
      );
    }
    return {
      getPack: function (id) { return call("GET", "/v1/packs/" + encodeURIComponent(id)); },
      assess: function (body) { return call("POST", "/v1/assess", body, { "Idempotency-Key": newIdempotencyKey() }); },
    };
  }

  /** What the visitor is told for each failure. The page owner gets the technical reason in the console. */
  function friendly(err) {
    var code = err && err.code;
    if (code === "monthly_cap_reached" || code === "rate_limited") return "This tool is busy right now. Please try again a little later.";
    if (code === "origin_not_allowed" || code === "origin_required" || code === "invalid_api_key" || code === "api_key_revoked" || code === "pack_not_found" || code === "subscription_required" || code === "not_available_to_publishable_keys")
      return "This tool is not available on this page.";
    if (code === "network_error") return "We could not reach the service. Check your connection and try again.";
    if (code === "invalid_body" || code === "invalid_inputs" || (err && err.status === 400)) return err.message || "Please check your answers and try again.";
    return "Something went wrong. Please try again.";
  }

  // ---------------------------------------------------------------- DOM

  function h(tag, attrs, children) {
    var el = root.document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === "string" ? root.document.createTextNode(c) : c); });
    return el;
  }

  var CSS = [
    ":host{all:initial;display:block;font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--fg)}",
    ".w,.w *{box-sizing:border-box}",
    ".w{--accent:var(--bw-accent);--radius:var(--bw-radius);font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:normal;word-spacing:normal;text-transform:none;text-indent:0;text-align:left;white-space:normal;font-style:normal;font-variant:normal;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:calc(var(--radius) * 1.4);padding:24px;max-width:640px}",
    ".w.light,.w.auto{--bg:#fff;--fg:#14141a;--muted:#5d5d68;--border:#dcdce3;--field:#f6f6f9;--soft:#eef0ff}",
    ".w.dark{--bg:#17171c;--fg:#f1f1f4;--muted:#a3a3b0;--border:#33333d;--field:#1f1f26;--soft:#22243a}",
    "@media (prefers-color-scheme:dark){.w.auto{--bg:#17171c;--fg:#f1f1f4;--muted:#a3a3b0;--border:#33333d;--field:#1f1f26;--soft:#22243a}}",
    "h2{margin:0 0 4px;font-size:1.25rem;line-height:1.3;font-weight:650}",
    "h3{margin:0 0 8px;font-size:.95rem;font-weight:650}",
    "p{margin:0}.muted{color:var(--muted)}.small{font-size:.8125rem}",
    ".q{margin:18px 0}.q>label,.q>fieldset>legend{display:block;font-weight:600;font-size:.9375rem;margin-bottom:6px;padding:0}",
    "fieldset{border:0;margin:0;padding:0;min-width:0}",
    ".help{margin-top:4px}",
    "input[type=text],input[type=number],select{width:100%;font:inherit;color:inherit;background:var(--field);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px}",
    "input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}",
    ".opts{display:flex;flex-wrap:wrap;gap:8px}",
    ".opt{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--field);border-radius:var(--radius);padding:8px 12px;cursor:pointer;font-size:.9375rem}",
    ".opt:has(input:checked){border-color:var(--accent);background:var(--soft)}",
    ".opt input{accent-color:var(--accent);margin:0}",
    ".err{color:#c0392b;font-size:.8125rem;margin-top:4px}",
    ".dark .err{color:#ff8a7a}@media (prefers-color-scheme:dark){.auto .err{color:#ff8a7a}}",
    "button.primary{font:inherit;font-weight:600;color:#fff;background:var(--accent);border:0;border-radius:var(--radius);padding:11px 20px;cursor:pointer}",
    "button.primary[disabled]{opacity:.6;cursor:default}",
    "button.link{font:inherit;background:none;border:0;color:var(--accent);cursor:pointer;text-decoration:underline;padding:0}",
    ".note{margin-top:14px}",
    ".banner{border:1px solid var(--border);background:var(--field);border-radius:var(--radius);padding:12px 14px;margin:12px 0;font-size:.9375rem}",
    ".banner.warn{border-color:#e0a200}",
    ".pill{display:inline-flex;align-items:center;gap:8px;font-weight:650;font-size:1.125rem}",
    ".dot{width:10px;height:10px;border-radius:50%;flex:none}",
    ".spec{display:flex;gap:4px;margin:12px 0}.spec>div{flex:1;min-width:0}.bar{height:6px;border-radius:99px;background:var(--border)}.lab{margin-top:4px;font-size:.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.on .lab{color:var(--fg);font-weight:600}",
    "ol.steps{margin:0;padding-left:1.25rem}ol.steps li{margin:6px 0}",
    ".sec{margin-top:20px;border-top:1px dashed var(--border);padding-top:16px}",
    "details{margin:10px 0}summary{cursor:pointer;font-weight:600;font-size:.9375rem}",
    ".rule{margin:10px 0 0;padding-left:12px;border-left:2px solid var(--border)}",
    "a{color:var(--accent)}",
    ".foot{margin-top:20px;display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:space-between;font-size:.75rem;color:var(--muted)}",
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  ].join("");

  // ---------------------------------------------------------------- the widget

  /**
   * Mounts a widget into `host` (an element). options: { key, api } for the real API, or { transport } to supply your own
   * (an object with getPack(id) and assess(body) returning promises), and quiet:true to keep console messages out. Returns { reset(), destroy() }.
   */
  function mount(host, rawConfig, options) {
    options = options || {};
    var cfg = sanitizeConfig(rawConfig);
    var transport = options.transport || httpTransport(options.api, options.key);
    // The page owner needs these messages in the console. A host that already shows them another way (the dashboard preview) can pass quiet.
    var logErr = function (m) { if (!options.quiet && root.console) root.console.error(m); };
    var shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.textContent = "";
    shadow.appendChild(h("style", { text: CSS }));
    var wrap = h("section", { class: "w " + cfg.theme.mode, "aria-label": cfg.copy.title || "Assessment" });
    wrap.style.setProperty("--bw-accent", cfg.theme.accent);
    wrap.style.setProperty("--bw-radius", RADIUS[cfg.theme.radius]);
    shadow.appendChild(wrap);

    var state = { pack: null, fields: [], visible: [], scenario: null, juris: [], destroyed: false };
    var emit = function (name, detail) {
      host.dispatchEvent(new root.CustomEvent("briesa:" + name, { detail: detail, bubbles: true, composed: true }));
    };
    var fail = function (err, where) {
      var hint = "";
      if (err && err.code === "origin_not_allowed") hint = " Add \"" + (root.location ? root.location.origin : "this site's origin") + "\" to the key's allowed sites in the Briesa dashboard.";
      else if (err && err.code === "network_error") hint = " Check data-briesa-api, that the API is reachable, and that this page's origin is in the key's allowed sites.";
      logErr("[briesa-widget] " + where + ": " + (err && err.code ? err.code + " - " : "") + (err && err.message ? err.message : err) + hint);
      emit("error", { code: err && err.code, status: err && err.status, message: err && err.message });
    };
    function render(nodes) { if (!state.destroyed) { wrap.textContent = ""; nodes.forEach(function (n) { if (n) wrap.appendChild(n); }); } }
    function message(text, tone) { render([h("div", { class: "banner" + (tone === "warn" ? " warn" : ""), role: "status", text: text })]); }

    function footer() {
      var p = state.pack;
      var bits = [];
      if (p) bits.push(h("span", { text: "Rules: " + p.name + " v" + p.version + " (" + p.status + ")" }));
      if (cfg.copy.brand) bits.push(h("span", { text: "Powered by Briesa" }));
      return h("div", { class: "foot" }, bits);
    }

    // ---------- loading the pack
    message("Loading...");
    if (!cfg.pack || !cfg.scenario) { message("This tool is not set up yet.", "warn"); logErr("[briesa-widget] config needs pack and scenario"); return { reset: function () {}, destroy: function () {} }; }
    transport.getPack(cfg.pack).then(function (pack) {
      var sc = pack.scenario_types && pack.scenario_types[cfg.scenario];
      if (!sc) throw new ApiFailure(404, "scenario_not_found", "The pack has no scenario '" + cfg.scenario + "'.");
      state.pack = pack; state.scenario = sc;
      state.fields = flattenSchema(sc.input_schema || {});
      state.visible = visibleFields(state.fields, cfg);
      state.juris = jurisdictionChoices(pack, cfg);
      var stuck = unanswerableFields(state.fields, cfg);
      if (stuck.length) {
        // The page owner hid a required question and gave no answer for it: say so for them in the console and show nothing broken to visitors.
        logErr("[briesa-widget] required questions are hidden with no value: " + stuck.map(function (f) { return f.path; }).join(", "));
        message("This tool is not available on this page.", "warn");
        emit("error", { code: "config_incomplete", message: "required questions hidden with no value" });
        return;
      }
      showForm();
      emit("ready", { pack: pack.id, version: pack.version, status: pack.status });
    }).catch(function (e) { message(friendly(e), "warn"); fail(e, "loading the pack"); });

    // ---------- the form
    var uid = "bw" + Math.random().toString(36).slice(2, 8);
    function field(f, idx) {
      var q = cfg.questions[f.path] || {};
      var label = q.label || f.label;
      // The pack's own field descriptions are written for developers, so visitors only see them if the page owner opts in.
      var help = q.help || (cfg.copy.schemaHelp ? f.description : "");
      var id = uid + "-" + idx;
      var name = f.path;
      var control;
      var labelEl;
      var wrapper = h("div", { class: "q", "data-path": f.path });
      var starred = f.required ? " *" : "";
      if (f.kind === "boolean" || (f.kind === "enum" && f.options.length <= 4)) {
        var opts = f.kind === "boolean" ? [["true", "Yes"], ["false", "No"]] : f.options.map(function (o) { return [o, sentence(words(o))]; });
        control = h("div", { class: "opts" }, opts.map(function (o, i) {
          return h("label", { class: "opt" }, [h("input", { type: "radio", name: id, value: o[0], required: f.required && i === 0 ? true : undefined }), h("span", { text: o[1] })]);
        }));
        labelEl = h("legend", { text: label + starred });
        wrapper.appendChild(h("fieldset", { "aria-describedby": help ? id + "-h" : undefined }, [labelEl, control]));
      } else if (f.kind === "multi") {
        control = h("div", { class: "opts" }, f.options.map(function (o) {
          return h("label", { class: "opt" }, [h("input", { type: "checkbox", name: id, value: o }), h("span", { text: sentence(words(o)) })]);
        }));
        wrapper.appendChild(h("fieldset", { "aria-describedby": help ? id + "-h" : undefined }, [h("legend", { text: label }), control]));
      } else if (f.kind === "enum") {
        var sel = h("select", { id: id, name: id }, [h("option", { value: "", text: "Choose..." })].concat(f.options.map(function (o) { return h("option", { value: o, text: sentence(words(o)) }); })));
        wrapper.appendChild(h("label", { for: id, text: label + starred }));
        wrapper.appendChild(sel);
      } else {
        wrapper.appendChild(h("label", { for: id, text: label + starred }));
        wrapper.appendChild(h("input", { id: id, name: id, type: f.kind === "string" ? "text" : "number", min: f.min, step: f.kind === "integer" ? "1" : "any", autocomplete: "off" }));
      }
      if (help) wrapper.appendChild(h("p", { id: id + "-h", class: "help muted small", text: help }));
      wrapper.appendChild(h("p", { class: "err", role: "alert", hidden: true }));
      return wrapper;
    }

    function readValue(f, wrapper) {
      if (f.kind === "boolean" || (f.kind === "enum" && f.options.length <= 4)) { var r = wrapper.querySelector("input:checked"); return r ? r.value : ""; }
      if (f.kind === "multi") return Array.prototype.map.call(wrapper.querySelectorAll("input:checked"), function (i) { return i.value; }).join(",");
      var el = wrapper.querySelector("input,select");
      return el ? el.value.trim() : "";
    }

    function showForm() {
      var form = h("form", { novalidate: true });
      var jurSelect = null;
      if (state.juris.length > 1) {
        var jw = h("div", { class: "q" });
        jurSelect = h("select", { id: uid + "-j", name: "jurisdiction" }, state.juris.map(function (j) { return h("option", { value: j, text: j }); }));
        jw.appendChild(h("label", { for: uid + "-j", text: "State or territory" }));
        jw.appendChild(jurSelect);
        form.appendChild(jw);
      }
      var wrappers = state.visible.map(function (f, i) { var w = field(f, i); form.appendChild(w); return w; });
      var submit = h("button", { class: "primary", type: "submit", text: cfg.copy.submit });
      form.appendChild(h("div", { class: "q" }, [submit]));
      form.appendChild(h("p", { class: "note muted small", text: "Please do not enter personal information. Your answers are assessed to give you a result, and the answers themselves are not stored." }));

      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var values = hiddenValues(state.fields, cfg);
        var bad = 0;
        state.visible.forEach(function (f, i) {
          var v = readValue(f, wrappers[i]);
          var err = wrappers[i].querySelector(".err");
          var missing = f.required && v === "";
          err.hidden = !missing;
          err.textContent = missing ? "Please answer this question." : "";
          if (missing) bad++;
          if (v !== "") values[f.path] = v;
        });
        if (bad) { var first = form.querySelector(".err:not([hidden])"); if (first && first.parentNode) { var focusable = first.parentNode.querySelector("input,select"); if (focusable) focusable.focus(); } return; }
        var body = { pack: state.pack.id, scenario_type: cfg.scenario, jurisdiction: jurSelect ? jurSelect.value : state.juris[0], inputs: buildInputs(state.fields, values) };
        submit.disabled = true; submit.textContent = "Checking...";
        form.setAttribute("aria-busy", "true");
        transport.assess(body).then(function (res) { showResult(res); emit("result", res); }).catch(function (e) {
          submit.disabled = false; submit.textContent = cfg.copy.submit; form.removeAttribute("aria-busy");
          var box = form.querySelector(".submit-err");
          if (!box) { box = h("p", { class: "err submit-err", role: "alert" }); form.appendChild(box); }
          box.textContent = friendly(e);
          fail(e, "assessing");
        });
      });

      render([
        cfg.copy.title ? h("h2", { text: cfg.copy.title }) : null,
        cfg.copy.intro ? h("p", { class: "muted", text: cfg.copy.intro }) : null,
        form,
        footer(),
      ]);
    }

    // ---------- the result
    function showResult(res) {
      var outcomes = state.scenario.outcomes || [res.outcome];
      var at = Math.max(0, outcomes.indexOf(res.outcome));
      var colour = outcomeColour(at, outcomes.length);
      var nodes = [];
      var heading = h("h2", { tabindex: "-1", text: "Result" });
      nodes.push(heading);
      nodes.push(h("div", { class: "pill" }, [h("span", { class: "dot", style: "background:" + colour }), h("span", { text: sentence(words(res.outcome)) })]));
      nodes.push(h("div", { class: "spec", role: "img", "aria-label": "Outcome " + words(res.outcome) + ", " + (at + 1) + " of " + outcomes.length }, outcomes.map(function (o, i) {
        return h("div", { class: i === at ? "on" : "" }, [h("div", { class: "bar", style: i === at ? "background:" + colour : "" }), h("div", { class: "lab", text: words(o) })]);
      })));
      if (res.escalation_recommended) nodes.push(h("div", { class: "banner warn", role: "note", text: "We recommend that a person reviews this." }));
      // Not switchable from the config: these tell the visitor how far to trust the result.
      var status = res.pack && res.pack.status;
      nodes.push(h("div", { class: "banner", role: "note", text: (res.human_review_recommended ? "Human review recommended" : "Reviewed by the pack's reviewer") + (status && status !== "verified" ? ": the rules behind this result are " + status + " and have not been fully verified." : ".") }));

      if (cfg.result.actions && res.required_actions && res.required_actions.length) {
        nodes.push(h("div", { class: "sec" }, [h("h3", { text: "What to do" }), h("ol", { class: "steps" }, res.required_actions.map(function (a) { return h("li", { text: a.description }); }))]));
      }
      if (res.missing_information && res.missing_information.length) {
        nodes.push(h("div", { class: "sec" }, [h("h3", { text: "More information needed" }), h("ul", { class: "steps" }, res.missing_information.map(function (m) { return h("li", { text: m.description }); }))]));
      }
      if (cfg.result.reasons && res.reasons && res.reasons.length) {
        var items = res.reasons.map(function (r) {
          var src = r.source || null;
          var url = src && safeUrl(src.url);
          var srcText = src ? src.instrument + (src.section ? ", " + src.section : "") : "";
          return h("div", { class: "rule" }, [
            h("p", { class: "small", text: r.title }),
            r.explanation ? h("p", { class: "muted small", text: r.explanation }) : null,
            src ? h("p", { class: "muted small" }, [root.document.createTextNode("Source: "), url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: srcText }) : root.document.createTextNode(srcText)]) : null,
          ]);
        });
        nodes.push(h("details", { class: "sec" }, [h("summary", { text: "Why this result (" + res.reasons.length + ")" })].concat(items)));
      }
      nodes.push(h("p", { class: "muted small sec", text: res.disclaimer || "Decision support only. A qualified person must review it." }));
      nodes.push(h("div", { class: "note" }, [h("button", { class: "link", type: "button", text: "Start again", onclick: function () { showForm(); emit("reset", {}); } })]));
      if (res.request_id) nodes.push(h("p", { class: "muted small", text: "Reference: " + res.request_id }));
      nodes.push(footer());
      render(nodes);
      heading.focus();
    }

    return {
      reset: function () { if (state.pack) showForm(); },
      destroy: function () { state.destroyed = true; shadow.textContent = ""; },
    };
  }

  // ---------------------------------------------------------------- auto-start from the <script> tag

  function autoStart(script) {
    if (!script || !script.getAttribute) return;
    var key = script.getAttribute("data-briesa-key");
    if (!key) return;
    var raw;
    try { raw = JSON.parse(script.getAttribute("data-briesa-config") || "{}"); }
    catch (e) { if (root.console) root.console.error("[briesa-widget] data-briesa-config is not valid JSON"); return; }
    if (/^bk_/.test(key)) { if (root.console) root.console.error("[briesa-widget] a SECRET key (bk_...) was supplied. Remove it from this page now and rotate it; use a publishable key (pk_...)."); return; }
    var api = script.getAttribute("data-briesa-api");
    var go = function () {
      var sel = script.getAttribute("data-briesa-target");
      var host = sel ? root.document.querySelector(sel) : null;
      if (!host) { host = root.document.createElement("div"); script.parentNode.insertBefore(host, script.nextSibling); }
      mount(host, raw, { key: key, api: api });
    };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", go); else go();
  }

  var api = { version: VERSION, mount: mount };
  if (!root.BriesaWidget) root.BriesaWidget = api;
  if (root.document && root.document.currentScript) autoStart(root.document.currentScript);

  if (typeof module === "object" && module && module.exports) {
    module.exports = {
      version: VERSION, mount: mount, sanitizeConfig: sanitizeConfig, flattenSchema: flattenSchema, buildInputs: buildInputs, visibleFields: visibleFields,
      hiddenValues: hiddenValues, unanswerableFields: unanswerableFields, jurisdictionChoices: jurisdictionChoices, outcomeColour: outcomeColour, friendly: friendly,
      safeUrl: safeUrl, httpTransport: httpTransport, words: words, ApiFailure: ApiFailure, autoStart: autoStart,
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
