# Qi 無線充電預測工具（Django）

在 `Qi_System` 目錄執行：

```powershell
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py runserver
```

開啟 http://127.0.0.1:8000/ 即可使用，不需要啟動 Vue 或 Vite。
若要使用 Django 內建 `/admin/`，先執行 `manage.py migrate` 與 `manage.py createsuperuser`。

## 檔案位置

- `apps/main/templates/main/index.html`：Django 頁面模板。
- `apps/main/static/main/qi-tool.css`：頁面樣式。
- `apps/main/static/main/qi-tool-*.js`：本地運算、結果顯示、繪圖、歷史資料及互動功能模組。
- `apps/main/static/main/qi-tool-calculation.js`：JavaScript 效率計算、輸入驗證與結果更新，修改公式的入口。
- `apps/ICmanage/`：IC 管理的 model、form、catalog、view、URL、模板、樣式、admin 與測試。
- `apps/main/curves.json`：原始曲線基準，保留作舊版計算比對；瀏覽器使用頁面載入時提供的資料庫曲線。
- `apps/main/views.py`、`urls.py`：計算頁與路由。

原始外部 HTML 保留不動；現有 `frontend` 目錄不參與此頁面。
CSS 與 JS 透過 Django 的 `{% static %}` 引用；JS 保持一般 script，讓 HTML 的 onclick 等事件仍可呼叫原有函式。

## 目前範圍

Django 負責頁面與 IC 資料庫管理。IC 曲線插值、ACR、Qrx、線圈／系統效率、輸入功率與各階損耗均由瀏覽器 JavaScript 計算。
每次輸入變動會立即同步計算及更新畫面，不再發送計算請求。輸入錯誤時顯示原因，保留上次效率並標示尚未更新，同時清除功率結果及診斷快照；修正後立即恢復。
智慧反推的目標求解、診斷文字與歷史卡片查表仍在前端；診斷使用最新本地結果，損耗分項與主畫面一致。
歷史資料仍內嵌在 JS，圖片仍存於 localStorage。IC 管理頁的曲線永久儲存於資料庫；數位化工具可選「套用本次計算」，管理者也可選「命名並儲存到資料庫」。原始上傳圖檔不會儲存。
從原本 file:// 開啟的頁面切換到 localhost 後，瀏覽器不會自動帶入原來源的 localStorage 圖片。
頁面中的管理者登入仍是原始的示範功能，與 Django `/admin/` 無關，不能作為真正的權限驗證。

## JavaScript 計算

`qi-tool-calculation.js` 的 `calculate(state, catalog = curveCatalog)` 回傳計算結果，不修改輸入。
`triggerCalc()` 負責呼叫計算並更新 UI。原 `POST /api/main/` 與 Python `service.py` 已移除。
`state` 必填數值：`batCapacity` (mAh)、`batVoltage` (V)、`batMaxC`、`sysPower` (W)、`rxL` (µH)、`rxR` (mΩ)、`freq` (kHz)、`qTx`、`kVal`。
必填選項：`caseMaterial` (`pc_abs/aluminum/zinc`)、`ncWrap` (`yes/no`)、`rxIcSelect`、`chargerIcSelect`。
`kVal` 範圍為 0–1；`sysPower` 與 `batMaxC` 可為零，其餘上述數值必須大於零（目前最小 0.000001），數值上限為 1000000。
選擇 `custom` 時需提供對應的 `rxIcEff` 或 `chargerIcEff` (0–100%)。
數位化工具會將 `custom_*` 型號加入瀏覽器的曲線目錄：`axis` 為 `power/current`，`data` 為 3–1000 組 `[x, efficiency]`，x 必須非負且嚴格遞增，效率為 0–100%。
資料庫曲線在頁面載入時傳入瀏覽器；本次套用的自訂曲線只留在頁面記憶體。兩類 IC 均依設定的 power/current 軸查表，範圍以外沿用端點效率。

## IC 管理

側邊欄「Rx IC 管理」與「Charger IC 管理」分別開啟 `/ics/rx/`、`/ics/charger/`。
首次 migrate 匯入 12 筆原有設定。每筆可保存設定名稱、IC 型號、曲線或固定效率、軸向及資料來源。
同類別名稱唯一；同型號可用不同名稱保存不同量測條件。
查表軸向支援 W、A、mA。選 mA 可直接輸入 `[[100,80],[500,92],[1000,95]]`；查表電流為電池容量(mAh) × C-rate。mA 資料以原單位保存，提供計算頁時統一換算為 A，歷史與反推共用相同結果。Excel／CSV 的 mA 欄位自動選用 mA 軸；數位化工具也可選 mA。更新後請執行 `python manage.py migrate`。
目前 IC 管理不要求登入，所有使用者皆可讀取、搜尋、新增、編輯及刪除，寫入操作仍受 CSRF 保護。
管理頁的命名設定以單筆 IC 效率配置為單位，不包含整份線圈／電池專案參數。
儲存後返回計算頁即可選用；其他已開啟頁面需重新整理以更新選單及前端診斷資料。
刪除需經確認頁 POST，不會自動恢復種子資料。已開啟的頁面保留載入時的曲線，重新整理後同步資料庫變更。
歷史展示會使用目前資料庫效率設定，並非不可變的過往計算快照。請備份目前設定使用的資料庫以保存管理資料。

成功回傳 `modelVersion: "lqk-v1"`、各階效率、`Qrx`、`rxACR`、`pInTotal`、`totalLoss`、`coilLoss`、`icLoss` 等欄位。
零效率且要求非零輸出時，無法計算的功率為 `null`，並附上 `warnings`，不回傳 Infinity 或 NaN。
輸入錯誤由 JavaScript 拋出並在畫面顯示；IC 管理的資料寫入仍使用 Django CSRF 保護。
此版保留原有經驗公式，不代表增加物理模型準確度；調整模型時請更新版本及比對案例。

## IC 效率資料匯入

在 Rx／Charger IC 管理點選「匯入效率資料」，上傳 `.xlsx` 或 UTF-8 `.csv`，填寫「IC 型號／Excel 工作表名稱」及選擇 5V／12V 條件。Excel 填完整工作表名稱（如 `Charger_MP2733`），CSV 直接填型號；同一欄用於查找工作表，儲存型號時自動移除開頭的 `Charger`、`cherger`、`Rx` 與其空白、底線或連字號分隔符，不分大小寫（例：`Charger_MP2733` → `MP2733`）。型號也會去除末尾 `_5V`／`_12V`；設定名稱自動產生為「型號_電壓」，例如 `MP2733_5V`、`MP2733_12V`，不用另填。來源仍保留完整工作表名稱。一次新增一條曲線，不覆蓋同名設定。需安裝 requirements.txt 中的 openpyxl。

支援本專案「電池效能表.xlsx」的 IC 明細表（例如 `Charger_MP2733`），不匯入摘要。CSV 範例：

Excel 效率先按儲存格數值／百分比格式的顯示小數位四捨五入，再換算成百分比（如 `0.94309` 在 `0.0000` 格式下匯入為 `94.31%`）。General 保留原值；複雜自訂格式會提示改用一般數值格式。CSV 依檔案文字數值匯入。此規則只影響新匯入的資料，既有設定不會自動重寫。

```csv
voltage_v,current_ma,efficiency_percent
5,100,82
5,500,94.5
5,1000,95.6
```

電流也可用 `current_a`，功率可用 `power_w`；小數效率改用 `efficiency_fraction`。有電壓欄會篩選指定電壓，無電壓欄則由使用者確認條件。空白效率略過、零值保留，拒絕非有限值、超出範圍、重複 X 及公式。5 MB／10000 列上限；超過 1000 點時合併共線插值點，仍超限則拒絕。原始檔不保存。

來源保留表頭說明，可於匯入後編輯。電壓條件尚不會自動限制計算頁選項；請自行選對設定，並確認 Rx 數值是否已含線圈／Tx 損耗。沿用現有 IC 管理權限與 CSRF 保護。

## 驗證

```powershell
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py test apps.main apps.ICmanage
Get-ChildItem apps/main/static/main/qi-tool-*.js | ForEach-Object { node --check $_.FullName }
node apps/main/testdata/calculation.cjs
node apps/main/testdata/request_flow.cjs
```

測試包含移植前由原始 JS 擷取的 20 組案例（`testdata/legacy_results.json`）、能量守恆、自訂曲線、錯誤输入、IC 管理 CSRF、即時計算與錯誤恢復（不使用網路請求）。

## Ubuntu / Gunicorn 靜態檔案

首次安裝 Python 套件前，先安裝 `mysqlclient` 的系統編譯依賴（[官方安裝說明](https://github.com/PyMySQL/mysqlclient/blob/main/README.md)）：

```bash
sudo apt-get update
sudo apt-get install -y python3-dev default-libmysqlclient-dev build-essential pkg-config
```

若在容器內，需在同一容器安裝；以 root 執行時省略 `sudo`。Python 開發標頭需符合虛擬環境的 Python 版本。缺少 `pkg-config` 時，`pip install` 會在編譯 `mysqlclient` 前失敗。開發環境可使用 `python -m pip install -r requirements-dev.txt`，其已包含正式依賴。

專案已啟用 WhiteNoise，由應用程式提供收集到 `staticfiles` 的 CSS、JS 與 Django admin 靜態檔案。Gunicorn 不會像開發用的 `runserver` 自動提供各 app 的靜態檔案，因此每次部署更新後，請在專案目錄、啟用 Ubuntu 的 Python 虛擬環境後執行：

```bash
python -m pip install -r requirements.txt
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind 0.0.0.0:8000
```

若 Gunicorn 已由 systemd 等服務管理，執行 `collectstatic` 後重啟原服務即可。可用 `curl -I http://127.0.0.1:8000/static/main/qi-tool.css` 確認回傳 200。若經過 Nginx，請讓 `/static/` 轉送至應用程式，或將其 alias 指向本次部署的 `staticfiles/`；錯誤的 Nginx 靜態檔案設定仍會造成 404。

若瀏覽器入口是 `http://localhost:8400/proxy/8000/`，且代理會移除 `/proxy/8000` 再轉送，請在 `.env` 設定 `FORCE_SCRIPT_NAME=/proxy/8000` 並重啟 Django/Gunicorn。這讓靜態檔案及站內連結帶上代理前綴；`STATIC_URL` 由設定中的 `FORCE_SCRIPT_NAME` 明確組成，避免靜態網址在初始化時漏掉前綴。直接用 8000 port 存取時則保持此變數空白。可在瀏覽器開啟 `http://localhost:8400/proxy/8000/static/main/qi-tool.css` 確認代理後的 CSS 能正常取得。

正式部署時需依環境設定 SECRET_KEY、DEBUG、ALLOWED_HOSTS。
資源配置依循 [Django 靜態檔案文件](https://docs.djangoproject.com/en/dev/howto/static-files/)。


DB建立指令
```bash
-- 建立一個名為 test_db 的資料庫，並設定好中文與 Emoji 編碼
CREATE DATABASE test_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;
```
