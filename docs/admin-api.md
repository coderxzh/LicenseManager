# Grasai API Key 管理接口文档

Grsai 开放平台本身没有“查询 API Key 列表”的接口，因此后端单独维护一张 `GrasaiApiKey` 表来保存完整信息。`License` 与 `GrasaiApiKey` 为**一对一**关系。

后端通过环境变量 `GRSAI_API_TOKEN` 调用 Grsai 接口，管理端调用下面封装好的接口即可。

## 认证

所有接口均需携带 JWT：

```http
Authorization: Bearer <token>
```

---

## 数据模型

```prisma
model GrasaiApiKey {
  id         String   @id @default(uuid())
  key        String   @unique
  name       String
  credits    Int?
  expireTime Int?
  createTime Int?
  license    License?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

`License` 通过 `grasaiApiKeyId` 外键一对一关联。删除 `GrasaiApiKey` 记录会自动将关联 License 的 `grasaiApiKeyId` 置空。

---

## 1. 创建并绑定 Grasai API Key

为指定 License 在 Grsai 平台创建 API Key，并在本地 `GrasaiApiKey` 表中创建记录，同时建立一对一关联。

- **POST** `/api/admin/licenses/:id/grasai-apikey`

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | API Key 名称（传给 Grsai） |
| type | number | 否 | `0` 无限制额度，`1` 限制额度，默认 `0` |
| credits | number | 否 | 积分额度，`type=1` 时必填 |
| expireTime | number | 否 | 到期时间，10 位时间戳，默认 `0` |

### 请求示例

```json
{
  "name": "测试Key",
  "type": 0,
  "credits": 0,
  "expireTime": 0
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "licenseId": "...",
    "licenseKey": "550E8400-E29B-41D4-A716-446655440000",
    "licenseRemark": "测试授权",
    "apiKey": "sk-xxxxxxxxxxxxxx",
    "name": "测试Key",
    "credits": 0,
    "expireTime": 0,
    "createTime": 1766737867
  }
}
```

### 说明

- 如果该 License 已绑定其他 Grasai API Key，会先远程删除旧 Key 并删除本地旧记录，再创建新 Key。
- 创建失败不会在本地表留下记录。

### 错误示例

```json
{ "success": false, "error": "缺少 name" }
```

```json
{ "success": false, "error": "授权码不存在" }
```

```json
{ "success": false, "error": "GRSAI_API_TOKEN 未配置" }
```

---

## 2. 更新 Grasai API Key 信息

先调用 Grsai 远程编辑接口，成功后再同步更新本地 `GrasaiApiKey` 表。**以远程平台为准。**

- **PUT** `/api/admin/grasai-apikeys/:id`

`:id` 为本地 `GrasaiApiKey.id`。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | API Key 名称 |
| type | number | 否 | `0` / `1`，默认 `0` |
| credits | number | 否 | 积分额度 |
| expireTime | number | 否 | 10 位时间戳 |
| **licenseId** | string \| null | 否 | 要关联的 License ID；传 `null` 解绑；目标 License 已有 Key 时会强制让旧 Key 解绑 |

### 换绑说明

- 传 `licenseId: null` 表示解绑当前 Key，Key 变为未绑定状态。
- 传其他 License ID 表示换绑到该 License。
- 如果目标 License 已绑定其他 Grasai API Key，会先让旧 Key 解绑（旧 Key 变为未绑定），再将当前 Key 绑定上去。

### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "...",
    "key": "sk-xxxxxxxxxxxxxx",
    "name": "新名称",
    "credits": 0,
    "expireTime": 0,
    "createTime": 1766737867,
    "createdAt": "...",
    "updatedAt": "...",
    "license": {
      "id": "...",
      "key": "550E8400-...",
      "remark": "测试授权"
    }
  }
}
```

### 错误示例

```json
{ "success": false, "error": "API Key 不存在" }
```

```json
{ "success": false, "error": "Grsai API 调用失败" }
```

---

## 3. 删除并解绑 Grasai API Key

调用 Grsai 远程删除接口删除 Key，成功后删除本地 `GrasaiApiKey` 记录，关联的 License 自动解绑。

- **DELETE** `/api/admin/licenses/:id/grasai-apikey`

`:id` 为 License ID。

### 响应示例

```json
{ "success": true }
```

### 说明

- 由于一对一关系，删除该 Key 只会影响当前 License。
- 远程删除失败时，本地记录不会删除。

### 错误示例

```json
{ "success": false, "error": "该授权码未绑定 Grasai API Key" }
```

---

## 4. 查询所有 Grasai API Key

- **GET** `/api/admin/grasai-apikeys`

### 查询参数

| 字段 | 类型 | 说明 |
|---|---|---|
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 20 |

### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 10,
    "page": 1,
    "pageSize": 20,
    "list": [
      {
        "id": "...",
        "key": "sk-xxxxxxxxxxxxxx",
        "name": "测试Key",
        "credits": 0,
        "expireTime": 0,
        "createTime": 1766737867,
        "createdAt": "...",
        "updatedAt": "...",
        "license": {
          "id": "...",
          "key": "550E8400-...",
          "remark": "测试授权"
        }
      }
    ]
  }
}
```

---

## 5. 删除 Grasai API Key（按 Key ID）

按本地 GrasaiApiKey ID 删除 Key，支持删除未绑定到 License 的 Key。

- **DELETE** `/api/admin/grasai-apikeys/:id`

`:id` 为本地 `GrasaiApiKey.id`。

### 响应示例

```json
{ "success": true }
```

### 说明

- 先调用 Grsai 远程删除接口，远程删除成功后才会删除本地记录。
- 远程删除失败返回 500，本地记录保留。

### 错误示例

```json
{ "success": false, "error": "API Key 不存在" }
```

```json
{ "success": false, "error": "Grsai API 调用失败" }
```

---

## License 创建/编辑接口的变更

`POST /api/admin/licenses` 和 `PUT /api/admin/licenses/:id` **不再接受 `grasaiApikey` 字段**。

 Grasai API Key 的创建、更新、删除必须走上面的专用接口。

---

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `GRSAI_API_TOKEN` | 是 | Grsai 开放平台用户 Token |
| `GRSAI_API_BASE_URL` | 否 | Grsai Host，默认 `https://grsaiapi.com` |

`.env` 示例：

```bash
GRSAI_API_TOKEN="你的Grsai用户token"
# GRSAI_API_BASE_URL="https://grsaiapi.com"
```

---

## 通用错误格式

```json
{
  "success": false,
  "error": "错误信息"
}
```

| 状态码 | 说明 |
|---|---|
| 400 | 请求参数错误，或该 License 未绑定 API Key |
| 401 | 未登录或 Token 无效 |
| 404 | License 或 API Key 不存在 |
| 500 | 服务端错误，通常包含 Grsai 远程调用失败信息 |

---

## 操作日志 Action 类型

| action | 说明 |
|---|---|
| `CREATE_GRSAI_APIKEY` | 创建并绑定 Grasai API Key |
| `UPDATE_GRSAI_APIKEY` | 更新 Grasai API Key 信息 |
| `DELETE_GRSAI_APIKEY` | 删除并解绑 Grasai API Key |

日志接口：`GET /api/admin/logs?action=CREATE_GRSAI_APIKEY`
