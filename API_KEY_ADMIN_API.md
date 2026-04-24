# API Key 额度管理 - 管理端对接文档

## 认证方式

所有接口需要管理员登录后获取的 JWT Token，通过 `Authorization: Bearer <token>` 请求头传递。

---

## 接口清单

### 1. 获取额度统计

```
GET /api/admin/api-key-stats
```

**响应**：
```json
{
  "success": true,
  "data": {
    "totalCredits": 105000,
    "allocatedCredits": 50000,
    "remainingCredits": 55000
  }
}
```

| 字段 | 说明 |
|------|------|
| `totalCredits` | 账户总额度 = 剩余积分 + 总消耗 |
| `allocatedCredits` | 已分配额度 = SUM(api_keys.allocated_credits) |
| `remainingCredits` | 剩余额度 = 总额度 - 已分配 |

---

### 2. 获取 API Key 列表

```
GET /api/admin/api-keys?page=1&size=10
```

**查询参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | number | 1 | 页码 |
| `size` | number | 10 | 每页条数 |

**响应**：
```json
{
  "success": true,
  "data": {
    "list": [
      {
        "id": "uuid-xxx",
        "apiKey": "sk-xxxx",
        "name": "测试Key",
        "allocatedCredits": 50000,
        "credits": 35000,
        "type": 1,
        "expireTime": 1750000000,
        "licenseId": "license-uuid",
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1
  }
}
```

| 字段 | 说明 |
|------|------|
| `allocatedCredits` | 累计分配/充值总额度（历史总投入） |
| `credits` | 当前剩余额度（从渠道商实时查询） |
| `type` | `0`=无限制额度，`1`=限制额度 |
| `expireTime` | 过期时间戳（秒），`0`=永不过期 |
| `licenseId` | 绑定的 License ID，`null`=未绑定 |

---

### 3. 创建 API Key

```
POST /api/admin/api-keys
```

**请求体**：
```json
{
  "name": "测试Key",
  "type": 1,
  "credits": 50000,
  "expireTime": 1750000000,
  "licenseId": "license-uuid"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | API Key 名称 |
| `type` | number | 是 | `0`=无限制，`1`=限制额度 |
| `credits` | number | type=1时必填 | 分配额度（单位：分） |
| `expireTime` | number | 否 | 过期时间戳（秒），不传或`0`=永不过期 |
| `licenseId` | string | 否 | 要绑定的 License ID |

**响应**（成功）：
```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "apiKey": "sk-xxxx",
    "name": "测试Key",
    "allocatedCredits": 50000,
    "type": 1,
    "expireTime": 1750000000,
    "licenseId": "license-uuid",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**响应**（额度不足）：
```json
{
  "success": false,
  "error": "剩余额度不足，当前剩余: 55000，请求分配: 100000"
}
```

**注意**：
- `type=0`（无限制）时 `credits` 不检查，创建的 Key `allocatedCredits=0`
- `type=1`（限制额度）时 `credits` 必须 `> 0`，且不能超过剩余额度
- 传入 `licenseId` 会自动将该 License 的 `grasaiApikey` 绑定为此 Key

---

### 4. 更新 API Key

```
PUT /api/admin/api-keys/:id
```

**请求体**：
```json
{
  "name": "新名称",
  "type": 1,
  "credits": 60000,
  "expireTime": 1750000000,
  "licenseId": "new-license-uuid"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 新名称 |
| `type` | number | 是 | `0`=无限制，`1`=限制额度 |
| `credits` | number | type=1时必填 | 新的分配额度（目标值，不是增量） |
| `expireTime` | number | 是 | 新的过期时间戳（秒），`0`=永不过期 |
| `licenseId` | string | 否 | 新的 License ID，传 `null` 解绑 |

**响应**：
```json
{ "success": true }
```

**额度变更规则**：
- **增加额度**：检查剩余额度是否充足，不足返回 400
- **减少额度**：直接更新，释放的额度回到账户
- **额度不变**：只更新其他字段

**渠道商传值逻辑**（后端自动处理）：
```
channelCredits = 当前剩余额度 + (新分配额度 - 旧分配额度)
```

**License 绑定变更规则**：
- 传入新的 `licenseId`：自动解绑旧的，绑定新的
- 传入 `null` 或不传（与当前不同）：解绑
- 不传且与当前相同：不做任何操作

---

### 5. 充值 API Key

```
POST /api/admin/api-keys/:id/recharge
```

**请求体**：
```json
{
  "amount": 10000
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `amount` | number | 是 | 充值额度，必须 `> 0` |

**后端自动处理**：
1. 检查 Key 存在且 `type === 1`
2. 检查主账户剩余额度是否充足
3. 查询 Key 当前剩余额度
4. 计算 `newAllocatedCredits = 旧 + amount`
5. 计算 `channelCredits = 当前剩余 + amount`
6. 调渠道商更新
7. 更新本地 `allocatedCredits`

**响应**（成功）：
```json
{ "success": true }
```

**响应**（额度不足）：
```json
{
  "success": false,
  "error": "剩余额度不足，当前剩余: 55000，请求充值: 100000"
}
```

**响应**（无限制 Key）：
```json
{
  "success": false,
  "error": "无限制额度 Key 不支持充值"
}
```

---

### 6. 准备删除 API Key（新增）

```
POST /api/admin/api-keys/:id/prepare-delete
```

**说明**：
删除操作拆分为两步，此接口为**第一步**。将本地 `allocatedCredits` 更新为当前剩余额度，并调用渠道商更新。

**响应**（成功）：
```json
{ "success": true }
```

**响应**（Key 不存在）：
```json
{ "success": false, "error": "API Key 不存在" }
```

**幂等性**：
若 `allocatedCredits` 已经等于当前剩余额度，会跳过重复更新，直接返回成功。

---

### 7. 确认删除 API Key

```
DELETE /api/admin/api-keys/:id
```

**说明**：
删除操作拆分为两步，此接口为**第二步**。物理删除本地记录，并调用渠道商删除 Key。

**响应**（成功）：
```json
{ "success": true }
```

**响应**（Key 不存在）：
```json
{ "success": false, "error": "API Key 不存在" }
```

**注意**：
- 若绑定了 license，自动解绑（`grasaiApikey` 设为 `null`）
- 删除后该 Key 的 `allocatedCredits` 自动释放回账户

---

## 删除流程变更（重要）

### 之前（一步删除）

```javascript
await axios.delete(`/api/admin/api-keys/${id}`)
```

### 之后（两步删除）

```javascript
// 第一步：准备删除（更新额度为剩余值）
await axios.post(`/api/admin/api-keys/${id}/prepare-delete`)

// 第二步：确认删除（物理删除记录）
await axios.delete(`/api/admin/api-keys/${id}`)
```

### 失败处理策略

| 场景 | 状态 | 前端处理 |
|------|------|----------|
| prepare-delete 失败 | 无任何副作用 | 提示错误，用户可重试整个流程 |
| prepare-delete 成功，delete 失败 | 额度已回收，但记录仍在 | 提示"额度已回收，记录删除失败"，提供**重试删除**按钮（只调 DELETE，不再调 prepare-delete） |
| prepare-delete 成功，delete 成功 | 完全删除 | 刷新列表 |

### 为什么拆两步？

MariaDB 在同一个 HTTP 请求内先 UPDATE 再 DELETE 时，aggregate SUM 查询可能看到 UPDATE 之前的旧值，导致回收额度计算错误。拆成两个独立请求后，网络间隔让 MVCC 自然刷新，彻底解决这个问题。

---

## 额度概念说明

### 两个额度的区分

| 字段 | 来源 | 含义 |
|------|------|------|
| `allocatedCredits` | 本地数据库 | **累计分配/充值总额度**（历史总投入，只记录不随消耗减少） |
| `credits` | 渠道商 | **当前剩余额度**（实时可用，用户消耗后会减少） |

### 已消耗额度计算

```
已消耗 = allocatedCredits - getAPIKeyCredits()
```

### 额度流向

| 操作 | allocatedCredits | 渠道商剩余 | 说明 |
|------|-----------------|-----------|------|
| 创建 50000 | 50000 | 50000 | 初始一致 |
| 消耗 15000 | 50000 | 35000 | 本地不变，渠道商减少 |
| 充值 10000 | 60000 | 45000 | 本地+10000，渠道商+10000 |
| 减额 10000 | 50000 | 35000 | 本地-10000，渠道商-10000 |

---

## 通用响应格式

### 成功
```json
{ "success": true, "data": { ... } }
```

### 失败
```json
{ "success": false, "error": "错误信息" }
```

### 权限不足
HTTP 401：`{ error: "未提供 Token" }`

---

## 前端对接变更对照

| 操作 | 之前（直接调渠道商） | 之后（调自有后端） |
|------|---------------------|-------------------|
| 额度统计 | 无 | `GET /api/admin/api-key-stats` |
| 获取列表 | `grsai.getAPIKeyList()` | `GET /api/admin/api-keys` |
| 创建 | `grsai.createAPIKey()` | `POST /api/admin/api-keys` |
| 更新 | `grsai.updateAPIKey()` | `PUT /api/admin/api-keys/:id` |
| 充值 | 无 | `POST /api/admin/api-keys/:id/recharge` |
| 删除 | `grsai.deleteAPIKey()` | `DELETE /api/admin/api-keys/:id` |

---

## 展示字段变更

| 卡片/列 | 之前 | 之后 |
|---------|------|------|
| 第一卡片 | 账户积分（当前 credits） | **账户总额度**（credits + totalConsumed） |
| 第二卡片 | 已分配积分（当前页 credits 累加） | **已分配额度**（SUM allocated_credits） |
| 第三卡片 | 剩余积分 | **账户剩余额度**（总额度 - 已分配） |
| 表格-额度列 | 当前剩余额度 | **已分配额度**（allocatedCredits）+ **当前剩余**（credits） |

---

## 环境变量（后端配置）

后端 `.env` 需配置：

```
VITE_GRSAI_TOKEN=xxx   # V1 接口 body token
VITE_GRSAI_AUTH=xxx    # V2 接口 getConfig 的 Authorization
```

前端无需再直接与渠道商交互，所有操作走后端接口即可。
