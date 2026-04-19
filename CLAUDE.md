# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

基于 Node.js、TypeScript、Express 和 Prisma (MySQL) 的授权码服务器，提供 REST API 用于管理授权码，支持浮动授权和固定授权两种策略。客户端响应可选 RSA 签名。

## 常用命令

- `npm install` - 安装依赖。
- `npm run dev` - 启动开发服务器，支持自动重载（ts-node-dev）。
- `npm run build` - 编译 TypeScript 到 `dist/` 目录。
- `npm start` - 运行编译后的输出（`node dist/app.js`）。
- `npm run seed` - 创建或更新数据库中的管理员账号。
- `npm run keygen` - 生成 RSA 密钥对（`private.pem` / `public.pem`）。
- `npx prisma db push` - 将 Prisma 模型同步到数据库。
- `npx prisma generate` - 在修改 schema 后重新生成 Prisma Client。

**注意：** 本项目当前未配置测试框架。

## 架构

### 入口与路由

- `src/app.ts` - Express 应用入口，配置中间件（CORS、body-parser），挂载 `src/routes.ts` 到 `/api`，并启动定时任务。
- `src/routes.ts` - 路由定义。客户端公开接口（`/v1/validate`、`/v1/heartbeat`、`/v1/check`）和登录接口（`/auth/login`）无需鉴权。管理端接口（`/admin/*`）受 `verifyToken` 中间件保护。

### 控制器

- `src/controllers/AuthController.ts` - 管理员登录，使用 bcrypt 校验密码并签发 JWT。
- `src/controllers/AdminController.ts` - 授权码的增删改查、仪表盘统计、设备列表查询、设备重置。
- `src/controllers/ClientController.ts` - 客户端接口：验证（激活）、心跳、查询授权信息。通过 `Signer.ts` 对响应进行 RSA 签名。

### 核心业务逻辑

- `src/services/LicenseService.ts` - 核心授权逻辑：
  - `activate()` - 校验授权码并注册机器指纹。**浮动策略（FLOATING）**：若机器数达到 `maxMachines`，按 `lastSeen` 淘汰最早的机器，使用 `deleteMany` 避免并发竞态。**固定策略（STRICT）**：达到上限则拒绝激活。
  - `heartbeat()` - 更新机器 `lastSeen`。若机器已被移除（例如被浮动策略挤掉），抛出 `ErrorCode.KICKED`。
  - `getInfo()` - 返回脱敏的授权信息（状态、已用/可用机器数、剩余天数等）。
  - `checkExpiry()` - 懒检查：若 `expiresAt` 已过期，将数据库中该授权码状态更新为 `EXPIRED`。

### 辅助模块

- `src/middleware/auth.ts` - JWT 校验，读取 `Authorization: Bearer <token>`。
- `src/jobs/CronJob.ts` - 每小时运行一次的定时任务，将过期的 `ACTIVE` 授权码状态改为 `EXPIRED`。
- `src/utils/Signer.ts` - 使用 `private.pem` 对 JSON 响应进行 RSA-SHA256 签名。若未找到 `private.pem`，则返回未签名的响应。
- `src/enums.ts` - 包含 `LicenseStatus`（`ACTIVE`、`SUSPENDED`、`EXPIRED`、`INACTIVE`）、`LicenseStrategy`（`FLOATING`、`STRICT`）和 `ErrorCode`（`KICKED`、`ERROR`）。

### 数据库模型（Prisma）

- `Admin` - 管理员用户表。
- `License` - 授权码表，字段包括 `key`、`status`、`strategy`、`expiresAt`、`maxMachines`、`remark`、`contact`。
- `Machine` - 注册设备表，包含 `fingerprint`、`ip`、`platform`、`name`、`lastSeen`，通过 `licenseId` 关联到 `License`。联合唯一索引 `[licenseId, fingerprint]`。

## 关键行为

- **在线状态判定**：若机器 `lastSeen` 在 10 分钟内，视为在线。该逻辑在 `AdminController.listMachines` 和 `AdminController.getStats` 中使用。
- **状态展示逻辑**：在 `AdminController.listLicenses` 中，`status` 为动态计算：`ACTIVE` 且无绑定机器时显示为 `INACTIVE`；`ACTIVE` 但已过期时显示为 `EXPIRED`。
- **跨域配置**：`src/app.ts` 中启用了允许所有域名的 CORS。
- **环境变量**（需在 `.env` 中配置）：
  - `PORT` - 服务端口（默认 3000）。
  - `DATABASE_URL` - MySQL 连接字符串。
  - `JWT_SECRET` - JWT 签名密钥。
