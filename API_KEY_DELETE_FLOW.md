# API Key 删除流程 - 前端对接文档

## 变更摘要

删除 API Key 从**一步**拆分为**两步**，解决 MariaDB MVCC 导致的额度回收计算错误问题。

---

## 接口清单

### 1. 准备删除

```
POST /api/admin/api-keys/:id/prepare-delete
```

**说明**：
删除操作第一步。将本地 `allocatedCredits` 更新为当前剩余额度，并同步调用渠道商更新。

**响应**（成功）：
```json
{ "success": true }
```

**响应**（Key 不存在）：
```json
{ "success": false, "error": "API Key 不存在" }
```

**幂等性**：
若 `allocatedCredits` 已经等于当前剩余额度，后端会跳过重复更新，直接返回成功。前端可以放心重试。

---

### 2. 确认删除

```
DELETE /api/admin/api-keys/:id
```

**说明**：
删除操作第二步。物理删除本地记录，并调用渠道商删除 Key。

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

## 前端实现

### 标准删除流程

```javascript
async function handleDelete(id) {
  // 第一步：准备删除（更新额度为剩余值）
  await axios.post(`/api/admin/api-keys/${id}/prepare-delete`)

  // 第二步：确认删除（物理删除记录）
  await axios.delete(`/api/admin/api-keys/${id}`)

  // 刷新列表
  refreshList()
}
```

---

## 失败处理策略

| 场景 | 状态 | 前端处理 |
|------|------|----------|
| prepare-delete 失败 | 无任何副作用 | 提示错误，用户可重试整个流程 |
| prepare-delete 成功，delete 失败 | 额度已回收，但记录仍在 | 提示"额度已回收，记录删除失败"，提供**重试删除**按钮（只调 DELETE，不再调 prepare-delete） |
| 两者都成功 | 完全删除 | 刷新列表 |

### 带重试的完整示例

```javascript
async function handleDelete(id) {
  try {
    await axios.post(`/api/admin/api-keys/${id}/prepare-delete`)
    await axios.delete(`/api/admin/api-keys/${id}`)
    message.success('删除成功')
    refreshList()
  } catch (e) {
    // 如果 prepare 成功但 delete 失败，提示用户重试删除
    message.error('删除失败，请点击重试')
    showRetryButton(id) // 只显示重试删除按钮
  }
}

async function retryDelete(id) {
  try {
    await axios.delete(`/api/admin/api-keys/${id}`)
    message.success('删除成功')
    refreshList()
  } catch (e) {
    message.error('删除失败，请再次重试')
  }
}
```

---

## 为什么拆两步？

MariaDB 在同一个 HTTP 请求内先 UPDATE 再 DELETE 时，aggregate SUM 查询可能看到 UPDATE 之前的旧值，导致回收额度计算错误（回收了全部分配额度，而非剩余额度）。

拆成两个独立请求后，前端/网络间隔让 MariaDB MVCC 自然刷新，彻底解决这个问题。

---

## 额度回收原理

以 allocatedCredits=20000、剩余额度=14000 为例：

| 阶段 | allocatedCredits | 说明 |
|------|-----------------|------|
| 初始 | 20000 | 创建时分配 |
| 消耗后 | 20000 | 本地不变，渠道商剩余 14000 |
| prepare-delete | 14000 | 本地 UPDATE 为剩余额度 |
| delete | 0（记录已删除） | 物理 DELETE，SUM 减少 14000 |

最终 stats 中 `allocatedCredits` 减少 14000（不是 20000），已消耗的 6000 不会被错误回收。
