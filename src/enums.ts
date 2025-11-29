// src/enums.ts

// 授权码状态
export enum LicenseStatus {
  ACTIVE = 'ACTIVE', // 正常
  SUSPENDED = 'SUSPENDED', // 停用/封禁
  EXPIRED = 'EXPIRED', // 过期
  INACTIVE = 'INACTIVE', // 待激活 (前端展示用)
}

// 验证策略
export enum LicenseStrategy {
  FLOATING = 'FLOATING', // 浮动/抢占
  STRICT = 'STRICT', // 严格/报错
}

// 错误码 (用于前后端通信)
export enum ErrorCode {
  KICKED = 'SESSION_KICKED', // 被挤下线
  ERROR = 'ERROR', // 普通错误
}

