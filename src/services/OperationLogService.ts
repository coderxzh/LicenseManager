import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export class OperationLogService {
  static async log(
    action: string,
    targetType: string,
    targetId: string | undefined,
    admin: { id?: string; username?: string } | undefined,
    details?: any
  ) {
    try {
      await prisma.operationLog.create({
        data: {
          action,
          targetType,
          targetId,
          adminId: admin?.id,
          adminUsername: admin?.username,
          details: details ? JSON.stringify(details) : undefined,
        },
      })
    } catch (e) {
      console.error('[OperationLog] 记录日志失败:', e)
    }
  }
}
