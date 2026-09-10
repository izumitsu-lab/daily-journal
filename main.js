// ==========================================
// main.js (初期化・全体設定・データ管理・IndexedDB)
// ==========================================

function updateAppHeight() {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
window.addEventListener('resize', updateAppHeight);
window.addEventListener('orientationchange', () => { setTimeout(updateAppHeight, 150); });
updateAppHeight();

// デフォルトカテゴリ設定
// ログ: 「ライフログ」「植物」 / 研究管理: 「学生１」「学生２」
const DEFAULT_CATEGORIES = [
    { name: "ライフログ", type: "ログ" },
    { name: "植物", type: "ログ" },
    { name: "学生１", type: "研究管理" },
    { name: "学生２", type: "研究管理" }
];
const DEFAULT_TYPE_SLACK = { "all": false, "研究管理": true, "ログ": false, "一般": false };
const DEFAULT_TYPE_NOTEBOOK = { "all": true, "研究管理": true, "ログ": true, "一般": true };

let categories = JSON.parse(localStorage.getItem('daily_journal_categories')) || DEFAULT_CATEGORIES;
let typeSlackSettings = JSON.parse(localStorage.getItem('daily_journal_type_slack')) || DEFAULT_TYPE_SLACK;
let typeNotebookSettings = JSON.parse(localStorage.getItem('daily_journal_type_notebook')) || DEFAULT_TYPE_NOTEBOOK;

let lightThemeEnabled = localStorage.getItem('daily_journal_theme') === 'true';
let hideEmptyCards = localStorage.getItem('daily_journal_hide_empty') === 'true';

// Gallery View 列数設定 ('auto', '3', '4', '5')
let galleryColumns = localStorage.getItem('daily_journal_gallery_cols') || 'auto';

let calendarScope = 'day';
let previousCalendarScope = 'day';
let lastJournalScope = 'day';
let lastJournalDateKey = null;
let lastPhotoPanelKey = null;

let currentNotebookIndex = 0;
let currentNotebookCategory = "ライフログ";
let notebookViewMode = 'grid';

let journalData = {};
let notebookData = [];
let dateList = [];
let activeDateKey = null;

let miniCalYear = new Date().getFullYear();
let miniCalMonth = new Date().getMonth();
let sidebarMode = 'cal';
let currentFilter = { mode: 'all', value: '' };

let selectedAddCategory = "ライフログ";
let selectedEditCategory = "ライフログ";
let currentAddMsgType = 'normal';
let currentEditMsgType = 'normal';
let currentAddPhotos = [];
let currentEditPhotos = [];
let currentEditTarget = { dateStr: null, index: null };
let isProgrammaticScroll = false;
let programmaticScrollTimer = null;

// ==========================================
// IndexedDB Setup & Wrappers
// ==========================================
const DB_NAME = 'DailyJournalDB';
const STORE_NAME = 'appData';

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function getDBData(key) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
    });
}

function setDBData(key, value) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
    });
}

function deleteDBData(key) {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await initDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
    });
}

async function saveNotebookData() { await setDBData('notebookData', notebookData); }
async function saveJournalData() { await setDBData('journalData', journalData); }

async function purgeTodoFromStorage() {
    try {
        await deleteDBData('todoData');
        await deleteDBData('projectData');
    } catch (e) {}
    localStorage.removeItem('daily_journal_todo');
    localStorage.removeItem('daily_journal_projects');
    localStorage.removeItem('daily_journal_type_todo');
}

// ==========================================
// Migrations & Helpers
// ==========================================
async function syncAndMigrateCategories() {
    let catUpdated = false;

    // 旧タイプ名「学生管理」があれば「研究管理」へマイグレーション
    categories.forEach(c => {
        if (c.type === "学生管理") { 
            c.type = "研究管理"; 
            catUpdated = true; 
        }
    });

    // カテゴリが未設定または空の場合はデフォルト値をセット
    if (!categories || categories.length === 0) {
        categories = [...DEFAULT_CATEGORIES];
        catUpdated = true;
    }

    if (catUpdated) {
        localStorage.setItem('daily_journal_categories', JSON.stringify(categories));
    }

    let settingsUpdated = false;
    if (typeSlackSettings["all"] === undefined) { typeSlackSettings["all"] = false; settingsUpdated = true; }
    if (typeSlackSettings["学生管理"] !== undefined) { typeSlackSettings["研究管理"] = typeSlackSettings["学生管理"]; delete typeSlackSettings["学生管理"]; settingsUpdated = true; }
    if (typeNotebookSettings["学生管理"] !== undefined) { typeNotebookSettings["研究管理"] = typeNotebookSettings["学生管理"]; delete typeNotebookSettings["学生管理"]; settingsUpdated = true; }
    if (settingsUpdated) { saveTypeSlackSettings(); saveTypeNotebookSettings(); }

    let dataUpdated = false;
    Object.keys(journalData).forEach(dateStr => {
        if (Array.isArray(journalData[dateStr])) {
            journalData[dateStr].forEach(log => {
                if (!log.category) { log.category = "ライフログ"; dataUpdated = true; }
            });
        }
    });
    if (dataUpdated) await saveJournalData();
    
    // Notebooksマイグレーション: statusが未設定の既存ノートをすべて "archive" に設定
    let notebookUpdated = false;
    notebookData.forEach(n => {
        if (!Array.isArray(n.linkedNoteIds)) {
            n.linkedNoteIds = [];
            notebookUpdated = true;
        }
        if (!n.status) {
            n.status = 'archive';
            notebookUpdated = true;
        }
    });
    if (notebookUpdated) await saveNotebookData();
}

function saveCategories() { localStorage.setItem('daily_journal_categories', JSON.stringify(categories)); }
function saveTypeSlackSettings() { localStorage.setItem('daily_journal_type_slack', JSON.stringify(typeSlackSettings)); }
function saveTypeNotebookSettings() { localStorage.setItem('daily_journal_type_notebook', JSON.stringify(typeNotebookSettings)); }
function isSlackEnabledForType(type) { return typeSlackSettings[type] !== undefined ? !!typeSlackSettings[type] : false; }

function applyGalleryColumnsSetting() {
    const sel = document.getElementById('galleryColumnsSelect');
    if (sel) sel.value = galleryColumns;
}

function changeGalleryColumns(val) {
    galleryColumns = val || 'auto';
    localStorage.setItem('daily_journal_gallery_cols', galleryColumns);
    if (calendarScope === 'notebooks' && notebookViewMode === 'grid') {
        renderRightCards();
    }
}

function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function generateDateKeys() {
    const dates = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    Object.keys(journalData).forEach(dKey => { if (!dates.includes(dKey)) dates.push(dKey); });
    dates.sort();
    return dates;
}

function applyTheme() {
    const s = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const t = document.querySelector('meta[name="theme-color"]');
    if (lightThemeEnabled) {
        document.body.classList.add('light-theme');
        if (s) s.setAttribute('content', 'default');
        if (t) t.setAttribute('content', '#f2f2f7');
        const tgl = document.getElementById('themeToggle'); if (tgl) tgl.checked = true;
    } else {
        document.body.classList.remove('light-theme');
        if (s) s.setAttribute('content', 'black-translucent');
        if (t) t.setAttribute('content', '#08080a');
        const tgl = document.getElementById('themeToggle'); if (tgl) tgl.checked = false;
    }
}
function toggleTheme() {
    lightThemeEnabled = document.getElementById('themeToggle').checked;
    localStorage.setItem('daily_journal_theme', lightThemeEnabled);
    applyTheme();
    if (calendarScope === 'notebooks') renderRightCards(); 
}

// ==========================================
// 起動処理
// ==========================================
window.onload = async () => {
    applyTheme(); 
    applyHideEmptyCardsSetting();
    applyGalleryColumnsSetting();

    await purgeTodoFromStorage();

    const loadedJournal = await getDBData('journalData');
    const loadedNotebook = await getDBData('notebookData');

    let needsMigration = false;
    
    if (loadedJournal) { journalData = loadedJournal; } 
    else { journalData = JSON.parse(localStorage.getItem('daily_journal_data')) || {}; needsMigration = true; }
    
    if (loadedNotebook) { notebookData = loadedNotebook; } 
    else { notebookData = JSON.parse(localStorage.getItem('daily_journal_notebook')) || []; needsMigration = true; }

    if (needsMigration) {
        await saveJournalData();
        await saveNotebookData();
        localStorage.removeItem('daily_journal_data');
        localStorage.removeItem('daily_journal_notebook');
    }

    await syncAndMigrateCategories();
    dateList = generateDateKeys();
    
    calendarScope = 'day';
    previousCalendarScope = 'day';
    lastJournalScope = 'day';
    const todayStr = getTodayKey();
    if (hideEmptyCards) {
        const w = dateList.filter(d => getFilteredDayLogs(d).length > 0);
        if (w.length > 0) {
            activeDateKey = w.includes(todayStr) ? todayStr : w[w.length - 1];
            const p = activeDateKey.split('-'); miniCalYear = parseInt(p[0], 10); miniCalMonth = parseInt(p[1], 10) - 1;
        } else activeDateKey = todayStr;
    } else activeDateKey = todayStr;
    lastJournalDateKey = activeDateKey;

    updateCategoryButtonUI(); 
    updateScopeButtonsUI(); 
    updateJumpButtonLabel(); 
    updateSidebars();
    renderRightCards(); 
    setupMiniCalSwipe(); 
    document.body.classList.add('ready');
};
