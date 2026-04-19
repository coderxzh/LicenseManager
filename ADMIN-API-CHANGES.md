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
