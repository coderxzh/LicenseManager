# License Server

一个功能完整的授权码服务器，支持浮动授权和固定授权两种策略。

## 功能特性

- ✅ 管理员认证（JWT）
- ✅ 授权码 CRUD 管理
- ✅ 浮动授权（自动踢出最早使用的机器）
- ✅ 固定授权（限制机器数量）
- ✅ 授权码过期检查
- ✅ 客户端验证和心跳

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```bash
npx prisma db push
```

### 3. 创建管理员账号

```bash
npm run seed
```

默认账号：`admin` / `password123`

### 4. 启动服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动

## API 接口

### 公开接口

- `POST /api/auth/login` - 管理员登录
- `POST /api/v1/validate` - 客户端验证授权码
- `POST /api/v1/heartbeat` - 客户端心跳（复用验证逻辑）

### 管理端接口（需要 JWT Token）

- `POST /api/admin/licenses` - 创建授权码
- `GET /api/admin/licenses` - 获取授权码列表
- `PUT /api/admin/licenses/:id` - 更新授权码
- `DELETE /api/admin/licenses/:id` - 删除授权码

## 使用示例

### 登录获取 Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
```

### 创建授权码

```bash
curl -X POST http://localhost:3000/api/admin/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "days": 30,
    "maxMachines": 5,
    "strategy": "FLOATING",
    "remark": "测试授权码"
  }'
```

### 客户端验证

```bash
curl -X POST http://localhost:3000/api/v1/validate \
  -H "Content-Type: application/json" \
  -d '{
    "key": "YOUR_LICENSE_KEY",
    "fingerprint": "machine-fingerprint",
    "platform": "windows",
    "hostname": "MyPC"
  }'
```

## 项目结构

```
license-server/
├── prisma/
│   ├── schema.prisma        # 数据库模型
│   └── dev.db               # SQLite 数据库
├── scripts/
│   └── seed.ts              # 初始化脚本
├── src/
│   ├── controllers/         # 控制器
│   ├── middleware/          # 中间件
│   ├── services/            # 业务逻辑
│   ├── routes.ts            # 路由定义
│   └── app.ts               # 入口文件
├── .env                     # 环境变量
├── package.json
├── tsconfig.json
└── README.md
```

## 环境变量

在 `.env` 文件中配置：

- `PORT` - 服务器端口（默认 3000）
- `DATABASE_URL` - 数据库连接字符串
- `JWT_SECRET` - JWT 密钥（生产环境请修改）

## License

ISC





