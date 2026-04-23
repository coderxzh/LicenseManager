import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { grsaiClient } from '../services/GrsaiClient'
import { OperationLogService } from '../services/OperationLogService'

const prisma = new PrismaClient()

function getAdmin(req: Request) {
  return (req as any).user as { id: string; username: string } | undefined
}

export class ApiKeyController {
  // GET /admin/api-key-stats
  static async getStats(req: Request, res: Response) {
    try {
      const dashboard = await grsaiClient.getDashboardData()
      const totalCredits = dashboard.credits + dashboard.totalConsumed

      const allocatedResult = await prisma.apiKey.aggregate({
        _sum: { allocatedCredits: true },
      })
      const allocatedCredits = Number(allocatedResult._sum.allocatedCredits || 0)
      const remainingCredits = totalCredits - allocatedCredits

      res.json({
        success: true,
        data: {
          totalCredits,
          allocatedCredits,
          remainingCredits,
        },
      })
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message })
    }
  }

  // GET /admin/api-keys?page=1&size=10
  static async listApiKeys(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.size as string) || 10

      const [total, list] = await Promise.all([
        prisma.apiKey.count(),
        prisma.apiKey.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
      ])

      const formattedList = await Promise.all(
        list.map(async (item) => {
          let credits = 0
          try {
            credits = await grsaiClient.getAPIKeyCredits(item.apiKey)
          } catch {
            credits = 0
          }
          return {
            id: item.id,
            apiKey: item.apiKey,
            name: item.name,
            allocatedCredits: Number(item.allocatedCredits),
            credits,
            type: item.type,
            expireTime: Number(item.expireTime),
            licenseId: item.licenseId,
            createdAt: item.createdAt.toISOString(),
          }
        })
      )

      res.json({
        success: true,
        data: {
          list: formattedList,
          total,
          page,
        },
      })
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message })
    }
  }

  // POST /admin/api-keys
  static async createApiKey(req: Request, res: Response) {
    try {
      const { name, type, credits, expireTime, licenseId } = req.body

      if (type === 1 && (!credits || credits <= 0)) {
        return res.status(400).json({
          success: false,
          error: '限制额度类型必须设置额度',
        })
      }

      const allocatedCredits = type === 1 ? credits : 0

      // 检查剩余额度
      if (type === 1) {
        const dashboard = await grsaiClient.getDashboardData()
        const totalCredits = dashboard.credits + dashboard.totalConsumed
        const allocatedResult = await prisma.apiKey.aggregate({
          _sum: { allocatedCredits: true },
        })
        const allocatedSum = Number(allocatedResult._sum.allocatedCredits || 0)
        const remainingCredits = totalCredits - allocatedSum

        if (allocatedCredits > remainingCredits) {
          return res.status(400).json({
            success: false,
            error: `剩余额度不足，当前剩余: ${remainingCredits}，请求分配: ${allocatedCredits}`,
          })
        }
      }

      // 调用渠道商创建
      const grsaiKey = await grsaiClient.createAPIKey({
        type,
        name,
        credits: allocatedCredits,
        expireTime: expireTime || 0,
      })

      // 写入本地表
      const id = uuidv4()
      await prisma.apiKey.create({
        data: {
          id,
          grsaiId: grsaiKey.id,
          apiKey: grsaiKey.key,
          name,
          allocatedCredits: BigInt(allocatedCredits),
          type,
          expireTime: expireTime || 0,
          licenseId: licenseId || null,
        },
      })

      // 绑定 license
      if (licenseId) {
        await prisma.license.update({
          where: { id: licenseId },
          data: { grasaiApikey: grsaiKey.key },
        })
      }

      await OperationLogService.log(
        'CREATE_API_KEY',
        'API_KEY',
        id,
        getAdmin(req),
        { name, type, credits: allocatedCredits, expireTime, licenseId }
      )

      res.json({
        success: true,
        data: {
          id,
          apiKey: grsaiKey.key,
          name,
          allocatedCredits,
          type,
          expireTime: expireTime || 0,
          licenseId: licenseId || null,
          createdAt: new Date().toISOString(),
        },
      })
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message })
    }
  }

  // PUT /admin/api-keys/:id
  static async updateApiKey(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { name, type, credits, expireTime, licenseId } = req.body

      const oldRecord = await prisma.apiKey.findUnique({ where: { id } })
      if (!oldRecord) {
        return res.status(404).json({
          success: false,
          error: 'API Key 不存在',
        })
      }

      const newAllocatedCredits = type === 1 ? (credits || 0) : 0
      const diff = newAllocatedCredits - Number(oldRecord.allocatedCredits)

      // 额度增加时检查剩余额度
      if (diff > 0) {
        const dashboard = await grsaiClient.getDashboardData()
        const totalCredits = dashboard.credits + dashboard.totalConsumed
        const allocatedResult = await prisma.apiKey.aggregate({
          _sum: { allocatedCredits: true },
        })
        const allocatedSum = Number(allocatedResult._sum.allocatedCredits || 0)
        const remainingCredits = totalCredits - allocatedSum

        if (diff > remainingCredits) {
          return res.status(400).json({
            success: false,
            error: `剩余额度不足，需增加 ${diff}，当前剩余 ${remainingCredits}`,
          })
        }
      }

      // 计算渠道商应传的 credits（剩余额度）
      let channelCredits = 0
      if (type === 1) {
        let currentRemaining = 0
        try {
          currentRemaining = await grsaiClient.getAPIKeyCredits(oldRecord.apiKey)
        } catch {
          currentRemaining = 0
        }
        channelCredits = currentRemaining + diff
        if (channelCredits < 0) {
          return res.status(400).json({
            success: false,
            error: `额度不能为负，当前剩余 ${currentRemaining}，需减少 ${Math.abs(diff)}`,
          })
        }
      }

      // 调用渠道商更新
      await grsaiClient.updateAPIKey({
        apiKey: oldRecord.apiKey,
        name: name || oldRecord.name,
        type,
        credits: channelCredits,
        expireTime: expireTime || 0,
      })

      // 处理 license 绑定变更
      const newLicenseId = licenseId !== undefined ? (licenseId || null) : oldRecord.licenseId
      if (newLicenseId !== oldRecord.licenseId) {
        // 解绑旧的
        if (oldRecord.licenseId) {
          await prisma.license.update({
            where: { id: oldRecord.licenseId },
            data: { grasaiApikey: null },
          })
        }
        // 绑定新的
        if (newLicenseId) {
          await prisma.license.update({
            where: { id: newLicenseId },
            data: { grasaiApikey: oldRecord.apiKey },
          })
        }
      }

      // 更新本地表
      await prisma.apiKey.update({
        where: { id },
        data: {
          name: name || oldRecord.name,
          allocatedCredits: BigInt(newAllocatedCredits),
          type,
          expireTime: expireTime || 0,
          licenseId: newLicenseId,
        },
      })

      await OperationLogService.log(
        'UPDATE_API_KEY',
        'API_KEY',
        id,
        getAdmin(req),
        { name, type, credits: newAllocatedCredits, expireTime, licenseId: newLicenseId }
      )

      res.json({ success: true })
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message })
    }
  }

  // POST /admin/api-keys/:id/recharge
  static async rechargeApiKey(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { amount } = req.body

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: '充值额度必须大于 0',
        })
      }

      const record = await prisma.apiKey.findUnique({ where: { id } })
      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'API Key 不存在',
        })
      }

      if (record.type !== 1) {
        return res.status(400).json({
          success: false,
          error: '无限制额度 Key 不支持充值',
        })
      }

      // 检查账户剩余额度
      const dashboard = await grsaiClient.getDashboardData()
      const totalCredits = dashboard.credits + dashboard.totalConsumed
      const allocatedResult = await prisma.apiKey.aggregate({
        _sum: { allocatedCredits: true },
      })
      const allocatedSum = Number(allocatedResult._sum.allocatedCredits || 0)
      const remainingCredits = totalCredits - allocatedSum

      if (amount > remainingCredits) {
        return res.status(400).json({
          success: false,
          error: `剩余额度不足，当前剩余: ${remainingCredits}，请求充值: ${amount}`,
        })
      }

      // 查询当前剩余额度
      let currentRemaining = 0
      try {
        currentRemaining = await grsaiClient.getAPIKeyCredits(record.apiKey)
      } catch {
        currentRemaining = 0
      }

      const newAllocatedCredits = Number(record.allocatedCredits) + amount
      const channelCredits = currentRemaining + amount

      // 调用渠道商更新
      await grsaiClient.updateAPIKey({
        apiKey: record.apiKey,
        name: record.name,
        type: 1,
        credits: channelCredits,
        expireTime: Number(record.expireTime),
      })

      // 更新本地表
      await prisma.apiKey.update({
        where: { id },
        data: {
          allocatedCredits: BigInt(newAllocatedCredits),
        },
      })

      await OperationLogService.log(
        'RECHARGE_API_KEY',
        'API_KEY',
        id,
        getAdmin(req),
        { amount, beforeCredits: Number(record.allocatedCredits), afterCredits: newAllocatedCredits }
      )

      res.json({ success: true })
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message })
    }
  }

  // DELETE /admin/api-keys/:id
  static async deleteApiKey(req: Request, res: Response) {
    try {
      const { id } = req.params

      const record = await prisma.apiKey.findUnique({ where: { id } })
      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'API Key 不存在',
        })
      }

      // 调用渠道商删除
      if (record.grsaiId) {
        await grsaiClient.deleteAPIKey(record.grsaiId)
      }

      // 删除本地记录
      await prisma.apiKey.delete({ where: { id } })

      // 解绑 license
      if (record.licenseId) {
        await prisma.license.update({
          where: { id: record.licenseId },
          data: { grasaiApikey: null },
        })
      }

      await OperationLogService.log(
        'DELETE_API_KEY',
        'API_KEY',
        id,
        getAdmin(req),
        { apiKey: record.apiKey, name: record.name }
      )

      res.json({ success: true })
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message })
    }
  }
}
