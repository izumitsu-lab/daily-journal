// ==========================================
// ui.js (モーダル開閉・タブ切り替え・カード描画・その他UI)
// ==========================================

let cardScrollPositions = {};

function saveCurrentScrollPositions() {
    const container = document.getElementById('journalCarouselContainer');
    if (!container) return;
    
    if (container.classList.contains('grid-mode-active')) {
        cardScrollPositions['notebook_grid'] = container.scrollTop;
    }
    
    const panels = container.querySelectorAll('.card-carousel-panel');
    panels.forEach(p => {
        const sw = p.querySelector('.logs-container-wrapper');
        if (sw && p.dataset.key) {
            cardScrollPositions[p.dataset.key] = sw.scrollTop;
        }
    });
}

window.addEventListener('scroll', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('logs-container-wrapper')) {
        const panel = e.target.closest('.card-carousel-panel');
        if (panel && panel.dataset.key) {
            cardScrollPositions[panel.dataset.key] = e.target.scrollTop;
        }
    } else if (e.target && e.target.id === 'journalCarouselContainer') {
        if (e.target.classList.contains('grid-mode-active')) {
            cardScrollPositions['notebook_grid'] = e.target.scrollTop;
        }
    }
}, true);

function applyHideEmptyCardsSetting() { const t = document.getElementById('hideEmptyCardsToggle'); if (t) t.checked = hideEmptyCards; }
function toggleHideEmptyCards() {
    hideEmptyCards = document.getElementById('hideEmptyCardsToggle').checked;
    localStorage.setItem('daily_journal_hide_empty', hideEmptyCards);
    if (hideEmptyCards && calendarScope !== 'notebooks') adjustActiveDateToLatestLog();
    triggerSmoothViewSwitch(() => { renderRightCards(); if (sidebarMode === 'cal' && calendarScope !== 'notebooks') renderMiniCalendar(); });
}

function triggerSmoothViewSwitch(updateCallback) {
    saveCurrentScrollPositions();
    const container = document.getElementById('journalCarouselContainer');
    isProgrammaticScroll = true;
    container.classList.add('is-transitioning');
    setTimeout(() => {
        updateCallback();
        container.classList.remove('is-transitioning');
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = setTimeout(() => { isProgrammaticScroll = false; }, 350);
    }, 80);
}

function smoothScrollToKey(key) {
    const container = document.getElementById('journalCarouselContainer');
    const panel = container.querySelector(`[data-key="${key}"]`);
    if (panel) {
        isProgrammaticScroll = true;
        container.scrollTo({ left: panel.offsetLeft - container.offsetLeft, behavior: 'smooth' });
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = setTimeout(() => { isProgrammaticScroll = false; }, 500);
        return true;
    }
    return false;
}

function smoothScrollToPhotoDate(dateKey) {
    const container = document.getElementById('journalCarouselContainer');
    let t = container.querySelector(`[data-date="${dateKey}"]`);
    if (!t) {
        const panels = Array.from(container.querySelectorAll('.card-carousel-panel[data-date]'));
        t = panels.find(p => p.dataset.date >= dateKey) || panels[panels.length - 1];
    }
    if (t) {
        isProgrammaticScroll = true;
        if (t.dataset.key) lastPhotoPanelKey = t.dataset.key;
        container.scrollTo({ left: t.offsetLeft - container.offsetLeft, behavior: 'smooth' });
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = setTimeout(() => { isProgrammaticScroll = false; }, 500);
        return true;
    }
    return false;
}

function instantScrollToKey(key) {
    const c = document.getElementById('journalCarouselContainer');
    const p = c.querySelector(`[data-key="${key}"]`);
    if (p) {
        isProgrammaticScroll = true;
        c.scrollLeft = p.offsetLeft - c.offsetLeft;
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = setTimeout(() => { isProgrammaticScroll = false; }, 120);
    }
}

function getActiveCarouselPanel() { const c = document.getElementById('journalCarouselContainer'); const w = c.clientWidth; if (!w) return null; return c.querySelectorAll('.card-carousel-panel')[Math.round(c.scrollLeft / w)] || null; }

function scrollToTimelineDateInPanel(p, tD, s = true) {
    if (!p) return; const sw = p.querySelector('.logs-container-wrapper'); if (!sw) return;
    let t = p.querySelector(`.timeline-date-divider[data-date="${tD}"]`);
    if (!t) { const d = Array.from(p.querySelectorAll('.timeline-date-divider[data-date]')); if (d.length > 0) { t = d.find(x => x.dataset.date >= tD) || d[0]; } }
    if (t) {
        const wR = sw.getBoundingClientRect(); const tR = t.getBoundingClientRect();
        const tS = Math.max(0, tR.top - wR.top + sw.scrollTop - 10);
        if (!((tR.top >= wR.top - 10 && tR.top <= wR.top + 70) || Math.abs(sw.scrollTop - tS) < 18)) sw.scrollTo({ top: tS, behavior: s ? 'smooth' : 'auto' });
        t.classList.remove('highlight-target'); void t.offsetWidth; t.classList.add('highlight-target');
    } else if (sw.scrollTop > 30) sw.scrollTo({ top: 0, behavior: s ? 'smooth' : 'auto' });
}

function parseLinksAndText(text) {
    if (!text) return "";
    return escapeHtml(text).replace(/(https?:\/\/[^\s]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="journal-link" onclick="event.stopPropagation()">🔗 ${url}</a>`);
}

function escapeHtml(str) { return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

function resizeImageFile(file, maxDimension = 1400, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > maxDimension || h > maxDimension) {
                    if (w > h) { h = Math.round((h * maxDimension) / w); w = maxDimension; }
                    else { w = Math.round((w * maxDimension) / h); h = maxDimension; }
                }
                const cvs = document.createElement('canvas'); cvs.width = w; cvs.height = h;
                cvs.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(cvs.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject; img.src = e.target.result;
        };
        reader.onerror = reject; reader.readAsDataURL(file);
    });
}
function triggerPhotoSelect(m) { document.getElementById(m === 'add' ? 'addPhotoInput' : 'editPhotoInput').click(); }
async function handlePhotosSelected(e, m) {
    const files = Array.from(e.target.files); if (!files.length) return;
    for (const f of files) {
        try {
            const b = await resizeImageFile(f);
            if (m === 'add') currentAddPhotos.push(b); else currentEditPhotos.push(b);
        } catch (err) {}
    }
    renderPhotoPreviews(m); e.target.value = "";
}
function renderPhotoPreviews(m) {
    const c = document.getElementById(m === 'add' ? 'addPhotoPreviewsContainer' : 'editPhotoPreviewsContainer');
    const p = m === 'add' ? currentAddPhotos : currentEditPhotos;
    c.innerHTML = "";
    if (!p.length) { c.classList.remove('has-photos'); return; }
    c.classList.add('has-photos');
    p.forEach((d, i) => {
        const div = document.createElement('div'); div.className = 'photo-preview-item';
        div.innerHTML = `<img src="${d}"><button class="photo-preview-del-btn" onclick="removePhotoAtIndex('${m}', ${i})">✕</button>`;
        c.appendChild(div);
    });
}
function removePhotoAtIndex(m, i) { if (m === 'add') currentAddPhotos.splice(i, 1); else currentEditPhotos.splice(i, 1); renderPhotoPreviews(m); }
function openLightbox(s) { document.getElementById('lightboxImg').src = s; document.getElementById('lightboxModal').classList.add('active'); }
function closeLightbox() { document.getElementById('lightboxModal').classList.remove('active'); document.getElementById('lightboxImg').src = ""; }

function getLogCategoryType(catName) { const f = categories.find(c => c.name === catName); return f ? (f.type || "一般") : "一般"; }
function getTypeIcon(t) { return t === '研究管理' ? '🎓' : t === 'ログ' ? '🌿' : '📁'; }
function getCategoryTypeClass(catName) { const f = categories.find(c => c.name === catName); if (!f) return ""; return f.type === "研究管理" ? "type-student" : f.type === "ログ" ? "type-log" : ""; }

function matchesCurrentFilter(item) {
    const isSlackMsg = !!(item.slackType || item.isSlack);
    
    if (currentFilter.mode === 'all') {
        if (isSlackMsg && typeSlackSettings['all'] === false) {
            return false;
        }
        return true;
    }
    
    const cat = item.category || "ライフログ";
    const catType = getLogCategoryType(cat);
    
    if (isSlackMsg && !isSlackEnabledForType(catType)) {
        return false;
    }

    if (currentFilter.mode === 'category') return cat === currentFilter.value;
    if (currentFilter.mode === 'type') return catType === currentFilter.value;
    return true;
}

function updateMsgTypeVisibility(mode, catName) {
    const catType = getLogCategoryType(catName);
    const enabled = isSlackEnabledForType(catType);
    const s = document.getElementById(mode === 'add' ? 'addMsgTypeSegmented' : 'editMsgTypeSegmented');
    if (!s) return;
    if (enabled) {
        s.style.display = 'inline-flex';
    } else {
        s.style.display = 'none';
        setMessageType(mode, 'normal');
    }
}

function setMessageType(mode, type) {
    if (mode === 'add') currentAddMsgType = type; else currentEditMsgType = type;
    const p = mode === 'add' ? 'addMsgType_' : 'editMsgType_';
    ['normal', 'incoming', 'outgoing'].forEach(t => {
        const b = document.getElementById(p + t); if (b) b.classList.toggle('active', t === type);
    });
    const ta = document.getElementById(mode === 'add' ? 'journalInputText' : 'editInputText');
    if (type === 'incoming') ta.placeholder = "相手から届いたSlackメッセージ...";
    else if (type === 'outgoing') ta.placeholder = "相手へ送信したSlackメッセージ...";
    else ta.placeholder = mode === 'add' ? "いま起きたことや記録を入力..." : "記録内容を編集...";
}

function updateSidebars() {
    const calSidebar = document.getElementById('calendarSidebar'); calSidebar.classList.remove('active');
    if (sidebarMode === 'cal') {
        calSidebar.classList.add('active'); 
        
        if (calendarScope === 'notebooks') {
            document.getElementById('sidebarTitle').textContent = 'NOTEBOOKS';
            document.getElementById('sidebarTitle').style.color = 'var(--notebook-color)';
            document.getElementById('calSidebarContent').style.display = 'none';
            document.getElementById('notebookSidebarContent').style.display = 'flex';
            renderNotebookSidebar();
        } else {
            document.getElementById('sidebarTitle').textContent = 'JOURNALS';
            document.getElementById('sidebarTitle').style.color = 'var(--accent-color)';
            document.getElementById('calSidebarContent').style.display = 'flex';
            document.getElementById('notebookSidebarContent').style.display = 'none';
            renderMiniCalendar(); 
        }
        
        updateScopeButtonsUI(); 
        updateJumpButtonLabel();
    }
}

function closeSidebar() { sidebarMode = 'none'; updateSidebars(); }

function handleCalendarButtonClick() {
    if (calendarScope === 'notebooks' && (notebookViewMode === 'card' || notebookViewMode === 'linked')) {
        const leftSwitch = document.getElementById('toggleLeftSidebarSwitch');
        const rightSwitch = document.getElementById('toggleRightSidebarSwitch');
        if (leftSwitch) leftSwitch.checked = (sidebarMode === 'cal');
        if (rightSwitch) rightSwitch.checked = isRightSidebarOpen;
        openModal('sidebarToggleModal');
        return;
    }

    if (sidebarMode === 'cal') closeSidebar();
    else {
        sidebarMode = 'cal';
        const p = (activeDateKey || getTodayKey()).split('-');
        miniCalYear = parseInt(p[0], 10);
        miniCalMonth = parseInt(p[1], 10) - 1;
        updateSidebars();
    }
}

function toggleLeftSidebar(isOpen) {
    if (isOpen) {
        sidebarMode = 'cal';
        const p = (activeDateKey || getTodayKey()).split('-');
        miniCalYear = parseInt(p[0], 10);
        miniCalMonth = parseInt(p[1], 10) - 1;
        updateSidebars();
    } else {
        closeSidebar();
    }
}

function toggleRightSidebar(isOpen) {
    isRightSidebarOpen = isOpen;
    const viewContainer = document.querySelector('.connected-view-container');
    if (viewContainer) {
        viewContainer.classList.toggle('hide-right-sidebar', !isRightSidebarOpen);
    }
}

function handleCategoryButtonClick() { renderCategoryFilterModal(); openModal('categorySelectModal'); }

function selectFilter(mode, value = '') {
    saveCurrentScrollPositions();
    triggerSmoothViewSwitch(() => {
        currentFilter = { mode, value };
        
        if (calendarScope === 'notebooks' && !isNotebookEnabledForCurrentFilter()) {
            calendarScope = 'day';
        }
        
        if (hideEmptyCards && calendarScope !== 'notebooks') adjustActiveDateToLatestLog();
        updateCategoryButtonUI(); 
        updateScopeButtonsUI(); 
        renderRightCards(); 
        if (sidebarMode === 'cal') updateSidebars();
    });
    closeModal('categorySelectModal');
}

function renderCategoryFilterModal() {
    const c = document.getElementById('catFilterModalList'); c.innerHTML = "";
    
    const allBtn = document.createElement('div');
    allBtn.className = `cat-filter-all-btn ${currentFilter.mode === 'all' ? 'selected' : ''}`;
    allBtn.innerHTML = `<div style="display: flex; align-items: center; gap: 9px;"><span style="font-size: 18px;">🌐</span><span class="cat-filter-name">すべて表示 (All)</span></div>`;
    allBtn.onclick = () => selectFilter('all'); c.appendChild(allBtn);

    const types = [...new Set(categories.map(c => c.type || "一般"))];
    types.forEach(t => {
        const card = document.createElement('div'); card.className = 'cat-filter-type-card';
        const isT = currentFilter.mode === 'type' && currentFilter.value === t;
        const row = document.createElement('button'); row.className = `cat-filter-type-row-btn ${isT ? 'selected' : ''}`;
        row.innerHTML = `<div class="cat-filter-type-title-area"><span class="cat-filter-type-icon">${getTypeIcon(t)}</span><span class="cat-filter-type-title">${escapeHtml(t)}</span><span class="cat-filter-type-subtext">${isT ? '(全件選択中)' : '(タイプ全件)'}</span></div>`;
        row.onclick = () => selectFilter('type', t); card.appendChild(row);

        const wrap = document.createElement('div'); wrap.className = 'cat-filter-chips-grid';
        categories.filter(ca => (ca.type || "一般") === t).forEach(cat => {
            const isC = currentFilter.mode === 'category' && currentFilter.value === cat.name;
            const b = document.createElement('button'); b.className = `cat-filter-subchip ${isC ? 'selected' : ''}`;
            b.innerHTML = `<span>${escapeHtml(cat.name)}</span>`;
            b.onclick = () => selectFilter('category', cat.name); wrap.appendChild(b);
        });
        card.appendChild(wrap); c.appendChild(card);
    });
}

function updateCategoryButtonUI() {
    const b = document.getElementById('btnCategory'), l = document.getElementById('btnCategoryLabel');
    if (currentFilter.mode === 'all') { l.textContent = "カテゴリ"; b.classList.remove('active-filter'); }
    else { l.textContent = currentFilter.value; b.classList.add('active-filter'); }
}

function switchSettingsTab(t) {
    ['general', 'categories', 'types', 'data'].forEach(p => {
        const b = document.getElementById('tabBtn' + p.charAt(0).toUpperCase() + p.slice(1));
        const e = document.getElementById('settingsPage' + p.charAt(0).toUpperCase() + p.slice(1));
        if (b) b.classList.toggle('active', p === t); if (e) e.classList.toggle('active', p === t);
    });
}

function openViewScopeModal() { updateViewScopeModalUI(); openModal('viewScopeModal'); }
function updateViewScopeModalUI() {
    ['day', 'week', 'month', 'photo', 'notebooks'].forEach(s => {
        const i = document.getElementById(`scopeItem_${s}`);
        if (i) {
            i.classList.toggle('selected', calendarScope === s);
            if (s === 'notebooks') i.classList.toggle('notebook-selected', calendarScope === s);
        }
    });

    const nbItem = document.getElementById('scopeItem_notebooks');
    const nbDivider = document.getElementById('modalNotebookDivider');
    const isNbEnabled = isNotebookEnabledForCurrentFilter();
    if (nbItem && nbDivider) {
        nbItem.style.display = isNbEnabled ? 'flex' : 'none';
        nbDivider.style.display = isNbEnabled ? 'block' : 'none';
    }
}
function selectScopeFromModal(s) { setCalendarScope(s); closeModal('viewScopeModal'); }

function setCalendarScope(scope) {
    saveCurrentScrollPositions();
    triggerSmoothViewSwitch(() => {
        if (['day', 'week', 'month', 'photo'].includes(calendarScope)) {
            lastJournalScope = calendarScope;
            lastJournalDateKey = activeDateKey;
            previousCalendarScope = calendarScope;
        }

        if (['day', 'week', 'month', 'photo'].includes(scope)) {
            if (lastJournalDateKey) {
                activeDateKey = lastJournalDateKey;
                const p = activeDateKey.split('-');
                miniCalYear = parseInt(p[0], 10);
                miniCalMonth = parseInt(p[1], 10) - 1;
            }
        }

        calendarScope = scope;
        
        if (hideEmptyCards && calendarScope !== 'notebooks') adjustActiveDateToLatestLog();
        updateScopeButtonsUI(); updateJumpButtonLabel(); 
        if (sidebarMode === 'cal') updateSidebars();
        renderRightCards();
    });
}

function updateScopeButtonsUI() {
    document.getElementById('btnScopeDay').classList.toggle('active', calendarScope === 'day');
    document.getElementById('btnScopeWeek').classList.toggle('active', calendarScope === 'week');
    document.getElementById('btnScopeMonth').classList.toggle('active', calendarScope === 'month');
    const pb = document.getElementById('btnScopePhoto'); pb.classList.toggle('active', calendarScope === 'photo');

    const isNbEnabled = isNotebookEnabledForCurrentFilter();
    const sbNb = document.getElementById('btnSidebarNotebook');
    if (sbNb) {
        sbNb.style.display = isNbEnabled ? 'flex' : 'none';
        sbNb.classList.toggle('active', calendarScope === 'notebooks');
    }

    const si = document.getElementById('btnViewScopeIcon'), sl = document.getElementById('btnViewScopeLabel'), v = document.getElementById('btnViewScope');
    v.className = 'bar-btn'; 
    if (calendarScope === 'day') { si.textContent = '☀️'; sl.textContent = 'DAILY'; }
    else if (calendarScope === 'week') { si.textContent = '🗓️'; sl.textContent = 'WEEKLY'; v.classList.add('active-scope'); }
    else if (calendarScope === 'month') { si.textContent = '📅'; sl.textContent = 'MONTHLY'; v.classList.add('active-scope'); }
    else if (calendarScope === 'photo') { si.textContent = '📸'; sl.textContent = 'PHOTO'; v.classList.add('active-scope'); }
    else if (calendarScope === 'notebooks') { si.textContent = '📔'; sl.textContent = 'NOTEBOOK'; v.classList.add('notebook-active-scope'); }

    const mainIcon = document.getElementById('launcherMainIcon');
    const mainLabel = document.getElementById('launcherMainLabel');
    if (calendarScope === 'notebooks') {
        mainIcon.textContent = '+';
        mainLabel.textContent = 'ノート';
    } else {
        mainIcon.textContent = '+';
        mainLabel.textContent = '追記';
    }
}

function updateJumpButtonLabel() {
    const l = document.getElementById('calJumpCurrentLabel');
    const bl = document.getElementById('btnTodayLabel');
    const bi = document.querySelector('#btnToday .bar-btn-icon');
    
    if (calendarScope === 'notebooks') {
        if (l) l.textContent = "一覧に戻る";
        if (bl) bl.textContent = "一覧";
        if (bi) bi.textContent = "🗂️";
    } else {
        if (l) l.textContent = "今日に戻る";
        if (bl) bl.textContent = "今日";
        if (bi) bi.textContent = "✦";
    }
}

function shouldShowSlackFormatting(log) {
    if (currentFilter.mode === 'all') {
        return typeSlackSettings['all'] === true;
    }
    const catType = getLogCategoryType(log.category || "ライフログ");
    return isSlackEnabledForType(catType);
}

function createLogItemHtml(log, dateStr, originalIndex) {
    const catName = log.category || "ライフログ"; const tCls = getCategoryTypeClass(catName);
    const showSlack = shouldShowSlackFormatting(log);
    const sType = showSlack ? (log.slackType || (log.isSlack ? 'incoming' : null)) : null;

    const showCat = (currentFilter.mode === 'all' || currentFilter.mode === 'type');
    const catBadge = showCat ? `<span class="log-category-badge ${tCls}">${escapeHtml(catName)}</span>` : '';
    let sBadge = "";
    if (sType === 'incoming') sBadge = `<span class="slack-direction-badge incoming"><span>📥</span><span>相手から</span></span>`;
    else if (sType === 'outgoing') sBadge = `<span class="slack-direction-badge outgoing"><span>📤</span><span>自分から</span></span>`;

    const p = Array.isArray(log.images) ? log.images : (log.image ? [log.image] : []);
    const pHtml = p.length > 0 ? `<div class="log-photos-grid">` + p.map(img => `<div class="log-photo-thumb-wrap" onclick="event.stopPropagation(); openLightbox('${img}')"><img class="log-photo-thumb" src="${img}" loading="lazy"></div>`).join('') + `</div>` : "";

    let cHtml = "";
    if (sType === 'incoming') cHtml = `<div class="chat-bubble-card incoming"><div class="chat-bubble-header"><span>💬</span><span>${escapeHtml(catName)}</span></div><div class="chat-bubble-text">${parseLinksAndText(log.text)}</div></div>`;
    else if (sType === 'outgoing') cHtml = `<div class="chat-bubble-card outgoing"><div class="chat-bubble-header"><span>💬</span><span>あなた → ${escapeHtml(catName)}</span></div><div class="chat-bubble-text">${parseLinksAndText(log.text)}</div></div>`;
    else cHtml = `<div class="log-content">${parseLinksAndText(log.text)}</div>`;

    return `<li class="log-item"><div class="log-header-row"><div class="log-meta-group"><span class="log-badge">${log.time}</span>${catBadge}${sBadge}</div><button class="log-edit-btn" onclick="openEditModal('${dateStr}', ${originalIndex})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button></div>${cHtml}${pHtml}</li>`;
}

function getFilteredDayLogs(dStr) {
    const raw = journalData[dStr] || []; const res = [];
    raw.forEach((l, i) => { if (matchesCurrentFilter(l)) res.push({ log: l, index: i }); });
    return res.sort((a, b) => a.log.time.localeCompare(b.log.time));
}

function getActiveFilterBadgeHtml() {
    if (currentFilter.mode === 'type') return `<span class="filter-status-badge type-badge"><span>${getTypeIcon(currentFilter.value)}</span><span>${escapeHtml(currentFilter.value)} (全件)</span></span>`;
    if (currentFilter.mode === 'category') return `<span class="filter-status-badge"><span>🏷️</span><span>${escapeHtml(currentFilter.value)}</span></span>`;
    return '';
}

function getEmptyStateMessage() {
    if (currentFilter.mode === 'type') return `「${currentFilter.value}」タイプの記録はありません`;
    if (currentFilter.mode === 'category') return `「${currentFilter.value}」の記録はありません`;
    return 'まだ記録がありません';
}

function renderRightCards() {
    saveCurrentScrollPositions();
    const container = document.getElementById('journalCarouselContainer');
    if (container) container.classList.remove('grid-mode-active');
    
    if (calendarScope === 'day') renderDayCarousel();
    else if (calendarScope === 'week') renderWeekCarousel();
    else if (calendarScope === 'month') renderMonthCarousel();
    else if (calendarScope === 'photo') renderPhotoJournalCarousel();
    else if (calendarScope === 'notebooks') {
        renderNotebookCarousel();
        if (notebookViewMode === 'grid' && cardScrollPositions['notebook_grid'] !== undefined) {
            requestAnimationFrame(() => {
                const c = document.getElementById('journalCarouselContainer');
                if (c) c.scrollTop = cardScrollPositions['notebook_grid'];
            });
        }
    }
}

function renderDayCarousel() {
    const container = document.getElementById('journalCarouselContainer'); container.innerHTML = "";
    const todayStr = getTodayKey(); const filterBadgeHtml = getActiveFilterBadgeHtml();
    let dToR = dateList;
    if (hideEmptyCards) {
        const w = dateList.filter(d => getFilteredDayLogs(d).length > 0);
        if (w.length > 0) { dToR = [...w]; if (!dToR.includes(activeDateKey)) { dToR.push(activeDateKey); dToR.sort(); } }
        else dToR = [todayStr];
    }
    dToR.forEach(dStr => {
        const f = getFilteredDayLogs(dStr); const p = document.createElement('div'); p.className = 'card-carousel-panel'; p.dataset.key = dStr;
        let h = "";
        if (!f.length) h = `<div class="empty-state"><span>📝 ${getEmptyStateMessage()}</span><span style="font-size: 13px; opacity: 0.7;">下部のボタンから今日に追記できます</span></div>`;
        else { h = `<ul class="log-list">`; f.forEach(i => h += createLogItemHtml(i.log, dStr, i.index)); h += `</ul>`; }
        p.innerHTML = `<div class="main-display"><div class="display-header"><div class="date-title-wrapper"><span class="date-eyebrow">DAILY JOURNAL</span><h1 class="date-title">${formatDateHeader(dStr)}</h1></div><div class="header-actions">${filterBadgeHtml}<span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); opacity: 0.8; margin-right: 4px;">${dStr}</span>${dStr === todayStr ? '<span class="header-badge">今日</span>' : ''}</div></div><div class="logs-container-wrapper">${h}</div></div>`;
        container.appendChild(p);

        if (cardScrollPositions[dStr] !== undefined) {
            const sw = p.querySelector('.logs-container-wrapper');
            if (sw) sw.scrollTop = cardScrollPositions[dStr];
        }
    });
    const targetKey = dToR.includes(activeDateKey) ? activeDateKey : dToR[dToR.length - 1];
    instantScrollToKey(targetKey);
}

function renderPhotoJournalCarousel() {
    const container = document.getElementById('journalCarouselContainer'); container.innerHTML = ""; const filterBadgeHtml = getActiveFilterBadgeHtml();
    const pLogs = [];
    Object.keys(journalData).sort().forEach(dStr => {
        (journalData[dStr] || []).forEach((l, i) => {
            const p = Array.isArray(l.images) ? l.images : (l.image ? [l.image] : []);
            if (p.length > 0 && matchesCurrentFilter(l)) pLogs.push({ dateStr: dStr, log: l, index: i, photos: p });
        });
    });
    pLogs.sort((a, b) => { const c = a.dateStr.localeCompare(b.dateStr); return c !== 0 ? c : (a.log.time || "").localeCompare(b.log.time || ""); });
    
    if (!pLogs.length) {
        const ep = document.createElement('div'); ep.className = 'card-carousel-panel';
        ep.innerHTML = `<div class="main-display"><div class="display-header compact-header"><div class="date-title-wrapper"><span class="date-eyebrow">PHOTO JOURNAL</span><h1 class="date-title">Memories</h1></div><div class="header-actions">${filterBadgeHtml}<span class="header-badge">0件</span></div></div><div class="empty-state"><span style="font-size: 36px;">📸</span><span style="font-size: 15px; font-weight: 600;">写真付きの記録がまだありません</span></div></div>`;
        container.appendChild(ep); return;
    }

    pLogs.forEach((item, pIdx) => {
        const { dateStr, log, index, photos } = item; const cat = log.category || "ライフログ"; const tCls = getCategoryTypeClass(cat);
        const showSlack = shouldShowSlackFormatting(log);
        const sType = showSlack ? (log.slackType || (log.isSlack ? 'incoming' : null)) : null;

        let sb = ""; if (sType === 'incoming') sb = `<span class="slack-direction-badge incoming"><span>📥</span><span>相手から</span></span>`; else if (sType === 'outgoing') sb = `<span class="slack-direction-badge outgoing"><span>📤</span><span>自分から</span></span>`;
        let sHtml = ""; photos.forEach(u => sHtml += `<div class="photo-stage-slide"><img class="photo-stage-full-img" src="${u}" onclick="openLightbox('${u}')" loading="lazy"></div>`);
        const cp = photos.length > 1 ? `<div class="photo-count-pill">📷 1 / ${photos.length}</div>` : '';
        
        let mb = "";
        if (sType === 'incoming') mb = `<div class="chat-bubble-card incoming" style="margin-top: 2px;"><div class="chat-bubble-header"><span>💬</span><span>${escapeHtml(cat)}</span></div><div class="chat-bubble-text">${parseLinksAndText(log.text)}</div></div>`;
        else if (sType === 'outgoing') mb = `<div class="chat-bubble-card outgoing" style="margin-top: 2px;"><div class="chat-bubble-header"><span>💬</span><span>あなた → ${escapeHtml(cat)}</span></div><div class="chat-bubble-text">${parseLinksAndText(log.text)}</div></div>`;
        else mb = `<div class="journal-drawer-text">${parseLinksAndText(log.text)}</div>`;

        const panelKey = `photo_${dateStr}_${index}`;
        const p = document.createElement('div'); p.className = 'card-carousel-panel'; p.dataset.key = panelKey; p.dataset.date = dateStr;
        p.innerHTML = `<div class="main-display journal-card-layout"><div class="display-header compact-header"><div class="date-title-wrapper"><span class="date-eyebrow">PHOTO JOURNAL</span><h1 class="date-title">${formatDateHeader(dateStr)}</h1></div><div class="header-actions">${filterBadgeHtml}<span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); opacity: 0.8; margin-right: 4px;">${dateStr}</span><span class="header-badge">${pIdx + 1} / ${pLogs.length}</span></div></div><div class="photo-stage-viewport">${cp}<div class="photo-stage-scroller" onscroll="updateSlideCounter(this)">${sHtml}</div></div><div class="journal-bottom-drawer"><div class="journal-drawer-header"><div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;"><span class="log-badge">${log.time}</span><span class="log-category-badge ${tCls}">${escapeHtml(cat)}</span>${sb}</div><button class="log-edit-btn" onclick="openEditModal('${dateStr}', ${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button></div>${mb}</div></div>`;
        container.appendChild(p);
    });

    let tP = null;
    if (lastPhotoPanelKey) {
        tP = container.querySelector(`[data-key="${lastPhotoPanelKey}"]`);
    }
    if (!tP) {
        tP = container.querySelector(`[data-date="${activeDateKey}"]`) || container.firstElementChild;
    }
    if (tP) {
        isProgrammaticScroll = true;
        container.scrollLeft = tP.offsetLeft - container.offsetLeft;
        if (tP.dataset.key) lastPhotoPanelKey = tP.dataset.key;
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = setTimeout(() => { isProgrammaticScroll = false; }, 120);
    }
}
function updateSlideCounter(s) { const p = s.parentElement.querySelector('.photo-count-pill'); if (!p) return; const w = s.clientWidth; if (!w) return; p.textContent = `📷 ${Math.round(s.scrollLeft / w) + 1} / ${s.querySelectorAll('.photo-stage-slide').length}`; }

function renderWeekCarousel() {
    const container = document.getElementById('journalCarouselContainer'); container.innerHTML = ""; const filterBadgeHtml = getActiveFilterBadgeHtml();
    const wL = []; const now = new Date();
    for (let i = 8; i >= 0; i--) {
        const t = new Date(); t.setDate(now.getDate() - (i * 7));
        const r = getWeekRangeFromDate(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`);
        if (!wL.some(w => w.monStr === r.monStr)) wL.push(r);
    }
    const aR = getWeekRangeFromDate(activeDateKey); if (!wL.some(w => w.monStr === aR.monStr)) { wL.push(aR); wL.sort((a, b) => a.monStr.localeCompare(b.monStr)); }
    
    const eW = [];
    wL.forEach(w => {
        const isC = isDateInWeek(getTodayKey(), w.monStr); const isF = isDateInWeek(activeDateKey, w.monStr);
        const wT = `${w.monDate.getMonth() + 1}/${w.monDate.getDate()}(${['日', '月', '火', '水', '木', '金', '土'][w.monDate.getDay()]}) - ${w.sunDate.getMonth() + 1}/${w.sunDate.getDate()}(${['日', '月', '火', '水', '木', '金', '土'][w.sunDate.getDay()]})`;
        let wLc = 0; let cH = "";
        for (let d = new Date(w.monDate); d <= w.sunDate; d.setDate(d.getDate() + 1)) {
            const dS = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const f = getFilteredDayLogs(dS);
            if (f.length > 0) {
                wLc += f.length; cH += `<div class="timeline-date-divider" data-date="${dS}"><span class="timeline-date-label" onclick="jumpToDayFromTimeline('${dS}')">${formatDateHeader(dS)}</span><div class="timeline-date-line"></div></div><ul class="log-list">`;
                f.forEach(i => cH += createLogItemHtml(i.log, dS, i.index)); cH += `</ul>`;
            }
        }
        if (!wLc) cH = `<div class="empty-state"><span>🗓️ この週の記録はありません</span></div>`;
        eW.push({ w, wT, cH, wLc, isC, isF });
    });

    let wToR = eW;
    if (hideEmptyCards) {
        const wL = eW.filter(ew => ew.wLc > 0);
        if (wL.length > 0) { wToR = [...wL]; const f = eW.find(ew => ew.isF); if (f && !wToR.some(ew => ew.w.monStr === f.w.monStr)) { wToR.push(f); wToR.sort((a, b) => a.w.monStr.localeCompare(b.w.monStr)); } }
        else { const fb = eW.find(ew => ew.isF) || eW[eW.length - 1]; wToR = [fb]; }
    }

    let aWk = null;
    wToR.forEach(ew => {
        if (ew.isF) aWk = ew.w.monStr;
        const p = document.createElement('div'); p.className = 'card-carousel-panel'; p.dataset.key = ew.w.monStr;
        p.innerHTML = `<div class="main-display"><div class="display-header"><div class="date-title-wrapper"><span class="date-eyebrow">WEEKLY JOURNAL</span><h1 class="date-title">${escapeHtml(ew.wT)}</h1></div><div class="header-actions">${filterBadgeHtml}${ew.isC ? '<span class="header-badge" style="background: var(--btn-secondary-bg); color: var(--text-primary);">今週</span>' : ''}</div></div><div class="logs-container-wrapper">${ew.cH}</div></div>`;
        container.appendChild(p);

        if (cardScrollPositions[ew.w.monStr] !== undefined) {
            const sw = p.querySelector('.logs-container-wrapper');
            if (sw) sw.scrollTop = cardScrollPositions[ew.w.monStr];
        }
    });
    const sT = aWk || (wToR.length > 0 ? wToR[wToR.length - 1].w.monStr : null);
    if (sT) {
        instantScrollToKey(sT);
        const aP = container.querySelector(`[data-key="${sT}"]`);
        if (aP) {
            if (cardScrollPositions[sT] === undefined) {
                scrollToTimelineDateInPanel(aP, activeDateKey, false);
            }
        }
    }
}

function renderMonthCarousel() {
    const container = document.getElementById('journalCarouselContainer'); container.innerHTML = ""; const filterBadgeHtml = getActiveFilterBadgeHtml();
    const mL = []; const now = new Date();
    for (let i = 11; i >= 0; i--) { const t = new Date(now.getFullYear(), now.getMonth() - i, 1); mL.push({ y: t.getFullYear(), m: t.getMonth() + 1, pre: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}` }); }
    const aP = activeDateKey.substring(0, 7); if (!mL.some(m => m.pre === aP)) { const [y, m] = aP.split('-').map(v => parseInt(v, 10)); mL.push({ y, m, pre: aP }); mL.sort((a, b) => a.pre.localeCompare(b.pre)); }
    
    const eM = [];
    mL.forEach(mO => {
        const isC = (mO.pre === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`); const isF = (mO.pre === aP);
        const mDs = Object.keys(journalData).filter(d => d.startsWith(mO.pre)).sort();
        let mLc = 0; let cH = "";
        mDs.forEach(dS => {
            const f = getFilteredDayLogs(dS);
            if (f.length > 0) {
                mLc += f.length; cH += `<div class="timeline-date-divider" data-date="${dS}"><span class="timeline-date-label" onclick="jumpToDayFromTimeline('${dS}')">${formatDateHeader(dS)}</span><div class="timeline-date-line"></div></div><ul class="log-list">`;
                f.forEach(i => cH += createLogItemHtml(i.log, dS, i.index)); cH += `</ul>`;
            }
        });
        if (!mLc) cH = `<div class="empty-state"><span>📅 この月の記録はありません</span></div>`;
        eM.push({ mO, isC, isF, mLc, cH });
    });

    let mToR = eM;
    if (hideEmptyCards) {
        const wL = eM.filter(em => em.mLc > 0);
        if (wL.length > 0) { mToR = [...wL]; const f = eM.find(em => em.isF); if (f && !mToR.some(em => em.mO.pre === f.mO.pre)) { mToR.push(f); mToR.sort((a, b) => a.mO.pre.localeCompare(b.mO.pre)); } }
        else { const fb = eM.find(ew => ew.isF) || eM[eM.length - 1]; mToR = [fb]; }
    }

    mToR.forEach(em => {
        const p = document.createElement('div'); p.className = 'card-carousel-panel'; p.dataset.key = em.mO.pre;
        p.innerHTML = `<div class="main-display"><div class="display-header"><div class="date-title-wrapper"><span class="date-eyebrow">MONTHLY JOURNAL</span><h1 class="date-title">${em.mO.y}年 ${em.mO.m}月</h1></div><div class="header-actions">${filterBadgeHtml}${em.isC ? '<span class="header-badge" style="background: var(--btn-secondary-bg); color: var(--text-primary);">今月</span>' : ''}</div></div><div class="logs-container-wrapper">${em.cH}</div></div>`;
        container.appendChild(p);

        if (cardScrollPositions[em.mO.pre] !== undefined) {
            const sw = p.querySelector('.logs-container-wrapper');
            if (sw) sw.scrollTop = cardScrollPositions[em.mO.pre];
        }
    });
    const sT = mToR.some(em => em.mO.pre === aP) ? aP : (mToR.length > 0 ? mToR[mToR.length - 1].mO.pre : null);
    if (sT) {
        instantScrollToKey(sT);
        const aPnl = container.querySelector(`[data-key="${sT}"]`);
        if (aPnl) {
            if (cardScrollPositions[sT] === undefined) {
                scrollToTimelineDateInPanel(aPnl, activeDateKey, false);
            }
        }
    }
}

function handleMainActionClick() {
    if (calendarScope === 'notebooks') openAddNotebookModal();
    else openAddModal();
}

function renderModalCategoryChips(mode, cSel) {
    const c = document.getElementById(mode === 'add' ? 'addCategoryChipsContainer' : 'editCategoryChipsContainer'); c.innerHTML = "";
    const types = [...new Set(categories.map(c => c.type || "一般"))];
    types.forEach(t => {
        const r = document.createElement('div'); r.className = 'category-type-row';
        r.innerHTML = `<div style="display: flex; align-items: center; gap: 5px;"><span style="font-size: 12px;">${getTypeIcon(t)}</span><span class="category-type-name">${t}</span></div>`;
        const w = document.createElement('div'); w.className = 'category-chips-wrap';
        categories.filter(ca => (ca.type || "一般") === t).forEach(cat => {
            const b = document.createElement('button'); b.type = 'button'; b.className = `category-chip ${cat.name === cSel ? 'selected' : ''}`; b.textContent = cat.name;
            b.onclick = () => { 
                if (mode === 'add') { 
                    selectedAddCategory = cat.name; 
                    renderModalCategoryChips('add', selectedAddCategory); 
                    updateMsgTypeVisibility('add', cat.name); 
                } else { 
                    selectedEditCategory = cat.name; 
                    renderModalCategoryChips('edit', selectedEditCategory); 
                    updateMsgTypeVisibility('edit', cat.name); 
                } 
            };
            w.appendChild(b);
        });
        r.appendChild(w); c.appendChild(r);
    });
}

function openAddModal() {
    const n = new Date(); document.getElementById('modalCurrentTimeBadge').textContent = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    document.getElementById('modalTargetDateBadge').textContent = `今日 (${formatShortDate(getTodayKey())})`;
    document.getElementById('journalInputText').value = "";
    
    if (currentFilter.mode === 'category' && categories.some(c => c.name === currentFilter.value)) selectedAddCategory = currentFilter.value;
    else if (currentFilter.mode === 'type') { const f = categories.find(c => (c.type || "一般") === currentFilter.value); selectedAddCategory = f ? f.name : "ライフログ"; }
    else selectedAddCategory = "ライフログ";
    
    renderModalCategoryChips('add', selectedAddCategory); 
    setMessageType('add', 'normal'); 
    updateMsgTypeVisibility('add', selectedAddCategory);
    currentAddPhotos = []; renderPhotoPreviews('add'); openModal('addModal');
    setTimeout(() => document.getElementById('journalInputText').focus(), 200);
}

function openEditModal(dStr, i) {
    const log = journalData[dStr] && journalData[dStr][i]; if (!log) return;
    currentEditTarget = { dateStr: dStr, index: i };
    document.getElementById('editModalTimeBadge').textContent = log.time || ""; document.getElementById('editInputText').value = log.text || "";
    selectedEditCategory = log.category || "ライフログ"; 
    renderModalCategoryChips('edit', selectedEditCategory);
    const m = log.slackType || (log.isSlack ? 'incoming' : 'normal'); 
    setMessageType('edit', m); 
    updateMsgTypeVisibility('edit', selectedEditCategory);
    currentEditPhotos = Array.isArray(log.images) ? [...log.images] : (log.image ? [log.image] : []); renderPhotoPreviews('edit');
    openModal('editModal'); setTimeout(() => document.getElementById('editInputText').focus(), 200);
}

function openModal(id) { 
    if (id === 'settingsModal') { 
        switchSettingsTab('general'); applyHideEmptyCardsSetting(); renderSettingsCategoryList(); 
        renderTypeSlackSettingsList(); renderTypeNotebookSettingsList();
    } 
    document.getElementById(id).classList.add('active'); 
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function outsideClose(e, id) { if (e.target.id === id) closeModal(id); }

async function saveNewLog() {
    const t = document.getElementById('journalInputText').value.trim();
    if (!t && !currentAddPhotos.length) { alert("内容または写真を添付してください。"); return; }
    if (!selectedAddCategory) { alert("カテゴリを選択してください。"); return; }
    const n = new Date(); const tStr = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; const dStr = getTodayKey();
    if (!journalData[dStr]) journalData[dStr] = [];
    
    const sA = isSlackEnabledForType(getLogCategoryType(selectedAddCategory));

    journalData[dStr].push({ 
        time: tStr, 
        text: t, 
        category: selectedAddCategory, 
        slackType: (sA && currentAddMsgType !== 'normal') ? currentAddMsgType : null, 
        images: [...currentAddPhotos] 
    });
    
    await saveJournalData();
    
    if (!dateList.includes(dStr)) { dateList.push(dStr); dateList.sort(); }
    closeModal('addModal');
    triggerSmoothViewSwitch(() => {
        if (!['day', 'photo'].includes(calendarScope)) { calendarScope = 'day'; updateScopeButtonsUI(); updateJumpButtonLabel(); }
        activeDateKey = dStr;
        lastJournalDateKey = dStr;
        renderRightCards(); 
        if (sidebarMode === 'cal') updateSidebars();
    });
}

async function saveEditedLog() {
    const { dateStr: d, index: i } = currentEditTarget; if (!d || i === null || !journalData[d] || !journalData[d][i]) return;
    const t = document.getElementById('editInputText').value.trim();
    if (!t && !currentEditPhotos.length) { alert("内容または写真を添付してください。"); return; }
    if (!selectedEditCategory) { alert("カテゴリを選択してください。"); return; }
    
    const sA = isSlackEnabledForType(getLogCategoryType(selectedEditCategory));

    journalData[d][i].text = t; 
    journalData[d][i].category = selectedEditCategory;
    journalData[d][i].slackType = (sA && currentEditMsgType !== 'normal') ? currentEditMsgType : null; 
    delete journalData[d][i].isSlack;
    journalData[d][i].images = [...currentEditPhotos]; 
    delete journalData[d][i].image;
    
    await saveJournalData();
    
    closeModal('editModal'); renderRightCards(); 
    if (sidebarMode === 'cal' && calendarScope !== 'notebooks') renderMiniCalendar();
}

async function deleteFromEditModal() {
    const { dateStr: d, index: i } = currentEditTarget; if (!d || i === null) return;
    if (confirm("この記録を削除しますか？")) { 
        journalData[d].splice(i, 1); 
        if (!journalData[d].length) delete journalData[d]; 
        
        await saveJournalData();
        
        closeModal('editModal'); 
        triggerSmoothViewSwitch(() => { 
            renderRightCards(); 
            if (sidebarMode === 'cal' && calendarScope !== 'notebooks') renderMiniCalendar(); 
        }); 
    }
}

function renderTypeSlackSettingsList() {
    const c = document.getElementById('typeSlackSettingsList'); c.innerHTML = "";
    
    const rAll = document.createElement('div'); rAll.className = 'type-slack-row';
    rAll.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span>🌐</span><strong>すべて表示 (All)</strong></div><label class="switch"><input type="checkbox" ${typeSlackSettings['all'] === true ? 'checked' : ''} onchange="toggleTypeSlackSetting('all', this.checked)"><span class="slider"></span></label>`;
    c.appendChild(rAll);

    [...new Set(categories.map(ca => ca.type || "一般"))].forEach(t => {
        const r = document.createElement('div'); r.className = 'type-slack-row';
        r.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span>${getTypeIcon(t)}</span><strong>${escapeHtml(t)}</strong></div><label class="switch"><input type="checkbox" ${isSlackEnabledForType(t) ? 'checked' : ''} onchange="toggleTypeSlackSetting('${escapeHtml(t)}', this.checked)"><span class="slider"></span></label>`;
        c.appendChild(r);
    });
}
function toggleTypeSlackSetting(t, chk) { 
    typeSlackSettings[t] = chk; 
    saveTypeSlackSettings();
    renderRightCards();
}

function renderTypeNotebookSettingsList() {
    const c = document.getElementById('typeNotebookSettingsList'); c.innerHTML = "";
    const rAll = document.createElement('div'); rAll.className = 'type-slack-row';
    rAll.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span>🌐</span><strong>すべて表示 (All)</strong></div><label class="switch"><input type="checkbox" ${typeNotebookSettings['all'] !== false ? 'checked' : ''} onchange="toggleTypeNotebookSetting('all', this.checked)"><span class="slider"></span></label>`;
    c.appendChild(rAll);

    [...new Set(categories.map(ca => ca.type || "一般"))].forEach(t => {
        const r = document.createElement('div'); r.className = 'type-slack-row';
        r.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span>${getTypeIcon(t)}</span><strong>${escapeHtml(t)}</strong></div><label class="switch"><input type="checkbox" ${typeNotebookSettings[t] !== false ? 'checked' : ''} onchange="toggleTypeNotebookSetting('${escapeHtml(t)}', this.checked)"><span class="slider"></span></label>`;
        c.appendChild(r);
    });
}
function toggleTypeNotebookSetting(t, chk) {
    typeNotebookSettings[t] = chk; 
    saveTypeNotebookSettings();
    if (calendarScope === 'notebooks' && !isNotebookEnabledForCurrentFilter()) setCalendarScope('day');
    else { updateScopeButtonsUI(); updateViewScopeModalUI(); }
}

function renderSettingsCategoryList() {
    const c = document.getElementById('settingsCategoryList'); c.innerHTML = ""; document.getElementById('catCountIndicator').textContent = `${categories.length}/30`;
    categories.forEach((cat, i) => {
        const r = document.createElement('div'); r.className = 'category-manage-item';
        r.innerHTML = `<span class="category-manage-name">${escapeHtml(cat.name)}</span><div style="display: flex; align-items: center; gap: 6px;"><select class="category-item-type-select" onchange="updateCategoryType(${i}, this.value)"><option value="研究管理" ${cat.type === '研究管理' ? 'selected' : ''}>研究管理</option><option value="ログ" ${cat.type === 'ログ' ? 'selected' : ''}>ログ</option><option value="一般" ${(cat.type || '一般') === '一般' ? 'selected' : ''}>一般</option></select>${categories.length > 1 ? `<button class="category-manage-del-btn" onclick="deleteCategory(${i})">削除</button>` : ''}</div>`;
        c.appendChild(r);
    });
}
function updateCategoryType(i, t) { 
    if (!categories[i]) return; 
    categories[i].type = t; 
    saveCategories(); 
    renderTypeSlackSettingsList(); 
    renderTypeNotebookSettingsList();
    renderRightCards(); 
    if (sidebarMode === 'cal') updateSidebars(); 
}
function addNewCategory() {
    if (categories.length >= 30) { alert("最大30件までです。"); return; }
    const n = document.getElementById('newCatName').value.trim(); const t = document.getElementById('newCatType').value;
    if (!n) { alert("カテゴリ名を入力してください。"); return; }
    if (categories.some(c => c.name === n)) { alert("同名が存在します。"); return; }
    categories.push({ name: n, type: t }); saveCategories(); document.getElementById('newCatName').value = "";
    renderSettingsCategoryList(); renderTypeSlackSettingsList(); renderTypeNotebookSettingsList();
}
function deleteCategory(i) {
    const t = categories[i]; if (!confirm(`「${t.name}」を削除しますか？`)) return;
    categories.splice(i, 1); saveCategories();
    if (currentFilter.mode === 'category' && currentFilter.value === t.name) { currentFilter = { mode: 'all', value: '' }; updateCategoryButtonUI(); }
    else if (currentFilter.mode === 'type' && !categories.some(c => (c.type || "一般") === currentFilter.value)) { currentFilter = { mode: 'all', value: '' }; updateCategoryButtonUI(); }
    renderSettingsCategoryList(); renderTypeSlackSettingsList(); renderTypeNotebookSettingsList();
    renderRightCards(); if (sidebarMode === 'cal') updateSidebars();
}

function openSearchModal() { document.getElementById('searchInput').value = ""; document.getElementById('searchResultsContainer').innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px;">キーワードを入力してください</div>`; openModal('searchModal'); setTimeout(() => document.getElementById('searchInput').focus(), 200); }
function handleSearchInput() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase(); const c = document.getElementById('searchResultsContainer'); c.innerHTML = "";
    if (!q) { c.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px;">キーワードを入力してください</div>`; return; }
    let ms = [];
    Object.keys(journalData).forEach(d => journalData[d].forEach(l => {
        const sT = l.slackType || (l.isSlack ? 'incoming' : null);
        if (l.text.toLowerCase().includes(q) || (l.category || "").toLowerCase().includes(q) || getLogCategoryType(l.category || "").toLowerCase().includes(q) || (sT === 'incoming' && "受信slack相手".includes(q)) || (sT === 'outgoing' && "送信slack自分".includes(q))) {
            ms.push({ date: d, time: l.time, text: l.text, category: l.category || "ライフログ", slackType: sT });
        }
    }));
    if (!ms.length) { c.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 20px;">見つかりませんでした</div>`; return; }
    ms.sort((a, b) => b.date.localeCompare(a.date)).forEach(m => {
        const i = document.createElement('div'); i.className = 'search-result-item';
        let b = `<span class="log-category-badge">${escapeHtml(m.category)}</span>`;
        if (m.slackType === 'incoming') b = `<span class="slack-direction-badge incoming"><span>📥</span><span>相手から</span></span> ` + b;
        else if (m.slackType === 'outgoing') b = `<span class="slack-direction-badge outgoing"><span>📤</span><span>自分から</span></span> ` + b;
        i.innerHTML = `<div class="search-result-header"><span>${m.date} (${m.time})</span><div style="display: flex; gap: 4px; align-items: center;">${b}</div></div><div class="search-result-text">${escapeHtml(m.text)}</div>`;
        i.onclick = () => { jumpToDayFromTimeline(m.date); closeModal('searchModal'); }; c.appendChild(i);
    });
}

function generateDayHtmlDocument(dStr, logs) {
    const p = dStr.split('-'); const d = new Date(p[0], p[1]-1, p[2]);
    const fd = `${parseInt(p[0], 10)}年${parseInt(p[1], 10)}月${parseInt(p[2], 10)}日 (${['日','月','火','水','木','金','土'][d.getDay()]})`;
    let h = "";
    logs.forEach(l => {
        const imgs = Array.isArray(l.images) ? l.images : (l.image ? [l.image] : []);
        let ih = imgs.length > 0 ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">` + imgs.map(i => `<img src="${i}" style="width:80px; height:80px; object-fit:cover; border-radius:10px; border:1px solid rgba(128,128,128,0.2);">`).join('') + `</div>` : "";
        const sT = l.slackType || (l.isSlack ? 'incoming' : null); let cH = "";
        if (sT === 'incoming') cH = `<div style="background: rgba(175, 82, 222, 0.06); border-radius: 12px; padding: 12px 14px; margin-top: 4px;"><div style="font-size: 11px; font-weight: 700; color: #af52de; margin-bottom: 4px;">💬 ${escapeHtml(l.category || 'ライフログ')} からのメッセージ</div><div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap; word-break: break-all;">${parseLinksAndText(l.text)}</div></div>`;
        else if (sT === 'outgoing') cH = `<div style="background: rgba(41, 151, 255, 0.06); border-radius: 12px; padding: 12px 14px; margin-top: 4px;"><div style="font-size: 11px; font-weight: 700; color: #2997ff; margin-bottom: 4px;">💬 あなた → ${escapeHtml(l.category || 'ライフログ')} への送信</div><div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap; word-break: break-all;">${parseLinksAndText(l.text)}</div></div>`;
        else cH = `<div class="content">${parseLinksAndText(l.text)}</div>`;
        h += `<div class="log-item"><div style="display:flex; gap:6px; align-items:center;"><span class="time">${l.time}</span><span class="cat">${escapeHtml(l.category || 'ライフログ')}</span></div>${cH}${ih}</div>`;
    });
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${fd} - Daily Journal</title><style>:root { color-scheme: light dark; --bg: #08080a; --card-bg: #121215; --item-bg: #1a1a1f; --border: rgba(255, 255, 255, 0.08); --text-primary: #ffffff; --text-secondary: #98989f; --accent: #2997ff; --accent-soft: rgba(41, 151, 255, 0.15); } @media (prefers-color-scheme: light) { :root { --bg: #f2f2f7; --card-bg: #ffffff; --item-bg: #f8f8fa; --border: rgba(0, 0, 0, 0.08); --text-primary: #1c1c1e; --text-secondary: #8e8e93; --accent: #007aff; --accent-soft: rgba(0, 122, 255, 0.12); } } * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; } body { background-color: var(--bg); color: var(--text-primary); padding: 30px 16px; display: flex; justify-content: center; } .container { width: 100%; max-width: 640px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 24px; padding: 28px; } header { margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 16px; } .eyebrow { font-size: 13px; font-weight: 700; color: var(--accent); letter-spacing: 0.5px; } h1 { font-size: 24px; font-weight: 700; margin-top: 4px; } .log-list { display: flex; flex-direction: column; gap: 14px; } .log-item { background: var(--item-bg); border: 1px solid var(--border); border-radius: 16px; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; } .time { font-size: 12px; font-weight: 700; color: var(--accent); background: var(--accent-soft); padding: 2px 8px; border-radius: 8px; } .cat { font-size: 11px; font-weight: 700; background: rgba(128,128,128,0.2); padding: 2px 8px; border-radius: 8px; } .content { font-size: 16px; line-height: 1.5; white-space: pre-wrap; word-break: break-all; } .journal-link { color: var(--accent); text-decoration: none; font-weight: 600; padding: 1px 6px; margin: 0 2px; background: var(--accent-soft); border-radius: 6px; display: inline-flex; align-items: center; gap: 3px; word-break: break-all; }</style></head><body><div class="container"><header><div class="eyebrow">${dStr}</div><h1>${fd}</h1></header><div class="log-list">${h}</div></div></body></html>`;
}

async function exportHtmlFiles() {
    const rd = Object.keys(journalData).filter(d => Array.isArray(journalData[d]) && journalData[d].length > 0);
    if (!rd.length) { alert("出力する記録データがありません。"); return; }
    if ('showDirectoryPicker' in window) {
        try {
            const dh = await window.showDirectoryPicker(); let c = 0;
            for (const d of rd) { const fh = await dh.getFileHandle(d.replace(/-/g, '') + '.html', { create: true }); const w = await fh.createWritable(); await w.write(generateDayHtmlDocument(d, journalData[d])); await w.close(); c++; }
            alert(`${c} 件の日付別HTMLを出力しました！`); closeModal('settingsModal');
        } catch (e) { if (e.name !== 'AbortError') alert("保存中にエラーが発生しました。"); }
    } else {
        try {
            const z = new JSZip(); rd.forEach(d => z.file(d.replace(/-/g, '') + '.html', generateDayHtmlDocument(d, journalData[d])));
            const b = await z.generateAsync({ type: "blob" }); const a = document.createElement('a'); a.href = URL.createObjectURL(b);
            const n = new Date(); a.download = `journal_html_${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}.zip`;
            document.body.appendChild(a); a.click(); a.remove(); alert(`ZIPファイルとして保存しました。`); closeModal('settingsModal');
        } catch (e) { alert("HTMLの作成に失敗しました。"); }
    }
}

function exportData() {
    const p = { categories, typeSlackSettings, typeNotebookSettings, hideEmptyCards, journalData, notebookData };
    const a = document.createElement('a'); a.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(p, null, 2)));
    const n = new Date(); a.setAttribute("download", `journal_backup_${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}.json`);
    document.body.appendChild(a); a.click(); a.remove();
}

function triggerImport() { document.getElementById('importFile').click(); }
function importData(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async function(ev) {
        try {
            const imp = JSON.parse(ev.target.result);
            if (typeof imp === 'object' && imp !== null) {
                if (confirm("既存のデータにインポートしたデータを統合・復元しますか？")) {
                    if (imp.categories && Array.isArray(imp.categories)) { categories = imp.categories; saveCategories(); }
                    if (imp.typeSlackSettings) { typeSlackSettings = imp.typeSlackSettings; saveTypeSlackSettings(); }
                    if (imp.typeNotebookSettings) { typeNotebookSettings = imp.typeNotebookSettings; saveTypeNotebookSettings(); }
                    if (typeof imp.hideEmptyCards === 'boolean') { hideEmptyCards = imp.hideEmptyCards; localStorage.setItem('daily_journal_hide_empty', hideEmptyCards); applyHideEmptyCardsSetting(); }
                    
                    if (imp.notebookData && Array.isArray(imp.notebookData)) { notebookData = imp.notebookData; await saveNotebookData(); }
                    
                    journalData = imp.journalData || imp; 
                    
                    await syncAndMigrateCategories(); 
                    await saveJournalData(); 
                    
                    Object.keys(journalData).forEach(d => { if (!dateList.includes(d)) dateList.push(d); }); dateList.sort();
                    calendarScope = 'day'; renderRightCards(); alert("データのインポートが完了しました！"); closeModal('settingsModal');
                }
            } else alert("無効なファイル形式です。");
        } catch (err) { alert("JSONファイルの解析に失敗しました。"); }
        e.target.value = "";
    };
    r.readAsText(f);
}

let scrollTimer = null;
document.getElementById('journalCarouselContainer').addEventListener('scroll', () => {
    if (isProgrammaticScroll) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        if (isProgrammaticScroll) return;
        const c = document.getElementById('journalCarouselContainer'); const w = c.clientWidth; if (!w) return;
        const pnl = c.querySelectorAll('.card-carousel-panel')[Math.round(c.scrollLeft / w)];
        if (pnl && pnl.dataset.key) {
            const k = pnl.dataset.key;
            if (calendarScope === 'notebooks') {
                if (k.startsWith('notebook_')) {
                    const id = k.replace('notebook_', '');
                    const filtered = notebookData.filter(n => matchesCurrentFilter(n));
                    const idx = filtered.findIndex(n => n.id === id);
                    if (idx !== -1) {
                        currentNotebookIndex = idx;
                        if (sidebarMode === 'cal') renderNotebookSidebar();
                    }
                }
            } else if (calendarScope === 'day') { 
                activeDateKey = k;
                lastJournalDateKey = k;
                const p = k.split('-'); miniCalYear = parseInt(p[0], 10); miniCalMonth = parseInt(p[1], 10) - 1; 
            } else if (calendarScope === 'photo') {
                lastPhotoPanelKey = k;
                const dStr = pnl.dataset.date;
                if (dStr) { 
                    activeDateKey = dStr; 
                    lastJournalDateKey = dStr;
                    const p = dStr.split('-'); miniCalYear = parseInt(p[0], 10); miniCalMonth = parseInt(p[1], 10) - 1; 
                }
            } else if (calendarScope === 'week') {
                if (!isDateInWeek(activeDateKey, k)) {
                    const pD = new Date(activeDateKey.replace(/-/g, '/')); const mD = new Date(k.replace(/-/g, '/'));
                    mD.setDate(mD.getDate() + (pD.getDay() === 0 ? 6 : pD.getDay() - 1));
                    activeDateKey = `${mD.getFullYear()}-${String(mD.getMonth() + 1).padStart(2, '0')}-${String(mD.getDate()).padStart(2, '0')}`;
                }
                lastJournalDateKey = activeDateKey;
                const p = activeDateKey.split('-'); miniCalYear = parseInt(p[0], 10); miniCalMonth = parseInt(p[1], 10) - 1;
            } else if (calendarScope === 'month') {
                if (activeDateKey.substring(0, 7) !== k) {
                    const [nY, nM] = k.split('-').map(v => parseInt(v, 10)); const prevD = parseInt(activeDateKey.split('-')[2], 10);
                    activeDateKey = `${k}-${String(Math.min(prevD, new Date(nY, nM, 0).getDate())).padStart(2, '0')}`;
                }
                lastJournalDateKey = activeDateKey;
                const p = activeDateKey.split('-'); miniCalYear = parseInt(p[0], 10); miniCalMonth = parseInt(p[1], 10) - 1;
            }
            if (sidebarMode === 'cal' && calendarScope !== 'notebooks') { renderMiniCalendar(); updateJumpButtonLabel(); }
        }
    }, 60);
}, { passive: true });