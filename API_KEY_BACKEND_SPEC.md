# API Key 额度管理 - 后端接口规范

## 一、背景

当前管理端通过渠道商(Grsai)API 直接操作 API Key，存在以下问题：
- 创建 API Key 分配额度时不扣减主账户额度，可超额分配
- 无法区分"已分配额度"和"当前剩余额度"
- 调整 API Key 额度时无法同步处理主账户额度增减

本规范定义后端新增的数据库表和接口，由后端维护"已分配额度"记录，实现额度预扣管理。

---

## 二、后端需封装的渠道商接口清单

后端内部需要调用以下 **5个** 渠道商接口（其余列表查询从本地数据库获取，不再直接调用渠道商）。

| # | 渠道商接口 | 后端调用场景 | 域名 | 认证方式 |
|---|-----------|-------------|------|---------|
| 1 | `getDashboardData` | 查询账户总额度时 | `grsaiapi.com` | `Authorization` |
| 2 | `createAPIKey` | 创建新 API Key 时 | `grsai.dakka.com.cn` | `token` (body参数) |
| 3 | `updateAPIKeyInfo` | 修改 API Key 额度/名称时 | `grsaiapi.com` | `Authorization` + **`xtx`** |
| 4 | `deleteAPIKey` | 删除 API Key 时 | `grsaiapi.com` | `Authorization` + **`xtx`** |
| 5 | `getConfig` | 生成 xtx 签名前获取密钥配置 | `grsaiapi.com` | `Authorization` |

**重要区分**：
- **V1 接口**（`grsai.dakka.com.cn`）：只用 `token`，无需 `xtx`
- **V2 接口**（`grsaiapi.com`）：需要 `Authorization` Header，其中 `#3` 和 `#4` 还需额外计算 **`xtx` Header**

### 2.1 获取账户额度详情（V2，仅需 Authorization）

```
POST https://grsaiapi.com/client/grsai/getDashboardData
Headers:
  Authorization: <auth_token>
Body: {}  // 空对象即可

Response:
{
    "code": 0,
    "data": {
        "credits": 44400,        // 账户剩余积分
        "todayConsumed": 6000,   // 今日消耗
        "totalConsumed": 60600   // 总消耗积分
    },
    "msg": "success"
}
```

**核心计算公式**：
- 账户总额度 = `credits` + `totalConsumed`

**替代说明**：此接口替代了平台文档中的 `/client/openapi/getCredits`（获取账户积分余额接口），因为 `getDashboardData` 同时返回当前余额和总消耗，更方便计算总额度。

### 2.2 创建 API Key（V1，仅需 token）

```
POST https://grsai.dakka.com.cn/client/openapi/createAPIKey
Headers:
  Content-Type: application/json
Body:
{
  "token": "<your_token>",
  "type": 1,
  "name": "测试Key",
  "credits": 50000,
  "expireTime": 0
}

Response:
{
  "code": 0,
  "data": {
    "id": "grsai-id-xxx",
    "key": "sk-actual-key",
    "name": "测试Key",
    "credits": 50000,
    "expireTime": 0,
    "createTime": 1234567890
  }
}
```

### 2.3 更新 API Key（V2，需要 Authorization + xtx）

此接口**未在平台文档中列出**，但已通过前端代码验证可用。用于修改已创建 API Key 的额度、名称、类型和过期时间。

```
POST https://grsaiapi.com/client/grsai/updateAPIKeyInfo
Headers:
  Content-Type: application/json
  Authorization: <auth_token>
  xtx: <动态生成的签名>
Body:
{
  "apiKey": "sk-actual-key",
  "name": "新名称",
  "type": 1,
  "credits": 60000,
  "expireTime": 1750000000
}

Response:
{
  "code": 0,
  "msg": "success"
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| apiKey | string | 是 | 要更新的 API Key 字符串（如 `sk-xxx`） |
| name | string | 是 | 新的名称 |
| type | number | 是 | 0=无限制额度，1=限制额度 |
| credits | number | 是 | 新的积分额度，type=0 时传 0 |
| expireTime | number | 是 | 新的过期时间戳（秒），0=永不过期 |

**重要**：
- `credits` 参数传入的是**新的分配额度值**，不是增量或减量
- 例如原额度 50000，要改成 60000，直接传 `credits: 60000`
- type 从 1 改为 0（限制→无限制）时，传 `credits: 0`

### 2.4 删除 API Key（V2，需要 Authorization + xtx）

```
POST https://grsaiapi.com/client/grsai/deleteAPIKey
Headers:
  Content-Type: application/json
  Authorization: <auth_token>
  xtx: <动态生成的签名>
Body:
{
  "id": "grsai-id-xxx"
}

Response: { "code": 0, "msg": "success" }
```

### 2.5 获取 Config（V2，需要 Authorization）

此接口**未在平台文档中列出**，但已通过前端代码验证可用。用于获取生成 `xtx` 签名所需的密钥配置。调用一次后结果可缓存复用。

```
POST https://grsaiapi.com/client/common/getConfig
Headers:
  Content-Type: application/json
  Authorization: <auth_token>
Body:
{
  "token": "<auth_token>",
  "referrer": ""
}

Response:
{
  "code": 0,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",  // 新的 Authorization token
    "kis": "base64EncodedString...",       // 密钥索引串（base64编码）
    "ra1": "encryptedAesKey...",           // 加密后的 AES key
    "ra2": "encryptedAesIv...",            // 加密后的 AES iv
    "random": 123456                       // 随机数，用于推导索引
  },
  "msg": "success"
}
```

**关键字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | 新的 Authorization token，后续 V2 接口应使用此 token 替代原始 AUTH |
| kis | string | base64 编码的密钥串，解码后按 `=sj+Ow2R/v` 分割得到密钥数组 |
| ra1 | string | 被加密后的 AES key，需用 kis 中指定索引的元素解密 |
| ra2 | string | 被加密后的 AES iv，需用 kis 中指定索引的元素解密 |
| random | number | 随机数，各位数字用于计算 kis 数组中的索引位置 |

**缓存策略**：
- 首次调用 V2 接口前执行 `getConfig`
- 将返回的 `data` 对象缓存在内存中（如 `configCache`）
- 后续所有 V2 接口复用此缓存，无需重复调用
- 缓存中的 `token` 字段替代原始 `AUTH` 作为 `Authorization` Header

---

## 三、xtx 生成逻辑详解（V2 接口必需）

`updateAPIKeyInfo` 和 `deleteAPIKey` 两个接口需要在请求头中携带动态签名 `xtx`。

### 3.1 整体流程

```
Step 1: 获取 Config（只需一次，可缓存）
    POST /client/common/getConfig
    Body: { token: <AUTH>, referrer: "" }
    Headers: { Authorization: <AUTH> }
    
    Response 关键字段:
    {
      data: {
        token: "...",   // 后续 Authorization 用
        kis: "...",     // base64编码的密钥串
        ra1: "...",     // 加密后的AES key
        ra2: "...",     // 加密后的AES iv
        random: 123456  // 随机数，用于推导索引
      }
    }

Step 2: 对请求体进行 ASCII 排序 + base64 编码
    例如 Body = { apiKey: "sk-xxx", name: "test" }
    排序后 = { apiKey: "sk-xxx", name: "test" }
    编码后 = apiKey=base64("sk-xxx")name=base64("test")
    结果记为字符串 b

Step 3: 从 random 和 kis 推导 AES key/iv
    p = base64_decode(kis).split("=sj+Ow2R/v")
    y = random.toString().split('')
    firstDigit = parseInt(y[0])
    lastDigit  = parseInt(y[y.length - 1])
    w = y.slice(2, 2 + firstDigit)
    B = y.slice(4 + firstDigit, 4 + firstDigit + lastDigit)
    S = parseInt(w.join(''))
    k = parseInt(B.join(''))
    A     = p[S]      // 解密ra1的中间key
    E_key = p[k]      // 解密ra2的中间iv

Step 4: 解密得到最终 AES key 和 iv
    C = AES_Decrypt(ra1, key=A, iv=E_key, mode=CBC, padding=Pkcs7)
    z = AES_Decrypt(ra2, key=A, iv=E_key, mode=CBC, padding=Pkcs7)

Step 5: 计算 xtx
    encrypted = AES_Encrypt(b, key=C, iv=z, mode=CBC, padding=Pkcs7)
    xtx = MD5(encrypted)
```

### 3.2 后端实现参考（Node.js + crypto-js）

```javascript
const CryptoJS = require('crypto-js');

class GrsaiClient {
    constructor(authToken) {
        this.auth = authToken;
        this.configCache = null;
    }

    async getConfig() {
        const res = await fetch('https://grsaiapi.com/client/common/getConfig', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': this.auth },
            body: JSON.stringify({ token: this.auth, referrer: '' })
        });
        const data = await res.json();
        if (data.code !== 0 || !data.data) throw new Error(data.msg);

        this.configCache = {
            token: data.data.token,
            kis: data.data.kis,
            ra1: data.data.ra1,
            ra2: data.data.ra2,
            random: data.data.random
        };
        return this.configCache;
    }

    sortASCII(obj) {
        const sorted = {};
        Object.keys(obj).sort().forEach(k => { sorted[k] = obj[k]; });
        return sorted;
    }

    aesDecrypt(key, iv, ciphertext) {
        const parsedKey = CryptoJS.enc.Utf8.parse(key);
        const parsedIv = CryptoJS.enc.Utf8.parse(iv);
        return CryptoJS.AES.decrypt(ciphertext, parsedKey, {
            iv: parsedIv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8);
    }

    aesEncrypt(key, iv, plaintext) {
        const parsedKey = CryptoJS.enc.Utf8.parse(key);
        const parsedIv = CryptoJS.enc.Utf8.parse(iv);
        return CryptoJS.AES.encrypt(plaintext, parsedKey, {
            iv: parsedIv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        }).toString();
    }

    generateXTX(body) {
        if (!this.configCache) throw new Error('Config not loaded');
        const { token, kis, ra1, ra2, random } = this.configCache;
        if (!kis || !token) return '';

        // 1. 排序 + base64编码
        const sorted = this.sortASCII(body);
        let b = '';
        for (const key in sorted) {
            if (sorted[key] === undefined) continue;
            let val = JSON.stringify(sorted[key]);
            val = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(val));
            b += `${key}=${val}`;
        }

        // 2. 解码 kis
        const p = Buffer.from(kis, 'base64').toString('utf8').split('=sj+Ow2R/v');

        // 3. 推导索引
        const y = random.toString().split('');
        const firstDigit = parseInt(y[0]);
        const lastDigit = parseInt(y[y.length - 1]);
        const w = y.slice(2, 2 + firstDigit);
        const B = y.slice(4 + firstDigit, 4 + firstDigit + lastDigit);
        const S = parseInt(w.join(''));
        const k = parseInt(B.join(''));
        const A = p[S];
        const E_key = p[k];

        if (!A || !E_key) return '';

        // 4. 解密 ra1/ra2
        const C = this.aesDecrypt(A, E_key, ra1);
        const z = this.aesDecrypt(A, E_key, ra2);
        if (!C || !z) return '';

        // 5. MD5(AES.encrypt(C, z, b))
        return CryptoJS.MD5(this.aesEncrypt(C, z, b)).toString();
    }

    async requestV2(endpoint, body) {
        if (!this.configCache) await this.getConfig();

        const xtx = this.generateXTX(body);
        const res = await fetch(`https://grsaiapi.com${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': this.configCache.token || this.auth,
                ...(xtx ? { 'xtx': xtx } : {})
            },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok || data.code !== 0) throw new Error(data.msg);
        return data;
    }
}
```

### 3.3 关键注意点

1. **Config 缓存**：`getConfig` 只需在首次调用 V2 接口前执行一次，结果可缓存在内存中（`configCache`）。`token` 字段会更新，后续 `Authorization` Header 应使用 `configCache.token` 而非原始的 `AUTH`。

2. **base64 行为一致性**：前端使用 `CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(val))`，后端 Node.js 可用 `Buffer.from(val, 'utf8').toString('base64')`，两者结果一致。

3. **JSON.stringify 行为**：Step 2 中对每个值先用 `JSON.stringify` 再 base64，例如数字 `50000` 先变成 `"50000"` 再编码。确保后端也遵循此顺序。

4. **特殊分隔符**：`kis` 解码后的分隔符是固定字符串 `=sj+Ow2R/v`，不是正则表达式。

5. **undefined 跳过**：Step 2 中 `undefined` 值不参与排序和编码。

---

## 四、数据库表结构

### api_keys 表

```sql
CREATE TABLE api_keys (
  id VARCHAR(255) PRIMARY KEY COMMENT '自有系统ID，建议使用 UUID 或 Snowflake',
  grsai_id VARCHAR(255) COMMENT '渠道商返回的ID（grsai deleteAPIKey 需要）',
  api_key VARCHAR(255) NOT NULL UNIQUE COMMENT 'Key字符串（grsai updateAPIKeyInfo 需要）',
  name VARCHAR(255) NOT NULL COMMENT 'API Key 名称',
  allocated_credits BIGINT NOT NULL DEFAULT 0 COMMENT '已分配额度（创建时设定的额度，单位：分）',
  type INT NOT NULL DEFAULT 0 COMMENT '0=无限制额度, 1=限制额度',
  expire_time BIGINT DEFAULT 0 COMMENT '过期时间戳（秒），0=永不过期',
  license_id VARCHAR(255) COMMENT '绑定的 License ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_license_id (license_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 数据初始化说明

- 已有 API Key：`allocated_credits` 设为 `0`，表示未纳入额度管理
- 新创建的 API Key：必须记录 `allocated_credits`
- 无限制额度（type=0）的 Key：`allocated_credits` 也设为 `0`

---

## 五、后端接口定义

### 4.1 获取额度统计

```
GET /admin/api-key-stats
```

**响应**：
```json
{
  "success": true,
  "data": {
    "totalCredits": 105000,      // 账户总额度 = credits + totalConsumed
    "allocatedCredits": 50000,   // 已分配额度 = SUM(allocated_credits)
    "remainingCredits": 55000    // 剩余额度 = totalCredits - allocatedCredits
  }
}
```

**实现逻辑**：
1. 调用 `getDashboardData` 获取 `credits` 和 `totalConsumed`
2. `totalCredits = credits + totalConsumed`
3. 查询 `SELECT SUM(allocated_credits) FROM api_keys`
4. `remainingCredits = totalCredits - allocatedCredits`

---

### 4.2 获取 API Key 列表

```
GET /admin/api-keys?page=1&size=10
```

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
        "allocatedCredits": 50000,   // 已分配额度
        "type": 1,                    // 0=无限制, 1=限制
        "expireTime": 1750000000,
        "licenseId": "license-uuid",
        "createdAt": "2025-01-01T00:00:00Z"
      }
    ],
    "total": 1,
    "page": 1
  }
}
```

**实现逻辑**：
- 直接从本地 `api_keys` 表分页查询
- 返回字段名使用驼峰命名（适配前端现有类型约定）

---

### 4.3 创建 API Key

```
POST /admin/api-keys
Body:
{
  "name": "测试Key",
  "type": 1,                // 0=无限制, 1=限制额度
  "credits": 50000,         // 分配额度（单位：分），type=0 时传 0
  "expireTime": 1750000000, // 可选，0=不过期
  "licenseId": "uuid"       // 可选
}
```

**响应**：
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
    "licenseId": "uuid",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

**核心实现逻辑**：

```javascript
async function createApiKey(req, res) {
    const { name, type, credits, expireTime, licenseId } = req.body;

    // 1. 限制额度类型必须传入 credits
    if (type === 1 && (!credits || credits <= 0)) {
        return res.status(400).json({ success: false, error: '限制额度类型必须设置额度' });
    }

    const allocatedCredits = type === 1 ? credits : 0;

    // 2. 检查剩余额度是否充足
    if (type === 1) {
        const dashboard = await grsaiClient.getDashboardData();
        const totalCredits = dashboard.credits + dashboard.totalConsumed;
        const allocatedSum = await db.query('SELECT SUM(allocated_credits) as sum FROM api_keys');
        const remainingCredits = totalCredits - (allocatedSum[0].sum || 0);

        if (allocatedCredits > remainingCredits) {
            return res.status(400).json({
                success: false,
                error: `剩余额度不足，当前剩余: ${remainingCredits}，请求分配: ${allocatedCredits}`
            });
        }
    }

    // 3. 调用渠道商API创建
    const grsaiKey = await grsaiClient.createAPIKey({
        type,
        name,
        credits: allocatedCredits,
        expireTime: expireTime || 0
    });

    // 4. 写入本地表
    const id = generateUUID();
    await db.query(
        `INSERT INTO api_keys (id, grsai_id, api_key, name, allocated_credits, type, expire_time, license_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, grsaiKey.id, grsaiKey.key, name, allocatedCredits, type, expireTime || 0, licenseId || null]
    );

    // 5. 如果绑定了license，更新license表
    if (licenseId) {
        await db.query('UPDATE licenses SET grasai_apikey = ? WHERE id = ?', [grsaiKey.key, licenseId]);
    }

    // 6. 返回结果
    res.json({
        success: true,
        data: {
            id, apiKey: grsaiKey.key, name,
            allocatedCredits, type,
            expireTime: expireTime || 0,
            licenseId: licenseId || null,
            createdAt: new Date().toISOString()
        }
    });
}
```

---

### 4.4 更新 API Key

```
PUT /admin/api-keys/:id
Body:
{
  "name": "新名称",
  "type": 1,
  "credits": 60000,         // 新的分配额度
  "expireTime": 1750000000
}
```

**响应**：
```json
{ "success": true }
```

**核心实现逻辑**：

```javascript
async function updateApiKey(req, res) {
    const { id } = req.params;
    const { name, type, credits, expireTime } = req.body;

    // 1. 查询旧记录
    const [oldRecord] = await db.query('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!oldRecord) {
        return res.status(404).json({ success: false, error: 'API Key 不存在' });
    }

    const newAllocatedCredits = type === 1 ? (credits || 0) : 0;
    const diff = newAllocatedCredits - oldRecord.allocated_credits;

    // 2. 如果额度增加，检查剩余额度
    if (diff > 0) {
        const dashboard = await grsaiClient.getDashboardData();
        const totalCredits = dashboard.credits + dashboard.totalConsumed;
        const allocatedSum = await db.query('SELECT SUM(allocated_credits) as sum FROM api_keys');
        const remainingCredits = totalCredits - (allocatedSum[0].sum || 0);

        if (diff > remainingCredits) {
            return res.status(400).json({
                success: false,
                error: `剩余额度不足，需增加 ${diff}，当前剩余 ${remainingCredits}`
            });
        }
    }

    // 3. 调用渠道商API更新
    await grsaiClient.updateAPIKey({
        apiKey: oldRecord.api_key,
        name,
        type,
        credits: newAllocatedCredits,
        expireTime: expireTime || 0
    });

    // 4. 更新本地表
    await db.query(
        `UPDATE api_keys SET name = ?, allocated_credits = ?, type = ?, expire_time = ? WHERE id = ?`,
        [name, newAllocatedCredits, type, expireTime || 0, id]
    );

    res.json({ success: true });
}
```

**关键说明**：
- `diff > 0`（增加额度）：从账户扣除差额，需检查剩余额度
- `diff < 0`（减少额度）：差额返还账户，无需检查
- `diff === 0`（额度不变）：只更新其他字段

---

### 4.5 删除 API Key

```
DELETE /admin/api-keys/:id
```

**响应**：
```json
{ "success": true }
```

**核心实现逻辑**：

```javascript
async function deleteApiKey(req, res) {
    const { id } = req.params;

    const [record] = await db.query('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!record) {
        return res.status(404).json({ success: false, error: 'API Key 不存在' });
    }

    // 1. 调用渠道商API删除
    await grsaiClient.deleteAPIKey(record.grsai_id);

    // 2. 删除本地记录（allocated_credits 自动释放）
    await db.query('DELETE FROM api_keys WHERE id = ?', [id]);

    // 3. 如果绑定了license，解绑
    if (record.license_id) {
        await db.query('UPDATE licenses SET grasai_apikey = NULL WHERE id = ?', [record.license_id]);
    }

    res.json({ success: true });
}
```

---

## 六、前端对接变更概览

### 5.1 前端调用路径变更

| 操作 | 之前（直接调渠道商） | 之后（调自有后端） |
|------|---------------------|-------------------|
| 获取列表 | `grsai.getAPIKeyList()` | `api.getApiKeys()` |
| 创建 | `grsai.createAPIKey()` | `api.createLocalApiKey()` |
| 更新 | `grsai.updateAPIKey()` | `api.updateLocalApiKey()` |
| 删除 | `grsai.deleteAPIKey()` | `api.deleteLocalApiKey()` |
| 额度统计 | 无 | `api.getApiKeyStats()` |

### 5.2 前端展示字段变更

| 卡片/列 | 之前 | 之后 |
|---------|------|------|
| 第一卡片 | 账户积分（当前credits） | **账户总额度**（credits + totalConsumed） |
| 第二卡片 | 已分配积分（当前页credits累加） | **已分配额度**（SUM allocated_credits） |
| 第三卡片 | 剩余积分 | **账户剩余额度**（总额度 - 已分配） |
| 表格-额度列 | 当前剩余额度 | **已分配额度** |

---

## 七、边界情况处理

### 6.1 额度为负数

如果渠道商的 `credits` 为负数（透支），`totalCredits` 可能小于 `totalConsumed`。
- 此时 `remainingCredits` 为负数
- 后端应正常计算并返回，前端展示负值并禁用创建按钮

### 6.2 渠道商API Key已删除但本地记录未同步

- 删除时优先调用渠道商API，成功后删除本地记录
- 如果渠道商已删除但本地还存在，查询列表时可能报错
- 建议：定期同步或删除失败时自动清理本地记录

### 6.3 调整额度时渠道商API失败

- 渠道商 `updateAPIKeyInfo` 失败时，本地记录不应更新
- 需要确保事务一致性或提供重试机制

### 6.4 无限制额度Key（type=0）

- `allocated_credits = 0`
- 不占用额度预算
- 创建时无需检查剩余额度

---

## 八、建议的后端项目结构

```
backend/
├── routes/
│   └── apiKeys.js          # /admin/api-keys 路由
├── services/
│   └── grsaiClient.js      # 封装渠道商API调用
├── controllers/
│   └── apiKeyController.js # 业务逻辑
└── models/
    └── apiKey.js           # 数据库操作
```

### grsaiClient.js 核心方法签名

```javascript
class GrsaiClient {
    async getDashboardData()      // 获取 credits + totalConsumed
    async createAPIKey(params)    // 创建
    async updateAPIKey(params)    // 更新
    async deleteAPIKey(id)        // 删除
    async getAPIKeyList(page, size) // 获取列表（可选，用于同步）
}
```

---

## 九、检查清单

后端实现完成后，请确认以下功能正常：

- [ ] `GET /admin/api-key-stats` 正确返回总额度/已分配/剩余
- [ ] `GET /admin/api-keys` 正确返回列表（含 allocatedCredits）
- [ ] 创建限制额度Key时，超出剩余额度返回 400 错误
- [ ] 创建无限制Key时，不检查剩余额度
- [ ] 增加额度时，超出剩余额度返回 400 错误
- [ ] 减少额度时，正常更新并释放额度
- [ ] 删除Key时，渠道商和本地记录都删除
- [ ] 创建时传入 licenseId，自动绑定到 license 表
- [ ] 删除时自动解绑 license
