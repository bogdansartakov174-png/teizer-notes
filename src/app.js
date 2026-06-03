// ── STATE ──
let notes = [];
let settings = { apiKey: '', fontSize: 15 };
let currentNoteId = null;
let currentCat = 'all';
let saveTimer = null;
let recognition = null;
let isListening = false;
let aiMessages = [];
let aiPanelOpen = true;

// ── T9 DICTIONARY ──
const T9_RU = ['привет','пожалуйста','спасибо','например','который','которая','которое','которые','сегодня','завтра','вчера','работа','задача','проект','идея','встреча','важно','срочно','готово','нужно','можно','должен','хочу','думаю','знаю','вижу','слышу','понимаю','делаю','сделать','написать','отправить','позвонить','встретиться','обсудить','проверить','добавить','удалить','изменить','создать'];
const T9_EN = ['hello','please','thank','example','which','today','tomorrow','yesterday','work','task','project','idea','meeting','important','urgent','done','need','can','should','want','think','know','see','hear','understand','doing','make','write','send','call','meet','discuss','check','add','remove','change','create','update','review'];

// ── INIT ──
async function init() {
  const data = await window.teizerAPI.getData();
  notes = data.notes || [];
  settings = { apiKey: '', fontSize: 15, ...data.settings };
  applySettings();
  refreshSidebar();
  if (notes.length > 0) openNote(notes[0].id);
  updateAIState();
}

function applySettings() {
  document.getElementById('editorArea').style.fontSize = settings.fontSize + 'px';
}

// ── NOTES ──
function openNewNoteDialog() {
  const title = prompt('Note title:') || 'Untitled';
  const cat = 'misc';
  const note = {
    id: 'n' + Date.now(),
    title,
    cat,
    content: '',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  notes.unshift(note);
  persistNotes();
  refreshSidebar();
  openNote(note.id);
}

function openNote(id) {
  currentNoteId = id;
  const note = getNoteById(id);
  if (!note) return;

  document.getElementById('emptyState').style.display = 'none';
  const ep = document.getElementById('editorPanel');
  ep.style.display = 'flex';

  document.getElementById('noteTitleInput').value = note.title;
  document.getElementById('noteCatSelect').value = note.cat;
  document.getElementById('editorArea').value = note.content;
  document.getElementById('lastSaved').textContent = 'Updated ' + new Date(note.updatedAt).toLocaleString('ru');
  renderTags(note.tags || []);
  updateStats(note.content);
  refreshSidebar();
  hideSaveIndicator();
}

function getNoteById(id) { return notes.find(n => n.id === id); }

function deleteNote() {
  if (!currentNoteId) return;
  if (!confirm('Delete this note?')) return;
  notes = notes.filter(n => n.id !== currentNoteId);
  persistNotes();
  currentNoteId = null;
  document.getElementById('editorPanel').style.display = 'none';
  document.getElementById('emptyState').style.display = 'flex';
  refreshSidebar();
}

function selectCat(cat) {
  currentCat = cat;
  document.querySelectorAll('.cat-item').forEach(el => el.classList.toggle('active', el.dataset.cat === cat));
  refreshSidebar();
}

function filterNotes() { refreshSidebar(); }

function refreshSidebar() {
  const counts = { all: 0, work: 0, ideas: 0, personal: 0, misc: 0 };
  notes.forEach(n => { counts.all++; counts[n.cat] = (counts[n.cat] || 0) + 1; });
  Object.keys(counts).forEach(c => {
    const el = document.getElementById('cnt-' + c);
    if (el) el.textContent = counts[c] || 0;
  });

  const search = document.getElementById('searchInput').value.toLowerCase();
  const filtered = notes.filter(n => {
    const matchCat = currentCat === 'all' || n.cat === currentCat;
    const matchSearch = !search || n.title.toLowerCase().includes(search) || n.content.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  const list = document.getElementById('notesList');
  list.innerHTML = filtered.length === 0
    ? `<div style="padding:20px 14px;text-align:center;color:var(--text3);font-size:12px">No notes found</div>`
    : filtered.map(n => {
        const active = n.id === currentNoteId ? ' active' : '';
        const preview = n.content.replace(/\n/g, ' ').slice(0, 50) || 'Empty note';
        const date = new Date(n.updatedAt).toLocaleDateString('ru', { day: '2-digit', month: 'short' });
        return `<div class="note-item${active}" onclick="openNote('${n.id}')">
          <div class="note-item-title">${esc(n.title) || 'Untitled'}</div>
          <div class="note-item-preview">${esc(preview)}</div>
          <div class="note-item-date">${date}</div>
        </div>`;
      }).join('');
}

// ── TAGS ──
function renderTags(tags) {
  const wrap = document.getElementById('tagsWrap');
  wrap.innerHTML = tags.map(t =>
    `<span class="tag-chip" onclick="removeTag('${esc(t)}')" title="Remove tag">${esc(t)} ✕</span>`
  ).join('');
}

function tagKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.replace(/[#,]/g, '').trim().toLowerCase();
    if (!val) return;
    const note = getNoteById(currentNoteId);
    if (!note) return;
    if (!note.tags) note.tags = [];
    if (!note.tags.includes(val)) note.tags.push(val);
    renderTags(note.tags);
    e.target.value = '';
    autoSave();
  }
}

function removeTag(tag) {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  note.tags = (note.tags || []).filter(t => t !== tag);
  renderTags(note.tags);
  autoSave();
}

// ── AUTOSAVE ──
function autoSave() {
  const note = getNoteById(currentNoteId);
  if (!note) return;
  note.title = document.getElementById('noteTitleInput').value || 'Untitled';
  note.cat = document.getElementById('noteCatSelect').value;
  note.content = document.getElementById('editorArea').value;
  note.updatedAt = Date.now();
  updateStats(note.content);
  setSaving();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistNotes();
    refreshSidebar();
    document.getElementById('lastSaved').textContent = 'Saved ' + new Date().toLocaleTimeString('ru');
    hideSaveIndicator();
  }, 600);
}

function setSaving() {
  document.getElementById('statusDot').classList.add('saving');
  document.getElementById('saveStatus').textContent = 'Saving…';
}
function hideSaveIndicator() {
  document.getElementById('statusDot').classList.remove('saving');
  document.getElementById('saveStatus').textContent = 'Saved';
}

async function persistNotes() {
  await window.teizerAPI.saveNotes(notes);
}

function updateStats(content) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = words + ' words';
  document.getElementById('charCount').textContent = content.length + ' chars';
}

// ── T9 / AUTOCOMPLETE ──
function onEditorInput() {
  autoSave();
  updateT9();
}

function updateT9() {
  const area = document.getElementById('editorArea');
  const val = area.value;
  const pos = area.selectionStart;
  const before = val.slice(0, pos);
  const words = before.split(/\s+/);
  const current = words[words.length - 1].toLowerCase();

  if (current.length < 2) {
    document.getElementById('t9Bar').classList.remove('visible');
    return;
  }

  const dict = [...T9_RU, ...T9_EN];
  const suggestions = dict.filter(w => w.startsWith(current) && w !== current).slice(0, 6);

  if (suggestions.length === 0) {
    document.getElementById('t9Bar').classList.remove('visible');
    return;
  }

  document.getElementById('t9Bar').classList.add('visible');
  document.getElementById('t9Chips').innerHTML = suggestions.map(s =>
    `<span class="t9-chip" onclick="applyT9('${s}')">${s}</span>`
  ).join('');
}

function applyT9(word) {
  const area = document.getElementById('editorArea');
  const val = area.value;
  const pos = area.selectionStart;
  const before = val.slice(0, pos);
  const after = val.slice(pos);
  const words = before.split(/(\s+)/);
  words[words.length - 1] = word;
  const newBefore = words.join('');
  area.value = newBefore + ' ' + after;
  const newPos = newBefore.length + 1;
  area.setSelectionRange(newPos, newPos);
  area.focus();
  document.getElementById('t9Bar').classList.remove('visible');
  autoSave();
}

// ── VOICE INPUT ──
function toggleVoice() {
  const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  if (!supported) {
    alert('Speech recognition is only supported in Chromium-based browsers.\nThis app uses Electron (Chromium) so it should work — try restarting.');
    return;
  }
  if (isListening) { recognition && recognition.stop(); return; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'ru-RU';
  recognition.continuous = true;
  recognition.interimResults = true;

  const area = document.getElementById('editorArea');
  const baseContent = area.value;
  let finalTranscript = '';

  recognition.onstart = () => {
    isListening = true;
    document.getElementById('voiceBtn').classList.add('listening');
    document.getElementById('voiceLabel').textContent = '■ Stop';
  };

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + ' ';
      else interim = e.results[i][0].transcript;
    }
    const sep = baseContent && (finalTranscript || interim) ? '\n' : '';
    area.value = baseContent + sep + finalTranscript + interim;
    area.scrollTop = area.scrollHeight;
    autoSave();
  };

  recognition.onerror = (e) => {
    console.error('Speech error:', e.error);
    recognition.stop();
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById('voiceBtn').classList.remove('listening');
    document.getElementById('voiceLabel').textContent = 'Voice';
    const sep = baseContent && finalTranscript ? '\n' : '';
    area.value = baseContent + sep + finalTranscript.trim();
    autoSave();
  };

  recognition.start();
}

// ── AI ASSISTANT ──
function updateAIState() {
  const hasKey = !!settings.apiKey;
  document.getElementById('aiNoKey').style.display = hasKey ? 'none' : 'block';
  document.getElementById('aiInputRow').style.opacity = hasKey ? '1' : '0.4';
  document.getElementById('aiSendBtn').disabled = !hasKey;
  document.getElementById('aiInput').disabled = !hasKey;
  document.getElementById('aiQuickBtns').style.opacity = hasKey ? '1' : '0.4';
  document.getElementById('aiQuickBtns').style.pointerEvents = hasKey ? 'auto' : 'none';
}

function toggleAIPanel() {
  const panel = document.getElementById('aiPanel');
  aiPanelOpen = !aiPanelOpen;
  panel.style.width = aiPanelOpen ? '300px' : '0';
  panel.style.overflow = aiPanelOpen ? 'hidden' : 'visible';
  document.querySelector('.ai-toggle').textContent = aiPanelOpen ? '›' : '‹';
}

function aiQuick(prompt) {
  if (!settings.apiKey) { openSettings(); return; }
  const note = getNoteById(currentNoteId);
  const context = note ? `\n\nТекущая заметка «${note.title}»:\n${note.content}` : '';
  sendAIWithMessage(prompt + context);
}

function aiInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
}

function sendAIMessage() {
  const input = document.getElementById('aiInput');
  const text = input.value.trim();
  if (!text || !settings.apiKey) return;
  input.value = '';
  sendAIWithMessage(text);
}

async function sendAIWithMessage(userText) {
  const messagesEl = document.getElementById('aiMessages');
  document.getElementById('aiNoKey').style.display = 'none';

  aiMessages.push({ role: 'user', content: userText });

  const userBubble = document.createElement('div');
  userBubble.className = 'ai-msg user';
  userBubble.innerHTML = `<span class="ai-msg-role">You</span><div class="ai-msg-text">${esc(userText)}</div>`;
  messagesEl.appendChild(userBubble);

  const typingBubble = document.createElement('div');
  typingBubble.className = 'ai-msg assistant';
  typingBubble.innerHTML = `<span class="ai-msg-role">Assistant</span><div class="ai-msg-text"><div class="ai-typing"><span></span><span></span><span></span></div></div>`;
  messagesEl.appendChild(typingBubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  document.getElementById('aiSendBtn').disabled = true;

  const result = await window.teizerAPI.aiChat({
    messages: aiMessages.slice(-10),
    apiKey: settings.apiKey
  });

  messagesEl.removeChild(typingBubble);
  document.getElementById('aiSendBtn').disabled = false;

  if (result.ok) {
    aiMessages.push({ role: 'assistant', content: result.text });
    const aiBubble = document.createElement('div');
    aiBubble.className = 'ai-msg assistant';
    aiBubble.innerHTML = `<span class="ai-msg-role">Assistant</span><div class="ai-msg-text">${esc(result.text)}</div>`;
    messagesEl.appendChild(aiBubble);
  } else {
    aiMessages.pop();
    const errBubble = document.createElement('div');
    errBubble.className = 'ai-msg assistant';
    errBubble.innerHTML = `<span class="ai-msg-role">Error</span><div class="ai-msg-text" style="color:var(--red)">${esc(result.error || 'Unknown error')}</div>`;
    messagesEl.appendChild(errBubble);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── SETTINGS ──
function openSettings() {
  document.getElementById('apiKeyInput').value = settings.apiKey;
  document.getElementById('fontSizeInput').value = settings.fontSize;
  document.getElementById('settingsOverlay').classList.add('show');
}
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('show'); }

async function saveSettings() {
  settings.apiKey = document.getElementById('apiKeyInput').value.trim();
  settings.fontSize = parseInt(document.getElementById('fontSizeInput').value) || 15;
  applySettings();
  await window.teizerAPI.saveSettings(settings);
  updateAIState();
  closeSettings();
}

document.getElementById('settingsOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeSettings();
});

// ── UTILS ──
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');
}

// ── KEYBOARD SHORTCUTS ──
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openNewNoteDialog(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); document.getElementById('searchInput').focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') { e.preventDefault(); toggleVoice(); }
  if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettings(); }
  if (e.key === 'Escape') { closeSettings(); }
});

// ── START ──
init();
