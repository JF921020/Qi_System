// ─── 4. V26 Canvas 繪圖引擎 ───
function resizeCanvases() {
    ['topCanvas_Layout', 'zCanvas'].forEach(id => {
        const c = document.getElementById(id);
        if (c && c.parentElement) {
            c.width = c.parentElement.clientWidth || 400;
            c.height = c.parentElement.clientHeight || 260;
        }
    });
}

function draw2D(canvas, envObj) {
    if(!canvas) return;
    let ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    if(w === 0 || h === 0) return;
    const REF2D = 65;
    const sc = Math.min(w / REF2D, h / REF2D);
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    
    if(state.ncWrap === 'yes') {
        ctx.strokeStyle = "rgba(51, 51, 51, 0.4)"; ctx.lineWidth = 4; ctx.setLineDash([8, 4]);
        ctx.strokeRect(cx-(envObj.nW/2)*sc, cy-(envObj.nH/2)*sc, envObj.nW*sc, envObj.nH*sc);
        ctx.setLineDash([]);
    }

    let textX = cx + 32*sc; 
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)"; 
    ctx.fillRect(textX - 5, cy - 20*sc, 180, 58*sc);
    ctx.textAlign = "left"; 
    
    ctx.font = "bold " + Math.max(9, 11*sc/6) + "px Arial";
    ctx.fillStyle = "#add8e6";
    ctx.fillText(`Tx 磁鐵環: ID ${TX_MAG_RING_ID.toFixed(1)} / OD ${TX_MAG_RING_OD.toFixed(1)} mm`, textX, cy - 9*sc);
    ctx.strokeStyle = "rgba(173, 216, 230, 0.8)";
    ctx.lineWidth = 2*sc;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, TX_MAG_MEAN_R*sc, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.strokeStyle = "#e53935";
    ctx.lineWidth = 3*sc;
    ctx.beginPath();
    ctx.arc(cx, cy, TX_MAG_MEAN_R*sc, -RX_LEAD_GAP_HALF_ANGLE_RAD, RX_LEAD_GAP_HALF_ANGLE_RAD);
    ctx.stroke();
    ctx.fillStyle = "#e53935";
    ctx.font = "bold " + Math.max(8, 9*sc/6) + "px Arial";
    ctx.fillText(`走線缺口: ${RX_LEAD_GAP_ARC_MM.toFixed(2)}mm (2×${RX_LEAD_GAP_HALF_ANGLE_DEG.toFixed(1)}°)`, textX, cy + 13*sc);
    ctx.restore();

    ctx.fillStyle = "#ff69b4"; ctx.font = "bold " + Math.max(9, 11*sc/6) + "px Arial";
    ctx.fillText("TX Coil: ID 20.5 / OD 44 mm", textX, cy + 2*sc);

    ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(cx, cy, 10.25*sc, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(255, 182, 193, 0.6)"; ctx.beginPath(); ctx.arc(cx, cy, 22*sc, 0, Math.PI*2); ctx.arc(cx, cy, 10.25*sc, 0, Math.PI*2, true); ctx.fill();

    ctx.beginPath(); ctx.moveTo(cx - 10.25*sc, cy); ctx.lineTo(cx + 10.25*sc, cy);
    ctx.strokeStyle = "rgba(217, 48, 37, 0.8)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 10.25*sc, cy); ctx.lineTo(cx - 10.25*sc + 4, cy - 3); ctx.lineTo(cx - 10.25*sc + 4, cy + 3); ctx.fillStyle = "rgba(217, 48, 37, 0.8)"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 10.25*sc, cy); ctx.lineTo(cx + 10.25*sc - 4, cy - 3); ctx.lineTo(cx + 10.25*sc - 4, cy + 3); ctx.fill();
    ctx.font = "bold 10px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillStyle = "#d93025";
    ctx.fillText("Ø20.5", cx, cy - 2);

    let drawCoilX = Math.max(1, state.coilX - state.coilW);
    let drawCoilY = Math.max(1, state.coilY - state.coilW);
    let userR = state.coilR - state.coilW/2;
    let drawCoilR = Math.max(0, Math.min(drawCoilX/2 - 0.01, drawCoilY/2 - 0.01, userR));
    let r = drawCoilR * sc, rx = cx - (drawCoilX/2)*sc, ry = cy - (drawCoilY/2)*sc, rw = drawCoilX * sc, rh = drawCoilY * sc;

    ctx.beginPath();
    ctx.moveTo(rx + r, ry); ctx.lineTo(rx + rw - r, ry); ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
    ctx.lineTo(rx + rw, ry + rh - r); ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
    ctx.lineTo(rx + r, ry + rh); ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
    ctx.lineTo(rx, ry + r); ctx.arcTo(rx, ry, rx + r, ry, r);
    ctx.closePath();
    ctx.lineWidth = state.coilW * sc; 
    ctx.strokeStyle = "rgba(243, 156, 18, 0.8)"; 
    ctx.stroke();

    if (state.enableMagnet) {
        let effW = state.magW + state.magCoating; 
        envObj.angles.forEach(ang => {
            ctx.save(); ctx.translate(cx+Math.cos(ang)*TX_MAG_MEAN_R*sc, cy+Math.sin(ang)*TX_MAG_MEAN_R*sc); ctx.rotate(ang+Math.PI/2);
            ctx.strokeStyle = "#7e22ce"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); 
            ctx.strokeRect(-(effW/2+0.4)*sc, -(RX_MAG_L/2+0.4)*sc, (effW+0.8)*sc, (RX_MAG_L+0.8)*sc); 
            ctx.setLineDash([]);
            ctx.fillStyle = "#ff0000"; ctx.fillRect(-effW*sc/2, 0, effW*sc, (RX_MAG_L/2)*sc); 
            ctx.fillStyle = "#1a73e8"; ctx.fillRect(-effW*sc/2, -(RX_MAG_L/2)*sc, effW*sc, (RX_MAG_L/2)*sc);
            ctx.fillStyle = "white"; ctx.font = "bold "+Math.max(7, 8*sc/6)+"px Arial"; ctx.textAlign = "center"; ctx.textBaseline='middle';
            ctx.fillText("N", 0, (RX_MAG_L/4)*sc); ctx.fillText("S", 0, -(RX_MAG_L/4)*sc);
            ctx.restore();
        });

        if(state.a1 > 0) {
            let rArrow = 18 * sc, rad = state.a1 * Math.PI / 180;
            ctx.beginPath(); ctx.strokeStyle = "rgba(255, 0, 0, 0.35)"; ctx.lineWidth = 1;
            ctx.moveTo(cx, cy); ctx.lineTo(cx + rArrow + 6*sc, cy);
            ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(-rad)*(rArrow+6*sc), cy + Math.sin(-rad)*(rArrow+6*sc)); ctx.stroke();
            
            ctx.beginPath(); ctx.strokeStyle = "red"; ctx.lineWidth = 1.5; 
            ctx.arc(cx, cy, rArrow, 0, -rad, true); ctx.stroke();
            
            let drawArrow = (angle) => {
                ctx.beginPath(); ctx.arc(cx + Math.cos(angle)*rArrow, cy + Math.sin(angle)*rArrow, 2.5, 0, Math.PI*2); ctx.fillStyle="red"; ctx.fill();
            };
            drawArrow(0); drawArrow(-rad); 
            ctx.fillStyle = "red"; ctx.font = "bold "+Math.max(9, 11*sc/6)+"px Arial"; ctx.textAlign = "left"; 
            ctx.fillText(state.a1 + "°", cx + 20*sc, cy - 6*sc);
        }
    }
    
    ctx.strokeStyle = state.ncWrap === 'yes' ? "rgba(51, 51, 51, 0.5)" : "#000";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(cx-(envObj.nW/2)*sc, cy-(envObj.nH/2)*sc, envObj.nW*sc, envObj.nH*sc);
}

function drawZ_Aligned(canvas, envObj, totalZ, coilPhysicalPos) {
    if(!canvas) return;
    let ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    if(w === 0 || h === 0) return;
    ctx.clearRect(0, 0, w, h);
    
    let cx = w / 2;
    let txBaseH = h * 0.65;
    let maxZ_scale = Math.max(totalZ + 1.5, 12.0);
    let sc_y = (h * 0.55) / maxZ_scale;
    const py = (z) => txBaseH - (z * sc_y);
    let sc_x = Math.min(w / 80, 5.5);

    let gapInput = state.gapInput;
    let z_shellBot = 0; 
    let z_shellTop = z_shellBot + gapInput;
    let magTotalT = state.enableMagnet ? (state.magT + state.magCoating) : 0;
    let susTotalT = state.enableMagnet ? state.susT : 0;
    let z_magTop = z_shellTop + magTotalT;
    let z_susTop = z_magTop + susTotalT; 
    let z_nanoBot = state.enableMagnet ? (z_susTop + 0.3) : (z_shellTop + state.coilT);
    let z_nanoTop = z_nanoBot + state.ncT;
    let z_coilTop = z_nanoBot;
    let z_coilBot = z_coilTop - state.coilT;

    let rxL_px = state.coilX * sc_x, txL_px = 65 * sc_x, grayW_px = envObj.nW * sc_x, txBoxH = 38;
    let maxRxEdge_px = state.enableMagnet ? (TX_MAG_MEAN_R * sc_x + (state.magW + state.magCoating)*sc_x) : (state.coilX/2 * sc_x);

    let y_8mm = py(8.0), txCoilR_px = 22 * sc_x; 
    
    ctx.strokeStyle = "#ff69b4"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - txCoilR_px, py(0));
    let domePeakZ = Math.max(8.5, totalZ + 2);
    ctx.quadraticCurveTo(cx, py(domePeakZ), cx + txCoilR_px, py(0)); ctx.stroke();

    let arcTargetX = cx + txCoilR_px * 0.6, arcTargetY = py(domePeakZ * 0.6); 
    ctx.fillStyle = "#ff69b4"; ctx.font = "bold 11px Arial"; ctx.textAlign = "left";
    ctx.fillText("Tx magnetic field", arcTargetX + 15, arcTargetY - 10);
    ctx.strokeStyle = "#ff69b4"; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(arcTargetX + 12, arcTargetY - 6); ctx.lineTo(arcTargetX + 2, arcTargetY - 1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(arcTargetX, arcTargetY); ctx.lineTo(arcTargetX + 7, arcTargetY - 2); ctx.lineTo(arcTargetX + 3, arcTargetY - 8); ctx.fillStyle = "#ff69b4"; ctx.fill();

    let dashLineStart = cx - maxRxEdge_px - 50, dashLineEnd = arcTargetX + 100;
    ctx.strokeStyle = "#ff69b4"; ctx.lineWidth = 2; ctx.setLineDash([8, 4]);
    ctx.beginPath(); ctx.moveTo(dashLineStart, y_8mm); ctx.lineTo(dashLineEnd, y_8mm); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#ff69b4"; ctx.font = "bold 11px Arial"; ctx.textAlign = "right"; 
    ctx.fillText("8mm Safety line", dashLineStart - 5, y_8mm + 4);

    ctx.fillStyle = "#e6e6e6";
    ctx.fillRect(cx - grayW_px/2, py(z_nanoBot), grayW_px, py(0) - py(z_nanoBot));

    ctx.fillStyle = "white"; ctx.fillRect(cx - txL_px/2, py(0), txL_px, txBoxH);
    let txMagDist = TX_MAG_MEAN_R * sc_x, txMagW_px = 8 * sc_x;
    ctx.fillStyle = "pink"; ctx.fillRect(cx - txMagDist, py(0) + 6, txMagDist*2, 12);
    
    const pinkTopY = py(0) + 6, pinkAnnoX = cx - txL_px/2 - 4;
    ctx.strokeStyle = "#c2185b"; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(pinkAnnoX, py(0)); ctx.lineTo(pinkAnnoX, pinkTopY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#c2185b"; ctx.font = "bold 9px Arial"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText("≤0.75mm", pinkAnnoX - 4, (py(0) + pinkTopY) / 2);

    ctx.fillStyle = "lightblue"; 
    ctx.fillRect(cx - txMagDist - txMagW_px/2, py(0) + 6, txMagW_px, 12); 
    ctx.fillRect(cx + txMagDist - txMagW_px/2, py(0) + 6, txMagW_px, 12);
    
    ctx.fillStyle = "#000"; ctx.font = "bold 8px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("N", cx - txMagDist - txMagW_px/4, py(0) + 12); ctx.fillText("S", cx - txMagDist + txMagW_px/4, py(0) + 12);
    ctx.fillText("S", cx + txMagDist - txMagW_px/4, py(0) + 12); ctx.fillText("N", cx + txMagDist + txMagW_px/4, py(0) + 12);

    ctx.fillStyle = "#000"; ctx.font = "11px Arial"; ctx.textAlign="center"; ctx.textBaseline="bottom"; 
    ctx.fillText("TX充電盤", cx, py(0) + txBoxH - 3);
    ctx.strokeStyle = "#555"; ctx.strokeRect(cx - txL_px/2, py(0), txL_px, txBoxH); 

    ctx.fillStyle = "rgba(243, 156, 18, 0.85)"; 
    ctx.fillRect(cx - rxL_px/2, py(z_coilTop), rxL_px, py(z_coilBot) - py(z_coilTop));

    if (state.enableMagnet) {
        let drawMag = (offsetX) => {
            let mW = (state.magW + state.magCoating) * sc_x, mx = cx + (offsetX * sc_x) - mW/2, mH = py(z_shellTop) - py(z_magTop);
            ctx.fillStyle = "#a855f7"; ctx.fillRect(mx - 2, py(z_susTop), mW + 4, py(z_magTop) - py(z_susTop));
            if (offsetX < 0) {
                ctx.fillStyle = "#1a73e8"; ctx.fillRect(mx, py(z_magTop), mW/2, mH); 
                ctx.fillStyle = "#d93025"; ctx.fillRect(mx + mW/2, py(z_magTop), mW/2, mH);
                ctx.fillStyle = "white"; ctx.font = "bold 9px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; 
                ctx.fillText("S", mx + mW/4, py(z_magTop) + mH/2); ctx.fillText("N", mx + mW*0.75, py(z_magTop) + mH/2);
            } else {
                ctx.fillStyle = "#d93025"; ctx.fillRect(mx, py(z_magTop), mW/2, mH); 
                ctx.fillStyle = "#1a73e8"; ctx.fillRect(mx + mW/2, py(z_magTop), mW/2, mH);
                ctx.fillStyle = "white"; ctx.font = "bold 9px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; 
                ctx.fillText("N", mx + mW/4, py(z_magTop) + mH/2); ctx.fillText("S", mx + mW*0.75, py(z_magTop) + mH/2);
            }
        };
        drawMag(-TX_MAG_MEAN_R); drawMag(TX_MAG_MEAN_R);
    }

    ctx.fillStyle = "#333"; ctx.fillRect(cx - grayW_px/2, py(z_nanoTop), grayW_px, py(z_nanoBot) - py(z_nanoTop));
    if (state.ncWrap === 'yes') {
        let wrapThickness = 1.5 * sc_x, wrapBottomZ = state.enableMagnet ? z_magTop : z_shellTop; 
        ctx.fillStyle = "#333"; 
        ctx.fillRect(cx - grayW_px/2, py(wrapBottomZ), wrapThickness, py(z_nanoTop) - py(wrapBottomZ)); 
        ctx.fillRect(cx + grayW_px/2 - wrapThickness, py(wrapBottomZ), wrapThickness, py(z_nanoTop) - py(wrapBottomZ)); 
    }

    let drawDim = (x, y1, y2, text, align, textOffsetX = 0) => {
        ctx.strokeStyle = "red"; ctx.fillStyle = "red"; ctx.lineWidth = 1.2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x-3, y1+(y1<y2?5:-5)); ctx.lineTo(x+3, y1+(y1<y2?5:-5)); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x-3, y2-(y1<y2?5:-5)); ctx.lineTo(x+3, y2-(y1<y2?5:-5)); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + (align==='left'?4:-4), y1); ctx.lineTo(x + (align==='left'?-8:8), y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + (align==='left'?4:-4), y2); ctx.lineTo(x + (align==='left'?-8:8), y2); ctx.stroke();
        ctx.font = "bold 10.5px Arial"; ctx.textAlign = align; ctx.textBaseline = "middle"; 
        ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.strokeText(text, x + textOffsetX, (y1+y2)/2); 
        ctx.fillStyle = "red"; ctx.fillText(text, x + textOffsetX, (y1+y2)/2);
    };

    let leftX = cx - Math.max(grayW_px/2, txL_px/2, maxRxEdge_px) - 25;
    drawDim(leftX, py(0), py(z_nanoTop), `預測 Z 高度:${totalZ.toFixed(2)}`, "right", -5);

    let coilLineX = cx - 55;
    ctx.strokeStyle = "red"; ctx.fillStyle = "red"; ctx.lineWidth = 1.2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(coilLineX, py(0)); ctx.lineTo(coilLineX, py(z_coilBot)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(coilLineX, py(0)); ctx.lineTo(coilLineX-3, py(0)-5); ctx.lineTo(coilLineX+3, py(0)-5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(coilLineX, py(z_coilBot)); ctx.lineTo(coilLineX-3, py(z_coilBot)+5); ctx.lineTo(coilLineX+3, py(z_coilBot)+5); ctx.fill();
    ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; 
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.strokeText(`Rx線圈距離:${coilPhysicalPos.toFixed(2)}`, cx, (py(0) + py(z_coilBot))/2);
    ctx.fillStyle = "red"; ctx.fillText(`Rx線圈距離:${coilPhysicalPos.toFixed(2)}`, cx, (py(0) + py(z_coilBot))/2);

    let rightMagX = cx + maxRxEdge_px + 20; 
    if(state.enableMagnet) { 
        drawDim(rightMagX, py(0), py(z_shellTop), `偷肉:${gapInput.toFixed(2)}`, "left", 5); 
    } else { 
        let rightX = cx + rxL_px/2 + 20; 
        drawDim(rightX, py(0), py(z_shellTop), `肉厚:${gapInput.toFixed(2)}`, "left", 5); 
    }

    ctx.font = "bold 10px Arial"; ctx.textAlign = "center"; ctx.fillStyle = "#333"; 
    ctx.fillText(state.coilT.toFixed(2), cx + 20, (py(z_coilTop) + py(z_coilBot)) / 2);
    ctx.fillStyle = "white"; 
    ctx.fillText(state.ncT.toFixed(2), cx + 20, (py(z_nanoTop) + py(z_nanoBot)) / 2);
}

function drawLayoutCanvases() {
    const envObj = calculateEnvelopes();
    const magTot = state.enableMagnet ? (state.magT + state.magCoating) : 0;
    const susTot = state.enableMagnet ? state.susT : 0;
    const nBase = state.enableMagnet ? (state.gapInput + magTot + susTot + 0.3) : (state.rxCoilDist + state.coilT);
    const totalZ = nBase + state.ncT;
    const coilPhysicalPos = state.enableMagnet ? (nBase - state.coilT) : state.rxCoilDist;

    const cvTop = document.getElementById('topCanvas_Layout');
    const cvZ = document.getElementById('zCanvas');
    draw2D(cvTop, envObj);
    drawZ_Aligned(cvZ, envObj, totalZ, coilPhysicalPos);

    const hudNc = document.getElementById('hudNcSize');
    if(hudNc) hudNc.innerText = `${envObj.nW.toFixed(1)} × ${envObj.nH.toFixed(1)} mm${state.ncWrap === 'yes' ? ' (含包邊)' : ''}`;

    const barZ = document.getElementById('hudZSum');
    if(barZ) barZ.innerText = totalZ.toFixed(2) + " mm";
    const barPos = document.getElementById('hudCoilPos');
    if(barPos) barPos.innerText = coilPhysicalPos.toFixed(2) + " mm";
}

