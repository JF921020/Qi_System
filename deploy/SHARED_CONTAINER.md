# 保留 Flask，在既有容器執行 Qi

此方案在 SSH 2300 登入的既有容器內啟動 Qi，使用 127.0.0.1:8501，透過 SSH Tunnel 測試。Flask 保留原埠。不執行本專案 Dockerfile 或 Compose；不需要修改 Django 原始碼。

## 1. 在遠端容器準備目錄

```bash
python3 --version
ss -lnt 'sport = :8501'
mkdir -p /workspace/projects/Qi_System
```

若 8501 已有 LISTEN，先查明服務，不要再次綁定。若目錄無寫入權限，請管理員提供可寫目錄；後續路徑一併修改。請確認 /workspace/projects 是否為持久化掛載，不能僅憑名稱判定。

## 2. Windows PowerShell 上傳

以下從本機專案目錄上傳必要檔案。若遠端已有同名專案，先備份，避免覆蓋遠端修改。不要上傳 Windows venv、本機 .env 或資料庫備份。

```powershell
cd C:\Users\user\Desktop\Qi_System
scp -P 2300 -r manage.py requirements.txt .env.example config apps couser@140.134.24.86:/workspace/projects/Qi_System/
```

若 scp 不可用，可使用 MobaXterm 的 SFTP 面板上傳同一組檔案及資料夾。

## 3. 遠端建立獨立 Python 環境

```bash
cd /workspace/projects/Qi_System
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

遇到 venv 或 mysqlclient 編譯缺少系統套件時，由具有容器內管理權限的人安裝以下套件，再重試失敗步驟：

```bash
sudo apt-get update
sudo apt-get install -y python3-venv python3-dev default-libmysqlclient-dev build-essential pkg-config
```

沒有 sudo 權限時交由管理員處理，不要改用全域 pip 安裝。mysqlclient 套件需求見 https://pypi.org/project/mysqlclient/ 。

## 4. 設定遠端 .env 與資料庫

確認已在上述專案目錄；僅在沒有 .env 時複製範本：

```bash
test -f .env || cp .env.example .env
chmod 600 .env
python -c 'import secrets; print(secrets.token_hex(32))'
```

用 MobaXterm 編輯遠端 .env，將剛產生的亂數填入 DJANGO_SECRET_KEY。以下中文占位文字必須替換為實際值，密碼若含 # 或空白請以引號包住：

```dotenv
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=填入剛產生的亂數
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
FORCE_SCRIPT_NAME=
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=填入Qi專用資料庫名稱
DB_USER=填入Qi資料庫使用者
DB_PASSWORD="填入資料庫密碼"
```

127.0.0.1:3306 只有在 MariaDB 確實運行於同一容器時才適用。可用 `ss -lnt 'sport = :3306'` 檢查監聽，但這不驗證資料庫帳號。SSH 帳號密碼不等於資料庫帳號密碼。

需要先有可用的 Qi 專用資料庫和帳號（具備該資料庫的 migration 權限），沒有就請資料庫管理員建立。不要猜用 root，也不要將 migrate 指向 Flask 的資料庫。新資料庫不會自動帶入本機既有 IC 資料；若需保留，另做備份及搬移。

## 5. 初始化並在前景測試

依序執行，每個步驟成功才繼續。若使用已有資料的 Qi 資料庫，先備份再 migrate。

```bash
python manage.py check
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py createsuperuser
.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8501 --workers 2 --access-logfile - --error-logfile -
```

createsuperuser 用於建立管理者；已有可用管理者時可跳過。最後一行會持續運行，請保持終端開啟。

## 6. Windows 開通道及瀏覽

在另一個 Windows PowerShell 視窗執行：

```powershell
ssh -N -o ExitOnForwardFailure=yes -p 2300 -L 127.0.0.1:8501:127.0.0.1:8501 couser@140.134.24.86
```

保持此視窗開啟，瀏覽 http://localhost:8501/ 及 http://localhost:8501/admin/ 。確認首頁、IC 清單、管理者登入與靜態樣式正常。

若本機 8501 已占用，將 -L 改成 `127.0.0.1:18501:127.0.0.1:8501`，瀏覽 http://localhost:18501/ 。若 SSH 回報 forwarding 禁止，需要管理員允許轉送。此時直接連遠端 IP 的 8501 仍可能失敗，是預期行為。

## 7. 暫時背景運行與後續部署

確認前景測試成功後，在 Gunicorn 視窗按 Ctrl+C，再於遠端專案目錄執行一次：

```bash
mkdir -p logs
nohup .venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8501 --workers 2 --access-logfile - --error-logfile - > logs/qi.log 2>&1 < /dev/null &
tail -n 50 logs/qi.log
curl -I http://127.0.0.1:8501/
curl -I http://127.0.0.1:8501/static/main/qi-tool.css
```

背景命令返回不代表啟動成功，需確認日誌與 HTTP 回應。nohup 用於暫時測試，沒有程序崩潰或容器重啟後自動恢復能力；正式常駐應由管理員加入容器既有程序管理方式。不要重複啟動多份 Gunicorn，也不要用 pkill python 影響 Flask。

若需多人直接使用遠端 IP，管理員還需設定主機到此容器的 8501 映射及網路規則，Qi 改綁定 0.0.0.0:8501，並將實際 IP/網域加入 DJANGO_ALLOWED_HOSTS。目前是 SSH 加密通道測試，直接公開服務前另安排 HTTPS。

## 8. 校內使用者直接連線（不需個別 SSH）

完成前述環境與資料庫設定後，遠端 .env 使用：

```dotenv
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=140.134.24.86,localhost,127.0.0.1
FORCE_SCRIPT_NAME=
```

保留原本 SECRET_KEY 與資料庫設定。停止先前的 Qi Gunicorn 程序後，在專案目錄改用以下命令啟動；Flask 不需停止：

```bash
.venv/bin/gunicorn config.wsgi:application --bind 0.0.0.0:8501 --workers 2 --access-logfile - --error-logfile -
```

請主機管理員新增「主機 TCP 8501 → 此既有容器 TCP 8501」映射，並允許核准校內網段連入。若需重建容器，先備份並保留資料掛載、SSH 2300 與 Flask 8500。網站由容器既有程序管理器維持運作，不能依賴上述前景終端。公開管理者登入前配置 HTTPS。

校內 Windows 電腦驗證：

```powershell
Test-NetConnection 140.134.24.86 -Port 8501
```

目標網址為 http://140.134.24.86:8501/ ，目前尚未確認開通。測試時關閉 SSH 通道，確認網站與 CSS 正常、一般使用者可瀏覽、管理者登入後才可修改 IC；另確認非核准網段無法連入。

Gunicorn 參數參考：https://gunicorn.org/reference/settings/ 。本文件依專案設定整理，尚未在遠端容器執行。
