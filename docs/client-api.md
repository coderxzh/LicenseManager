# 客户端接口文档

## 基础信息
- **Base URL:** `https://nanzhanggui.cn/api`
- **认证方式:** 无需登录，通过授权码 + 机器指纹验证
- **签名:** 所有响应均附带 RSA-SHA256 签名（`signature` 字段），用于校验 `data` 未被篡改

---

## 1. 激活验证
**POST** `/v1/validate`

### 请求体
```json
{
  "key": "授权码",
  "fingerprint": "机器指纹",
  "platform": "windows/macos/linux",
  "hostname": "主机名"
}
```

### 响应
```json
{
  "data": {
    "success": true,
    "valid": true,
    "message": "激活成功" | "欢迎回来",
    "sharedApikey": "xxx" | null
  },
  "signature": "base64签名"
}
```

---

## 2. 心跳续期
**POST** `/v1/heartbeat`

### 请求体
```json
{
  "key": "授权码",
  "fingerprint": "机器指纹"
}
```

### 响应
```json
{
  "data": {
    "success": true,
    "alive": true,
    "sharedApikey": "xxx" | null
  },
  "signature": "base64签名"
}
```

---

## 3. 授权详情查询
**POST** `/v1/check`

### 请求体
```json
{
  "key": "授权码"
}
```

### 响应
```json
{
  "data": {
    "success": true,
    "valid": true,
    "status": "ACTIVE" | "SUSPENDED" | "EXPIRED",
    "maxMachines": 5,
    "usedMachines": 2,
    "expiresAt": "2026-09-01T00:00:00.000Z" | null,
    "remainingDays": 99999,
    "strategy": "FLOATING" | "STRICT",
    "sharedApikey": "xxx" | null
  },
  "signature": "base64签名"
}
```

---

## 错误码
| 字段 | 说明 |
|---|---|
| `KICKED` | 机器被踢出（浮动策略下被其他机器挤下线） |
| `ERROR` | 其他错误 |

```json
{
  "data": {
    "success": false,
    "code": "KICKED" | "ERROR",
    "error": "错误信息"
  },
  "signature": "base64签名"
}
```
