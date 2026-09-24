// ─── 8. IC Efficiency Curve 數位化工具 ───
let dig = {
    target: 'rx',       // 'rx' | 'charger'
    img: null,
    calib: [],          // [{px,py,value}, ...] 依序：X1,X2,Y1,Y2
    calibStage: 0,
    pendingPixel: null,
    calibDone: false,
    points: []          // [{x, y}, ...] 已數位化的資料點 (真實座標)
};

const DIG_CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦'];
function renumberDigSteps() {
    const steps = document.querySelectorAll('#digModal .dig-step');
    let visIdx = 0;
    steps.forEach(step => {
        const numSpan = step.querySelector('.dig-num');
        if (!numSpan) return;
        const isVisible = step.style.display !== 'none' && getComputedStyle(step).display !== 'none';
        if (isVisible) {
            numSpan.innerText = DIG_CIRCLE_NUMS[visIdx] || (visIdx + 1);
            visIdx++;
        }
    });
}

function openDigitizer(target) {
    dig = { target, img: null, calib: [], calibStage: 0, pendingPixel: null, calibDone: false, points: [] };
    document.getElementById('digHeaderTitle').innerText = target === 'rx' ? '➕ 新增自訂 Rx IC 型號（曲線數位化）' : '➕ 新增自訂 Charger IC 型號（曲線數位化）';
    document.getElementById('digModelName').value = '';
    document.getElementById('digAxisType').value = target === 'rx' ? 'power' : 'current';
    document.getElementById('digFileInput').value = '';
    document.getElementById('digCanvasWrap').style.display = 'none';
    document.getElementById('digCalibStep').style.display = 'none';
    document.getElementById('digDigitizeStep').style.display = 'none';
    document.getElementById('digCalibInputRow').style.display = 'none';
    document.getElementById('digSaveMsg').innerText = '';
    document.getElementById('digPtTbody').innerHTML = '';
    updateDigColHeader();
    renumberDigSteps();
    document.getElementById('digModal').style.display = 'flex';
}
function closeDigitizer() { document.getElementById('digModal').style.display = 'none'; }

function updateDigColHeader() {
    const axisType = document.getElementById('digAxisType').value;
    document.getElementById('digColX').innerText = axisType === 'power' ? 'X: 功率(W)' : 'X: 電流(A)';
}

document.addEventListener('DOMContentLoaded', () => {
    renderHistTable();
    populateHistFilterOptions();
    const axisSel = document.getElementById('digAxisType');
    if (axisSel) axisSel.addEventListener('change', updateDigColHeader);

    const fileInput = document.getElementById('digFileInput');
    if (fileInput) fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                dig.img = img;
                const canvas = document.getElementById('digCanvas');
                const maxW = 660;
                const scale = img.width > maxW ? maxW / img.width : 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                dig.imgScale = scale;
                redrawDigCanvas();
                document.getElementById('digCanvasWrap').style.display = 'block';
                document.getElementById('digCalibStep').style.display = 'block';
                document.getElementById('digCalibHint').innerText = '請點擊X軸上第1個已知刻度點';
                renumberDigSteps();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    const canvas = document.getElementById('digCanvas');
    if (canvas) canvas.addEventListener('click', e => {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        if (!dig.calibDone) {
            dig.pendingPixel = { px, py };
            redrawDigCanvas();
            document.getElementById('digCalibInputRow').style.display = 'flex';
            document.getElementById('digCalibValue').value = '';
            document.getElementById('digCalibValue').focus();
            return;
        }
        // 描點模式：直接依校正換算成真實座標
        const realX = pixelToRealX(px);
        const realY = pixelToRealY(py);
        dig.points.push({ x: realX, y: realY, px, py });
        dig.points.sort((a, b) => a.x - b.x);
        redrawDigCanvas();
        renderDigPtTable();
    });
});

function confirmCalibPoint() {
    if (!dig.pendingPixel) return;
    const val = parseFloat(document.getElementById('digCalibValue').value);
    if (isNaN(val)) { alert('請輸入數值'); return; }
    dig.calib.push({ px: dig.pendingPixel.px, py: dig.pendingPixel.py, value: val });
    dig.pendingPixel = null;
    dig.calibStage++;
    document.getElementById('digCalibInputRow').style.display = 'none';

    const hints = [
        '請點擊X軸上第1個已知刻度點',
        '請點擊X軸上第2個已知刻度點（與第1點數值不同）',
        '請點擊Y軸上第1個已知刻度點',
        '請點擊Y軸上第2個已知刻度點（與第1點數值不同）'
    ];
    if (dig.calibStage < 4) {
        document.getElementById('digCalibHint').innerText = hints[dig.calibStage];
    } else {
        dig.calibDone = true;
        document.getElementById('digCalibHint').innerText = '✅ 座標校正完成，請開始在下方描點';
        document.getElementById('digDigitizeStep').style.display = 'block';
        renumberDigSteps();
    }
    redrawDigCanvas();
}

function resetCalibration() {
    dig.calib = [];
    dig.calibStage = 0;
    dig.calibDone = false;
    dig.pendingPixel = null;
    dig.points = [];
    document.getElementById('digCalibHint').innerText = '請點擊X軸上第1個已知刻度點';
    document.getElementById('digCalibInputRow').style.display = 'none';
    document.getElementById('digDigitizeStep').style.display = 'none';
    document.getElementById('digPtTbody').innerHTML = '';
    renumberDigSteps();
    redrawDigCanvas();
}

function pixelToRealX(px) {
    if (dig.calib.length < 2) return 0;
    const [c1, c2] = dig.calib;
    if (c2.px === c1.px) return c1.value;
    return c1.value + (px - c1.px) * (c2.value - c1.value) / (c2.px - c1.px);
}
function pixelToRealY(py) {
    if (dig.calib.length < 4) return 0;
    const c1 = dig.calib[2], c2 = dig.calib[3];
    if (c2.py === c1.py) return c1.value;
    return c1.value + (py - c1.py) * (c2.value - c1.value) / (c2.py - c1.py);
}

function redrawDigCanvas() {
    const canvas = document.getElementById('digCanvas');
    if (!canvas || !dig.img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(dig.img, 0, 0, canvas.width, canvas.height);

    // 畫已確認的校正點 (藍色)
    ctx.fillStyle = '#2563eb';
    dig.calib.forEach((c, i) => {
        ctx.beginPath(); ctx.arc(c.px, c.py, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillText((i < 2 ? 'X' : 'Y') + (i % 2 === 0 ? '1' : '2'), c.px + 6, c.py - 6);
    });
    // 畫待確認的點 (橘色空心)
    if (dig.pendingPixel) {
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(dig.pendingPixel.px, dig.pendingPixel.py, 5, 0, Math.PI * 2); ctx.stroke();
    }
    // 畫描點結果 (紅色) + 連線
    if (dig.points.length > 0) {
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        dig.points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.px, p.py); else ctx.lineTo(p.px, p.py); });
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        dig.points.forEach(p => { ctx.beginPath(); ctx.arc(p.px, p.py, 3.5, 0, Math.PI * 2); ctx.fill(); });
    }
}

function renderDigPtTable() {
    const tbody = document.getElementById('digPtTbody');
    tbody.innerHTML = dig.points.map((p, i) =>
        `<tr><td>${i + 1}</td><td>${p.x.toFixed(2)}</td><td>${p.y.toFixed(1)}</td><td><span class="dig-del-btn" onclick="deleteDigPoint(${i})">✕</span></td></tr>`
    ).join('');
}
function deleteDigPoint(i) { dig.points.splice(i, 1); redrawDigCanvas(); renderDigPtTable(); }
function undoLastPoint() { dig.points.pop(); redrawDigCanvas(); renderDigPtTable(); }
function clearAllPoints() { dig.points = []; redrawDigCanvas(); renderDigPtTable(); }

function saveDigitizedToDatabase() {
    const name = document.getElementById('digModelName').value.trim();
    if (!name || dig.points.length < 3) {
        document.getElementById('digSaveMsg').textContent = '請輸入型號名稱，並至少描出 3 個資料點。';
        return;
    }
    const button = document.getElementById('digDatabaseSave');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = dig.target === 'rx' ? button.dataset.rxUrl : button.dataset.chargerUrl;
    const fields = {
        csrfmiddlewaretoken: document.querySelector('[name=csrfmiddlewaretoken]').value,
        name, model_number: name, mode: 'curve', provisional: 'on',
        axis: document.getElementById('digAxisType').value,
        points: JSON.stringify(dig.points.map(p => [p.x, p.y])),
        source: '使用者手動數位化',
    };
    for (const [key, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = key; input.value = value;
        form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
}

function saveDigitizedCurve() {
    const msgEl = document.getElementById('digSaveMsg');
    const modelName = document.getElementById('digModelName').value.trim();
    if (!modelName) { msgEl.innerHTML = '<span style="color:var(--danger);">請先輸入型號名稱。</span>'; return; }
    if (dig.points.length < 3) { msgEl.innerHTML = '<span style="color:var(--danger);">請至少描出3個資料點才能建立可用曲線。</span>'; return; }

    const axisType = document.getElementById('digAxisType').value;
    const key = 'custom_' + modelName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '_' + Date.now().toString(36).slice(-4);
    const curveData = dig.points.map(p => [p.x, p.y]);
    const curveObj = { axis: axisType, src: `使用者手動數位化：${modelName}`, data: curveData };

    const selectId = dig.target === 'rx' ? 'rxIcSelect' : 'chargerIcSelect';
    const curveMap = dig.target === 'rx' ? RX_EFF_CURVES : CHARGER_EFF_CURVES;
    curveMap[key] = curveObj;

    const selectEl = document.getElementById(selectId);
    const opt = document.createElement('option');
    opt.value = key;
    opt.text = `${modelName} [✅ 使用者數位化, ${dig.points.length}點]`;
    selectEl.appendChild(opt);
    selectEl.value = key;
    state[selectId] = key;

    msgEl.innerHTML = `<span style="color:var(--eff-green); font-weight:700;">✅ 已儲存並加入「${dig.target === 'rx' ? 'Rx IC' : 'Charger IC'}」下拉選單，已自動選用。</span>`;
    triggerCalc();
    setTimeout(() => { closeDigitizer(); }, 900);
}

