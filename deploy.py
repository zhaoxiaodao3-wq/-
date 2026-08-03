#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键部署脚本（后端 + 前端）

做了什么：
  1. 用 VITE_API_BASE 构建前端（输出 dist）
  2. 打包后端源码（自动排除 .env / data / uploads / node_modules / .git，避免把线上数据或密钥带上去）
  3. 通过 SFTP 把两个 zip 上传到服务器 /tmp
  4. 用 sudo 在服务器上执行安全部署脚本：
       - 先备份生产 .env / data / uploads
       - 解压后端代码时【二次排除】uploads/* 与 data/*（绝不覆盖挂载卷里的线上数据）
       - docker compose down + build + up -d 重建容器（数据在宿主机挂载卷，重建不影响）
       - 解压前端 dist 到 web 根目录

数据安全保证（后端部署不影响线上数据）：
  - 数据卷 ./data（db.sqlite）和 ./uploads 是宿主机 bind 挂载，docker 重建不会删
  - 打包、解压两道都排除了 data/uploads，不会用旧包覆盖线上数据
  - 部署前还会把 .env / data / uploads 各打一份带时间戳的备份，真出事可回滚

用法：
  # 方式一：环境变量传入密码（推荐，不落盘）
  DEPLOY_PW='你的密码' python deploy.py

  # 方式二：交互输入密码
  python deploy.py

  # 方式三：把配置写进同目录 .deploy.env（已被 .gitignore 忽略，勿提交）
  #   SERVER_HOST=139.224.162.142
  #   SERVER_USER=workuser
  #   DEPLOY_PW=你的密码
  #   VITE_API_BASE=https://api.mia-fly.cn/api
  # 然后：python deploy.py

前置：
  - 本机需要 node/npm（前端构建）、python3 + paramiko（pip install paramiko）
  - 服务器需 docker / docker compose 已就绪（本次架构已满足）
"""
import os
import sys
import subprocess
import zipfile
import tempfile
import getpass

try:
    import paramiko
except ImportError:
    sys.exit("缺少依赖 paramiko，请先执行：pip install paramiko")

# ---------------- 配置（环境变量可覆盖） ----------------
BASE = os.path.dirname(os.path.abspath(__file__))

def _env(key, default):
    return os.environ.get(key, default)

FRONTEND_DIR       = _env("FRONTEND_DIR", os.path.join(BASE, "..", "sell-front", "---"))
BACKEND_DIR        = _env("BACKEND_DIR", BASE)
SERVER_HOST        = _env("SERVER_HOST", "139.224.162.142")
SERVER_USER        = _env("SERVER_USER", "workuser")
VITE_API_BASE      = _env("VITE_API_BASE", "https://api.mia-fly.cn/api")
SERVER_BACKEND_DIR = _env("SERVER_BACKEND_DIR", "/home/workuser/sell-server")
SERVER_FRONTEND_DIR= _env("SERVER_FRONTEND_DIR", "/www/wwwroot/web.mia-fly.cn")

# 加载同目录 .deploy.env（若存在），但不覆盖已设置的环境变量
_deploy_env = os.path.join(BASE, ".deploy.env")
if os.path.exists(_deploy_env):
    with open(_deploy_env, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

DEPLOY_PW = os.environ.get("DEPLOY_PW") or getpass.getpass("服务器 %s 的密码: " % SERVER_USER)

# 本地打包时绝不带上去的东西（密钥 / 线上数据 / 依赖 / 版本控制）
BACKEND_SKIP = {".git", "node_modules", "data", "uploads", ".env", ".workbuddy", "_t.log"}

# ---------------- 远端部署脚本（数据安全核心） ----------------
REMOTE_SCRIPT = r"""
#!/bin/bash
set -u
LOG=/tmp/deploy_$(date +%Y%m%d_%H%M%S).log
exec > >(tee -a "$LOG") 2>&1
echo "===== DEPLOY $(date) ====="

BDIR=%s
FDIR=%s
TS=$(date +%Y%m%d_%H%M%S)

extract() {
  local zip="$1" dest="$2" excl="$3"
  if command -v unzip >/dev/null 2>&1; then
    if [ -n "$excl" ]; then unzip -o "$zip" -d "$dest" -x $excl; else unzip -o "$zip" -d "$dest"; fi
  else
    python3 - "$zip" "$dest" "$excl" <<'PY'
import sys, zipfile, os
zp,dest,excl=sys.argv[1],sys.argv[2],sys.argv[3]
ex=set(excl.split()) if excl else set()
with zipfile.ZipFile(zp) as z:
    for n in z.namelist():
        if any((n.startswith(e.rstrip('/')+'/') or n==e) for e in ex):
            continue
        t=os.path.join(dest,n)
        if n.endswith('/'):
            os.makedirs(t, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(t), exist_ok=True)
            with z.open(n) as f, open(t,'wb') as o:
                o.write(f.read())
PY
  fi
}

# ===== [0/5] 备份（数据安全网，绝不删除）=====
echo "===== [0/5] 备份生产 .env / data / uploads ====="
[ -f "$BDIR/.env" ]    && cp -f "$BDIR/.env"    "/tmp/sell-server.env.bak.$TS"       && echo "备份 .env    -> /tmp/sell-server.env.bak.$TS"
[ -d "$BDIR/data" ]     && cp -r "$BDIR/data"     "/tmp/sell-server-data.bak.$TS"     && echo "备份 data    -> /tmp/sell-server-data.bak.$TS"
[ -d "$BDIR/uploads" ]  && cp -r "$BDIR/uploads"  "/tmp/sell-server-uploads.bak.$TS"  && echo "备份 uploads -> /tmp/sell-server-uploads.bak.$TS"

# ===== [1/5] 更新后端代码（不触碰 data / uploads / .env）=====
echo "===== [1/5] 更新后端代码（排除 data/uploads/.env）====="
rm -rf "$BDIR/src" "$BDIR/integration" "$BDIR/package.json" "$BDIR/package-lock.json" \
       "$BDIR/Dockerfile" "$BDIR/docker-compose.yml" "$BDIR/.dockerignore" "$BDIR/README.md" \
       "$BDIR/nginx-api-subdomain.conf" "$BDIR/前端接入指南.md" "$BDIR/.gitignore" "$BDIR/.env.example"
extract /tmp/sell-server-new.zip "$BDIR" "uploads/* uploads data/* data"
[ -f "/tmp/sell-server.env.bak.$TS" ] && cp -f "/tmp/sell-server.env.bak.$TS" "$BDIR/.env" && echo "已恢复生产 .env"
chown -R workuser:workuser "$BDIR"
echo "后端代码已更新"

# ===== [2/5] 重建并重启容器（数据卷不变）=====
echo "===== [2/5] 重建并重启容器 ====="
cd "$BDIR"
docker compose down 2>/dev/null || true
docker compose build 2>&1 | tail -30
docker compose up -d 2>&1
echo "容器已启动"

# ===== [3/5] 部署前端静态文件 =====
echo "===== [3/5] 部署前端静态文件 ====="
cp -r "$FDIR" "/tmp/web.mia-fly.cn.bak.$TS" 2>/dev/null || true
rm -rf "$FDIR/assets" "$FDIR/index.html"
extract /tmp/sell-front-dist.zip "$FDIR" ""
chown -R www:www "$FDIR/assets" "$FDIR/index.html" 2>/dev/null || true
echo "前端已更新"

# ===== [4/5] 验证 =====
echo "===== [4/5] 验证 ====="
sleep 5
echo "--- 容器状态 ---"; docker ps --filter name=sell-server --format '{{.Names}} | {{.Status}} | {{.Ports}}'
echo "--- /health ---";   curl -s -m 5 http://127.0.0.1:4000/health; echo
echo "--- 新路由(需登录) ---"; curl -s -m 5 "http://127.0.0.1:4000/api/summary/payables?groupBy=order" | head -c 200; echo
echo "--- 前端标题 ---"; curl -s -m 5 -H "Host: web.mia-fly.cn" http://127.0.0.1/ | grep -o '<title>[^<]*</title>'

# ===== [5/5] 完成 / 回滚提示 =====
echo "===== [5/5] 部署完成 ====="
echo "日志: $LOG"
echo "回滚数据: cp -r /tmp/sell-server-data.bak.$TS/. $BDIR/data/ && cd $BDIR && docker compose restart"
echo "回滚前端: cp -r /tmp/web.mia-fly.cn.bak.$TS/. $FDIR/"
""" % (SERVER_BACKEND_DIR, SERVER_FRONTEND_DIR)


# ---------------- 工具函数 ----------------
def run(cmd, cwd=None):
    print(">>", cmd if isinstance(cmd, str) else " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True, shell=isinstance(cmd, str))


def make_zip(src_dir, dst_zip, skip_top):
    """打包目录，跳过顶层 skip_top 中的条目。"""
    skip = set(skip_top)
    with zipfile.ZipFile(dst_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src_dir):
            rel = os.path.relpath(root, src_dir)
            if rel != "." and rel.split(os.sep)[0] in skip:
                dirs[:] = []
                continue
            for f in files:
                if rel == "." and f in skip:
                    continue
                fp = os.path.join(root, f)
                z.write(fp, os.path.relpath(fp, src_dir))


def main():
    tmp = tempfile.mkdtemp(prefix="deploy_")
    backend_zip = os.path.join(tmp, "sell-server-new.zip")
    frontend_zip = os.path.join(tmp, "sell-front-dist.zip")

    # 1) 构建前端
    if os.path.isfile(os.path.join(FRONTEND_DIR, "package.json")):
        print("\n[1/4] 构建前端 (VITE_API_BASE=%s) ..." % VITE_API_BASE)
        env = dict(os.environ, VITE_API_BASE=VITE_API_BASE)
        run(["npm", "run", "build"], cwd=FRONTEND_DIR)
        dist_dir = os.path.join(FRONTEND_DIR, "dist")
        if not os.path.isdir(dist_dir):
            sys.exit("前端构建未生成 dist 目录: %s" % dist_dir)
        make_zip(dist_dir, frontend_zip, skip_top=set())
        print("前端 dist 已打包: %s" % frontend_zip)
    else:
        sys.exit("未找到前端 package.json: %s" % FRONTEND_DIR)

    # 2) 打包后端（排除密钥与线上数据）
    print("\n[2/4] 打包后端源码（排除 .env/data/uploads/node_modules/.git）...")
    make_zip(BACKEND_DIR, backend_zip, skip_top=BACKEND_SKIP)
    print("后端已打包: %s" % backend_zip)

    # 3) 上传
    print("\n[3/4] 上传到服务器 %s ..." % SERVER_HOST)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(hostname=SERVER_HOST, username=SERVER_USER, password=DEPLOY_PW,
              port=22, timeout=30, look_for_keys=False, allow_agent=False)
    sftp = c.open_sftp()
    sftp.put(backend_zip, "/tmp/sell-server-new.zip")
    sftp.put(frontend_zip, "/tmp/sell-front-dist.zip")
    with sftp.open("/tmp/deploy.sh", "w") as f:
        f.write(REMOTE_SCRIPT)
    sftp.close()
    print("上传完成")

    # 4) 提权执行
    print("\n[4/4] 执行远端安全部署（sudo）...")
    esc = DEPLOY_PW.replace("'", "'\\''")
    remote_cmd = "printf '%s\\n' '%s' | sudo -S bash /tmp/deploy.sh" % (esc,)
    transport = c.get_transport()
    chan = transport.open_session()
    chan.exec_command(remote_cmd)
    chan.settimeout(30)
    import socket
    try:
        while True:
            try:
                data = chan.recv(4096)
            except socket.timeout:
                continue
            if not data:
                break
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
    finally:
        chan.close()
        c.close()
    print("\n===== 部署流程结束（详见服务器 /tmp/deploy_*.log）=====")


if __name__ == "__main__":
    main()
