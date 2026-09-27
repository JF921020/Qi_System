# Qi 無線充電預測工具（Django）

在 `Qi_System` 目錄執行：

```powershell
.\venv\Scripts\python.exe backend/manage.py migrate
.\venv\Scripts\python.exe backend/manage.py runserver
```

開啟 http://127.0.0.1:8000/ 即可使用，不需要啟動 Vue 或 Vite。
若要使用 Django 內建 `/admin/`，先執行 `manage.py migrate` 與 `manage.py createsuperuser`。

## 檔案位置

- `apps/main/templates/main/index.html`：Django 頁面模板。
- `apps/main/static/main/qi-tool.css`：頁面樣式。
- `apps/main/static/main/qi-tool-*.js`：API 呼叫、結果顯示、繪圖、歷史資料及互動功能模組。
- `apps/main/service.py`：效率計算純函式與輸入驗證，未來修改公式的入口。
- `apps/ICmanage/`：IC 管理的 model、form、catalog、view、URL、模板、樣式、admin 與測試。
- `apps/main/curves.json`：原始曲線基準，保留作舊版計算比對；線上計算使用資料庫。
- `apps/main/views.py`、`urls.py`：計算頁、效率 API 與路由。

原始外部 HTML 保留不動；現有 `frontend` 目錄不參與此頁面。
CSS 與 JS 透過 Django 的 `{% static %}` 引用；JS 保持一般 script，讓 HTML 的 onclick 等事件仍可呼叫原有函式。

## 目前範圍

Django 負責頁面與主要效率 API：IC 曲線插值、ACR、Qrx、線圈／系統效率、輸入功率與各階損耗。
前端在每次輸入變動時立即送出完整參數，不等待停止輸入；後端回傳後立即更新數字，仍有網路請求延遲。舊請求會取消，過期回應不會覆蓋新結果；等待時上方效率欄位保留上次數值，收到新結果後更新；失敗時保留上次效率並標示尚未更新，其餘舊結果清除，15 秒逾時可重試。
智慧反推的目標求解、診斷文字與歷史卡片查表仍在前端；診斷使用最新後端結果，損耗分項與主畫面一致。
歷史資料仍內嵌在 JS，圖片仍存於 localStorage。IC 管理頁的曲線永久儲存於資料庫；數位化工具可選「套用本次計算」，管理者也可選「命名並儲存到資料庫」。原始上傳圖檔不會儲存。
從原本 file:// 開啟的頁面切換到 localhost 後，瀏覽器不會自動帶入原來源的 localStorage 圖片。
頁面中的管理者登入仍是原始的示範功能，與 Django `/admin/` 無關，不能作為真正的權限驗證。

## 計算 API

`POST /api/main/`，Content-Type 為 `application/json`，同源請求需帶 `X-CSRFToken`。
請求格式為 `{"state": {...}, "customCurves": {"rx": {...}, "charger": {...}}}`。
`state` 必填數值：`batCapacity` (mAh)、`batVoltage` (V)、`batMaxC`、`sysPower` (W)、`rxL` (µH)、`rxR` (mΩ)、`freq` (kHz)、`qTx`、`kVal`。
必填選項：`caseMaterial` (`pc_abs/aluminum/zinc`)、`ncWrap` (`yes/no`)、`rxIcSelect`、`chargerIcSelect`。
`kVal` 範圍為 0–1；`sysPower` 與 `batMaxC` 可為零，其餘上述數值必須大於零（目前最小 0.000001），數值上限為 1000000。
選擇 `custom` 時需提供對應的 `rxIcEff` 或 `chargerIcEff` (0–100%)。
`custom_*` 型號需提供對應自訂曲線：`axis` 為 `power/current`，`data` 為 3–1000 組 `[x, efficiency]`，x 必須非負且嚴格遞增，效率為 0–100%。
資料庫型號的曲線以後端為準，請求無法覆寫。兩類 IC 均依設定的 power/current 軸查表，範圍以外沿用端點效率。

## IC 管理

側邊欄「Rx IC 管理」與「Charger IC 管理」分別開啟 `/ics/rx/`、`/ics/charger/`。
首次 migrate 匯入 12 筆原有設定。每筆可保存設定名稱、IC 型號、曲線或固定效率、軸向、暫定標記及資料來源。
同類別名稱唯一；同型號可用不同名稱保存不同量測條件。暫定標記與效率來源獨立設定。
目前 IC 管理不要求登入，所有使用者皆可讀取、搜尋、新增、編輯及刪除，寫入操作仍受 CSRF 保護。
管理頁的命名設定以單筆 IC 效率配置為單位，不包含整份線圈／電池專案參數。
儲存後返回計算頁即可選用；其他已開啟頁面需重新整理以更新選單及前端診斷資料。
刪除需經確認頁 POST，不會自動恢復種子資料。已選用被刪除設定的舊頁面會收到明確的未知型號錯誤。
歷史展示會使用目前資料庫效率設定，並非不可變的過往計算快照。請備份 `backend/db.sqlite3` 以保存管理資料。

成功回傳 `modelVersion: "lqk-v1"`、各階效率、`Qrx`、`rxACR`、`pInTotal`、`totalLoss`、`coilLoss`、`icLoss` 等欄位。
零效率且要求非零輸出時，無法計算的功率為 `null`，並附上 `warnings`，不回傳 Infinity 或 NaN。
輸入錯誤回傳 400 JSON `error`，非 JSON 為 415，非 POST 為 405；CSRF 驗證失敗為 403。
此版保留原有經驗公式，不代表增加物理模型準確度；調整模型時請更新版本及比對案例。

## 驗證

```powershell
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py test apps.main apps.ICmanage
Get-ChildItem apps/main/static/main/qi-tool-*.js | ForEach-Object { node --check $_.FullName }
node apps/main/testdata/request_flow.cjs
```

測試包含移植前由原始 JS 擷取的 20 組案例（`testdata/legacy_results.json`）、能量守恆、自訂曲線、錯誤输入、CSRF 與請求隔離。

正式部署時需依環境設定 SECRET_KEY、DEBUG、ALLOWED_HOSTS，並執行 `manage.py collectstatic`，由靜態檔案伺服器提供 `staticfiles` 目錄。
資源配置依循 [Django 靜態檔案文件](https://docs.djangoproject.com/en/dev/howto/static-files/)。
