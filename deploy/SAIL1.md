# SAIL1 校內 Docker 部署

目標：使用者連到學校網路後，直接用固定網址開啟 Qi，不必建立 SSH Tunnel。以下為部署準備，尚未在 SAIL1 執行或驗證。

## 教學文件已確認的限制

- SSH 登入既有 Merry-Qi 容器，工作目錄為 `/workspace`；不代表具有主機 Docker 權限。
- 既有 8500 已供 Flask 使用，而且 `/workspace/app.py` 是唯讀掛載。不能直接讓另一個服務搶用該埠。
- 既有 MariaDB 僅監聽原容器的 `127.0.0.1:3306`。新容器的 localhost 指向自身，不能沿用該位址連接原資料庫。
- 教學沒有提供核准的校內 CIDR、可用新埠、DNS 名稱或主機 Docker 權限；這些需確認，不能從「sail1」名稱推定。

## couser 可以先執行的唯讀檢查

登入教學中的 SSH 後執行，將結果交給協助部署的人（不用提供密碼）：

```bash
whoami
hostname
test -f /.dockerenv && echo 'Inside a Docker container'
command -v docker
docker version
docker compose version
ss -ltn
```

找不到 docker 或出現 permission denied，請由管理員處理，不需要自行安裝 Docker-in-Docker、修改 socket 權限或停止既有 Flask。即使 docker version 可用，也要確認 Docker daemon 是 SAIL1 的主機，而非另一個環境。

## 可交給管理員的需求

請在 SAIL1 主機建立 Qi 專用 Docker Compose 服務，包含 Django/Gunicorn 與專用 MariaDB；網站目標使用主機 TCP 8500，映射到新 web 容器的 8000。先依下節確認並處理既有 Flask 的埠占用。只允許核准的校內網段連入該入口，資料庫不發布主機埠。若可提供校內 DNS，將核准名稱指到主機入口；若需要無埠號 HTTPS 網址，請以學校既有反向代理及憑證轉送至此服務。請確認重開機後 Docker 會自動啟動，並安排資料庫備份。

一般使用者可直接使用計算頁及檢視 IC 清單；IC 修改、匯入與刪除需要啟用的工作人員帳號。部署後需建立管理者帳號並驗證權限；來源網段限制仍由網路入口負責。

## 將主機 8500 切換給 Qi

Flask 即使沒有功能，只要仍占用同一主機位址的 TCP 8500，新容器便不能同時發布該埠。先在 **SAIL1 主機**（不是 SSH 登入後的既有容器內）檢查：

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
sudo ss -lntp 'sport = :8500'
```

- 若是主機上的 Flask 程序直接監聽 8500，確認程序及其啟動方式後，透過原本的服務管理方式停止，並調整自動啟動設定，避免重開機後再次占用。
- 若是既有容器發布主機 8500，僅停止容器內的 Flask 不會移除 Docker 埠映射。需由管理該容器的人保留原部署設定與資料掛載，移除原設定中的主機 8500 映射後重建既有容器，再啟動 Qi。
- 若 SSH 2300、資料庫及 Flask 都在同一個容器，停止或重建它會影響 SSH 和資料庫。先備份並確認主機端操作入口，保留 SSH 2300 映射與資料掛載，再安排切換；不要直接刪除整個容器。

若主機沒有發布 8500，容器內 Flask 使用 8500 本身不妨礙新的獨立容器使用主機 8500。以主機檢查結果為準；外部 `Test-NetConnection` 失敗不能證明該埠未被占用。

## 主機端部署（有 Docker 權限的人執行）

將專案放到管理員核准的主機目錄。透過 couser 上傳到 `/workspace/projects/Qi_System` 只代表檔案進了原容器；是否對應主機掛載目錄需另確認。

在主機的專案根目錄：

```bash
cp deploy/docker.env.example .env.docker
chmod 600 .env.docker
python3 -c 'import secrets; print(secrets.token_hex(32)); print(secrets.token_hex(32)); print(secrets.token_hex(32))'
```

將三個不同亂數分別填入 `.env.docker` 的 `DJANGO_SECRET_KEY`、`QI_DB_PASSWORD`、`QI_DB_ROOT_PASSWORD`，不要提交或傳送密碼。此檔獨立於本地開發 `.env`，映像不會包含本機 `.env`。

設定 `DJANGO_ALLOWED_HOSTS` 為實際 IP 或核准 DNS 名稱，以逗號分隔，不含 `http://`、port 或路徑。不要使用 `*`。

`.env.docker` 使用 `QI_HTTP_PORT=8500`；已有此檔時需手動確認，Compose 的預設值不會覆蓋舊值。直接使用指定 IP 存取時，將 `140.134.24.86` 加入 `DJANGO_ALLOWED_HOSTS`，並依下一段設定可從網路連入的 `QI_BIND_IP`。部署成功且網路放行後，目標網址為 `http://140.134.24.86:8500/`。

`QI_BIND_IP=127.0.0.1` 預設僅供主機或主機反向代理使用。需要直接校內連線時，由管理員設定正確的主機介面 IP 或 `0.0.0.0`，並事先完成來源限制。`0.0.0.0` 本身不表示「僅校內」。Docker 發布埠可能繞過一般 UFW INPUT 規則，需在上游 ACL 或符合 Docker 網路後端的防火牆鏈限制來源，並實测。參考 [Docker 防火牆說明](https://docs.docker.com/engine/network/packet-filtering-firewalls/)。

```bash
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 web
```

Compose 等待新 MariaDB 健康檢查通過後啟動 web；web 自動執行 migrate、collectstatic，再以非 root 使用者啟動 Gunicorn。WhiteNoise 提供靜態檔案。此設定只啟動一個 web 容器，請勿直接擴成多個副本同時遷移資料庫。Docker 啟用時，服務會依 `unless-stopped` 政策恢復。

這個部署會建立全新的 `qi_platform` 資料庫並載入 migration 種子資料，**不會自動搬移你現在新增的 IC 資料**。若需要沿用現有資料，先另外確認來源及備份／搬移流程。

## 網址與驗證

直接連線網址為 `http://<主機可達IP>:<核准埠>/`，有 DNS 時為 `http://<核准DNS名稱>:<核准埠>/`。這些是格式示例，不是已啟用的網址。SSH Tunnel 的 localhost 網址只能用在建立 Tunnel 的電腦上。

在校內電腦以實際主機 IP 和核准埠測試：

```powershell
Test-NetConnection <主機IP> -Port <核准埠>
```

在主機／校內電腦以實際網址驗證：

```bash
curl -I http://<主機IP>:<核准埠>/
curl -I http://<主機IP>:<核准埠>/static/main/qi-tool.css
```

兩者應回傳 200；再確認計算頁、IC 讀取與測試資料的匯入／編輯功能。關閉使用者 SSH 後再測試，以確認不依賴 Tunnel。另以校外且未連 VPN 的網路測試，應無法連入，才能確認「僅校內」。是否包含學校 VPN 由管理員決定。

400 常見原因為 ALLOWED_HOSTS 未設定；timeout 常見於路由或 ACL；connection refused 常見於未監聽或未發布埠。Django 的 ALLOWED_HOSTS 檢查請求主機名稱，不能用來限制使用者來源網段。

若配置 HTTPS 反向代理，需另外正確設定可信的代理 HTTPS 標頭和 Django 的安全 Cookie／CSRF 設定；目前提供的是直接 HTTP 測試入口，不可假設已完成 HTTPS。

## 更新與備份

更新程式前，在主機專案根目錄備份（產生的檔案含平台資料）：

```bash
umask 077
docker compose --env-file .env.docker exec -T db sh -c 'MYSQL_PWD="$MARIADB_PASSWORD" mariadb-dump -u "$MARIADB_USER" --single-transaction "$MARIADB_DATABASE"' > "qi-backup-$(date +%Y%m%d-%H%M%S).sql"
```

確認備份命令成功、檔案非空並定期驗證還原。更新專案後再次執行 `docker compose --env-file .env.docker up -d --build`。資料存於命名 volume，重建 web 不會移除資料；不要執行 `down -v`，那會刪除資料庫 volume。資料庫建立後只改環境變數的密碼不會修改既有 DB 帳號密碼。

## 本地設定檢查

```bash
python -m unittest config.test_deployment
python manage.py check
```

完整映像建置及 SAIL1 校內／校外連通性仍需在可用 Docker daemon 與真實網路上驗證。
