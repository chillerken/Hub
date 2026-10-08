(() => {
  "use strict";

  if (window.__RECEPTION_AI_WIDGET_LOADED__) return;

  const script =
    document.currentScript ||
    Array.from(document.scripts).reverse().find((s) => /\/widget\.js(?:\?|$)/.test(s.src));

  if (!script) return;

  const token = String(
    script.dataset.widgetToken ||
    script.dataset.businessId ||
    script.dataset.token ||
    ""
  ).trim();

  if (!token) {
    console.warn("[Reception AI] data-widget-token ontbreekt.");
    return;
  }

  // Mark as initialized only after the required embed configuration is valid.
  window.__RECEPTION_AI_WIDGET_LOADED__ = true;

  const API_BASE = String(
    script.dataset.apiBase ||
    "https://ndecxbsrxspkuxjsbndq.supabase.co/functions/v1"
  ).replace(/\/$/, "");

  const CONFIG_URL = API_BASE + "/public-widget-config";
  const CHAT_URL = API_BASE + "/public-reception-chat";
  const CONTACT_URL = API_BASE + "/public-contact-capture";
  const position = script.dataset.position === "left" ? "left" : "right";
  const bottomRaw = String(script.dataset.bottom || "").trim();
  const bottomOffset = /^(?:\d{1,4}(?:\.\d+)?)(?:px|rem|vh|dvh|%)$/i.test(bottomRaw)
    ? bottomRaw
    : "";
  const launcherLabel = script.dataset.label || "Chat";
  const initialOpen = /^(1|true|yes)$/i.test(script.dataset.open || "");
  const privacyUrl = String(script.dataset.privacyUrl || "").trim();
  const showConsent = !/^(0|false|no)$/i.test(script.dataset.consent || "");
  const storageKey = "reception_ai:" + token;
  const campaignCode = String(script.dataset.campaign || new URLSearchParams(window.location.search).get("rai_campaign") || "").trim().slice(0,80);

  const currentHost = String(window.location.hostname || "")
    .toLowerCase()
    .replace(/^www\./, "");
  const shouldRemoveLuxWashLegacy = currentHost === "luxwash.online";
  const LUXWASH_RECEIPT_LINK_URL = API_BASE + "/public-receipt-link";

  // LuxWash-only, fail-open observer. It never changes the booking response:
  // it only links the public receipt returned by ChatGPT Sites to the
  // idempotency key already stored in the central CRM.
  function installLuxWashReceiptObserver() {
    if (!shouldRemoveLuxWashLegacy || window.__LUXWASH_RECEIPT_OBSERVER__) return;
    window.__LUXWASH_RECEIPT_OBSERVER__ = true;

    const originalFetch = window.fetch.bind(window);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    window.fetch = async function receptionAiObservedFetch(input, init) {
      let intakeKey = "";
      let observeBooking = false;

      try {
        const inputUrl =
          typeof input === "string" || input instanceof URL
            ? String(input)
            : input && typeof input.url === "string"
              ? input.url
              : "";
        const url = new URL(inputUrl, window.location.href);
        const method = String(
          init?.method ||
          (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
        ).toUpperCase();

        observeBooking =
          url.origin === window.location.origin &&
          url.pathname === "/api/core/request" &&
          method === "POST";

        if (observeBooking) {
          let rawBody = init?.body;
          if (
            rawBody == null &&
            typeof Request !== "undefined" &&
            input instanceof Request
          ) {
            rawBody = await input.clone().text();
          }
          if (typeof rawBody === "string") {
            const payload = JSON.parse(rawBody);
            intakeKey = String(payload?.idempotency_key || "").trim().toLowerCase();
          }
        }
      } catch {
        observeBooking = false;
      }

      const response = await originalFetch(input, init);

      if (observeBooking && uuidRe.test(intakeKey)) {
        try {
          const copy = response.clone();
          void copy.json().then((data) => {
            const publicReceiptId = String(data?.id || "").trim().toLowerCase();
            if (!copy.ok || !data?.ok || !data?.stored || !uuidRe.test(publicReceiptId)) return;

            void originalFetch(LUXWASH_RECEIPT_LINK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                widget_token: token,
                public_receipt_id: publicReceiptId,
                intake_key: intakeKey
              }),
              keepalive: true
            }).catch(() => {});
          }).catch(() => {});
        } catch {}
      }

      return response;
    };
  }

  installLuxWashReceiptObserver();

  function removeLuxWashLegacy() {
    if (!shouldRemoveLuxWashLegacy) return;
    document
      .querySelectorAll(".lux-chat,.lux-chat-launcher,.lux-chat-entry,#luxwash-new-chat-v5")
      .forEach((el) => el.remove());
  }

  // Compatibility shim for the current LuxWash Editorless bundle, which still
  // emits its legacy chatbot before Reception AI. Keep this host-scoped so
  // other Reception AI tenants are unaffected.
  removeLuxWashLegacy();
  if (shouldRemoveLuxWashLegacy) {
    const legacyObserver = new MutationObserver(removeLuxWashLegacy);
    legacyObserver.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => legacyObserver.disconnect(), 15000);
  }

  const host = document.createElement("div");
  host.id = "reception-ai-widget";
  host.setAttribute("data-reception-ai", "true");
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; }
    .rai-wrap {
      --rai-accent: #6d5dfc;
      --rai-bg: #ffffff;
      --rai-text: #111827;
      --rai-muted: #6b7280;
      --rai-border: rgba(17,24,39,.12);
      --rai-user: #f1f5f9;
      position: fixed;
      bottom: ${bottomOffset || "18px"};
      ${position}: 18px;
      z-index: 2147483000;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--rai-text);
      line-height: 1.4;
    }
    .rai-launcher {
      margin-left: auto;
      width: 62px;
      height: 62px;
      border: 0;
      border-radius: 999px;
      background: var(--rai-accent);
      color: white;
      display: grid;
      place-items: center;
      cursor: pointer;
      box-shadow: 0 14px 38px rgba(0,0,0,.24);
      font: 800 23px/1 system-ui, sans-serif;
      transition: transform .18s ease, box-shadow .18s ease;
    }
    .rai-launcher:hover { transform: translateY(-2px); box-shadow: 0 18px 44px rgba(0,0,0,.28); }
    .rai-launcher:focus-visible, button:focus-visible, textarea:focus-visible, input:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--rai-accent) 38%, white);
      outline-offset: 2px;
    }
    .rai-panel {
      width: min(390px, calc(100vw - 28px));
      height: min(620px, calc(100vh - 112px));
      min-height: 430px;
      margin-bottom: 12px;
      background: var(--rai-bg);
      border: 1px solid var(--rai-border);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 70px rgba(0,0,0,.28);
      display: none;
      grid-template-rows: auto 1fr auto;
    }
    .rai-panel[data-open="true"] { display: grid; }
    .rai-head {
      padding: 15px 16px;
      display: flex;
      align-items: center;
      gap: 11px;
      background: linear-gradient(135deg, var(--rai-accent), color-mix(in srgb, var(--rai-accent) 72%, black));
      color: white;
    }
    .rai-avatar {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      background: rgba(255,255,255,.16);
      display: grid;
      place-items: center;
      font-weight: 900;
      flex: 0 0 auto;
    }
    .rai-title { min-width: 0; flex: 1; }
    .rai-title strong { display: block; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rai-title span { display: block; margin-top: 2px; font-size: 12px; opacity: .86; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rai-close {
      width: 34px; height: 34px; border: 0; border-radius: 10px;
      background: rgba(255,255,255,.14); color: white; cursor: pointer; font-size: 21px;
    }
    .rai-body {
      min-height: 0;
      display: grid;
      grid-template-rows: 1fr auto;
      background: #f8fafc;
    }
    .rai-log {
      min-height: 0;
      overflow-y: auto;
      padding: 16px;
      background: #f8fafc;
      scroll-behavior: smooth;
    }
    .rai-row { display: flex; margin: 0 0 11px; }
    .rai-row.user { justify-content: flex-end; }
    .rai-bubble {
      max-width: 84%;
      padding: 10px 12px;
      border-radius: 15px;
      background: white;
      border: 1px solid var(--rai-border);
      font-size: 14px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      box-shadow: 0 3px 12px rgba(0,0,0,.04);
    }
    .rai-row.user .rai-bubble {
      background: var(--rai-accent);
      color: white;
      border-color: transparent;
      border-bottom-right-radius: 5px;
    }
    .rai-row.ai .rai-bubble { border-bottom-left-radius: 5px; }
    .rai-typing { color: var(--rai-muted); font-size: 12px; padding: 0 16px 8px; display: none; background: #f8fafc; }
    .rai-typing[data-show="true"] { display: block; }
    .rai-foot {
      padding: 11px 12px 12px;
      border-top: 1px solid var(--rai-border);
      background: white;
    }
    .rai-compose { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
    .rai-input {
      resize: none;
      min-height: 44px;
      max-height: 110px;
      width: 100%;
      border: 1px solid var(--rai-border);
      border-radius: 13px;
      padding: 11px 12px;
      font: 14px/1.35 inherit;
      color: var(--rai-text);
      background: white;
    }
    .rai-send {
      width: 44px; height: 44px; border: 0; border-radius: 13px;
      background: var(--rai-accent); color: white; cursor: pointer; font-size: 18px; font-weight: 900;
    }
    .rai-send:disabled, .rai-input:disabled { opacity: .55; cursor: not-allowed; }
    .rai-capture {
      display: none;
      margin: 0 0 10px;
      padding: 10px;
      border: 1px solid color-mix(in srgb, var(--rai-accent) 24%, var(--rai-border));
      border-radius: 14px;
      background: color-mix(in srgb, var(--rai-accent) 5%, white);
    }
    .rai-capture[data-show="true"] { display: block; }
    .rai-capture strong { display: block; font-size: 12px; margin-bottom: 3px; }
    .rai-capture-copy { margin: 0 0 8px; color: var(--rai-muted); font-size: 11px; }
    .rai-capture-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    .rai-capture-grid input {
      min-width: 0;
      width: 100%;
      border: 1px solid var(--rai-border);
      border-radius: 10px;
      padding: 9px 10px;
      font: 12px/1.2 inherit;
      color: var(--rai-text);
      background: white;
    }
    .rai-capture-grid .rai-capture-name { grid-column: 1 / -1; }
    .rai-capture-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .rai-capture-save {
      border: 0;
      border-radius: 10px;
      padding: 9px 11px;
      background: var(--rai-accent);
      color: white;
      cursor: pointer;
      font: 700 11px/1 inherit;
    }
    .rai-capture-save:disabled { opacity: .55; cursor: not-allowed; }
    .rai-capture-status { color: var(--rai-muted); font-size: 10.5px; }
    .rai-consent {
      margin-top: 8px;
      display: flex;
      gap: 7px;
      align-items: flex-start;
      color: var(--rai-muted);
      font-size: 10.5px;
    }
    .rai-consent input { margin: 2px 0 0; flex: 0 0 auto; }
    .rai-note {
      margin-top: 7px;
      color: var(--rai-muted);
      font-size: 10px;
      text-align: center;
    }
    .rai-note a { color: inherit; }
    .rai-error {
      margin: 10px 16px;
      padding: 10px 12px;
      border-radius: 12px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #9a3412;
      font-size: 12px;
    }
    @media (max-width: 520px) {
      .rai-wrap { bottom: ${bottomOffset || "10px"}; ${position}: 10px; }
      .rai-panel {
        width: calc(100vw - 20px);
        height: min(72vh, 640px);
        border-radius: 18px;
      }
      .rai-launcher { width: 58px; height: 58px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .rai-launcher, .rai-log { transition: none; scroll-behavior: auto; }
    }
  `;

  const wrap = document.createElement("div");
  wrap.className = "rai-wrap";
  wrap.innerHTML = `
    <section class="rai-panel" role="dialog" aria-label="AI receptionist" aria-modal="false">
      <header class="rai-head">
        <div class="rai-avatar" aria-hidden="true">AI</div>
        <div class="rai-title">
          <strong>AI Receptionist</strong>
          <span>Online assistent</span>
        </div>
        <button class="rai-close" type="button" aria-label="Chat sluiten">×</button>
      </header>
      <div class="rai-body">
        <div class="rai-log" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="rai-typing" aria-live="polite">Even geduld…</div>
      </div>
      <footer class="rai-foot">
        <div class="rai-capture">
          <strong>Persoonlijke opvolging</strong>
          <p class="rai-capture-copy">Vul uw contactgegevens in zodat deze aanvraag persoonlijk kan worden opgevolgd.</p>
          <div class="rai-capture-grid">
            <input class="rai-capture-name" type="text" maxlength="120" autocomplete="name" placeholder="Naam (optioneel)">
            <input class="rai-capture-email" type="email" maxlength="250" autocomplete="email" placeholder="E-mail">
            <input class="rai-capture-phone" type="tel" maxlength="40" autocomplete="tel" placeholder="Telefoon">
          </div>
          <label class="rai-consent"><input type="checkbox" class="rai-capture-consent"> <span>Ik geef toestemming om mij over deze aanvraag persoonlijk te contacteren.</span></label>
          <div class="rai-capture-actions">
            <button class="rai-capture-save" type="button">Gegevens opslaan</button>
            <span class="rai-capture-status"></span>
          </div>
        </div>
        <div class="rai-compose">
          <textarea class="rai-input" rows="1" maxlength="2000" placeholder="Typ uw vraag…" aria-label="Uw bericht"></textarea>
          <button class="rai-send" type="button" aria-label="Bericht versturen">➤</button>
        </div>
        ${showConsent ? '<label class="rai-consent"><input type="checkbox" class="rai-consent-box"> <span>Ik geef toestemming om mijn contactgegevens te gebruiken voor de opvolging van mijn aanvraag.</span></label>' : ""}
        <div class="rai-note">AI-assistent kan fouten maken.${privacyUrl ? ' <a target="_blank" rel="noopener noreferrer">Privacy</a>' : ""}</div>
      </footer>
    </section>
    <button class="rai-launcher" type="button" aria-label="${launcherLabel}" aria-expanded="false">💬</button>
  `;

  root.append(style, wrap);

  const panel = wrap.querySelector(".rai-panel");
  const launcher = wrap.querySelector(".rai-launcher");
  const closeBtn = wrap.querySelector(".rai-close");
  const title = wrap.querySelector(".rai-title strong");
  const subtitle = wrap.querySelector(".rai-title span");
  const log = wrap.querySelector(".rai-log");
  const typing = wrap.querySelector(".rai-typing");
  const input = wrap.querySelector(".rai-input");
  const send = wrap.querySelector(".rai-send");
  const consent = wrap.querySelector(".rai-consent-box");
  const capture = wrap.querySelector(".rai-capture");
  const captureCopy = wrap.querySelector(".rai-capture-copy");
  const captureName = wrap.querySelector(".rai-capture-name");
  const captureEmail = wrap.querySelector(".rai-capture-email");
  const capturePhone = wrap.querySelector(".rai-capture-phone");
  const captureConsent = wrap.querySelector(".rai-capture-consent");
  const captureSave = wrap.querySelector(".rai-capture-save");
  const captureStatus = wrap.querySelector(".rai-capture-status");
  const privacy = wrap.querySelector(".rai-note a");

  if (privacy && privacyUrl) privacy.href = privacyUrl;

  let configLoaded = false;
  let busy = false;
  let state = { lead_id: null, conversation_id: null };

  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
    if (saved && typeof saved === "object") {
      state.lead_id = saved.lead_id || null;
      state.conversation_id = saved.conversation_id || null;
    }
  } catch {}

  function persist() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
  }

  function addBubble(kind, text) {
    const row = document.createElement("div");
    row.className = "rai-row " + (kind === "user" ? "user" : "ai");
    const bubble = document.createElement("div");
    bubble.className = "rai-bubble";
    bubble.textContent = String(text || "");
    row.appendChild(bubble);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function showError(message) {
    const old = wrap.querySelector(".rai-error");
    if (old) old.remove();
    const el = document.createElement("div");
    el.className = "rai-error";
    el.textContent = message;
    log.prepend(el);
  }

  function showContactCapture(info, contact) {
    if (!info?.required) {
      capture.dataset.show = "false";
      return;
    }
    capture.dataset.show = "true";
    captureCopy.textContent = info.prompt || "Vul uw contactgegevens in zodat deze aanvraag persoonlijk kan worden opgevolgd.";
    if (contact?.name && !captureName.value) captureName.value = contact.name;
    if (contact?.email && !captureEmail.value) captureEmail.value = contact.email;
    if (contact?.phone && !capturePhone.value) capturePhone.value = contact.phone;
    if (consent?.checked) captureConsent.checked = true;
    captureStatus.textContent = "";
  }

  async function saveContactCapture() {
    if (!state.lead_id || !state.conversation_id || busy) return;
    captureSave.disabled = true;
    captureStatus.textContent = "Opslaan…";
    try {
      const response = await fetch(CONTACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          widget_token: token,
          lead_id: state.lead_id,
          conversation_id: state.conversation_id,
          name: captureName.value.trim(),
          email: captureEmail.value.trim(),
          phone: capturePhone.value.trim(),
          contact_consent: Boolean(captureConsent.checked)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error || "Contactgegevens konden niet worden opgeslagen.");
      if (consent) consent.checked = true;
      capture.dataset.show = "false";
      captureStatus.textContent = "";
      if (data.next_prompt) addBubble("ai", data.next_prompt);
    } catch (error) {
      captureStatus.textContent = error?.message || "Opslaan mislukt.";
    } finally {
      captureSave.disabled = false;
    }
  }

  async function loadConfig() {
    if (configLoaded) return true;
    try {
      const response = await fetch(CONFIG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget_token: token }),
        credentials: "omit"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error || "Widget niet beschikbaar");

      const accentOverride = script.dataset.accent;
      const accent = /^#[0-9a-f]{6}$/i.test(accentOverride || "")
        ? accentOverride
        : data.accent;

      if (/^#[0-9a-f]{6}$/i.test(accent || "")) {
        wrap.style.setProperty("--rai-accent", accent);
      }
      title.textContent = data.business_name || "AI Receptionist";
      subtitle.textContent = data.receptionist_name
        ? data.receptionist_name + " · AI-assistent"
        : "AI-assistent";

      if (!log.children.length) addBubble("ai", data.greeting || "Hallo! Waarmee kan ik helpen?");
      configLoaded = true;
      return true;
    } catch (error) {
      input.disabled = true;
      send.disabled = true;
      showError(error?.message || "De receptionist is tijdelijk niet beschikbaar.");
      return false;
    }
  }

  function setOpen(open) {
    panel.dataset.open = open ? "true" : "false";
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    launcher.style.display = open ? "none" : "grid";
    if (open) {
      loadConfig().then((ok) => { if (ok) setTimeout(() => input.focus(), 30); });
    }
  }

  async function sendMessage() {
    const message = input.value.trim();
    if (!message || busy) return;
    if (!configLoaded && !(await loadConfig())) return;

    addBubble("user", message);
    input.value = "";
    input.style.height = "auto";
    busy = true;
    send.disabled = true;
    typing.dataset.show = "true";

    try {
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          widget_token: token,
          message,
          contact_consent: Boolean(consent?.checked),
          marketing_consent: false,
          lead_id: state.lead_id,
          conversation_id: state.conversation_id,
          campaign_code: campaignCode || null
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) throw new Error(data?.error || "Bericht kon niet worden verstuurd.");

      state.lead_id = data.lead_id || state.lead_id;
      state.conversation_id = data.conversation_id || state.conversation_id;
      persist();

      if (data.business_name) title.textContent = data.business_name;
      if (data.receptionist_name) subtitle.textContent = data.receptionist_name + " · AI-assistent";
      addBubble("ai", data.reply || "Bedankt. Uw bericht is ontvangen.");
      showContactCapture(data.contact_capture, data.contact);
    } catch (error) {
      addBubble("ai", "Dat lukte even niet. Probeer het over enkele ogenblikken opnieuw.");
      console.error("[Reception AI]", error);
    } finally {
      busy = false;
      send.disabled = false;
      typing.dataset.show = "false";
      input.focus();
    }
  }

  launcher.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));
  send.addEventListener("click", sendMessage);
  captureSave.addEventListener("click", saveContactCapture);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  });

  window.ReceptionAI = Object.freeze({
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(panel.dataset.open !== "true"),
    reset: () => {
      state = { lead_id: null, conversation_id: null };
      try { sessionStorage.removeItem(storageKey); } catch {}
      log.textContent = "";
      capture.dataset.show = "false";
      captureName.value = "";
      captureEmail.value = "";
      capturePhone.value = "";
      captureConsent.checked = false;
      configLoaded = false;
      loadConfig();
    }
  });

  loadConfig();
  if (initialOpen) setOpen(true);
})();