# 管理端 API 变更文档

本文档汇总了后端新增的数据字段、操作记录功能及相关接口变更，供管理端前端对接参考。

---

## 一、License 新增字段

`License` 模型新增了 3 个 API Key 字段，用于存储不同平台的授权密钥：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `standardApikey` | `string` | 标准 API Key |
| `advancedApikey` | `string` | 高级 API Key |
| `grasaiApikey` | `string` | Grasai 平台 API Key |
| `account` | `string` | Runninghub 会员账号 |

**注意：** 以上字段均为可选（可空字符串），现有数据完全兼容。

---

## 二、现有管理接口变更

### 1. 创建授权码 `POST /api/admin/licenses`

**Request Body 新增字段：**

```json
{
  "days": 30,
  "maxMachines": 5,
  "strategy": "FLOATING",
  "remark": "测试授权码",
  "standardApikey": "sk-standard-xxxx",
  "advancedApikey": "sk-advanced-xxxx",
  "grasaiApikey": "sk-grasai-xxxx",
  "account": "runninghub-username"
}
```

- 原有字段保持不变。
- `standardApikey`、`advancedApikey`、`grasaiApikey` 为可选字段。

---

### 2. 更新授权码 `PUT /api/admin/licenses/:id`

**Request Body 新增字段：**

```json
{
  "status": "SUSPENDED",
  "remark": "更新备注",
  "maxMachines": 10,
  "strategy": "STRICT",
  "addDays": 30,
  "standardApikey": "sk-new-standard",
  "advancedApikey": "sk-new-advanced",
  "grasaiApikey": "sk-new-grasai",
  "account": "runninghub-new-username"
}
```

- 支持更新三个 API Key 字段及 `account` 字段。
- 传入空字符串 `""` 时会清空对应字段（因为后端使用 `!== undefined` 判断）。
- 原有逻辑（如 `addDays` 自动计算过期时间）保持不变。

**行为变更：** 更新成功后，后端会自动写入一条 `UPDATE_LICENSE` 类型的操作记录。

---

### 3. 删除授权码 `DELETE /api/admin/licenses/:id`

**行为变更：** 删除成功后，后端会自动写入一条 `DELETE_LICENSE` 类型的操作记录。

---

### 4. 重置设备 `DELETE /api/admin/licenses/:id/machines`

**行为变更：** 重置成功后，后端会自动写入一条 `RESET_MACHINES` 类型的操作记录。

---

### 5. 查询授权码列表 `GET /api/admin/licenses`

**行为变更：** 返回数据中的每个 `License` 对象已自动包含新增的 `standardApikey`、`advancedApikey`、`grasaiApikey`、`account` 字段（通过 `...item` 展开），前端可直接读取展示。

---

## 二（续）、前端对接：License 列表响应结构

以下说明专供前端团队参考，展示 `GET /api/admin/licenses` 返回的 `data.list` 中每个 License 对象的完整字段结构。

### 响应字段说明

| 字段名 | 类型 | 说明 | 来源 |
|--------|------|------|------|
| `id` | `string` | License 唯一标识 | 原始字段 |
| `key` | `string` | 授权码 | 原始字段 |
| `status` | `string` | **展示状态**（动态计算）：`ACTIVE` / `SUSPENDED` / `EXPIRED` / `INACTIVE` | 计算字段 |
| `rawStatus` | `string` | 数据库原始状态：`ACTIVE` / `SUSPENDED` / `EXPIRED` | 原始字段 |
| `strategy` | `string` | 授权策略：`FLOATING` / `STRICT` | 原始字段 |
| `expiresAt` | `string \| null` | 过期时间（ISO 8601），`null` 表示永久授权 | 原始字段 |
| `maxMachines` | `number` | 最大允许绑定设备数 | 原始字段 |
| `remark` | `string \| null` | 备注 | 原始字段 |
| `contact` | `string \| null` | 联系人 | 原始字段 |
| `standardApikey` | `string \| null` | **【新增】** 标准 API Key | 原始字段 |
| `advancedApikey` | `string \| null` | **【新增】** 高级 API Key | 原始字段 |
| `grasaiApikey` | `string \| null` | **【新增】** Grasai 平台 API Key | 原始字段 |
| `account` | `string \| null` | **【新增】** Runninghub 会员账号 | 原始字段 |
| `createdAt` | `string` | 创建时间 | 原始字段 |
| `updatedAt` | `string` | 更新时间 | 原始字段 |
| `remainingDays` | `number \| null` | 剩余天数（永久授权为 `99999`） | 计算字段 |
| `isPermanent` | `boolean` | 是否为永久授权 | 计算字段 |
| `usedCount` | `number` | 当前已绑定设备数 | 计算字段 |
| `isActivated` | `boolean` | 是否已被激活（有绑定设备） | 计算字段 |
| `lastSeenAt` | `string \| null` | 最后活跃时间 | 计算字段 |
| `lastIp` | `string \| null` | 最后活跃 IP | 计算字段 |
| `machineNames` | `string[]` | 绑定设备的名称/指纹列表 | 计算字段 |
| `machines` | `Machine[]` | 完整的绑定设备数组（含 `fingerprint`、`ip`、`name`、`platform`、`lastSeen` 等） | 原始关联 |

### 状态计算规则

前端展示的 `status` 字段由后端根据以下条件动态计算：

1. `ACTIVE` + 已过期（`expiresAt < now`）→ 展示为 **`EXPIRED`**
2. `ACTIVE` + 从未激活（无绑定设备）→ 展示为 **`INACTIVE`**
3. 其他情况保持原始状态（`ACTIVE` / `SUSPENDED` / `EXPIRED`）

> 如需使用数据库原始状态进行筛选或逻辑判断，请读取 `rawStatus` 字段。

### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 1,
    "page": 1,
    "pageSize": 10,
    "list": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "key": "XXXX-XXXX-XXXX-XXXX",
        "status": "ACTIVE",
        "rawStatus": "ACTIVE",
        "strategy": "FLOATING",
        "expiresAt": "2025-12-31T23:59:59.000Z",
        "maxMachines": 5,
        "remark": "测试授权码",
        "contact": null,
        "standardApikey": "sk-standard-xxxx",
        "advancedApikey": "sk-advanced-xxxx",
        "grasaiApikey": null,
        "account": "runninghub-user",
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z",
        "remainingDays": 350,
        "isPermanent": false,
        "usedCount": 2,
        "isActivated": true,
        "lastSeenAt": "2025-01-15T10:25:00.000Z",
        "lastIp": "192.168.1.100",
        "machineNames": ["PC-Office", "a1b2c3d4e5f6"],
        "machines": [
          {
            "id": "...",
            "fingerprint": "a1b2c3d4e5f6",
            "name": "PC-Office",
            "platform": "windows",
            "ip": "192.168.1.100",
            "lastSeen": "2025-01-15T10:25:00.000Z",
            "licenseId": "550e8400-e29b-41d4-a716-446655440000"
          }
        ]
      }
    ]
  }
}
```

### 对接要点

- **新增字段直接可用**：`standardApikey`、`advancedApikey`、`grasaiApikey`、`account` 已通过 `...item` 展开自动包含在响应中，前端在列表/详情页直接读取即可，无需额外调用接口。
- **空值处理**：以上新增字段在未填写时可能为 `null` 或空字符串，前端展示时建议做空值判断（如显示为 "-" 或隐藏该行）。
- **`status` vs `rawStatus`**：列表展示和标签颜色请使用 `status`（动态计算后的展示状态）；如果前端需要按原始状态筛选，Query 参数中的 `status` 筛选对应的是数据库原始状态，响应中的 `rawStatus` 与之对应。

---

## 三、新增接口：操作记录查询

### `GET /api/admin/logs`

**说明：** 查询管理员的操作记录日志，支持分页和筛选。该接口需要 JWT Token。

**Query Parameters：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | 否 | 页码，默认 `1` |
| `pageSize` | number | 否 | 每页条数，默认 `20` |
| `action` | string | 否 | 按操作类型筛选，如 `UPDATE_LICENSE` |
| `targetType` | string | 否 | 按目标类型筛选，如 `LICENSE` |
| `targetId` | string | 否 | 按目标 ID 筛选 |
| `adminUsername` | string | 否 | 按操作人用户名筛选 |

**Response：**

```json
{
  "success": true,
  "data": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "list": [
      {
        "id": "uuid",
        "adminId": "admin-uuid",
        "adminUsername": "hurry",
        "action": "UPDATE_LICENSE",
        "targetType": "LICENSE",
        "targetId": "license-uuid",
        "details": {
          "key": "XXXX-XXXX",
          "changes": {
            "status": "SUSPENDED",
            "addDays": 30
          }
        },
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

**常用 `action` 枚举：**

| action | 说明 |
|--------|------|
| `CREATE_LICENSE` | 创建授权码 |
| `UPDATE_LICENSE` | 更新授权码（含延期、修改状态、修改 API Key 等） |
| `DELETE_LICENSE` | 删除授权码 |
| `RESET_MACHINES` | 清空某授权码下的绑定设备 |

---

## 四、数据模型变更

### License
```prisma
model License {
  // ... 原有字段
  standardApikey  String?
  advancedApikey  String?
  grasaiApikey    String?
  account         String?   // Runninghub 会员账号
}
```

### OperationLog（新增）
```prisma
model OperationLog {
  id            String   @id @default(uuid())
  adminId       String?
  adminUsername String?
  action        String
  targetType    String
  targetId      String?
  details       String?  @db.Text
  createdAt     DateTime @default(now())
}
```

---

## 五、对接建议

1. **授权码表单**：在创建/编辑授权码的表单中增加三个 API Key 输入框及 Runninghub 会员账号输入框。
2. **操作记录页面**：建议新增一个"操作记录"页面，调用 `GET /api/admin/logs`：
   - 支持按操作类型（`action`）快速筛选。
   - `details` 字段可展开显示具体的变更内容（如 `addDays: 30` 表示延期 30 天）。
3. **授权码详情/列表**：在展示 License 信息时，可直接读取并展示三个 API Key 及 Runninghub 会员账号。
