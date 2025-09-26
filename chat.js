/* ====== CONFIG ====== */
const CHATBOT_CONFIG = {
  webhookUrl: "https://n8n1.vbservices.org/webhook/c5796ce9-6a17-4181-b39c-20108ed3f122/chat",
  title: "Support Assistant",

  // Bubble iconen
  bubbleIconClosed: "./Assets/ChatImage.png",
  bubbleIconOpen:   "./Assets/dropDown.png",

  // Avatar in de chat header
  agentAvatar: "./Assets/ChatImage.png",

  headers: {},

  // Output parser
  parseReply: (data) => {
    if (!data) return "Er ging iets mis. Probeer opnieuw.";
    if (typeof data === "string") return data;
    if (data.output) return data.output;
    if (data.reply)  return data.reply;
    if (data.text)   return data.text;
    if (data.message)return data.message;
    try { return JSON.stringify(data); } catch { return String(data); }
  },

  identity: { site: location.hostname, path: location.pathname },

  // Watermark (optioneel)
  watermark: {
    image: "./Assets/plastic_molecules1.png",
    mode: "center",       // "center" of "tile"
    text: "",             // bv. "© Dimensio"
    opacity: 0.6
  },

  // Resize instellingen
  resize: {
    minW: 300, minH: 360,          // px
    maxWvw: 90, maxHvh: 85,        // % van viewport
    remember: true,                // maat onthouden in localStorage
    storageKey: "cb_size"          // prefix voor opslag
  },
};
/* ===================== */

(function(){
  const qs = (s,p=document)=>p.querySelector(s);
  const elWin    = qs('#cbWindow');
  const elBody   = qs('#cbBody');
  const elForm   = qs('#cbForm');
  const elInput  = qs('#cbInput');
  const elToggle = qs('#cbToggle');
  const elClose  = qs('#cbClose');
  const elAvatar = qs('#cbAvatar');
  const elIconClosed = qs('.cb-icon-closed', elToggle);
  const elIconOpen   = qs('.cb-icon-open',   elToggle);

  /* ---------- helpers ---------- */
  const bust = (url)=> url ? url + ((url.includes('?')?'&':'?') + 'v=' + Date.now()) : url;
  function preload(src){ if(!src) return; const i=new Image(); i.src=bust(src); }
  function setBubbleIcons(closedSrc, openSrc){
    if (closedSrc) elIconClosed.src = bust(closedSrc);
    if (openSrc)   elIconOpen.src   = bust(openSrc);
  }
  function setAvatar(src){
    if (!src) { elAvatar.style.display='none'; return; }
    elAvatar.src = bust(src);
    elAvatar.referrerPolicy = "no-referrer";
  }

  /* ---------- Markdown renderer ---------- */
  function escapeHTML(s){ return s.replace(/[&<>"]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
  function parseBlocks(md){
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let buf = []; let inCode = false;

    const flushParagraph = () => {
      const text = buf.join('\n').trim();
      buf = []; if (!text) return;
      blocks.push({ type:'p', text });
    };

    for(let i=0;i<lines.length;i++){
      const line = lines[i];

      const fence = line.match(/^```(\w+)?\s*$/);
      if (fence){
        if (!inCode){ flushParagraph(); inCode = true; blocks.push({ type:'code_open', lang: fence[1]||'' }); }
        else { inCode = false; blocks.push({ type:'code_close' }); }
        continue;
      }
      if (inCode){ blocks.push({ type:'code_line', text: line }); continue; }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h){ flushParagraph(); blocks.push({ type:'h', level: h[1].length, text: h[2] }); continue; }

      const ul = line.match(/^\s*-\s+(.*)$/);
      if (ul){
        flushParagraph();
        const items = [ul[1]];
        while (i+1<lines.length && /^\s*-\s+/.test(lines[i+1])) items.push(lines[++i].replace(/^\s*-\s+/, ''));
        blocks.push({ type:'ul', items }); continue;
      }

      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol){
        flushParagraph();
        const items = [ol[1]];
        while (i+1<lines.length && /^\s*\d+\.\s+/.test(lines[i+1])) items.push(lines[++i].replace(/^\s*\d+\.\s+/, ''));
        blocks.push({ type:'ol', items }); continue;
      }

      if (/^\s*$/.test(line)) flushParagraph(); else buf.push(line);
    }
    flushParagraph();
    return blocks;
  }
  function renderInline(text){
    let s = escapeHTML(text);
    s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,(m,alt,url)=> `<img src="${url}" alt="${alt}" class="cb-img">`);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(m,txt,url)=> `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
    s = s.replace(/`([^`]+)`/g,(m,code)=> `<code>${code}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g,(m,txt)=> `<strong>${txt}</strong>`);
    s = s.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g,(m,prefix,txt)=> `${prefix}<em>${txt}</em>`);
    s = s.replace(/(https?:\/\/[^\s<]+?\.(?:png|jpe?g|gif|webp|svg))(?![^<]*>)/gi,(url)=> `<img src="${url}" alt="" class="cb-img">`);
    s = s.replace(/(https?:\/\/[^\s<]+)(?![^<]*>)/g,(url)=> `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    return s;
  }
  function renderMarkdown(md){
    const blocks = parseBlocks(md);
    const out = []; let inCode = false; let codeBuf = [];
    for (const b of blocks){
      if (b.type==='code_open'){ inCode=true; codeBuf=[]; continue; }
      if (b.type==='code_close'){ const codeText = escapeHTML(codeBuf.join('\n')); out.push(`<pre><code>${codeText}</code></pre>`); inCode=false; codeBuf=[]; continue; }
      if (b.type==='code_line'){ codeBuf.push(b.text); continue; }
      if (b.type==='h'){ const lvl = Math.min(3, Math.max(1, b.level)); out.push(`<h${lvl}>${renderInline(b.text)}</h${lvl}>`); continue; }
      if (b.type==='ul'){ out.push(`<ul>${b.items.map(t=> `<li>${renderInline(t)}</li>`).join('')}</ul>`); continue; }
      if (b.type==='ol'){ out.push(`<ol>${b.items.map(t=> `<li>${renderInline(t)}</li>`).join('')}</ol>`); continue; }
      if (b.type==='p'){ out.push(`<p>${renderInline(b.text)}</p>`); continue; }
    }
    return out.join('');
  }

  function addMsg(role, htmlOrText, asTyping=false, isHTML=false){
    const m = document.createElement('div');
    m.className = `cb-msg ${role}`;
    if (asTyping) {
      m.innerHTML = `<span class="cb-typing"><span class="cb-dot"></span><span class="cb-dot"></span><span class="cb-dot"></span></span>`;
    } else {
      if (isHTML) {
        m.innerHTML = htmlOrText;
        m.querySelectorAll('img').forEach(img=> img.addEventListener('load', ()=>{ elBody.scrollTop = elBody.scrollHeight; }, {once:true}));
      } else {
        m.textContent = htmlOrText;
      }
    }
    elBody.appendChild(m);
    elBody.scrollTop = elBody.scrollHeight;
    return m;
  }

  async function sendMessage(text){
    addMsg('user', text);
    const typing = addMsg('bot', '', true);

    const payload = { chatInput: text, sessionId, metadata: CHATBOT_CONFIG.identity };

    try {
      const res = await fetch(CHATBOT_CONFIG.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...CHATBOT_CONFIG.headers },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let data; try { data = JSON.parse(raw); } catch { data = raw; }
      const reply = CHATBOT_CONFIG.parseReply(data);
      typing.innerHTML = renderMarkdown(reply);

      typing.querySelectorAll('img').forEach(img=> img.addEventListener('load', ()=>{ elBody.scrollTop = elBody.scrollHeight; }, {once:true}));

    } catch (e) {
      console.error(e);
      typing.textContent = "Sorry, er ging iets mis. Probeer het later opnieuw.";
    }
  }

  function setOpen(open){
    elWin.classList[open ? 'add' : 'remove']('cb-open');
    elToggle.classList[open ? 'add' : 'remove']('is-open');
    elToggle.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(()=> elInput.focus(), 50);
  }

  /* ---------- Watermark (laag onder bubbles) ---------- */
  function initWatermark() {
    const wm = CHATBOT_CONFIG.watermark || {};
    if (!wm.image && !wm.text) return;

    const layer = document.createElement('div');
    layer.className = 'cb-watermark';
    if (typeof wm.opacity === 'number') layer.style.opacity = String(wm.opacity);

    if (wm.image) {
      const url = bust(wm.image);
      if ((wm.mode||'center') === 'tile') {
        layer.classList.add('tiled');
        layer.style.backgroundImage = `url("${url}")`;
      } else {
        const img = document.createElement('img');
        img.src = url; img.alt = "";
        layer.appendChild(img);
      }
    }
    if (wm.text) {
      const t = document.createElement('div');
      t.className = 'cb-watermark-text';
      t.textContent = wm.text;
      layer.appendChild(t);
    }
    elBody.appendChild(layer);
  }

  /* ---------- Resize (linksboven) ---------- */
  function initResize(){
    const grip = document.createElement('div');
    grip.className = 'cb-resize';
    elWin.appendChild(grip);

    const cfg = CHATBOT_CONFIG.resize || {};
    const key = (k)=> `${cfg.storageKey || 'cb_size'}_${k}`;

    if (cfg.remember) {
      const w = +localStorage.getItem(key('w'));
      const h = +localStorage.getItem(key('h'));
      if (w > 0 && h > 0) {
        elWin.style.width = `${w}px`;
        elWin.style.height = `${h}px`;
      }
    }

    const getBounds = ()=>{
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const maxW = Math.min(vw * (cfg.maxWvw||90)/100, 760);
      const maxH = Math.min(vh * (cfg.maxHvh||85)/100, 900);
      const minW = cfg.minW || 300;
      const minH = cfg.minH || 360;
      return {vw, vh, maxW, maxH, minW, minH};
    };

    let startW=0, startH=0, startX=0, startY=0, resizing=false;

    const onDown = (x,y)=>{
      const r = elWin.getBoundingClientRect();
      startW = r.width; startH = r.height; startX = x; startY = y;
      resizing = true;
      document.body.style.cursor = 'nw-resize';
      document.body.style.userSelect = 'none';
    };
    const onMove = (x,y)=>{
      if (!resizing) return;
      const {maxW,maxH,minW,minH} = getBounds();
      let deltaX = x - startX;
      let deltaY = y - startY;
      let newW = Math.min(Math.max(startW - deltaX, minW), maxW);
      let newH = Math.min(Math.max(startH - deltaY, minH), maxH);
      elWin.style.width = `${Math.round(newW)}px`;
      elWin.style.height = `${Math.round(newH)}px`;
    };
    const onUp = ()=>{
      if (!resizing) return;
      resizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (cfg.remember) {
        const r = elWin.getBoundingClientRect();
        localStorage.setItem(key('w'), String(Math.round(r.width)));
        localStorage.setItem(key('h'), String(Math.round(r.height)));
      }
    };

    grip.addEventListener('mousedown', e=>{
      e.preventDefault(); e.stopPropagation();
      onDown(e.clientX, e.clientY);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp, { once:true });
    });
    const onMouseMove = (e)=> onMove(e.clientX, e.clientY);
    const onMouseUp   = ()=> { onUp(); window.removeEventListener('mousemove', onMouseMove); };

    grip.addEventListener('touchstart', e=>{
      const t = e.touches[0]; if (!t) return;
      e.preventDefault(); e.stopPropagation();
      onDown(t.clientX, t.clientY);
    }, {passive:false});
    window.addEventListener('touchmove', e=>{
      if (!resizing) return;
      const t = e.touches[0]; if (!t) return;
      onMove(t.clientX, t.clientY);
    }, {passive:false});
    window.addEventListener('touchend', onUp);

    grip.addEventListener('dblclick', ()=>{
      elWin.style.width  = '';
      elWin.style.height = '';
      if (cfg.remember) {
        localStorage.removeItem(key('w'));
        localStorage.removeItem(key('h'));
      }
    });
  }

  /* ---------- init visuals ---------- */
  setBubbleIcons(CHATBOT_CONFIG.bubbleIconClosed, CHATBOT_CONFIG.bubbleIconOpen);
  preload(CHATBOT_CONFIG.bubbleIconClosed); preload(CHATBOT_CONFIG.bubbleIconOpen);
  setAvatar(CHATBOT_CONFIG.agentAvatar);
  if (CHATBOT_CONFIG.title) qs('#cbTitle').textContent = CHATBOT_CONFIG.title;

  // Watermark + Resize init
  initWatermark();
  initResize();

  /* ---------- session ---------- */
  const SESSION_KEY = 'cb_session_id';
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  /* ---------- events ---------- */
  function setOpen(open){
    elWin.classList[open ? 'add' : 'remove']('cb-open');
    elToggle.classList[open ? 'add' : 'remove']('is-open');
    elToggle.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(()=> elInput.focus(), 50);
  }

  elToggle.addEventListener('click', ()=> setOpen(!elWin.classList.contains('cb-open')));
  elClose.addEventListener('click', ()=> setOpen(false));
  elClose.addEventListener('keydown', (e)=> { if (e.key==='Enter'||e.key===' ') setOpen(false); });

  elForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = (elInput.value || '').trim();
    if (!text) return;
    elInput.value = '';
    sendMessage(text);
  });

  // Welkomstbericht (markdown)
  addMsg('bot', renderMarkdown("Hoi! Waar kan ik je mee helpen?\n\n- Productvragen\n- Bestellingen\n- Levering & retour"), false, true);
})();