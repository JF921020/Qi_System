# Qi 無線充電預測工具（Django）

在 `Qi_System` 目錄執行：

```powershell
cd backend
.\venv\Scripts\python.exe manage.py runserver
```

開啟 http://127.0.0.1:8000/ 即可使用，不需要啟動 Vue 或 Vite。
若要使用 Django 內建 `/admin/`，先執行 `manage.py migrate` 與 `manage.py createsuperuser`。

## 檔案位置

- `apps/calculator/templates/calculator/index.html`：Django 頁面模板。
- `apps/calculator/static/calculator/qi-tool.css`：頁面樣式。
- `apps/calculator/static/calculator/qi-tool.js`：API 呼叫、結果顯示、繪圖、歷史資料及互動功能。
- `apps/calculator/service.py`：效率計算純函式與輸入驗證，未來修改公式的入口。
- `apps/calculator/curves.json`：內建 IC 曲線與暫定效率；由後端載入並提供前端顯示。
- `apps/calculator/views.py`、`urls.py`：頁面入口與路由。

原始外部 HTML 保留不動；現有 `frontend` 目錄不參與此頁面。
CSS 與 JS 透過 Django 的 `{% static %}` 引用；JS 保持一般 script，讓 HTML 的 onclick 等事件仍可呼叫原有函式。

## 目前範圍

Django 負責頁面與主要效率 API：IC 曲線插值、ACR、Qrx、線圈／系統效率、輸入功率與各階損耗。
前端在每次輸入變動時立即送出完整參數，不等待停止輸入；後端回傳後立即更新數字，仍有網路請求延遲。舊請求會取消，過期回應不會覆蓋新結果；等待時上方效率欄位保留上次數值，收到新結果後更新；失敗時保留上次效率並標示尚未更新，其餘舊結果清除，15 秒逾時可重試。
智慧反推的目標求解、診斷文字與歷史卡片查表仍在前端；診斷使用最新後端結果，損耗分項與主畫面一致。
歷史資料仍內嵌在 JS，圖片仍存於 localStorage，自訂曲線仍只存在當次頁面記憶體，計算時隨請求傳送並由後端驗證。
從原本 file:// 開啟的頁面切換到 localhost 後，瀏覽器不會自動帶入原來源的 localStorage 圖片。
頁面中的管理者登入仍是原始的示範功能，與 Django `/admin/` 無關，不能作為真正的權限驗證。

## 計算 API

`POST /api/calculate/`，Content-Type 為 `application/json`，同源請求需帶 `X-CSRFToken`。
請求格式為 `{"state": {...}, "customCurves": {"rx": {...}, "charger": {...}}}`。
`state` 必填數值：`batCapacity` (mAh)、`batVoltage` (V)、`batMaxC`、`sysPower` (W)、`rxL` (µH)、`rxR` (mΩ)、`freq` (kHz)、`qTx`、`kVal`。
必填選項：`caseMaterial` (`pc_abs/aluminum/zinc`)、`ncWrap` (`yes/no`)、`rxIcSelect`、`chargerIcSelect`。
`kVal` 範圍為 0–1；`sysPower` 與 `batMaxC` 可為零，其餘上述數值必須大於零（目前最小 0.000001），數值上限為 1000000。
選擇 `custom` 時需提供對應的 `rxIcEff` 或 `chargerIcEff` (0–100%)。
`custom_*` 型號需提供對應自訂曲線：`axis` 為 `power/current`，`data` 為 3–1000 組 `[x, efficiency]`，x 必須非負且嚴格遞增，效率為 0–100%。
內建型號的曲線以後端為準，請求無法覆寫。曲線範圍以外沿用端點效率；充電 IC 沿用原版按電流查表規則。

成功回傳 `modelVersion: "lqk-v1"`、各階效率、`Qrx`、`rxACR`、`pInTotal`、`totalLoss`、`coilLoss`、`icLoss` 等欄位。
零效率且要求非零輸出時，無法計算的功率為 `null`，並附上 `warnings`，不回傳 Infinity 或 NaN。
輸入錯誤回傳 400 JSON `error`，非 JSON 為 415，非 POST 為 405；CSRF 驗證失敗為 403。
此版保留原有經驗公式，不代表增加物理模型準確度；調整模型時請更新版本及比對案例。

## 驗證

```powershell
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py test apps.calculator
node --check apps/calculator/static/calculator/qi-tool.js
node apps/calculator/testdata/request_flow.cjs
```

測試包含移植前由原始 JS 擷取的 20 組案例（`testdata/legacy_results.json`）、能量守恆、自訂曲線、錯誤输入、CSRF 與請求隔離。

正式部署時需依環境設定 SECRET_KEY、DEBUG、ALLOWED_HOSTS，並執行 `manage.py collectstatic`，由靜態檔案伺服器提供 `staticfiles` 目錄。
資源配置依循 [Django 靜態檔案文件](https://docs.djangoproject.com/en/dev/howto/static-files/)。
