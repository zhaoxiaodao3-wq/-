# 后端部署文档（sell-server）

> 目标：把本仓库代码部署到宝塔服务器并对外提供 API。部署过程**不影响线上数据**。

## 1. 线上架构（现状）

| 项 | 值 |
|---|---|
| 服务器 | `139.224.162.142` |
| 登录用户 | `workuser`（有 sudo，docker 需要 sudo） |
| 后端容器 | `sell-server`（镜像 `sell-server:latest`，`node:22-alpine`） |
| 服务端口 | `4000`（宿主机 → 容器 `4000:4000`） |
| 数据卷（宿主机挂载） | `/home/workuser/sell-server/data`（db.sqlite，业务数据） |
| 上传卷（宿主机挂载） | `/home/workuser/sell-server/uploads`（图片） |
| 配置 | `/home/workuser/sell-server/.env`（由 `env_file` 注入，**不在镜像内**） |
| Nginx 反代 | `api.mia-fly.cn` → `127.0.0.1:4000`（宝塔站点配置已存在） |
| 数据层 | `node:sqlite`（内置模块，无需额外 npm 依赖） |

数据卷和上传卷通过 `docker-compose.yml` 的 `volumes` 绑定到宿主机目录，**容器重建不会删除它们**。

## 2. 前置条件（本机）

- Node.js / npm（用于本地构建前端，如果只用本脚本的一键部署）
- Python 3 + `paramiko`：`pip install paramiko`
- 能 SSH 到服务器的 `workuser` 账号（密码）

## 3. 一键部署（推荐）

仓库内已提供 `deploy.py`，一条命令完成：**构建前端 → 打包后端 → 上传 → 远端安全部署**。

```bash
# 进入后端仓库
cd sell-server

# 方式 A：密码走环境变量（不落盘，推荐）
DEPLOY_PW='服务器密码' python deploy.py

# 方式 B：交互输入密码
python deploy.py

# 方式 C：把配置写入 .deploy.env（已被 git 忽略，切勿提交）
#   SERVER_HOST=139.224.162.142
#   SERVER_USER=workuser
#   DEPLOY_PW=服务器密码
#   VITE_API_BASE=https://api.mia-fly.cn/api
python deploy.py
```

脚本会在服务器 `/tmp/deploy_*.log` 留下完整日志，结束时回显容器状态、`/health`、前端标题等验证信息。

### 一键脚本的数据安全设计（为什么不会动线上数据）

1. **打包时排除**：本地打包后端时，自动跳过 `.env` / `data` / `uploads` / `node_modules` / `.git`，zip 里不含任何线上数据或密钥。
2. **解压时再次排除**：远端解压后端代码时，额外用 `-x "uploads/*" "data/*"` 二次排除，即使 zip 误带也不会覆盖宿主机挂载卷。
3. **部署前先备份**：远端脚本会先拷贝生产 `.env` / `data` / `uploads` 到 `/tmp/sell-server-*.bak.<时间戳>`。
4. **容器重建不删卷**：`docker compose down/build/up` 只重建镜像与容器，宿主机 `./data`、`./uploads` 原封不动。

## 4. 手动部署（不用脚本时）

```bash
# 1) 打包后端（排除数据/密钥）
cd sell-server
zip -r /tmp/sell-server-new.zip . -x ".git/*" "node_modules/*" "data/*" "uploads/*" ".env" ".workbuddy/*" "_t.log"

# 2) 上传到服务器
scp /tmp/sell-server-new.zip workuser@139.224.162.142:/tmp/

# 3) SSH 到服务器，sudo 执行：
sudo bash -c '
  BDIR=/home/workuser/sell-server
  cp -f $BDIR/.env /tmp/sell-server.env.bak
  cp -r $BDIR/data /tmp/sell-server-data.bak.$(date +%s)
  cd $BDIR
  rm -rf src integration package.json package-lock.json Dockerfile docker-compose.yml .dockerignore README.md nginx-api-subdomain.conf 前端接入指南.md .gitignore .env.example
  unzip -o /tmp/sell-server-new.zip -d $BDIR -x "uploads/*" "data/*"
  cp -f /tmp/sell-server.env.bak $BDIR/.env
  chown -R workuser:workuser $BDIR
  docker compose down
  docker compose build
  docker compose up -d
'
```

## 5. 回滚

```bash
# 回滚数据（容器重建后数据异常时用）
cp -r /tmp/sell-server-data.bak.<时间戳>/. /home/workuser/sell-server/data/
cd /home/workuser/sell-server && docker compose restart

# 回滚前端
cp -r /tmp/web.mia-fly.cn.bak.<时间戳>/. /www/wwwroot/web.mia-fly.cn/
```

## 6. 验证清单

部署后确认：

- [ ] `docker ps` 中 `sell-server` 状态为 `Up`（health 最终变 `healthy`）
- [ ] `curl http://127.0.0.1:4000/health` 返回 `{"ok":true,...}`
- [ ] 登录后 `GET /api/summary/payables?groupBy=order` 返回聚合 JSON
- [ ] `orders` / `expenses` 仍能查到历史数据（确认数据未丢）
- [ ] 浏览器访问 `https://web.mia-fly.cn` 正常，`https://api.mia-fly.cn` 可通

## 7. 注意事项

- **不要把 `.env`、真实数据、密码提交进 git。** 仓库 `.gitignore` 已忽略 `data/`、`uploads/`、`.env`。
- 若服务器 `node`/`npm` 不在 `workuser` 的 PATH，属正常——后端在 Docker（`node:22-alpine`）内运行，宿主机无需装 node。
- 修改 `docker-compose.yml` 的端口/挂载后需重新 `docker compose up -d`。
- 服务器 `workuser` 不在 docker 组，所有 docker 命令需 `sudo`。
