function getCoilImgs(item) {
    try {
        const saved = localStorage.getItem(COIL_IMG_LS_PREFIX + item.model);
        if (saved) return JSON.parse(saved);
    } catch (e) { /* localStorage不可用(如無痕模式)或資料損毀時，退回預設圖 */ }
    return item.coilImgs && item.coilImgs.length ? item.coilImgs : [];
}

function saveCoilImgs(model, arr) {
    const msgEl = document.getElementById('hcoilMsg_' + model);
    try {
        localStorage.setItem(COIL_IMG_LS_PREFIX + model, JSON.stringify(arr));
        if (msgEl) msgEl.innerHTML = '✅ 已儲存（保存在本機瀏覽器，下次開啟此檔案仍會顯示）';
    } catch (err) {
        if (msgEl) msgEl.innerHTML = '<span style="color:var(--danger);">⚠ 本機儲存空間不足，圖片僅本次瀏覽有效，重新整理後會消失。建議刪除幾張舊圖或壓縮檔案大小。</span>';
    }
}

// ─── 資料庫分頁：管理者登入 / 訪客模式 (UI/UX 預覽，尚未串接後端) ───
let isHistAdmin = false;

function openHistLogin() {
    if (isHistAdmin) {
        // 已是管理者身分時，按鈕改為登出
        isHistAdmin = false;
        updateHistModeUI();
        return;
    }
    document.getElementById('histLoginUser').value = '';
    document.getElementById('histLoginPass').value = '';
    document.getElementById('histLoginMsg').innerText = '';
    document.getElementById('histLoginOverlay').style.display = 'flex';
}
function closeHistLogin() { document.getElementById('histLoginOverlay').style.display = 'none'; }

function submitHistLogin() {
    const user = document.getElementById('histLoginUser').value.trim();
    const pass = document.getElementById('histLoginPass').value.trim();
    if (!user || !pass) {
        document.getElementById('histLoginMsg').innerText = '請輸入帳號與密碼（示範用，任意輸入即可）。';
        return;
    }
    // ⚠ UI/UX 預覽：此處未來應改為呼叫後端登入 API 驗證，目前僅示範前端流程，任意帳密皆視為登入成功
    isHistAdmin = true;
    closeHistLogin();
    updateHistModeUI();
}

function updateHistModeUI() {
    const badge = document.getElementById('histModeBadge');
    const btn = document.getElementById('histLoginBtn');
    if (isHistAdmin) {
        badge.className = 'hist-mode-badge admin';
        badge.innerText = '🔓 管理者模式（示範）';
        btn.innerText = '🚪 登出';
    } else {
        badge.className = 'hist-mode-badge guest';
        badge.innerText = '👁 訪客模式（僅檢視）';
        btn.innerText = '🔒 管理者登入';
    }
    // 重新渲染圖庫，套用最新的權限狀態
    HISTORY_DB.forEach(item => renderCoilGallery(item.model, getCoilImgs(item)));
}

function handleCoilUpload(model, inputEl) {
    if (!isHistAdmin) { alert('訪客模式僅能檢視，請先以管理者身分登入才能上傳/刪除圖片。'); return; }
    const file = inputEl.files[0];
    const msgEl = document.getElementById('hcoilMsg_' + model);
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
        if (msgEl) msgEl.innerHTML = '<span style="color:var(--danger);">⚠ 檔案過大(建議<3MB)，請壓縮後再上傳。</span>';
        return;
    }
    const item = HISTORY_DB.find(h => h.model === model);
    const current = getCoilImgs(item);
    if (current.length >= COIL_IMGS_MAX) {
        if (msgEl) msgEl.innerHTML = `<span style="color:var(--danger);">⚠ 已達單一機型上限(${COIL_IMGS_MAX}張)，請先刪除幾張再上傳。</span>`;
        inputEl.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        const updated = [...current, e.target.result];
        saveCoilImgs(model, updated);
        renderCoilGallery(model, updated);
        inputEl.value = '';
    };
    reader.readAsDataURL(file);
}

function deleteCoilImage(model, idx) {
    if (!isHistAdmin) { alert('訪客模式僅能檢視，請先以管理者身分登入才能上傳/刪除圖片。'); return; }
    const item = HISTORY_DB.find(h => h.model === model);
    const current = getCoilImgs(item);
    current.splice(idx, 1);
    saveCoilImgs(model, current);
    renderCoilGallery(model, current);
}

function renderCoilGallery(model, imgs) {
    const gal = document.getElementById('hcoilGallery_' + model);
    if (!gal) return;
    if (imgs.length === 0) {
        gal.innerHTML = `<div class="hcoil-thumbwrap"><img class="hcoil-thumb" src="${COIL_PLACEHOLDER_SVG}" alt="尚未上傳"></div>`;
    } else {
        gal.innerHTML = imgs.map((src, i) => `
            <div class="hcoil-thumbwrap">
                <img class="hcoil-thumb" src="${src}" onclick="openCoilLightbox('${model}', ${i})" alt="${model} Coil圖面 ${i+1}">
                <div class="hcoil-thumb-del${isHistAdmin ? '' : ' hidden-guest'}" onclick="deleteCoilImage('${model}', ${i})" title="刪除此圖">✕</div>
            </div>`).join('');
    }
    const addBtn = document.getElementById('hcoilAddBtn_' + model);
    if (addBtn) {
        addBtn.classList.toggle('disabled-guest', !isHistAdmin);
        addBtn.title = isHistAdmin ? `新增圖片（上限${COIL_IMGS_MAX}張）` : '訪客模式僅能檢視，請先以管理者身分登入才能上傳/刪除圖片';
    }
}

let coilLightboxState = { model: null, imgs: [], idx: 0 };

function openCoilLightbox(model, idx) {
    const item = HISTORY_DB.find(h => h.model === model);
    const imgs = getCoilImgs(item);
    if (imgs.length === 0) return;
    coilLightboxState = { model, imgs, idx: idx || 0 };
    renderLightboxImg();
    document.getElementById('coilLightboxOverlay').style.display = 'flex';
}
function renderLightboxImg() {
    const s = coilLightboxState;
    document.getElementById('coilLightboxImg').src = s.imgs[s.idx];
    document.getElementById('coilLightboxTitle').innerText = s.model + ' — Coil圖面';
    document.getElementById('coilLightboxCounter').innerText = s.imgs.length > 1 ? `${s.idx + 1} / ${s.imgs.length}` : '';
}
function navCoilLightbox(dir) {
    const s = coilLightboxState;
    if (s.imgs.length <= 1) return;
    s.idx = (s.idx + dir + s.imgs.length) % s.imgs.length;
    renderLightboxImg();
}
function closeCoilLightbox() { document.getElementById('coilLightboxOverlay').style.display = 'none'; }

function getHistRxEff(item) {
    const rxCurve = RX_EFF_CURVES[item.rxKey];
    if (rxCurve) {
        const qX = rxCurve.axis === 'power' ? item.powerW : item.currentA;
        return interpEff(rxCurve.data, qX);
    }
    return RX_EFF_FIXED[item.rxKey] ?? null;
}

function renderHistTable(list) {
    const tbody = document.getElementById('histTableBody');
    if (!tbody) return;
    const arr = list || HISTORY_DB;
    tbody.innerHTML = arr.map(item => `
        <tr>
            <td>${item.model}${item.group ? '<br><span style="font-size:0.85em; color:#94a3b8;">' + item.group + '</span>' : ''}</td>
            <td>${item.rxName}</td>
            <td>${item.chName}</td>
            <td>${item.capacity}mAh</td>
            <td>${item.voltage}V</td>
            <td>${item.currentA}A</td>
            <td>${item.crate}C</td>
            <td>${item.chargeTime}</td>
            <td>${item.coilType || '—'}</td>
            <td>${item.shield || '—'}</td>
            <td>${item.size || '—'}</td>
            <td>${formatEfficiency(getHistRxEff(item))}${getHistRxEff(item) === null ? '' : '%'}</td>
            <td>${item.ls}</td>
            <td>${item.q ?? '—'}</td>
            <td>${item.dcr ?? '—'}</td>
        </tr>`).join('');
    if (!list) { const c = document.getElementById('histFilterCount'); if (c) c.innerText = ''; }
}

function populateHistFilterOptions() {
    const coilTypes = [...new Set(HISTORY_DB.map(h => h.coilType).filter(Boolean))].sort();
    const shields = [...new Set(HISTORY_DB.map(h => h.shield).filter(Boolean))].sort();
    const sizes = [...new Set(HISTORY_DB.map(h => h.size).filter(Boolean))].sort();

    const fillSelect = (id, values) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        values.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.innerText = v;
            sel.appendChild(opt);
        });
    };
    fillSelect('filterCoilType', coilTypes);
    fillSelect('filterShield', shields);
    fillSelect('filterSize', sizes);
    const rxNames = [...new Set(HISTORY_DB.map(h => getRxBaseName(h.rxName)).filter(Boolean))].sort();
    fillSelect('filterRxIc', rxNames);
}

function getRxBaseName(name) {
    if (!name) return name;
    return name.split('-')[0];
}

function applyHistFilters() {
    const coilType = document.getElementById('filterCoilType').value;
    const shield = document.getElementById('filterShield').value;
    const rxIc = document.getElementById('filterRxIc').value;
    const size = document.getElementById('filterSize').value;

    const filtered = HISTORY_DB.filter(item => {
        if (coilType && item.coilType !== coilType) return false;
        if (shield && item.shield !== shield) return false;
        if (size && item.size !== size) return false;
        if (rxIc && getRxBaseName(item.rxName) !== rxIc) return false;
        return true;
    });

    const countEl = document.getElementById('histFilterCount');
    if (countEl) countEl.innerText = `符合條件：${filtered.length} / ${HISTORY_DB.length} 筆`;

    renderHistTable(filtered);
    if (document.getElementById('histCardView').style.display !== 'none') renderHistCards(filtered);
}

function resetHistFilters() {
    ['filterCoilType', 'filterShield', 'filterSize', 'filterRxIc'].forEach(id => { document.getElementById(id).value = ''; });
    applyHistFilters();
}

function switchHistView(mode) {
    document.getElementById('histViewTableBtn').classList.toggle('active', mode === 'table');
    document.getElementById('histViewCardBtn').classList.toggle('active', mode === 'card');
    document.getElementById('histTableView').style.display = mode === 'table' ? 'table' : 'none';
    document.getElementById('histCardView').style.display = mode === 'card' ? 'block' : 'none';
    if (mode === 'card') applyHistFilters();
}

function fieldOrDash(val, suffix) { return (val === null || val === undefined || val === '') ? '<span class="hfield-value empty">— 待補</span>' : `<span class="hfield-value">${val}${suffix || ''}</span>`; }

function renderHistCards(list) {
    const box = document.getElementById('histCardView');
    const arr = list || HISTORY_DB;
    box.innerHTML = arr.map(item => {
        const rxCurve = RX_EFF_CURVES[item.rxKey];
        const chCurve = CHARGER_EFF_CURVES[item.chKey];

        let rxEffVal = '—', rxEffNote = '設定不存在或已刪除', rxEffColor = '#b45309';
        if (rxCurve) {
            const qX = rxCurve.axis === 'power' ? item.powerW : item.currentA;
            rxEffVal = formatEfficiency(interpEff(rxCurve.data, qX)) + ' %';
            rxEffNote = `依資料庫曲線查表 (${rxCurve.axis === 'power' ? qX.toFixed(2) + 'W' : qX.toFixed(2) + 'A'})`;
            rxEffColor = '#15803d';
        } else if (RX_EFF_FIXED[item.rxKey] !== undefined) {
            rxEffVal = formatEfficiency(RX_EFF_FIXED[item.rxKey]) + ' %';
            rxEffNote = '資料庫自訂固定效率';
        }

        let chEffVal = '—', chEffNote = '設定不存在或已刪除', chEffColor = '#b45309';
        if (chCurve) {
            const qX = chCurve.axis === 'power' ? item.powerW : item.currentA;
            chEffVal = formatEfficiency(interpEff(chCurve.data, qX)) + ' %';
            chEffNote = `依資料庫曲線查表 (${qX.toFixed(2)}${chCurve.axis === 'power' ? 'W' : 'A'})`;
            chEffColor = '#15803d';
        } else if (CHARGER_EFF_FIXED[item.chKey] !== undefined) {
            chEffVal = formatEfficiency(CHARGER_EFF_FIXED[item.chKey]) + ' %';
            chEffNote = '資料庫自訂固定效率';
        }

        return `
        <div class="hcard">
            <div class="hcard-header">
                <div class="hcard-header-title">${item.model}${item.group ? '<span style="font-weight:400; font-size:0.75em; color:#94a3b8; margin-left:8px;">' + item.group + '</span>' : ''}</div>
                <div class="hcard-pn">Merry P/N: ${item.pn}</div>
            </div>
            <div class="hcard-quad">
                <div class="hquad hquad-1">
                    <div class="hquad-title">⚡ 電氣參數 <span class="hist-data-tag confirmed">✅ 已確認規格</span></div>
                    <div class="hfield"><div class="hfield-label">Rx IC 型號</div>${fieldOrDash(item.rxName)}</div>
                    <div class="hfield"><div class="hfield-label">Charger IC 型號</div>${fieldOrDash(item.chName)}</div>
                    <div class="hfield"><div class="hfield-label">電池</div><div class="hfield-value">${item.capacity}mAh / ${item.voltage}V / ${item.crate}C</div></div>
                </div>
                <div class="hquad hquad-2">
                    <div class="hquad-title">🎯 RX IC 效率查表</div>
                    <div class="hfield"><div class="hfield-label">IC 型號</div><div class="hfield-value">${item.rxName}</div></div>
                    <div class="hcurve-box"><div class="hcv-label">查表依據</div><div class="hcv-val">${rxCurve && rxCurve.axis === 'current' ? item.currentA.toFixed(2) + ' A' : item.powerW.toFixed(2) + ' W'}</div></div>
                    <div class="hcurve-box" style="margin-top:6px;"><div class="hcv-label">${rxEffNote}</div><div class="hcv-val" style="color:${rxEffColor};">${rxEffVal}</div></div>
                </div>
                <div class="hquad hquad-3">
                    <div class="hquad-title">⚡ CHARGER IC 效率查表</div>
                    <div class="hfield"><div class="hfield-label">IC 型號</div><div class="hfield-value">${item.chName}</div></div>
                    <div class="hcurve-box"><div class="hcv-label">查表依據</div><div class="hcv-val">${chCurve?.axis === 'power' ? item.powerW.toFixed(2) + ' W' : item.currentA.toFixed(2) + ' A'}</div></div>
                    <div class="hcurve-box" style="margin-top:6px;"><div class="hcv-label">${chEffNote}</div><div class="hcv-val" style="color:${chEffColor};">${chEffVal}</div></div>
                </div>
                <div class="hquad hquad-4">
                    <div class="hquad-title">🧲 RX COIL 規格 <span class="hist-data-tag confirmed">✅ 已確認規格</span></div>
                    <div class="hfield"><div class="hfield-label">隔磁片材質</div>${fieldOrDash(item.shield)}</div>
                    <div class="hfield"><div class="hfield-label">感值 Ls (μH)</div><div class="hfield-value">${item.ls}</div></div>
                    <div class="hfield"><div class="hfield-label">Q 值 / DCR (mΩ)</div><div class="hfield-value">${item.q ?? '—'} / ${item.dcr ?? '—'}</div></div>
                    <div class="hfield"><div class="hfield-label">Type（繞線類型）</div>${fieldOrDash(item.coilType)}</div>
                    <div class="hfield"><div class="hfield-label">尺寸 (mm)</div>${fieldOrDash(item.size)}</div>
                </div>
            </div>

            <div class="hcoil-imgrow">
                <div style="width:100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div class="hfield-label">📷 Coil圖面（可上傳多張，點縮圖可放大並左右切換） <span class="hist-data-tag local">💾 本機暫存</span></div>
                        <div id="hcoilMsg_${item.model}" style="font-size:0.7em; color:#15803d;"></div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start;">
                        <div id="hcoilGallery_${item.model}" class="hcoil-gallery"></div>
                        <label id="hcoilAddBtn_${item.model}" class="hcoil-addbtn" title="新增圖片（上限${COIL_IMGS_MAX}張）">
                            ＋
                            <input type="file" id="hcoilFile_${item.model}" accept="image/*" onchange="if(!isHistAdmin){alert('訪客模式僅能檢視，請先以管理者身分登入才能上傳/刪除圖片。');this.value='';return;} handleCoilUpload('${item.model}', this)">
                        </label>
                    </div>
                </div>
            </div>
            <div class="hsummary-bar">
                <div class="hsummary-item"><div class="hs-label">充電時數要求</div><div class="hs-val">${item.chargeTime}</div></div>
                <div class="hsummary-item"><div class="hs-label">Rx IC效率</div><div class="hs-val" style="color:${rxEffColor === '#15803d' ? '#4ade80' : '#fbbf24'};">${rxEffVal}</div></div>
                <div class="hsummary-item"><div class="hs-label">Charger IC效率</div><div class="hs-val" style="color:${chEffColor === '#15803d' ? '#4ade80' : '#fbbf24'};">${chEffVal}</div></div>
            </div>
        </div>`;
    }).join('');

    // 卡片HTML注入DOM後，逐一機型填入Coil圖庫縮圖
    HISTORY_DB.forEach(item => renderCoilGallery(item.model, getCoilImgs(item)));
}

