# Grasai API Key 后端封装 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端封装 Grsai 开放平台的 API Key 创建/删除接口，并新增两个管理端接口：创建 Key 后自动绑定到指定 License；删除 Key 时自动清空该 License 的绑定。

**Architecture:** 新增 `src/services/GrsaiService.ts` 负责与 Grsai 开放平台通信（token 从环境变量读取）；在 `AdminController` 新增两个方法处理绑定/解绑逻辑；在 `src/routes.ts` 注册新路由。保持现有 `License.grasaiApikey` 字段不变，客户端接口无需改动。

**Tech Stack:** Node.js, TypeScript, Express, Prisma, native `fetch`.

## Global Constraints

- 不新增数据库表，继续复用 `License.grasaiApikey` 字段。
- 创建时必须绑定 License；删除时同步远程删除并清空本地绑定。
- 远程调用 token 从 `GRSAI_API_TOKEN` 环境变量读取。
- 远程 Host 默认 `https://grsaiapi.com`，可通过 `GRSAI_API_BASE_URL` 覆盖。
- 操作记录写入 `OperationLog`。

---

## Task 1: 新增 GrsaiService 封装层

**Files:**
- Create: `src/services/GrsaiService.ts`

**Interfaces:**
- Consumes: `process.env.GRSAI_API_TOKEN`, `process.env.GRSAI_API_BASE_URL`
- Produces:
  - `GrasaiService.createApiKey(params)` → `Promise<{ id, key, name, credits, expireTime, createTime }>`
  - `GrasaiService.deleteApiKey(apiKey)` → `Promise<void>`

- [ ] **Step 1: 创建 `src/services/GrsaiService.ts`**

```ts
const GRS_AI_BASE_URL = process.env.GRSAI_API_BASE_URL || 'https://grsaiapi.com'
const GRS_AI_TOKEN = process.env.GRSAI_API_TOKEN

interface CreateApiKeyParams {
  name: string
  type?: number
  credits?: number
  expireTime?: number
}

interface GrsaiApiKeyData {
  id: string
  key: string
  name: string
  credits: number
  expireTime: number
  createTime: number
}

async function request(path: string, body: Record<string, any>) {
  if (!GRS_AI_TOKEN) {
    throw new Error('GRSAI_API_TOKEN 未配置')
  }

  const res = await fetch(`${GRS_AI_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: GRS_AI_TOKEN }),
  })

  if (!res.ok) {
    throw new Error(`Grsai HTTP 错误: ${res.status}`)
  }

  const json = await res.json()
  if (json.code !== 0) {
    throw new Error(json.msg || 'Grsai API 调用失败')
  }
  return json.data
}

export class GrsaiService {
  static async createApiKey(params: CreateApiKeyParams): Promise<GrsaiApiKeyData> {
    return request('/client/openapi/createAPIKey', {
      type: params.type ?? 0,
      name: params.name,
      credits: params.credits ?? 0,
      expireTime: params.expireTime ?? 0,
    })
  }

  static async deleteApiKey(apiKey: string): Promise<void> {
    await request('/client/openapi/deleteAPIKey', { apiKey })
  }
}
```

- [ ] **Step 2: 编译检查**

Run: `npm run build`  
Expected: 通过（目前只有新增文件，无引用）。

- [ ] **Step 3: Commit**

```bash
git add src/services/GrsaiService.ts
git commit -m "feat: add GrsaiService wrapper for create/delete API key"
```

---

## Task 2: 新增“创建并绑定 Grasai API Key”接口

**Files:**
- Modify: `src/controllers/AdminController.ts`

**Interfaces:**
- Consumes: `GrsaiService.createApiKey`, `prisma.license.findUnique`, `prisma.license.update`, `OperationLogService.log`
- Produces: `AdminController.createGrasaiApiKey(req, res)`

- [ ] **Step 1: 在 `src/controllers/AdminController.ts` 顶部引入 GrsaiService**

```ts
import { GrsaiService } from '../services/GrsaiService'
```

- [ ] **Step 2: 新增 `createGrasaiApiKey` 方法**

在 `listBoundApiKeys` 方法之前（或 `AdminController` 内部任意合适位置）插入：

```ts
  // 为指定 License 创建并绑定 Grasai API Key
  static async createGrasaiApiKey(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { name, type, credits, expireTime } = req.body

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ success: false, error: '缺少 name' })
      }

      const license = await prisma.license.findUnique({ where: { id } })
      if (!license) {
        return res.status(404).json({ success: false, error: '授权码不存在' })
      }

      const grsaiKey = await GrsaiService.createApiKey({
        name,
        type: type ?? 0,
        credits,
        expireTime,
      })

      const updated = await prisma.license.update({
        where: { id },
        data: { grasaiApikey: grsaiKey.key },
      })

      await OperationLogService.log(
        'CREATE_GRSAI_APIKEY',
        'LICENSE',
        id,
        getAdmin(req),
        { key: updated.key, apiKey: grsaiKey.key, name }
      )

      res.json({
        success: true,
        data: {
          licenseId: updated.id,
          licenseKey: updated.key,
          licenseRemark: updated.remark,
          apiKey: grsaiKey.key,
          name: grsaiKey.name,
          credits: grsaiKey.credits,
          expireTime: grsaiKey.expireTime,
          createTime: grsaiKey.createTime,
        },
      })
    } catch (e: any) {
      console.error(e)
      res.status(500).json({ success: false, error: e.message })
    }
  }
```

- [ ] **Step 3: 编译检查**

Run: `npm run build`  
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/controllers/AdminController.ts
git commit -m "feat(admin): add create-and-bind Grasai API key endpoint"
```

---

## Task 3: 新增“删除并解绑 Grasai API Key”接口

**Files:**
- Modify: `src/controllers/AdminController.ts`

**Interfaces:**
- Consumes: `GrsaiService.deleteApiKey`, `prisma.license.findUnique`, `prisma.license.update`, `OperationLogService.log`
- Produces: `AdminController.deleteGrasaiApiKey(req, res)`

- [ ] **Step 1: 新增 `deleteGrasaiApiKey` 方法**

紧跟 `createGrasaiApiKey` 方法后插入：

```ts
  // 删除并解绑指定 License 的 Grasai API Key
  static async deleteGrasaiApiKey(req: Request, res: Response) {
    try {
      const { id } = req.params

      const license = await prisma.license.findUnique({ where: { id } })
      if (!license) {
        return res.status(404).json({ success: false, error: '授权码不存在' })
      }

      if (!license.grasaiApikey || !license.grasaiApikey.trim()) {
        return res.status(400).json({ success: false, error: '该授权码未绑定 Grasai API Key' })
      }

      await GrsaiService.deleteApiKey(license.grasaiApikey)

      const updated = await prisma.license.update({
        where: { id },
        data: { grasaiApikey: null },
      })

      await OperationLogService.log(
        'DELETE_GRSAI_APIKEY',
        'LICENSE',
        id,
        getAdmin(req),
        { key: updated.key }
      )

      res.json({ success: true })
    } catch (e: any) {
      console.error(e)
      res.status(500).json({ success: false, error: e.message })
    }
  }
```

- [ ] **Step 2: 编译检查**

Run: `npm run build`  
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/controllers/AdminController.ts
git commit -m "feat(admin): add delete-and-unbind Grasai API key endpoint"
```

---

## Task 4: 注册新路由

**Files:**
- Modify: `src/routes.ts`

- [ ] **Step 1: 在 `src/routes.ts` 中新增两条路由**

在现有 `/admin/licenses/bound-apikeys` 路由附近添加：

```ts
router.post('/admin/licenses/:id/grasai-apikey', AdminController.createGrasaiApiKey)
router.delete('/admin/licenses/:id/grasai-apikey', AdminController.deleteGrasaiApiKey)
```

- [ ] **Step 2: 编译检查**

Run: `npm run build`  
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add src/routes.ts
git commit -m "feat(routes): register Grasai API key bind/unbind endpoints"
```

---

## Task 5: 环境变量与配置说明

**Files:**
- 修改本地 `.env`（不提交到 git）

- [ ] **Step 1: 在 `.env` 中追加**

```bash
GRSAI_API_TOKEN="你的Grsai用户token"
# 可选，默认 https://grsaiapi.com
# GRSAI_API_BASE_URL="https://grsaiapi.com"
```

- [ ] **Step 2: 提醒管理端同学**

新接口路径：
- `POST /api/admin/licenses/:id/grasai-apikey`
- `DELETE /api/admin/licenses/:id/grasai-apikey`

创建时 BODY 示例：
```json
{
  "name": "测试Key",
  "type": 0,
  "credits": 0,
  "expireTime": 0
}
```

---

## Task 6: 手动验证

**前置条件：**
- `.env` 已配置 `GRSAI_API_TOKEN`。
- 数据库里有一条 `License` 记录，且已知其 `id`。

- [ ] **Step 1: 启动服务**

Run: `npm run dev`  
Expected: 服务启动，监听 `PORT`。

- [ ] **Step 2: 登录获取 JWT**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"xxx"}'
```

- [ ] **Step 3: 创建并绑定 API Key**

```bash
curl -X POST http://localhost:3000/api/admin/licenses/{licenseId}/grasai-apikey \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"name":"测试Key","type":0,"credits":0,"expireTime":0}'
```

Expected: 返回 `success: true`，且 `data.apiKey` 为 `sk-` 开头字符串；数据库中该 License 的 `grasaiApikey` 字段已更新。

- [ ] **Step 4: 查询绑定列表**

```bash
curl http://localhost:3000/api/admin/licenses/bound-apikeys \
  -H "Authorization: Bearer {token}"
```

Expected: 列表中包含刚才绑定的 License，且 `apiKey` 不为空。

- [ ] **Step 5: 删除并解绑 API Key**

```bash
curl -X DELETE http://localhost:3000/api/admin/licenses/{licenseId}/grasai-apikey \
  -H "Authorization: Bearer {token}"
```

Expected: 返回 `success: true`；数据库中该 License 的 `grasaiApikey` 已变为 `null`；Grsai 平台侧该 Key 也被删除。

---

## Self-Review

- [x] Spec coverage：创建+绑定、删除+解绑、环境变量、操作日志均已覆盖。
- [x] Placeholder scan：无 TBD/TODO。
- [x] Type consistency：`GrsaiService` 返回的 `key` 字段与 `License.grasaiApikey` 类型一致（`string`）。
