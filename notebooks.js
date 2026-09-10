// ==========================================
// notebooks.js (ノートブック管理に関する関数群)
// ==========================================

let notebookSearchQuery = "";
let currentActiveEditorNotebookId = null;

// 右サイドバー（Linked Notes）の表示・非表示フラグ
let isRightSidebarOpen = true;

// ステータスフィルター状態: 'all', 'active', 'permanent', 'archive', 'trash'
let currentNotebookStatusFilter = 'all';

// 関連ノートリンクモーダル用ステート
let currentLinkingNotebookId = null;
let tempSelectedLinkIds = new Set();
let linkModalSearchQuery = "";

// ノートエクスポート用ステート
let currentExportingNotebookId = null;

// Graph View (Canvas) 用ステート
let graphAnimId = null;
let graphNodes = [];
let graphEdges = [];
let draggedNode = null;
let hoveredNode = null;
let graphPointerStart = { x: 0, y: 0 };
let isGraphDragMoved = false;

function isNotebookEnabledForCurrentFilter() {
    if (currentFilter.mode === 'all') {
        return typeNotebookSettings['all'] !== false;
    } else if (currentFilter.mode === 'type') {
        return typeNotebookSettings[currentFilter.value] !== false;
    } else if (currentFilter.mode === 'category') {
        const t = getLogCategoryType(currentFilter.value);
        return typeNotebookSettings[t] !== false;
    }
    return true;
}

// 検索語句・カテゴリフィルター・ステータスフィルターに合致するノートを抽出（Active → Permanent → Archive 順に整列）
function getFilteredNotebooks() {
    const q = (notebookSearchQuery || '').trim().toLowerCase();
    const statusPriority = {
        active: 1,
        permanent: 2,
        archive: 3,
        trash: 4
    };

    const list = notebookData.filter(n => {
        if (!matchesCurrentFilter(n)) return false;

        const noteStatus = n.status || 'archive';
        
        // ゴミ箱ビュー選択時は trash のみを表示
        if (currentNotebookStatusFilter === 'trash') {
            if (noteStatus !== 'trash') return false;
        } else {
            // 通常時は trash を除外
            if (noteStatus === 'trash') return false;
            // 特定ステータス絞り込み時
            if (currentNotebookStatusFilter !== 'all' && noteStatus !== currentNotebookStatusFilter) {
                return false;
            }
        }

        if (!q) return true;

        const titleText = (n.title || '').toLowerCase();
        const contentText = stripHtml(n.content || '').toLowerCase();
        const categoryText = (n.category || '').toLowerCase();

        return titleText.includes(q) || contentText.includes(q) || categoryText.includes(q);
    });

    // 優先度（Active → Permanent → Archive）順にソートし、同ステータス内は更新日時順に並べる
    list.sort((a, b) => {
        const pA = statusPriority[a.status || 'archive'] || 99;
        const pB = statusPriority[b.status || 'archive'] || 99;
        if (pA !== pB) return pA - pB;
        const dateA = a.updatedAt || a.createdAt || '';
        const dateB = b.updatedAt || b.createdAt || '';
        return dateB.localeCompare(dateA);
    });

    return list;
}

function setNotebookStatusFilter(status) {
    currentNotebookStatusFilter = status;
    currentNotebookIndex = 0;
    renderNotebookSidebar();
    renderRightCards();
}

function renderNotebookSidebar() {
    const modes = [
        { id: 'nb-nav-grid', mode: 'grid' },
        { id: 'nb-nav-linked', mode: 'card' },
        { id: 'nb-nav-local-graph', mode: 'local-graph' },
        { id: 'nb-nav-graph', mode: 'graph' }
    ];

    modes.forEach(m => {
        const el = document.getElementById(m.id);
        if (!el) return;
        const isActive = (notebookViewMode === m.mode || (m.mode === 'card' && notebookViewMode === 'linked'));
        el.className = `todo-nav-item ${isActive ? 'active' : ''}`;
        el.style.backgroundColor = isActive ? 'var(--notebook-soft)' : 'transparent';
        el.style.borderColor = isActive ? 'rgba(48, 209, 88, 0.3)' : 'transparent';
        const txt = el.querySelector('.todo-nav-text');
        if (txt) txt.style.color = isActive ? 'var(--notebook-color)' : '';
    });

    ['all', 'active', 'permanent', 'archive', 'trash'].forEach(st => {
        const btn = document.getElementById(`nbStatus_${st}`);
        if (btn) btn.classList.toggle('active', currentNotebookStatusFilter === st);
    });

    const searchInput = document.getElementById('notebookSearchInput');
    const clearBtn = document.getElementById('notebookSearchClearBtn');
    if (searchInput) searchInput.value = notebookSearchQuery;
    if (clearBtn) clearBtn.classList.toggle('active', !!notebookSearchQuery);
}

function handleNotebookSearchInput(e) {
    notebookSearchQuery = e.target.value;
    const clearBtn = document.getElementById('notebookSearchClearBtn');
    if (clearBtn) clearBtn.classList.toggle('active', !!notebookSearchQuery);

    currentNotebookIndex = 0;
    renderRightCards();
}

function clearNotebookSearch() {
    notebookSearchQuery = "";
    const searchInput = document.getElementById('notebookSearchInput');
    const clearBtn = document.getElementById('notebookSearchClearBtn');
    if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
    }
    if (clearBtn) clearBtn.classList.remove('active');

    currentNotebookIndex = 0;
    renderRightCards();
}

function setNotebookViewMode(mode) {
    if (graphAnimId) {
        cancelAnimationFrame(graphAnimId);
        graphAnimId = null;
    }
    triggerSmoothViewSwitch(() => {
        notebookViewMode = (mode === 'linked') ? 'card' : mode;
        if (sidebarMode === 'cal') renderNotebookSidebar();
        renderRightCards();
    });
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function openNotebookLinked(id) {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;

    let filteredNotebooks = getFilteredNotebooks();
    let idx = filteredNotebooks.findIndex(n => n.id === id);

    if (idx === -1) {
        notebookSearchQuery = "";
        currentNotebookStatusFilter = 'all';
        const searchInput = document.getElementById('notebookSearchInput');
        if (searchInput) searchInput.value = "";
        if (currentFilter.mode !== 'all') {
            currentFilter = { mode: 'all', value: '' };
            updateCategoryButtonUI();
        }
        filteredNotebooks = getFilteredNotebooks();
        idx = filteredNotebooks.findIndex(n => n.id === id);
    }

    if (idx !== -1) {
        currentNotebookIndex = idx;
    }

    if (notebookViewMode !== 'card' && notebookViewMode !== 'linked') {
        setNotebookViewMode('card');
    } else {
        const scroller = document.getElementById('connectedCenterScroller');
        const cardSlide = scroller ? scroller.querySelector(`[data-id="${id}"]`) : null;
        
        if (cardSlide && scroller) {
            scroller.scrollTo({ left: cardSlide.offsetLeft, behavior: 'auto' });
            const targetNote = notebookData.find(n => n.id === id);
            if (targetNote) updateConnectedRightSidebar(targetNote);
        } else {
            renderRightCards();
        }
    }
}

function renderNotebookCarousel() {
    const container = document.getElementById('journalCarouselContainer');
    container.innerHTML = "";
    container.classList.remove('grid-mode-active');
    
    if (graphAnimId) {
        cancelAnimationFrame(graphAnimId);
        graphAnimId = null;
    }

    const filterBadgeHtml = getActiveFilterBadgeHtml();
    const filteredNotebooks = getFilteredNotebooks();
    const q = (notebookSearchQuery || '').trim();

    if (filteredNotebooks.length === 0 && notebookViewMode !== 'graph' && notebookViewMode !== 'local-graph') {
        let emptyMsg = 'ノートがありません';
        if (q) emptyMsg = `「${escapeHtml(q)}」に一致するノートはありません`;
        else if (currentNotebookStatusFilter === 'trash') emptyMsg = 'ゴミ箱は空です';
        else if (currentNotebookStatusFilter !== 'all') emptyMsg = `${currentNotebookStatusFilter.toUpperCase()} のノートはありません`;

        const panel = document.createElement('div');
        panel.className = 'card-carousel-panel';
        panel.innerHTML = `
            <div class="main-display" style="--tab-color: var(--notebook-color);">
                <div class="display-header compact-header">
                    <div class="date-title-wrapper">
                        <span class="date-eyebrow" style="color: var(--notebook-color);">NOTEBOOKS</span>
                        <h1 class="date-title">📔 ノートブック</h1>
                    </div>
                    <div class="header-actions">${filterBadgeHtml}</div>
                </div>
                <div class="empty-state">
                    <span style="font-size: 32px;">${currentNotebookStatusFilter === 'trash' ? '🗑️' : '🔍'}</span>
                    <span style="font-size: 15px; font-weight: 600; margin-top: 8px;">${emptyMsg}</span>
                    <span style="font-size: 13px; opacity: 0.7;">${q ? '検索キーワードを変更してください' : '下部の「＋」ボタンから追加できます'}</span>
                </div>
            </div>
        `;
        container.appendChild(panel);
        return;
    }

    if (notebookViewMode === 'grid') {
        renderGridMode(container, filteredNotebooks, filterBadgeHtml);
    } else if (notebookViewMode === 'card' || notebookViewMode === 'linked' || notebookViewMode === 'single') {
        renderCardViewMode(container, filteredNotebooks, filterBadgeHtml);
    } else if (notebookViewMode === 'graph') {
        renderGraphMode(container, filterBadgeHtml, false);
    } else if (notebookViewMode === 'local-graph') {
        renderGraphMode(container, filterBadgeHtml, true);
    }
}

// カードのDOM要素を生成する共通ヘルパー
function createNotebookCardElement(n) {
    const card = document.createElement('div');
    card.className = 'notebook-grid-card';
    card.onclick = () => openNotebookLinked(n.id);
    
    const catClass = getCategoryTypeClass(n.category || 'ライフログ');
    const showCat = (currentFilter.mode === 'all' || currentFilter.mode === 'type');
    const catBadgeHtml = showCat ? `<span class="log-category-badge ${catClass}" style="font-size: 10px; padding: 2px 6px;">${escapeHtml(n.category || 'ライフログ')}</span>` : '';
    const statusBadgeHtml = buildStatusBadgeHtml(n.status || 'archive');
    const rawContent = (n.content && n.content.trim()) ? n.content : '<span style="opacity:0.4;">(空のノート)</span>';
    
    card.innerHTML = `
        <h3 class="notebook-grid-title">${escapeHtml(n.title || '無題のノート')}</h3>
        <div class="notebook-grid-preview">${rawContent}</div>
        <div class="notebook-grid-meta" style="justify-content: flex-end; gap: 6px;">
            ${statusBadgeHtml}
            ${catBadgeHtml}
        </div>
    `;
    return card;
}

// ==========================================
// 1. Gallery View (Active → Permanent → Archive 順にグループ表示、空セクションは自動スキップ)
// ==========================================
function renderGridMode(container, filteredNotebooks, filterBadgeHtml) {
    container.classList.add('grid-mode-active');
    
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'notebook-grid-wrapper';
    
    const gridHeader = document.createElement('div');
    gridHeader.className = 'display-header compact-header';
    gridHeader.style.alignItems = 'flex-start';
    gridHeader.innerHTML = `
        <div class="date-title-wrapper" style="width: 100%;">
            <span class="date-eyebrow" style="color: var(--notebook-color); margin-bottom: 4px;">NOTEBOOKS</span>
            <h1 class="date-title">Gallery View</h1>
        </div>
        <div class="header-actions" style="margin-top: 2px;">
            ${filterBadgeHtml}
            <span class="header-badge" style="background: var(--notebook-color); color: #fff;">${filteredNotebooks.length} 冊</span>
        </div>
    `;
    gridWrapper.appendChild(gridHeader);

    const gridLogsContainer = document.createElement('div');
    gridLogsContainer.className = 'logs-container-wrapper';
    gridLogsContainer.style.padding = '10px 4px';

    const groupsContainer = document.createElement('div');
    groupsContainer.className = 'nb-status-groups-container';

    // 表示するステータスグループの定義（ゴミ箱選択時は Trash のみ、通常時は Active → Permanent → Archive）
    const sectionDefs = currentNotebookStatusFilter === 'trash'
        ? [{ key: 'trash', label: 'Trash', titleColor: 'trash' }]
        : [
            { key: 'active', label: 'Active', titleColor: 'active' },
            { key: 'permanent', label: 'Permanent', titleColor: 'permanent' },
            { key: 'archive', label: 'Archive', titleColor: 'archive' }
        ];

    const colsClass = (galleryColumns === '3' || galleryColumns === '4' || galleryColumns === '5') ? `cols-${galleryColumns}` : 'cols-auto';

    sectionDefs.forEach(sec => {
        // 左サイドバーでのステータスフィルター（All 以外）の選択に連動
        if (currentNotebookStatusFilter !== 'all' && currentNotebookStatusFilter !== sec.key) {
            return;
        }

        const notesInSec = filteredNotebooks.filter(n => (n.status || 'archive') === sec.key);

        // ノートが0件のグループはヘッダーごと非表示にしてスキップ
        if (notesInSec.length === 0) {
            return;
        }

        const groupDiv = document.createElement('div');
        groupDiv.className = 'nb-status-group';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'nb-status-section-header';
        headerDiv.innerHTML = `
            <div class="nb-status-section-title-wrap">
                <span class="nb-status-dot ${sec.titleColor}"></span>
                <span class="nb-status-section-title ${sec.titleColor}">${sec.label}</span>
            </div>
            <span class="nb-status-section-count ${sec.titleColor}">${notesInSec.length}</span>
        `;
        groupDiv.appendChild(headerDiv);

        const groupGrid = document.createElement('div');
        groupGrid.className = `notebook-grid-container ${colsClass}`;
        notesInSec.forEach(n => {
            groupGrid.appendChild(createNotebookCardElement(n));
        });
        groupDiv.appendChild(groupGrid);

        groupsContainer.appendChild(groupDiv);
    });

    gridLogsContainer.appendChild(groupsContainer);
    gridWrapper.appendChild(gridLogsContainer);
    container.appendChild(gridWrapper);
}

// ==========================================
// 2. Card View (中央カルーセル ＋ 右サイドバー形式)
// ==========================================
function renderCardViewMode(container, filteredNotebooks, filterBadgeHtml) {
    if (currentNotebookIndex >= filteredNotebooks.length) {
        currentNotebookIndex = 0;
    }

    const connectedWrapper = document.createElement('div');
    connectedWrapper.className = `connected-view-container ${isRightSidebarOpen ? '' : 'hide-right-sidebar'}`;

    const centerArea = document.createElement('div');
    centerArea.className = 'connected-center-carousel';
    centerArea.id = 'connectedCenterScroller';

    filteredNotebooks.forEach((n, idx) => {
        const catClass = getCategoryTypeClass(n.category || 'ライフログ');
        const showCat = (currentFilter.mode === 'all' || currentFilter.mode === 'type');
        const catBadge = showCat ? `<span class="log-category-badge ${catClass}" style="width: fit-content;">${escapeHtml(n.category || 'ライフログ')}</span>` : '';
        const hasLinks = Array.isArray(n.linkedNoteIds) && n.linkedNoteIds.length > 0;
        const linkCount = hasLinks ? n.linkedNoteIds.length : 0;
        const noteStatus = n.status || 'archive';

        const cardPanel = document.createElement('div');
        cardPanel.className = 'connected-card-slide';
        cardPanel.dataset.id = n.id;
        cardPanel.dataset.index = idx;

        const isTrash = noteStatus === 'trash';
        const trashActionsHtml = isTrash ? `
            <button class="log-edit-btn" onclick="restoreNotebookFromTrash('${n.id}')" style="padding: 5px 8px; color: var(--accent-color); font-size: 11px; font-weight: 700;" title="ゴミ箱から復元">↺ 復元</button>
            <button class="log-edit-btn" onclick="purgeNotebookPermanent('${n.id}')" style="padding: 5px 8px; color: var(--reset-btn-bg); font-size: 11px; font-weight: 700;" title="完全に削除">✕ 完全削除</button>
        ` : '';

        cardPanel.innerHTML = `
            <div class="main-display" style="--tab-color: var(--notebook-color);">
                <div class="display-header compact-header" style="align-items: flex-start;">
                    <div class="date-title-wrapper" style="width: 100%;">
                        <span class="date-eyebrow" style="color: var(--notebook-color); margin-bottom: 4px;">NOTEBOOKS</span>
                        ${buildNotebookTitleHtml(n)}
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
                            ${buildStatusSelectHtml(n.id, noteStatus)}
                            ${catBadge}
                        </div>
                    </div>
                    <div class="header-actions" style="margin-top: 2px;">
                        ${filterBadgeHtml}
                        ${trashActionsHtml}
                        ${!isTrash ? `
                            <button class="log-edit-btn" onclick="openLinkNotebookModal('${n.id}')" style="padding: 6px; ${hasLinks ? 'color: var(--notebook-color); opacity: 0.9;' : ''}" title="関連ノートをリンク (${linkCount}件)">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                </svg>
                            </button>
                            <button class="log-edit-btn" onclick="openExportNotebookModal('${n.id}')" style="padding: 6px;" title="このノートをエクスポート (HTML / PDF)">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7 10 12 15 17 10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            </button>
                            <button class="log-edit-btn" onclick="enableNotebookEdit('${n.id}', 'content')" style="margin-right: 4px; padding: 6px;" title="このノートを編集">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        ` : ''}
                        <span class="header-badge" style="background: var(--notebook-color); color: #fff;">${idx + 1} / ${filteredNotebooks.length}</span>
                    </div>
                </div>
                <div class="logs-container-wrapper" id="nb_logs_wrapper_${n.id}" style="padding: 4px 2px;">
                    ${buildNotebookContentHtml(n)}
                </div>
            </div>
        `;
        centerArea.appendChild(cardPanel);
    });

    const sidebarArea = document.createElement('div');
    sidebarArea.className = 'connected-right-sidebar';
    sidebarArea.id = 'connectedRightSidebar';

    connectedWrapper.appendChild(centerArea);
    connectedWrapper.appendChild(sidebarArea);
    container.appendChild(connectedWrapper);

    updateConnectedRightSidebar(filteredNotebooks[currentNotebookIndex]);
    setupConnectedSwipeListener(centerArea, filteredNotebooks);

    requestAnimationFrame(() => {
        const targetPanel = centerArea.children[currentNotebookIndex];
        if (targetPanel) {
            centerArea.scrollLeft = targetPanel.offsetLeft;
        }
    });
}

let connectedSwipeTimer = null;
function setupConnectedSwipeListener(scroller, filteredNotebooks) {
    scroller.addEventListener('scroll', () => {
        clearTimeout(connectedSwipeTimer);
        connectedSwipeTimer = setTimeout(() => {
            const w = scroller.clientWidth;
            if (!w) return;
            const newIndex = Math.round(scroller.scrollLeft / w);
            if (newIndex >= 0 && newIndex < filteredNotebooks.length) {
                if (currentNotebookIndex !== newIndex) {
                    currentNotebookIndex = newIndex;
                    updateConnectedRightSidebar(filteredNotebooks[currentNotebookIndex]);
                }
            }
        }, 60);
    }, { passive: true });
}

function updateConnectedRightSidebar(currentNote) {
    const sidebarEl = document.getElementById('connectedRightSidebar');
    if (!sidebarEl || !currentNote) return;

    const hasLinks = Array.isArray(currentNote.linkedNoteIds) && currentNote.linkedNoteIds.length > 0;
    const linkedNotes = [];
    
    if (hasLinks) {
        currentNote.linkedNoteIds.forEach(lid => {
            const found = notebookData.find(n => n.id === lid && n.status !== 'trash');
            if (found) linkedNotes.push(found);
        });
    }

    let sideCardsHtml = "";
    if (linkedNotes.length > 0) {
        linkedNotes.forEach(ln => {
            const cClass = getCategoryTypeClass(ln.category || 'ライフログ');
            const showCat = (currentFilter.mode === 'all' || currentFilter.mode === 'type');
            const catBadgeHtml = showCat ? `<span class="log-category-badge ${cClass}" style="font-size: 10px; padding: 2px 6px;">${escapeHtml(ln.category || 'ライフログ')}</span>` : '';
            const statusBadgeHtml = buildStatusBadgeHtml(ln.status || 'archive');
            const rawContent = (ln.content && ln.content.trim()) ? ln.content : '<span style="opacity:0.4;">(空のノート)</span>';
            
            const unlinkBtnHtml = window.IS_READONLY_MODE ? '' : `<button class="nb-unlink-btn" onclick="unlinkNotebook('${currentNote.id}', '${ln.id}', event)" title="このノートとのリンクを解除">✕ 解除</button>`;

            sideCardsHtml += `
                <div class="connected-side-card-item notebook-grid-card" onclick="openNotebookLinked('${ln.id}')" title="クリックしてこのノートを中央に表示">
                    <h3 class="notebook-grid-title">${escapeHtml(ln.title || '無題のノート')}</h3>
                    <div class="notebook-grid-preview">${rawContent}</div>
                    <div class="notebook-grid-meta">
                        <div>${unlinkBtnHtml}</div>
                        <div style="display: flex; gap: 4px; align-items: center;">${statusBadgeHtml}${catBadgeHtml}</div>
                    </div>
                </div>
            `;
        });
    } else {
        sideCardsHtml = `
            <div class="connected-side-empty">
                <span>🔗 リンクされたノートはありません</span>
            </div>
        `;
    }

    sidebarEl.innerHTML = `
        <div class="connected-side-sidebar-header">
            <div class="connected-side-title-area">
                <span>🔗 LINKED NOTES</span>
                <span class="connected-side-count">${linkedNotes.length}</span>
            </div>
            <div class="connected-side-actions">
                <button type="button" class="nb-tool-btn" onclick="openLinkNotebookModal('${currentNote.id}')" style="font-size: 11px; height: 24px; padding: 0 8px;">＋ リンク</button>
                <button type="button" class="connected-side-close-btn" onclick="toggleRightSidebar(false)" title="右サイドバーを閉じる">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="connected-side-scroller">
            ${sideCardsHtml}
        </div>
    `;
}

// エレガントなステータスバッジビルダー (Permanent: 緑, Active: 青, Archive: グレー, Trash: 赤)
function buildStatusBadgeHtml(status) {
    const map = {
        permanent: { label: 'Permanent', cls: 'status-permanent' },
        active: { label: 'Active', cls: 'status-active' },
        archive: { label: 'Archive', cls: 'status-archive' },
        trash: { label: 'Trash', cls: 'status-trash' }
    };
    const s = map[status] || map.archive;
    return `<span class="nb-status-pill ${s.cls}">${s.label}</span>`;
}

// 矢印・絵文字なしのプレーンなステータスセレクター
function buildStatusSelectHtml(id, currentStatus) {
    return `
        <select class="nb-status-select" onchange="changeNotebookStatus('${id}', this.value)" onclick="event.stopPropagation()">
            <option value="active" ${currentStatus === 'active' ? 'selected' : ''}>Active</option>
            <option value="permanent" ${currentStatus === 'permanent' ? 'selected' : ''}>Permanent</option>
            <option value="archive" ${currentStatus === 'archive' ? 'selected' : ''}>Archive</option>
            <option value="trash" ${currentStatus === 'trash' ? 'selected' : ''}>Trash</option>
        </select>
    `;
}

async function changeNotebookStatus(id, newStatus) {
    const idx = notebookData.findIndex(n => n.id === id);
    if (idx !== -1) {
        notebookData[idx].status = newStatus;
        notebookData[idx].updatedAt = new Date().toISOString();
        await saveNotebookData();

        const filtered = getFilteredNotebooks();
        if (currentNotebookIndex >= filtered.length) {
            currentNotebookIndex = Math.max(0, filtered.length - 1);
        }
        renderRightCards();
    }
}

async function restoreNotebookFromTrash(id) {
    await changeNotebookStatus(id, 'active');
}

async function purgeNotebookPermanent(id) {
    if (!confirm("このノートを完全に削除しますか？\n（復元できなくなります）")) return;
    const idx = notebookData.findIndex(x => x.id === id);
    if (idx !== -1) {
        notebookData.splice(idx, 1);
        notebookData.forEach(other => {
            if (Array.isArray(other.linkedNoteIds) && other.linkedNoteIds.includes(id)) {
                other.linkedNoteIds = other.linkedNoteIds.filter(lid => lid !== id);
            }
        });
        await saveNotebookData();

        const filtered = getFilteredNotebooks();
        if (currentNotebookIndex >= filtered.length) {
            currentNotebookIndex = Math.max(0, filtered.length - 1);
        }
        renderRightCards();
    }
}

async function unlinkNotebook(sourceId, targetId, event) {
    event.stopPropagation();
    if (!confirm("このノートとのリンクを解除しますか？")) return;

    const sourceNote = notebookData.find(n => n.id === sourceId);
    const targetNote = notebookData.find(n => n.id === targetId);

    let updated = false;
    if (sourceNote && Array.isArray(sourceNote.linkedNoteIds)) {
        sourceNote.linkedNoteIds = sourceNote.linkedNoteIds.filter(id => id !== targetId);
        sourceNote.updatedAt = new Date().toISOString();
        updated = true;
    }
    if (targetNote && Array.isArray(targetNote.linkedNoteIds)) {
        targetNote.linkedNoteIds = targetNote.linkedNoteIds.filter(id => id !== sourceId);
        targetNote.updatedAt = new Date().toISOString();
        updated = true;
    }

    if (updated) {
        await saveNotebookData();
        renderRightCards();
    }
}

// ==========================================
// 3. Obsidian風 Graph View (Global / Local)
// ==========================================

function getConnectedComponentNotes(visibleNotes, centerNote) {
    if (!centerNote) return { notes: [], centerId: null };
    const centerId = centerNote.id;
    
    const adjList = new Map();
    visibleNotes.forEach(n => adjList.set(n.id, new Set()));
    
    visibleNotes.forEach(n => {
        const links = Array.isArray(n.linkedNoteIds) ? n.linkedNoteIds : [];
        links.forEach(targetId => {
            if (adjList.has(targetId)) {
                adjList.get(n.id).add(targetId);
                adjList.get(targetId).add(n.id);
            }
        });
    });
    
    const connectedIds = new Set();
    const queue = [centerId];
    connectedIds.add(centerId);
    
    while (queue.length > 0) {
        const currentId = queue.shift();
        const neighbors = adjList.get(currentId);
        if (neighbors) {
            neighbors.forEach(neighborId => {
                if (!connectedIds.has(neighborId)) {
                    connectedIds.add(neighborId);
                    queue.push(neighborId);
                }
            });
        }
    }
    
    return {
        notes: visibleNotes.filter(n => connectedIds.has(n.id)),
        centerId: centerId
    };
}

function renderGraphMode(container, filterBadgeHtml, isLocal = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'notebook-graph-wrapper';

    let visibleNotes = notebookData.filter(n => matchesCurrentFilter(n) && (n.status !== 'trash'));
    let centerNoteId = null;

    if (isLocal) {
        const filteredNotebooks = getFilteredNotebooks();
        const centerNote = filteredNotebooks[currentNotebookIndex] || filteredNotebooks[0];
        const comp = getConnectedComponentNotes(visibleNotes, centerNote);
        visibleNotes = comp.notes;
        centerNoteId = comp.centerId;
    }

    wrapper.innerHTML = `
        <div class="graph-overlay-header">
            <div class="date-title-wrapper">
                <span class="date-eyebrow" style="color: var(--notebook-color);">NOTEBOOKS • ${isLocal ? 'LOCAL GRAPH' : 'GLOBAL GRAPH'}</span>
                <h1 class="date-title">${isLocal ? 'Local Graph' : 'Knowledge Graph'}</h1>
            </div>
            <div class="header-actions">
                ${filterBadgeHtml}
                <span class="header-badge" style="background: var(--notebook-color); color: #fff;">${visibleNotes.length} ノード</span>
            </div>
        </div>
        <canvas class="graph-canvas-layer" id="notebookGraphCanvas"></canvas>
        <div class="graph-tooltip" id="graphTooltip"></div>
        <div class="graph-controls-dock">
            <button class="graph-ctrl-btn" onclick="resetGraphPhysics()" title="ノード配置を再計算">↺</button>
        </div>
    `;
    container.appendChild(wrapper);

    setupGraphSimulation(visibleNotes, centerNoteId);
}

function setupGraphSimulation(notes, centerNoteId = null) {
    const canvas = document.getElementById('notebookGraphCanvas');
    const tooltip = document.getElementById('graphTooltip');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.parentElement.clientWidth || 600;
    const height = rect.height || canvas.parentElement.clientHeight || 500;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const noteMap = new Map();
    graphNodes = notes.map((n, i) => {
        const angle = (i / Math.max(notes.length, 1)) * Math.PI * 2;
        const radius = Math.min(width, height) * 0.32;
        const links = Array.isArray(n.linkedNoteIds) ? n.linkedNoteIds : [];
        const isCenter = n.id === centerNoteId;
        const baseR = isCenter ? 14 : 7;
        
        const node = {
            id: n.id,
            title: n.title || '無題のノート',
            category: n.category || 'ライフログ',
            status: n.status || 'archive',
            x: isCenter ? (width / 2) : (width / 2) + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
            y: isCenter ? (height / 2) : (height / 2) + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
            vx: 0,
            vy: 0,
            r: Math.min(isCenter ? 24 : 18, Math.max(isCenter ? 16 : 8, baseR + links.length * 1.8)),
            links: links,
            isCenter: isCenter
        };
        noteMap.set(n.id, node);
        return node;
    });

    graphEdges = [];
    const addedEdgeSet = new Set();
    graphNodes.forEach(source => {
        source.links.forEach(targetId => {
            const target = noteMap.get(targetId);
            if (target) {
                const edgeKey = [source.id, target.id].sort().join('--');
                if (!addedEdgeSet.has(edgeKey)) {
                    addedEdgeSet.add(edgeKey);
                    graphEdges.push({ source, target });
                }
            }
        });
    });

    canvas.onpointerdown = (e) => {
        const cRect = canvas.getBoundingClientRect();
        const mx = e.clientX - cRect.left;
        const my = e.clientY - cRect.top;
        graphPointerStart = { x: mx, y: my };
        isGraphDragMoved = false;

        draggedNode = getNodeAt(mx, my);
        if (draggedNode) {
            canvas.setPointerCapture(e.pointerId);
        }
    };

    canvas.onpointermove = (e) => {
        const cRect = canvas.getBoundingClientRect();
        const mx = e.clientX - cRect.left;
        const my = e.clientY - cRect.top;

        if (Math.hypot(mx - graphPointerStart.x, my - graphPointerStart.y) > 10) {
            isGraphDragMoved = true;
        }

        if (draggedNode) {
            draggedNode.x = mx;
            draggedNode.y = my;
            draggedNode.vx = 0;
            draggedNode.vy = 0;
            if (tooltip) tooltip.style.display = 'none';
            return;
        }

        const h = getNodeAt(mx, my);
        hoveredNode = h;
        if (h && tooltip) {
            tooltip.textContent = `📔 ${h.title} (${h.category}) [${h.status.toUpperCase()}]`;
            tooltip.style.left = `${mx}px`;
            tooltip.style.top = `${my}px`;
            tooltip.style.display = 'block';
        } else if (tooltip) {
            tooltip.style.display = 'none';
        }
    };

    canvas.onpointerup = (e) => {
        if (!isGraphDragMoved && draggedNode) {
            const targetId = draggedNode.id;
            draggedNode = null;
            openNotebookLinked(targetId);
            return;
        }
        draggedNode = null;
    };

    canvas.onpointerleave = () => {
        hoveredNode = null;
        if (tooltip) tooltip.style.display = 'none';
    };

    function graphTick() {
        if (notebookViewMode !== 'graph' && notebookViewMode !== 'local-graph') return;

        const repFactor = 1600;
        for (let i = 0; i < graphNodes.length; i++) {
            for (let j = i + 1; j < graphNodes.length; j++) {
                const n1 = graphNodes[i];
                const n2 = graphNodes[j];
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const distSq = Math.max(dx * dx + dy * dy, 120);
                const dist = Math.sqrt(distSq);
                const force = repFactor / distSq;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                if (n1 !== draggedNode) { n1.vx -= fx; n1.vy -= fy; }
                if (n2 !== draggedNode) { n2.vx += fx; n2.vy += fy; }
            }
        }

        const springLength = 80;
        const springK = 0.045;
        graphEdges.forEach(edge => {
            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const force = (dist - springLength) * springK;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (edge.source !== draggedNode) { edge.source.vx += fx; edge.source.vy += fy; }
            if (edge.target !== draggedNode) { edge.target.vx -= fx; edge.target.vy -= fy; }
        });

        const cx = width / 2;
        const cy = height / 2;
        const centerGravity = 0.015;
        graphNodes.forEach(node => {
            if (node === draggedNode) return;
            node.vx += (cx - node.x) * centerGravity;
            node.vy += (cy - node.y) * centerGravity;

            node.vx *= 0.82;
            node.vy *= 0.82;

            node.x += node.vx;
            node.y += node.vy;

            node.x = Math.max(node.r + 10, Math.min(width - node.r - 10, node.x));
            node.y = Math.max(node.r + 55, Math.min(height - node.r - 15, node.y));
        });

        drawGraphScene(ctx, width, height);
        graphAnimId = requestAnimationFrame(graphTick);
    }

    graphAnimId = requestAnimationFrame(graphTick);
}

function drawGraphScene(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    const isLight = document.body.classList.contains('light-theme');
    const edgeColor = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
    const edgeActiveColor = isLight ? 'rgba(52, 199, 89, 0.65)' : 'rgba(48, 209, 88, 0.65)';
    const textColor = isLight ? '#1c1c1e' : '#f2f2f7';

    ctx.lineWidth = 1.4;
    graphEdges.forEach(edge => {
        const isConnectedToHover = (hoveredNode && (edge.source === hoveredNode || edge.target === hoveredNode));
        ctx.strokeStyle = isConnectedToHover ? edgeActiveColor : edgeColor;
        ctx.lineWidth = isConnectedToHover ? 2.2 : 1.2;

        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);
        ctx.stroke();
    });

    graphNodes.forEach(node => {
        const isHover = (node === hoveredNode || node === draggedNode);
        const isCenter = node.isCenter;
        
        if (isHover || isCenter) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.r + (isCenter ? 8 : 6), 0, Math.PI * 2);
            ctx.fillStyle = isCenter ? 'rgba(255, 69, 58, 0.2)' : (isLight ? 'rgba(52, 199, 89, 0.22)' : 'rgba(48, 209, 88, 0.22)');
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        
        // ステータスごとの正確なカラー判定（Archiveはリンクがあってもグレーを維持）
        let fillColor = isLight ? '#8e8e93' : '#636366';
        if (node.status === 'permanent') {
            fillColor = isLight ? '#34c759' : '#30d158';
        } else if (node.status === 'active') {
            fillColor = isLight ? '#007aff' : '#2997ff';
        } else if (node.status === 'trash') {
            fillColor = '#ff453a';
        } else {
            fillColor = isLight ? '#8e8e93' : '#636366';
        }
        
        if (isHover) fillColor = isLight ? '#34c759' : '#30d158';
        if (isCenter) fillColor = '#ff453a';
        
        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.lineWidth = isCenter ? 3 : 2;
        ctx.strokeStyle = isLight ? '#ffffff' : '#121215';
        ctx.stroke();

        ctx.font = (isCenter ? '800 13px ' : '600 11px ') + '-apple-system, sans-serif';
        ctx.fillStyle = isHover ? (isLight ? '#34c759' : '#30d158') : (isCenter ? '#ff453a' : textColor);
        ctx.textAlign = 'center';
        ctx.fillText(truncateTitle(node.title, isCenter ? 16 : 12), node.x, node.y + node.r + (isCenter ? 16 : 14));
    });
}

function getNodeAt(x, y) {
    for (let i = graphNodes.length - 1; i >= 0; i--) {
        const n = graphNodes[i];
        if (Math.hypot(n.x - x, n.y - y) <= n.r + 8) {
            return n;
        }
    }
    return null;
}

function truncateTitle(str, maxLen) {
    if (!str) return '無題';
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function resetGraphPhysics() {
    if (notebookViewMode === 'graph' || notebookViewMode === 'local-graph') {
        const isLocal = notebookViewMode === 'local-graph';
        let visibleNotes = notebookData.filter(n => matchesCurrentFilter(n) && (n.status !== 'trash'));
        let centerNoteId = null;

        if (isLocal) {
            const filteredNotebooks = getFilteredNotebooks();
            const centerNote = filteredNotebooks[currentNotebookIndex] || filteredNotebooks[0];
            const comp = getConnectedComponentNotes(visibleNotes, centerNote);
            visibleNotes = comp.notes;
            centerNoteId = comp.centerId;
        }
        setupGraphSimulation(visibleNotes, centerNoteId);
    }
}

// ==========================================
// 共通 HTML ビルダー群
// ==========================================

function buildNotebookTitleHtml(n) {
    return `
        <div class="notebook-title-container" style="position: relative; flex: 1; display: flex; flex-direction: column;">
            <h1 class="date-title notebook-title-view" id="nb_title_view_${n.id}" style="cursor: text; padding: 2px 4px; border-radius: 6px; transition: background 0.2s; margin-left: -4px;" ondblclick="enableNotebookEdit('${n.id}', 'title')" title="ダブルクリックして編集">📔 ${escapeHtml(n.title || '無題のノート')}</h1>
            <input type="text" class="notebook-title-edit" id="nb_title_edit_${n.id}" value="${escapeHtml(n.title || '')}" placeholder="タイトル..." style="display: none; width: 100%; font-size: 22px; font-weight: 700; background: transparent; border: 1px solid var(--item-border); color: var(--text-primary); padding: 4px 8px; border-radius: 8px; outline: none; margin-left: -4px;" onkeydown="if(event.key==='Enter' && !event.isComposing){ document.getElementById('nb_content_view_${n.id}').focus(); }">
        </div>
    `;
}

function buildNotebookContentHtml(n) {
    const toolbarHtml = `
        <div class="notebook-toolbar" id="nb_toolbar_${n.id}">
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('bold', false, null);" title="太字"><b>B</b></button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('italic', false, null);" title="斜体"><i>I</i></button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('underline', false, null);" title="下線"><u>U</u></button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('strikeThrough', false, null);" title="取り消し線"><s>S</s></button>
            
            <div style="width: 1px; height: 16px; background: var(--item-border); margin: 0 2px;"></div>

            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('insertUnorderedList', false, null);" title="箇条書き (リスト)"><b>• リスト</b></button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); toggleNotebookCheckbox('${n.id}');" title="チェックボックス (ToDo)"><b>☑ ToDo</b></button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); insertNotebookHr('${n.id}');" title="区切り線 (水平線)"><b>― 線</b></button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); triggerNotebookPhotoSelect('${n.id}');" title="画像を挿入"><b>📷 画像</b></button>

            <div style="width: 1px; height: 16px; background: var(--item-border); margin: 0 2px;"></div>
            
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('superscript', false, null);" title="上付き文字">X²</button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('subscript', false, null);" title="下付き文字">X₂</button>

            <div style="width: 1px; height: 16px; background: var(--item-border); margin: 0 2px;"></div>

            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('formatBlock', false, 'H1');" title="大見出し" style="font-weight: 800;">H1</button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('formatBlock', false, 'H2');" title="中見出し" style="font-weight: 700;">H2</button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('formatBlock', false, 'H3');" title="小見出し" style="font-weight: 600;">H3</button>
            <button type="button" class="nb-tool-btn" onmousedown="event.preventDefault(); document.execCommand('formatBlock', false, 'DIV');" title="標準テキスト">Aa</button>

            <div style="width: 1px; height: 16px; background: var(--item-border); margin: 0 2px;"></div>

            <button type="button" class="nb-tool-btn color-btn" onmousedown="event.preventDefault(); document.execCommand('foreColor', false, '#ff453a');" title="赤文字" style="color: #ff453a;">A</button>
            <button type="button" class="nb-tool-btn color-btn" onmousedown="event.preventDefault(); document.execCommand('foreColor', false, '#2997ff');" title="青文字" style="color: #2997ff;">A</button>
            <button type="button" class="nb-tool-btn color-btn" onmousedown="event.preventDefault(); document.execCommand('foreColor', false, '#30d158');" title="緑文字" style="color: #30d158;">A</button>
            <button type="button" class="nb-tool-btn color-btn" onmousedown="event.preventDefault(); document.execCommand('removeFormat', false, null);" title="色・書式リセット" style="font-size: 11px; opacity: 0.7;">✕色</button>

            <div style="flex: 1;"></div>

            <button type="button" class="nb-tool-btn danger" onmousedown="event.preventDefault(); deleteNotebookDirect('${n.id}');" title="このノートをゴミ箱へ移動">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 3px;">
                    <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>ゴミ箱へ</span>
            </button>

            <button type="button" class="nb-tool-btn primary" onmousedown="event.preventDefault(); saveNotebookEdit('${n.id}');">保存して完了</button>
        </div>
    `;

    if (window.IS_READONLY_MODE) {
        return `
            <div class="notebook-content-container" style="position: relative; flex: 1; display: flex; flex-direction: column; min-height: 200px;">
                <div class="log-content notebook-content-view rich-text-area" style="padding: 8px 4px; border-radius: 8px; flex: 1; font-size: 15.5px; line-height: 1.6;">${n.content || ''}</div>
            </div>
        `;
    }

    return `
        <div class="notebook-content-container" style="position: relative; flex: 1; display: flex; flex-direction: column; min-height: 200px;">
            ${toolbarHtml}
            <div class="log-content notebook-content-view rich-text-area" id="nb_content_view_${n.id}" data-placeholder="ここをダブルクリックして入力..." style="cursor: text; padding: 8px 4px; border-radius: 8px; transition: background 0.2s; flex: 1; font-size: 15.5px; line-height: 1.6; outline: none;" onclick="handleNotebookContentClick(event, '${n.id}')" ondblclick="handleNotebookContentDblClick(event, '${n.id}')" onkeydown="handleNotebookKeyDown(event, '${n.id}')" onpaste="handleNotebookPaste(event, '${n.id}')" oncopy="handleNotebookCopy(event)">${n.content || ''}</div>
        </div>
    `;
}

// ==========================================
// 関連ノートリンクモーダル処理
// ==========================================
function openLinkNotebookModal(id) {
    const note = notebookData.find(n => n.id === id);
    if (!note) return;

    currentLinkingNotebookId = id;
    tempSelectedLinkIds = new Set(Array.isArray(note.linkedNoteIds) ? note.linkedNoteIds : []);
    linkModalSearchQuery = "";

    const searchInput = document.getElementById('linkNotebookSearchInput');
    if (searchInput) searchInput.value = "";

    renderLinkNotebookList();
    openModal('linkNotebookModal');

    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 200);
}

function handleLinkNotebookSearchInput(e) {
    linkModalSearchQuery = e.target.value;
    renderLinkNotebookList();
}

function renderLinkNotebookList() {
    const container = document.getElementById('linkNotebookListContainer');
    if (!container) return;
    container.innerHTML = "";

    const q = (linkModalSearchQuery || '').trim().toLowerCase();
    const candidateNotes = notebookData.filter(n => {
        if (n.id === currentLinkingNotebookId) return false;
        if (n.status === 'trash') return false;
        if (!q) return true;

        const titleText = (n.title || '').toLowerCase();
        const contentText = stripHtml(n.content || '').toLowerCase();
        const categoryText = (n.category || '').toLowerCase();

        return titleText.includes(q) || contentText.includes(q) || categoryText.includes(q);
    });

    if (candidateNotes.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 32px 10px;">
                ${q ? '該当するノートが見つかりません' : 'リンク可能な他のノートがまだありません'}
            </div>
        `;
        return;
    }

    candidateNotes.forEach(n => {
        const isChecked = tempSelectedLinkIds.has(n.id);
        const item = document.createElement('div');
        item.className = `nb-link-item ${isChecked ? 'selected' : ''}`;
        item.onclick = () => toggleLinkNotebookSelection(n.id);

        const plainContent = stripHtml(n.content || '').replace(/\s+/g, ' ').trim();
        const snippet = plainContent ? plainContent.substring(0, 60) : '(本文なし)';
        const title = (n.title && n.title.trim()) ? n.title : '無題のノート';

        item.innerHTML = `
            <label class="nb-link-checkbox-wrap" onclick="event.stopPropagation()">
                <input type="checkbox" class="nb-link-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleLinkNotebookSelection('${n.id}')">
            </label>
            <div class="nb-link-info">
                <div class="nb-link-title">📔 ${escapeHtml(title)}</div>
                <div class="nb-link-snippet">${escapeHtml(snippet)}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

function toggleLinkNotebookSelection(noteId) {
    if (tempSelectedLinkIds.has(noteId)) {
        tempSelectedLinkIds.delete(noteId);
    } else {
        tempSelectedLinkIds.add(noteId);
    }
    renderLinkNotebookList();
}

async function saveNotebookLinksFromModal() {
    if (!currentLinkingNotebookId) return;
    const currentNote = notebookData.find(n => n.id === currentLinkingNotebookId);
    if (!currentNote) return;

    const oldLinks = new Set(Array.isArray(currentNote.linkedNoteIds) ? currentNote.linkedNoteIds : []);
    const newLinks = new Set(tempSelectedLinkIds);

    currentNote.linkedNoteIds = Array.from(newLinks);
    currentNote.updatedAt = new Date().toISOString();

    newLinks.forEach(targetId => {
        if (!oldLinks.has(targetId)) {
            const targetNote = notebookData.find(n => n.id === targetId);
            if (targetNote) {
                if (!Array.isArray(targetNote.linkedNoteIds)) targetNote.linkedNoteIds = [];
                if (!targetNote.linkedNoteIds.includes(currentLinkingNotebookId)) {
                    targetNote.linkedNoteIds.push(currentLinkingNotebookId);
                    targetNote.updatedAt = new Date().toISOString();
                }
            }
        }
    });

    oldLinks.forEach(targetId => {
        if (!newLinks.has(targetId)) {
            const targetNote = notebookData.find(n => n.id === targetId);
            if (targetNote && Array.isArray(targetNote.linkedNoteIds)) {
                targetNote.linkedNoteIds = targetNote.linkedNoteIds.filter(id => id !== currentLinkingNotebookId);
                targetNote.updatedAt = new Date().toISOString();
            }
        }
    });

    await saveNotebookData();
    closeModal('linkNotebookModal');
    renderRightCards();
}

// ==========================================
// ノートブックエクスポート処理 (HTML / PDF)
// ==========================================
function openExportNotebookModal(id) {
    const note = notebookData.find(n => n.id === id);
    if (!note) return;
    currentExportingNotebookId = id;
    const targetTitleEl = document.getElementById('exportNotebookTargetTitle');
    if (targetTitleEl) {
        targetTitleEl.textContent = note.title && note.title.trim() ? `「${note.title.trim()}」` : '「無題のノート」';
    }
    openModal('exportNotebookModal');
}

function generateNotebookHtmlDocument(n) {
    const title = n.title && n.title.trim() ? escapeHtml(n.title.trim()) : '無題のノート';
    const catName = escapeHtml(n.category || 'ライフログ');
    const statusStr = (n.status || 'archive').toUpperCase();
    const createdDate = n.createdAt ? new Date(n.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const updatedDate = n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const dateStr = updatedDate ? `更新: ${updatedDate}` : (createdDate ? `作成: ${createdDate}` : '');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = n.content || '';
    tempDiv.querySelectorAll('.nb-img-controls').forEach(el => el.remove());
    tempDiv.querySelectorAll('.nb-img-wrapper').forEach(el => el.classList.remove('selected'));
    const cleanContent = tempDiv.innerHTML;

    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Notebook</title>
    <style>
        :root {
            color-scheme: light dark;
            --bg: #08080a;
            --card-bg: #121215;
            --item-border: rgba(255, 255, 255, 0.08);
            --text-primary: #ffffff;
            --text-secondary: #98989f;
            --notebook-color: #30d158;
            --notebook-soft: rgba(48, 209, 88, 0.15);
        }
        @media (prefers-color-scheme: light) {
            :root {
                --bg: #f2f2f7;
                --card-bg: #ffffff;
                --item-border: rgba(0, 0, 0, 0.08);
                --text-primary: #1c1c1e;
                --text-secondary: #8e8e93;
                --notebook-color: #34c759;
                --notebook-soft: rgba(52, 199, 89, 0.15);
            }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif; }
        body { background-color: var(--bg); color: var(--text-primary); padding: 40px 20px; display: flex; justify-content: center; line-height: 1.6; }
        .notebook-container { width: 100%; max-width: 740px; background: var(--card-bg); border: 1px solid var(--item-border); border-radius: 20px; padding: 32px 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); }
        header { margin-bottom: 24px; border-bottom: 1px solid var(--item-border); padding-bottom: 18px; }
        .eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.8px; color: var(--notebook-color); text-transform: uppercase; margin-bottom: 6px; }
        h1.title { font-size: 26px; font-weight: 800; margin-bottom: 12px; line-height: 1.3; word-break: break-word; }
        .meta-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-secondary); }
        .badge { font-size: 11px; font-weight: 700; background: var(--notebook-soft); color: var(--notebook-color); padding: 2px 8px; border-radius: 6px; }
        .content-view { font-size: 15.5px; line-height: 1.7; word-break: break-word; }
        .content-view h1 { font-size: 1.55em; margin-top: 0.8em; margin-bottom: 0.35em; font-weight: 800; }
        .content-view h2 { font-size: 1.3em; margin-top: 0.75em; margin-bottom: 0.3em; font-weight: 750; }
        .content-view h3 { font-size: 1.15em; margin-top: 0.65em; margin-bottom: 0.25em; font-weight: 700; }
        .content-view ul, .content-view ol { margin: 8px 0 8px 24px; }
        .content-view li { margin-bottom: 4px; }
        .content-view hr { border: none; border-top: 1px solid var(--item-border); margin: 18px 0; }
        .nb-todo-item { display: flex; align-items: flex-start; gap: 8px; margin: 5px 0; }
        .nb-todo-checkbox { appearance: none; -webkit-appearance: none; width: 17px; height: 17px; border: 1.5px solid var(--text-secondary); border-radius: 4px; margin-top: 4px; flex-shrink: 0; position: relative; }
        .nb-todo-checkbox:checked { background-color: var(--notebook-color); border-color: var(--notebook-color); }
        .nb-todo-checkbox:checked::after { content: ''; position: absolute; left: 4.5px; top: 1px; width: 4px; height: 8px; border: solid #ffffff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
        .nb-todo-text { flex: 1; }
        .nb-todo-item.completed .nb-todo-text { text-decoration: line-through; opacity: 0.5; }
        .nb-img-wrapper { position: relative; display: inline-block; vertical-align: top; box-sizing: border-box; padding: 4px 0; }
        .nb-img-wrapper.size-full { width: 100%; display: block; }
        .nb-img-wrapper.size-half { width: 50%; }
        .nb-img-wrapper.size-quarter { width: 25%; }
        .nb-embedded-img { width: 100%; height: auto; max-height: 520px; object-fit: cover; border-radius: 10px; display: block; }
        .nb-img-controls { display: none !important; }
        
        @media print {
            body { background: #ffffff !important; color: #000000 !important; padding: 0 !important; }
            .notebook-container { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
            @page { size: auto; margin: 15mm; }
        }
    </style>
</head>
<body>
    <div class="notebook-container">
        <header>
            <div class="eyebrow">DAILY JOURNAL NOTEBOOK</div>
            <h1 class="title">📔 ${title}</h1>
            <div class="meta-row">
                <span class="badge">${catName}</span>
                <span class="badge">${statusStr}</span>
                ${dateStr ? `<span>${dateStr}</span>` : ''}
            </div>
        </header>
        <div class="content-view">${cleanContent}</div>
    </div>
</body>
</html>`;
}

function executeNotebookExport(format) {
    if (!currentExportingNotebookId) return;
    const note = notebookData.find(n => n.id === currentExportingNotebookId);
    if (!note) return;

    const htmlStr = generateNotebookHtmlDocument(note);
    const baseTitle = (note.title && note.title.trim() ? note.title.trim().replace(/[\\/:*?"<>|]/g, '_') : 'notebook');

    closeModal('exportNotebookModal');

    if (format === 'html') {
        const blob = new Blob([htmlStr], { type: 'text/html;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${baseTitle}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } else if (format === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(htmlStr);
        doc.close();

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                if (iframe.parentNode) document.body.removeChild(iframe);
            }, 2000);
        }, 350);
    }
}

// ==========================================
// 画像挿入・サイズ変更・ペースト機能
// ==========================================
function triggerNotebookPhotoSelect(id) {
    currentActiveEditorNotebookId = id;
    const fileInput = document.getElementById('notebookPhotoInput');
    if (fileInput) fileInput.click();
}

async function handleNotebookPhotosSelected(e) {
    const files = Array.from(e.target.files);
    if (!files.length || !currentActiveEditorNotebookId) return;
    
    for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        try {
            const b64 = await resizeImageFile(f);
            insertImageToNotebook(currentActiveEditorNotebookId, b64);
        } catch (err) {}
    }
    e.target.value = "";
}

async function handleNotebookPaste(e, id) {
    if (!e.clipboardData || !e.clipboardData.items) return;
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const blob = items[i].getAsFile();
            if (blob) {
                try {
                    const b64 = await resizeImageFile(blob);
                    insertImageToNotebook(id, b64);
                } catch (err) {}
            }
            return;
        }
    }
}

function insertImageToNotebook(id, base64Url, size = 'size-half') {
    const contentArea = document.getElementById(`nb_content_view_${id}`);
    if (!contentArea) return;
    contentArea.focus();

    const wrapper = document.createElement('span');
    wrapper.className = `nb-img-wrapper ${size}`;
    wrapper.setAttribute('contenteditable', 'false');

    wrapper.innerHTML = `
        <img class="nb-embedded-img" src="${base64Url}" alt="挿入画像">
        <div class="nb-img-controls" onclick="event.stopPropagation()">
            <button type="button" class="nb-img-btn ${size === 'size-full' ? 'active' : ''}" onclick="setNotebookImageSize(this, 'size-full', '${id}')">1/1</button>
            <button type="button" class="nb-img-btn ${size === 'size-half' ? 'active' : ''}" onclick="setNotebookImageSize(this, 'size-half', '${id}')">1/2</button>
            <button type="button" class="nb-img-btn ${size === 'size-quarter' ? 'active' : ''}" onclick="setNotebookImageSize(this, 'size-quarter', '${id}')">1/4</button>
            <button type="button" class="nb-img-btn del" onclick="removeNotebookImage(this, '${id}')">✕</button>
        </div>
    `;

    insertNodeAtSelection(wrapper);
    saveNotebookContentDirect(id);
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.nb-img-wrapper')) {
        document.querySelectorAll('.nb-img-wrapper.selected').forEach(w => w.classList.remove('selected'));
    }
});

function setNotebookImageSize(btn, sizeClass, notebookId) {
    const wrapper = btn.closest('.nb-img-wrapper');
    if (!wrapper) return;

    wrapper.classList.remove('size-full', 'size-half', 'size-quarter');
    wrapper.classList.add(sizeClass);

    const controls = wrapper.querySelector('.nb-img-controls');
    if (controls) {
        controls.querySelectorAll('.nb-img-btn').forEach(b => {
            if (b.classList.contains('del')) return;
            b.classList.toggle('active', b.textContent === (sizeClass === 'size-full' ? '1/1' : sizeClass === 'size-half' ? '1/2' : '1/4'));
        });
    }

    saveNotebookContentDirect(notebookId);
}

function removeNotebookImage(btn, notebookId) {
    const wrapper = btn.closest('.nb-img-wrapper');
    if (wrapper) {
        wrapper.remove();
        saveNotebookContentDirect(notebookId);
    }
}

// ==========================================
// ToDoトグル機能
// ==========================================
function toggleNotebookCheckbox(id) {
    const contentArea = document.getElementById(`nb_content_view_${id}`);
    if (!contentArea) return;
    contentArea.focus();

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    const blocks = getSelectedBlocks(contentArea, range);

    if (!blocks || blocks.length === 0) {
        const todoDiv = document.createElement('div');
        todoDiv.className = 'nb-todo-item';
        todoDiv.innerHTML = `<input type="checkbox" class="nb-todo-checkbox" contenteditable="false"><span class="nb-todo-text" contenteditable="true"></span>`;
        insertNodeAtSelection(todoDiv);
        const textSpan = todoDiv.querySelector('.nb-todo-text');
        if (textSpan) setCursorToTodoText(textSpan);
        saveNotebookContentDirect(id);
        return;
    }

    const allAreTodos = blocks.every(b => b.classList && b.classList.contains('nb-todo-item'));

    if (allAreTodos) {
        let lastDiv = null;
        blocks.forEach(b => {
            const textSpan = b.querySelector('.nb-todo-text');
            const content = textSpan ? textSpan.innerHTML : '<br>';
            const div = document.createElement('div');
            div.innerHTML = content.trim() ? content : '<br>';
            b.parentNode.replaceChild(div, b);
            lastDiv = div;
        });
        if (lastDiv) setCursorToElement(lastDiv, false);
    } else {
        let targetTextSpan = null;
        blocks.forEach(b => {
            if (b.classList && b.classList.contains('nb-todo-item')) return;

            let textHtml = b.innerHTML.trim();
            if (textHtml === '<br>' || textHtml === '&nbsp;') textHtml = '';

            const todoDiv = document.createElement('div');
            todoDiv.className = 'nb-todo-item';
            todoDiv.innerHTML = `<input type="checkbox" class="nb-todo-checkbox" contenteditable="false"><span class="nb-todo-text" contenteditable="true">${textHtml}</span>`;
            
            b.parentNode.replaceChild(todoDiv, b);
            targetTextSpan = todoDiv.querySelector('.nb-todo-text');
        });
        if (targetTextSpan) setCursorToTodoText(targetTextSpan);
    }

    saveNotebookContentDirect(id);
}

function getSelectedBlocks(root, range) {
    const blocks = [];
    normalizeEditorChildNodes(root);

    Array.from(root.children).forEach(child => {
        if (range.intersectsNode(child)) {
            blocks.push(child);
        }
    });

    if (blocks.length === 0) {
        let node = range.startContainer;
        while (node && node.parentElement !== root && node !== root) {
            node = node.parentElement;
        }
        if (node && node !== root) blocks.push(node);
    }
    return blocks;
}

function normalizeEditorChildNodes(root) {
    const nodes = Array.from(root.childNodes);
    nodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            const div = document.createElement('div');
            div.textContent = node.textContent;
            root.replaceChild(div, node);
        }
    });
}

function insertNotebookHr(id) {
    const contentArea = document.getElementById(`nb_content_view_${id}`);
    if (!contentArea) return;
    contentArea.focus();

    const hr = document.createElement('hr');
    const blankLine = document.createElement('div');
    blankLine.innerHTML = '<br>';

    insertNodeAtSelection(hr);
    hr.parentNode.insertBefore(blankLine, hr.nextSibling);
    setCursorToElement(blankLine, true);
    saveNotebookContentDirect(id);
}

function insertNodeAtSelection(node) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.collapse(false);
}

function setCursorToElement(el, selectAll = false) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    if (!selectAll) {
        range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
}

function setCursorToTodoText(textSpan) {
    textSpan.focus();
    if (!textSpan.firstChild) {
        textSpan.appendChild(document.createTextNode(''));
    }
    const targetNode = textSpan.lastChild;
    const range = document.createRange();
    const sel = window.getSelection();

    if (targetNode.nodeType === Node.TEXT_NODE) {
        range.setStart(targetNode, targetNode.length);
        range.setEnd(targetNode, targetNode.length);
    } else {
        range.selectNodeContents(textSpan);
        range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
}

// ==========================================
// キーボード操作制御
// ==========================================
function handleNotebookKeyDown(e, id) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const anchor = sel.anchorNode;
    if (!anchor) return;

    const todoItem = anchor.nodeType === Node.ELEMENT_NODE ? anchor.closest('.nb-todo-item') : anchor.parentElement ? anchor.parentElement.closest('.nb-todo-item') : null;
    const listItem = anchor.nodeType === Node.ELEMENT_NODE ? anchor.closest('li') : anchor.parentElement ? anchor.parentElement.closest('li') : null;

    if (e.key === 'Enter' && !e.isComposing) {
        if (todoItem) {
            e.preventDefault();
            const textSpan = todoItem.querySelector('.nb-todo-text');
            const textContent = textSpan ? textSpan.textContent.replace(/\u00a0/g, '').trim() : '';

            if (!textContent) {
                const normalDiv = document.createElement('div');
                normalDiv.innerHTML = '<br>';
                todoItem.parentNode.replaceChild(normalDiv, todoItem);
                setCursorToElement(normalDiv, true);
                saveNotebookContentDirect(id);
                return;
            }

            const newTodo = document.createElement('div');
            newTodo.className = 'nb-todo-item';
            newTodo.innerHTML = `<input type="checkbox" class="nb-todo-checkbox" contenteditable="false"><span class="nb-todo-text" contenteditable="true"></span>`;

            if (todoItem.nextSibling) {
                todoItem.parentNode.insertBefore(newTodo, todoItem.nextSibling);
            } else {
                todoItem.parentNode.appendChild(newTodo);
            }

            const newText = newTodo.querySelector('.nb-todo-text');
            if (newText) setCursorToTodoText(newText);
            saveNotebookContentDirect(id);
            return;
        }

        if (listItem) {
            const listText = listItem.textContent.replace(/\u00a0/g, '').trim();
            if (!listText) {
                e.preventDefault();
                const listParent = listItem.closest('ul, ol');
                const normalDiv = document.createElement('div');
                normalDiv.innerHTML = '<br>';

                if (listParent) {
                    listItem.remove();
                    if (listParent.children.length === 0) {
                        listParent.parentNode.replaceChild(normalDiv, listParent);
                    } else {
                        if (listParent.nextSibling) {
                            listParent.parentNode.insertBefore(normalDiv, listParent.nextSibling);
                        } else {
                            listParent.parentNode.appendChild(normalDiv);
                        }
                    }
                }
                setCursorToElement(normalDiv, true);
                saveNotebookContentDirect(id);
                return;
            }
        }
    }

    if (e.key === 'Backspace' && !e.isComposing) {
        if (todoItem) {
            const textSpan = todoItem.querySelector('.nb-todo-text');
            const textContent = textSpan ? textSpan.textContent.replace(/\u00a0/g, '').trim() : '';
            const isAtStart = sel.anchorOffset === 0;

            if (!textContent || isAtStart) {
                e.preventDefault();
                const prev = todoItem.previousElementSibling;
                
                if (prev) {
                    const prevTodoText = prev.querySelector ? prev.querySelector('.nb-todo-text') : null;
                    todoItem.remove();
                    if (prevTodoText) {
                        setCursorToTodoText(prevTodoText);
                    } else {
                        setCursorToElement(prev, false);
                    }
                } else {
                    const normalDiv = document.createElement('div');
                    normalDiv.innerHTML = '<br>';
                    todoItem.parentNode.replaceChild(normalDiv, todoItem);
                    setCursorToElement(normalDiv, true);
                }
                saveNotebookContentDirect(id);
                return;
            }
        }

        if (listItem) {
            const listText = listItem.textContent.replace(/\u00a0/g, '').trim();
            const listParent = listItem.closest('ul, ol');

            if (!listText) {
                e.preventDefault();
                const prev = listItem.previousElementSibling;
                listItem.remove();

                if (listParent && listParent.children.length === 0) {
                    const normalDiv = document.createElement('div');
                    normalDiv.innerHTML = '<br>';
                    listParent.parentNode.replaceChild(normalDiv, listParent);
                    setCursorToElement(normalDiv, true);
                } else if (prev) {
                    setCursorToElement(prev, false);
                } else if (listParent) {
                    const normalDiv = document.createElement('div');
                    normalDiv.innerHTML = '<br>';
                    listParent.parentNode.insertBefore(normalDiv, listParent);
                    setCursorToElement(normalDiv, true);
                }
                saveNotebookContentDirect(id);
                return;
            }
        }
    }
}

// ==========================================
// コピーイベント制御
// ==========================================
function handleNotebookCopy(e) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const container = document.createElement('div');
    for (let i = 0; i < sel.rangeCount; i++) {
        container.appendChild(sel.getRangeAt(i).cloneContents());
    }

    const todoElements = container.querySelectorAll('.nb-todo-item');
    if (todoElements.length > 0) {
        e.preventDefault();

        const htmlContainer = document.createElement('div');
        const plainTextLines = [];

        Array.from(container.childNodes).forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('nb-todo-item')) {
                const checkbox = node.querySelector('.nb-todo-checkbox');
                const textSpan = node.querySelector('.nb-todo-text');
                const isChecked = checkbox && (checkbox.checked || checkbox.hasAttribute('checked'));
                const text = textSpan ? textSpan.textContent.replace(/\u00a0/g, ' ').trim() : '';

                const ul = document.createElement('ul');
                ul.style.listStyleType = 'none';
                ul.style.paddingLeft = '0';
                ul.style.margin = '0';
                
                const li = document.createElement('li');
                li.setAttribute('data-type', 'to-do');
                li.innerHTML = `<input type="checkbox" ${isChecked ? 'checked' : ''} disabled> <span>${escapeHtml(text)}</span>`;
                ul.appendChild(li);
                htmlContainer.appendChild(ul);

                plainTextLines.push(`${isChecked ? '[x]' : '[ ]'} ${text}`);
            } else {
                htmlContainer.appendChild(node.cloneNode(true));
                const txt = node.textContent ? node.textContent.trim() : '';
                if (txt) plainTextLines.push(txt);
            }
        });

        if (e.clipboardData) {
            e.clipboardData.setData('text/html', htmlContainer.innerHTML);
            e.clipboardData.setData('text/plain', plainTextLines.join('\n'));
        }
    }
}

function handleNotebookContentClick(event, id) {
    const target = event.target;
    if (!target) return;

    if (target.tagName === 'IMG' || target.classList.contains('nb-embedded-img')) {
        event.stopPropagation();
        const contentArea = document.getElementById(`nb_content_view_${id}`);
        const isEditing = contentArea && contentArea.classList.contains('is-editing');

        if (isEditing) {
            const wrapper = target.closest('.nb-img-wrapper');
            if (wrapper) {
                const isSelected = wrapper.classList.contains('selected');
                document.querySelectorAll('.nb-img-wrapper.selected').forEach(w => w.classList.remove('selected'));
                if (!isSelected) wrapper.classList.add('selected');
            }
        } else {
            document.querySelectorAll('.nb-img-wrapper.selected').forEach(w => w.classList.remove('selected'));
            openLightbox(target.src);
        }
        return;
    }

    if (target.classList.contains('nb-todo-checkbox')) {
        const item = target.closest('.nb-todo-item');
        if (item) {
            item.classList.toggle('completed', target.checked);
            if (target.checked) target.setAttribute('checked', 'checked');
            else target.removeAttribute('checked');
        }
        saveNotebookContentDirect(id);
        return;
    }
}

function handleNotebookContentDblClick(event, id) {
    const target = event.target;
    if (target && (target.classList.contains('nb-todo-checkbox') || target.tagName === 'IMG' || target.classList.contains('nb-embedded-img') || target.closest('.nb-img-controls'))) {
        return;
    }
    enableNotebookEdit(id, 'content');
}

function enableNotebookEdit(id, focusTarget = 'content') {
    currentActiveEditorNotebookId = id;
    const toolbar = document.getElementById(`nb_toolbar_${id}`);
    const titleView = document.getElementById(`nb_title_view_${id}`);
    const titleEdit = document.getElementById(`nb_title_edit_${id}`);
    const contentArea = document.getElementById(`nb_content_view_${id}`);

    if (toolbar) toolbar.style.display = 'flex';
    
    if (titleView && titleEdit) {
        titleView.style.display = 'none';
        titleEdit.style.display = 'block';
    }
    
    if (contentArea) {
        contentArea.setAttribute('contenteditable', 'true');
        contentArea.classList.add('is-editing');
    }

    if (focusTarget === 'title' && titleEdit) {
        titleEdit.focus();
        titleEdit.select();
    } else if (contentArea) {
        contentArea.focus();
    }
}

async function saveNotebookContentDirect(id) {
    const contentArea = document.getElementById(`nb_content_view_${id}`);
    const idx = notebookData.findIndex(x => x.id === id);
    if (idx !== -1 && contentArea) {
        notebookData[idx].content = contentArea.innerHTML;
        notebookData[idx].updatedAt = new Date().toISOString();
        await saveNotebookData();
    }
}

async function saveNotebookEdit(id) {
    const titleEdit = document.getElementById(`nb_title_edit_${id}`);
    const contentArea = document.getElementById(`nb_content_view_${id}`);
    
    const idx = notebookData.findIndex(x => x.id === id);
    
    if (idx !== -1) {
        if (titleEdit) {
            notebookData[idx].title = titleEdit.value.trim();
        }
        if (contentArea) {
            contentArea.querySelectorAll('.nb-img-wrapper.selected').forEach(w => w.classList.remove('selected'));
            notebookData[idx].content = contentArea.innerHTML;
        }
        notebookData[idx].updatedAt = new Date().toISOString();
        
        await saveNotebookData();
        
        currentNotebookIndex = getFilteredNotebooks().findIndex(x => x.id === id);
        if (currentNotebookIndex === -1) currentNotebookIndex = 0;
        renderRightCards();
        if (sidebarMode === 'cal') renderNotebookSidebar();
    }
}

async function deleteNotebookDirect(id) {
    if (confirm("このノートをゴミ箱に移動しますか？")) {
        await changeNotebookStatus(id, 'trash');
    }
}

async function openAddNotebookModal() {
    let defCat = "ライフログ";
    const validTypes = [...new Set(categories.map(c => c.type || "一般"))].filter(t => typeNotebookSettings[t] !== false);
    
    if (!validTypes.length) { 
        alert("Notebooksが有効なカテゴリがありません。設定を確認してください。"); 
        return; 
    }
    
    defCat = categories.find(c => (c.type || "一般") === validTypes[0]).name;
    if (currentFilter.mode === 'category' && categories.some(c => c.name === currentFilter.value && validTypes.includes(c.type || "一般"))) {
        defCat = currentFilter.value;
    } else if (currentFilter.mode === 'type' && validTypes.includes(currentFilter.value)) { 
        const f = categories.find(c => (c.type || "一般") === currentFilter.value); 
        if (f) defCat = f.name; 
    }
    
    const newId = 'nb_' + Date.now().toString() + Math.floor(Math.random()*1000);
    
    // 新規作成ノートは Active
    notebookData.unshift({
        id: newId,
        title: '',
        content: '',
        category: defCat,
        status: 'active',
        linkedNoteIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    
    if (notebookViewMode === 'grid' || notebookViewMode === 'graph' || notebookViewMode === 'local-graph') {
        notebookViewMode = 'card';
    }
    
    currentNotebookIndex = 0;
    notebookSearchQuery = "";
    currentNotebookStatusFilter = 'all';
    
    await saveNotebookData(); 
    
    if (calendarScope !== 'notebooks') { 
        calendarScope = 'notebooks'; 
        updateScopeButtonsUI(); 
        updateJumpButtonLabel(); 
        if (sidebarMode === 'cal') updateSidebars();
    }
    
    renderRightCards(); 
    if (sidebarMode === 'cal') renderNotebookSidebar();
    
    setTimeout(() => {
        enableNotebookEdit(newId, 'title');
        const titleEdit = document.getElementById(`nb_title_edit_${newId}`);
        if (titleEdit) titleEdit.focus();
    }, 150);
}