# Qi 無線充電預測工具

以 Django 管理 Rx IC／Charger IC 效率資料，並在瀏覽器即時計算無線充電效率、輸入功率與各階損耗。支援 Google 登入、CSV／Excel 多電壓匯入，以及效率曲線檢視與編輯。

## 功能與資料保存

- **即時計算**：JavaScript 在瀏覽器計算，不會在每次調整參數時呼叫後端計算 API。
- **IC 資料庫**：保存型號、電壓、曲線或固定效率、來源與最後修改者；Rx IC 與 Charger IC 分開管理。
- **多電壓匯入**：既有電壓不覆蓋，新電壓可繼續新增，重複項目以紅字提示。
- **曲線工作台**：搜尋 X 值、依 X 遞增顯示資料、分頁及即時繪圖。
- **帳號權限**：計算頁與 IC 清單公開，資料寫入限管理者。

資料庫保存 IC 設定與平台帳號，不保存上傳的原始檔案。數位化工具的自訂曲線僅供當次計算；歷史展示資料與圖片另由前端 JavaScript、瀏覽器 localStorage 處理，不代表整份計算專案已存入資料庫。

## 本機啟動（Windows／PowerShell）

### 1. 準備環境

需要 Python、MySQL 或 MariaDB。執行 JavaScript 測試另需 Node.js；網站本身不需要啟動 Vue／Vite 或執行前端建置。

以下命令均在包含 `manage.py` 的專案根目錄執行。`requirements.txt` 尚未完整鎖定套件版本，部署前請確認選用的 Python 與實際安裝套件相容。

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2. 建立資料庫與環境設定

在 MySQL／MariaDB 建立資料庫，並配置可存取它的應用程式帳號：

```sql
CREATE DATABASE qi_platform
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

首次設定時複製範本；已有 `.env` 時直接編輯，避免覆蓋：

```powershell
Copy-Item .env.example .env
```

填入實際設定，以下帳號、密碼與金鑰都是待替換欄位：

```dotenv
DB_NAME=qi_platform
DB_USER=你的資料庫帳號
DB_PASSWORD=你的資料庫密碼
DB_HOST=127.0.0.1
DB_PORT=3306
DJANGO_DEBUG=true
DJANGO_SECRET_KEY=你的隨機金鑰
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
FORCE_SCRIPT_NAME=
```

可產生一次金鑰並存入 `.env`；已有正式金鑰應沿用：

```powershell
.\venv\Scripts\python.exe -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

`.env` 已排除於 Git；不要將真實密碼或 OAuth 憑證填入 `.env.example`。

### 3. 初始化並啟動

```powershell
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py collectstatic --noinput
.\start-server.ps1
```

開啟 <http://127.0.0.1:8000/>。啟動腳本使用專案 `venv` 內的 Waitress，預設只監聽本機 8000 埠，不需要先啟用虛擬環境。按 Ctrl+C 停止；修改 Python 或模板後需重啟，修改靜態資源後需重新執行 `collectstatic` 並重啟。若開發時需要自動重新載入，可另用 `python manage.py runserver`。

服務啟動後可在另一個 PowerShell 視窗檢查，兩者應回傳 HTTP 200：

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" http://127.0.0.1:8000/accounts/login/
curl.exe -I http://127.0.0.1:8000/static/main/qi-tool.css
```

若 PowerShell 執行原則不允許腳本，可直接使用相同的啟動命令，不必修改系統執行原則：

```powershell
.\venv\Scripts\waitress-serve.exe --listen=127.0.0.1:8000 config.wsgi:application
```

## Google 登入與權限

網站使用 Google OpenID Connect 登入，不提供帳號密碼登入；`/admin/login/` 也會導向 Google 登入。

在 Google Cloud Console 建立「網頁應用程式」OAuth 用戶端，加入與實際網址完全相同的重新導向 URI，例如：

```text
http://127.0.0.1:8000/accounts/google/callback/
https://qi.example.com/accounts/google/callback/
```

部署時替換示例網域。使用 `localhost` 或子路徑時，也要登記對應的完整 URI。OAuth 同意畫面若處於測試狀態，需加入測試使用者。

在 `.env` 設定：

```dotenv
GOOGLE_OAUTH_CLIENT_ID=你的ClientID
GOOGLE_OAUTH_CLIENT_SECRET=你的ClientSecret
GOOGLE_OAUTH_REDIRECT_URI=http://127.0.0.1:8000/accounts/google/callback/
GOOGLE_ALLOWED_DOMAINS=example.com
GOOGLE_DEFAULT_ROLE=viewer
PLATFORM_SUPERUSER_EMAILS=admin@example.com
```

| 設定 | 用途 |
| --- | --- |
| `GOOGLE_OAUTH_REDIRECT_URI` | 留白時依請求產生；代理部署建議明確填入公開回呼網址 |
| `GOOGLE_ALLOWED_DOMAINS` | 允許的信箱網域，逗號分隔；留白表示不限制網域 |
| `GOOGLE_DEFAULT_ROLE` | 新帳號角色：`admin` 或 `viewer`；不改變既有帳號角色 |
| `PLATFORM_SUPERUSER_EMAILS` | 登入時授予系統管理者權限的信箱，逗號分隔 |

目前程式及 `.env.example` 的預設角色仍是 `admin`。正式環境請依需求改成 `viewer` 並限制登入網域。系統管理者若也要匯入、編輯 IC，其平台角色仍須為 `admin`。

| 身分 | 權限 |
| --- | --- |
| 未登入／檢視者 | 使用計算頁、瀏覽與搜尋 IC 清單 |
| 管理者 `admin` | 匯入、編輯、刪除 IC 設定 |
| 系統管理者 | 在帳號設定中管理平台使用者角色與停用狀態 |

IC 寫入與登出受 CSRF 保護。平台使用者存於 `accounts_platform_user`，IC 最後修改者關聯此資料表。

## IC 效率資料匯入

### 操作與命名

1. 進入 `/ics/rx/` 或 `/ics/charger/`，以管理者身分選擇「匯入效率資料」。
2. 上傳 UTF-8 CSV 或 `.xlsx`。Excel 必須選取一張工作表；列出工作表時不會寫入資料庫。
3. 沒有電壓欄時手動填入電壓，例如 `3.8`、`5`、`12`；有電壓欄時以檔案為準。
4. 查看新增訊息與紅字提醒，重新載入計算頁即可使用新增設定。

CSV 以檔名、Excel 以工作表名稱取得型號。系統移除 `Charger`／`cherger`／`Rx` 前綴及 `_5V`、`_3.8V` 等末尾電壓後綴，再產生「型號_電壓」設定名稱。

例如 `Charger_MP2733_5V.csv` 解析出的型號為 `MP2733`。**檔名的 `_5V` 不作為電壓來源**；沒有電壓欄仍須手動輸入。Rx／Charger 類別由匯入頁面決定，不由檔名前綴決定。

### CSV 格式與電壓來源

以下為虛構的多電壓範例，每個電壓至少 3 個有效點：

```csv
voltage_v,current_ma,efficiency_percent
5,100,80
5,500,90
5,1000,92
9,100,82
9,500,91
9,1000,93
12,100,81
12,500,89
12,1000,91
```

沒有電壓欄時，手動輸入的電壓套用於整份檔案：

```csv
current_ma,efficiency_percent
100,80
500,90
1000,92
```

| 資料 | 支援欄名與單位 |
| --- | --- |
| 電流 | `current_ma`／`Iout (mA)`，或 `current_a`／`Iout (A)` |
| 功率 | `power_w`／`Pout (W)` |
| 百分比效率 | `efficiency_percent`／`效率 (%)`／`效率(%)`，0～100 |
| 小數效率 | `efficiency_fraction`／`效率（小數）`，0～1 |
| 優先電壓 | `VBAT (V)`／`VBAT`／`vbat_v` |
| 其他電壓 | `voltage_v`／`工作電壓 (V)`／`VIN (V)` |

同時有 VBAT 與 VIN 時使用 VBAT；VBAT 空白或無效不會改用 VIN。沒有 VBAT 時須能唯一辨識其他電壓欄。手動電壓不會篩選檔案內的電壓。電流與功率同時存在時優先使用電流。

### 重複電壓的處理

以 **IC 類別＋型號（不分大小寫）＋電壓** 判斷重複，不比較檔案內容或效率是否相同。

假設資料庫已有 Charger／MP2733／5V：

| 匯入內容 | 處理結果 |
| --- | --- |
| 5V、9V、12V | 5V 不寫入並以紅字提醒；新增 9V、12V |
| 只有 5V | 留在匯入頁，紅字提示沒有可新增的電壓 |
| 沒有電壓欄，手動填 5V | 電壓欄顯示紅字，拒絕匯入 |
| 沒有電壓欄，手動填 9V | 新增 9V |

既有曲線、名稱、來源與最後修改資訊保持不變。更新既有曲線請使用編輯功能。同一份無電壓欄的檔案手動填不同電壓，會被視為不同設定，請自行確認量測條件。

### 驗證與限制

- 上限 5 MB、10000 列（含表頭與說明）、每列 100 欄；表頭須在前 10 列內。
- 每個非空電壓組至少 3 點；X 必須非負，同組不能重複；匯入時依 X 排序。
- 空白效率略過，0% 保留；整組效率空白時不建立該電壓並提示。全部沒有有效點時拒絕匯入。
- 非數值、非有限值、超出範圍、公式或不支援的格式會回報錯誤。
- Excel 效率依儲存格顯示精度四捨五入後換算；`General` 保留原值。CSV 使用原始數值。
- 重複電壓的內容仍須通過解析驗證；資料錯誤或新設定名稱衝突會阻止整批新增。
- 新增使用資料庫交易，儲存失敗會回滾。同時匯入產生衝突時可能需要重試。

## 曲線與計算方式

工作台使用 SVG 繪圖，X 軸固定從 0 到搜尋結果的最大 X 值，分成 10 格；最大值為 0 時只顯示零刻度。Y 軸為效率 0～100%。搜尋影響圖表範圍，表格分頁不影響；超過 300 點時保留完整連線，但不逐點畫圓點。

資料庫可保存 W、A、mA 軸。mA 資料傳至計算頁前換算成 A；曲線採線性插值，超出範圍時使用端點效率並提示。固定效率不會隨電流或功率改變。

電壓是量測條件，不會自動限制計算頁的 IC 選項。請選擇符合實際條件的曲線，並確認 Rx 效率是否已包含線圈／Tx 損耗。歷史展示引用目前曲線，並非不可變的量測快照。

計算入口為 `qi-tool-calculation.js` 的 `calculate()`，UI 由 `triggerCalc()` 更新。此工具使用現有經驗模型，計算結果不等同硬體實測驗證。

## Windows Server 部署

建議入口為「IIS HTTPS → 本機 Waitress → Django」。`config/wsgi.py` 與 `WSGI_APPLICATION` 可沿用。

`requirements.txt` 已使用 Waitress，Windows 與 Linux 共用同一份依賴。`start-server.ps1` 是前景啟動腳本，不會自動註冊 Windows 服務。Waitress 支援 Windows，參考 [官方文件](https://docs.pylonsproject.org/projects/waitress/en/stable/)。

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Server 的 `.env` 須填入正式資料庫、Google 憑證及下列值：

```dotenv
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=正式環境專用金鑰
DJANGO_ALLOWED_HOSTS=qi.example.com,localhost,127.0.0.1
GOOGLE_OAUTH_REDIRECT_URI=https://qi.example.com/accounts/google/callback/
FORCE_SCRIPT_NAME=
```

`DJANGO_ALLOWED_HOSTS` 只填主機名稱，不含協定、埠號或路徑。`DEBUG=false` 時未提供金鑰，程式會拒絕啟動。

備份既有資料庫後，在專案根目錄執行：

```powershell
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py collectstatic --noinput
.\venv\Scripts\python.exe manage.py check --deploy
.\start-server.ps1 -UrlScheme https
```

`-UrlScheme https` 會傳入 Waitress 的 `--url-scheme=https`，適用於所有公開流量經 IIS HTTPS、HTTP 在 IIS 先轉向 HTTPS 的情境；此參數不會讓 Waitress 自行提供 TLS。IIS 須保留原始 Host，將路徑與查詢參數轉送至本機 8000 埠。其他代理架構請依 [Waitress 反向代理文件](https://docs.pylonsproject.org/projects/waitress/en/stable/reverse-proxy.html) 設定。

目前 `settings.py` 尚未啟用 Secure Cookie，也未讀取 `DJANGO_SESSION_COOKIE_SECURE` 等環境變數，僅在 `.env` 加入這些名稱不會生效。正式 HTTPS 環境需另在設定中啟用 `SESSION_COOKIE_SECURE`、`CSRF_COOKIE_SECURE`，並依 [Django 部署檢查清單](https://docs.djangoproject.com/en/stable/howto/deployment/checklist/) 處理檢查結果；本機 HTTP 開發不應直接套用只允許 HTTPS 的設定。

以 Windows 服務包裝工具管理 Waitress：執行檔設為 `<專案路徑>\venv\Scripts\waitress-serve.exe`，IIS HTTPS 部署參數設為 `--listen=127.0.0.1:8000 --url-scheme=https config.wsgi:application`。設定專案根目錄為工作目錄、自動啟動、失敗重啟與日誌。服務啟動前先停止手動執行的 Waitress，避免 8000 埠衝突。IIS 憑證、反向代理與服務註冊須在 Server 另行完成。

## Linux 部署與靜態檔案

Ubuntu 首次安裝 `mysqlclient` 前可能需要系統編譯依賴：

```bash
sudo apt-get update
sudo apt-get install -y python3-dev default-libmysqlclient-dev build-essential pkg-config
python3 -m venv venv
./venv/bin/python -m pip install -r requirements.txt
./venv/bin/python manage.py migrate
./venv/bin/python manage.py collectstatic --noinput
./venv/bin/waitress-serve --listen=127.0.0.1:8000 config.wsgi:application
```

先完成資料庫及正式環境變數設定；對外服務另配置反向代理、HTTPS 與服務管理。此版本未提供 `Dockerfile` 或 `compose.yaml`，不能直接執行 Docker Compose 部署。

專案已啟用 WhiteNoise，提供收集至 `staticfiles/` 的資源。更新 JS／CSS 後重新執行 `collectstatic`、重啟應用服務，再重新整理瀏覽器。若代理另行接管 `/static/`，須指向此次部署的檔案。

若入口是 `/proxy/8000/`，且代理轉送時會移除此路徑前綴，設定：

```dotenv
FORCE_SCRIPT_NAME=/proxy/8000
```

網站根目錄部署時留白；此設定取決於路徑及代理行為，與是否使用虛擬機無關。Google 回呼 URI 也須包含公開路徑前綴。

## 測試與維護

安裝 Node.js 後，在開發／測試環境執行：

```powershell
.\venv\Scripts\python.exe manage.py check
.\venv\Scripts\python.exe manage.py test apps.main apps.ICmanage apps.accounts config
node apps/main/testdata/calculation.cjs
node apps/main/testdata/request_flow.cjs
node apps/ICmanage/testdata/curve_workbench.cjs
```

Django 測試會建立測試資料庫，帳號須有對應權限。測試涵蓋計算、Google 登入與權限、CSV／Excel 匯入、重複電壓、交易回滾與曲線互動；不代表正式 Google OAuth、IIS 或實際 Server 已通過驗證。

| 狀況 | 檢查位置 |
| --- | --- |
| CSS／圖表更新未生效 | `collectstatic`、服務重啟、頁面 JS 版本及瀏覽器快取 |
| `DisallowedHost` | `DJANGO_ALLOWED_HOSTS` 與代理傳送的 Host |
| Google 回呼失敗 | 公開網址、HTTPS、路徑前綴與 OAuth 登記 URI 是否一致 |
| 匯入後沒有新增資料 | 紅字是否列出全部重複電壓，或存在格式／名稱錯誤 |
| MySQL 儲存結構錯誤 | 程式與資料庫 migration 是否同步；先備份，再檢查 `showmigrations` |

定期備份資料庫，保存平台帳號與 IC 設定；刪除 IC 不會自動恢復原始資料。

## 程式位置

| 路徑 | 用途 |
| --- | --- |
| `config/settings.py`、`.env.example` | Django 與環境變數設定 |
| `start-server.ps1` | Windows Waitress 啟動腳本，預設 HTTP；IIS HTTPS 使用 `-UrlScheme https` |
| `config/wsgi.py` | Waitress 使用的 WSGI 入口 |
| `apps/main/templates/main/index.html` | 主計算頁 |
| `apps/main/static/main/qi-tool-calculation.js` | 計算與輸入驗證 |
| `apps/main/static/main/qi-tool-*.js` | 互動、歷史、數位化與診斷 |
| `apps/ICmanage/importer.py` | CSV／Excel 解析、電壓分組與數值驗證 |
| `apps/ICmanage/forms.py`、`views.py` | 匯入重複判斷、儲存與訊息 |
| `apps/ICmanage/models.py`、`catalog.py` | IC 模型與前端曲線目錄 |
| `apps/ICmanage/static/ICmanage/curve-workbench.js` | SVG 曲線、軸刻度與點位互動 |
| `apps/ICmanage/static/ICmanage/ic-manager.css` | 管理頁與圖表樣式 |
| `apps/accounts/` | Google 認證、平台帳號與角色同步 |
| `apps/main/curves.json` | 原始曲線基準，保留作比對 |
