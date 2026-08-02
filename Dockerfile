# 销售收支记录后端 - 生产镜像
FROM node:22-alpine

WORKDIR /app

# 先装依赖（利用 Docker 层缓存，改代码不会重装依赖）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 拷贝源码
COPY . .

ENV PORT=4000
EXPOSE 4000

# 健康检查：连不上 /health 即判定异常
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:4000/health >/dev/null 2>&1 || exit 1

# 数据持久化在挂载的 volume（/app/data、/app/uploads）
CMD ["node", "src/index.js"]
