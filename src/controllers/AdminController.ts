import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'
import { LicenseStatus, LicenseStrategy } from '../enums'

const prisma = new PrismaClient()

export class AdminController {
  // 生成授权码
  static async createLicense(req: Request, res: Response) {
    try {
      const { days, maxMachines, strategy, remark } = req.body
      const license = await prisma.license.create({
        data: {
          key: uuidv4().toUpperCase(),
          expiresAt: days ? dayjs().add(days, 'day').toDate() : null,
          maxMachines: maxMachines || 1,
          strategy: strategy || LicenseStrategy.FLOATING,
          remark,
          status: LicenseStatus.ACTIVE,
        },
      })
      res.json({ success: true, data: license })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  }

  // 查询列表 (分页 + 搜索 + 状态计算)
  static async listLicenses(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 10
      const keyword = req.query.keyword as string
      const statusFilter = req.query.status as string
      const usageFilter = req.query.usage as string
      // 支持按 'expiring' (快过期) 排序
      const sort = req.query.sort === 'expiring' ? { expiresAt: 'asc' } : { createdAt: 'desc' }

      const where: any = {}
      if (keyword) {
        // 增强搜索：包括授权码、备注、以及关联设备的指纹/名称/IP
        where.OR = [
          { key: { contains: keyword } },
          { remark: { contains: keyword } },
          {
            machines: {
              some: {
                OR: [
                  { fingerprint: { contains: keyword } },
                  { name: { contains: keyword } },
                  { ip: { contains: keyword } },
                ],
              },
            },
          },
        ]
      }
      if (statusFilter) where.status = statusFilter
      if (usageFilter === 'used') where.machines = { some: {} }
      if (usageFilter === 'unused') where.machines = { none: {} }

      const [total, list] = await Promise.all([
        prisma.license.count({ where }),
        prisma.license.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: sort as any,
          include: { machines: { orderBy: { lastSeen: 'desc' } } },
        }),
      ])

      const formattedList = list.map(item => {
        const now = dayjs()
        let remainingDays = null
        let displayStatus = item.status

        if (item.expiresAt) {
          const exp = dayjs(item.expiresAt)
          remainingDays = exp.diff(now, 'day')
          // 实时状态修正：如果时间到了，强制显示 EXPIRED
          if (item.status === LicenseStatus.ACTIVE && now.isAfter(exp)) displayStatus = LicenseStatus.EXPIRED
        } else {
          remainingDays = 99999 // 永久
        }

        const isActivated = item.machines.length > 0
        // 如果状态是 ACTIVE 但从未激活，显示为 INACTIVE
        if (displayStatus === LicenseStatus.ACTIVE && !isActivated) displayStatus = LicenseStatus.INACTIVE

        return {
          ...item,
          status: displayStatus,
          rawStatus: item.status, // 保留原始状态
          remainingDays, // <--- 前端可用此显示"剩余X天"
          isPermanent: !item.expiresAt,
          usedCount: item.machines.length,
          isActivated,
          lastSeenAt: item.machines[0]?.lastSeen || null,
          lastIp: item.machines[0]?.ip || null,
          machineNames: item.machines.map(m => m.name || m.fingerprint), // 设备名称列表
        }
      })

      res.json({ success: true, data: { total, page, pageSize, list: formattedList } })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  }

  // 仪表盘统计
  static async getStats(req: Request, res: Response) {
    try {
      const totalLicenses = await prisma.license.count()

      // 1. 总绑定设备数 (历史总装机量)
      const totalBoundMachines = await prisma.machine.count()

      // 2. 实时在线数 (最后活跃在 10 分钟内的)
      const tenMinutesAgo = dayjs().subtract(10, 'minute').toDate()
      const onlineMachines = await prisma.machine.count({
        where: { lastSeen: { gte: tenMinutesAgo } },
      })

      // 3. 激活的 License
      const activeLicenses = await prisma.license.count({
        where: { machines: { some: {} } },
      })

      // 4. 快过期的
      const expiringSoon = await prisma.license.count({
        where: {
          status: LicenseStatus.ACTIVE,
          expiresAt: { lte: dayjs().add(7, 'day').toDate(), gte: new Date() },
        },
      })

      res.json({
        success: true,
        data: {
          totalLicenses,
          activeLicenses,
          inactiveLicenses: totalLicenses - activeLicenses,

          // === 变动字段 ===
          totalMachines: totalBoundMachines, // 为了兼容旧字段，仍叫 totalMachines，但含义是总装机
          totalBoundMachines, // 明确的新字段：总装机
          onlineMachines, // 新字段：实时在线 (前端仪表盘建议显示这个)

          expiringSoon,
        },
      })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  }

  // 设备列表 (反查)
  static async listMachines(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1
      const pageSize = parseInt(req.query.pageSize as string) || 10
      const keyword = req.query.keyword as string

      const where: any = {}
      if (keyword) {
        where.OR = [
          { fingerprint: { contains: keyword } },
          { name: { contains: keyword } },
          { ip: { contains: keyword } },
          { license: { key: { contains: keyword } } },
        ]
      }

      const [total, list] = await Promise.all([
        prisma.machine.count({ where }),
        prisma.machine.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { lastSeen: 'desc' },
          include: {
            license: {
              select: { key: true, remark: true, status: true },
            },
          },
        }),
      ])

      const now = dayjs()

      const formattedList = list.map(m => {
        // 判断逻辑：心跳时间在 10 分钟以内算在线
        const diffMinutes = now.diff(dayjs(m.lastSeen), 'minute')
        const isOnline = diffMinutes < 10

        return {
          id: m.id,
          fingerprint: m.fingerprint,
          name: m.name || '未知设备',
          platform: m.platform,
          ip: m.ip,
          lastSeen: m.lastSeen,

          // === 新增字段 ===
          isOnline: isOnline, // true=在线(绿), false=离线(灰)
          offlineDuration: isOnline ? '在线' : `${diffMinutes}分钟前`, // 用于前端显示文本

          licenseKey: m.license.key,
          licenseRemark: m.license.remark,
          licenseStatus: m.license.status,
        }
      })

      res.json({ success: true, data: { total, page, pageSize, list: formattedList } })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  }

  // CRUD
  static async updateLicense(req: Request, res: Response) {
    try {
      const { id } = req.params
      // 1. 解构前端传来的参数
      const { status, remark, maxMachines, strategy, addDays } = req.body

      // 2. 准备要更新到数据库的对象 (只包含数据库里有的字段)
      const updateData: any = {}

      if (status) updateData.status = status
      if (remark) updateData.remark = remark
      if (maxMachines) updateData.maxMachines = maxMachines
      if (strategy) updateData.strategy = strategy

      // 3. 特殊处理：如果有 addDays，则需要计算新的 expiresAt
      if (addDays && typeof addDays === 'number') {
        // 先查出当前授权码的信息
        const currentLicense = await prisma.license.findUnique({ where: { id } })

        if (currentLicense) {
          const now = dayjs()
          const currentExpire = currentLicense.expiresAt ? dayjs(currentLicense.expiresAt) : now

          // 逻辑：如果当前还没过期，就在原过期时间上加；如果已过期，就从今天开始加
          const baseDate = currentExpire.isAfter(now) ? currentExpire : now

          // 计算新的过期时间
          updateData.expiresAt = baseDate.add(addDays, 'day').toDate()

          // 如果进行了延期操作，且当前状态是 EXPIRED，自动改为 ACTIVE
          if (currentLicense.status === LicenseStatus.EXPIRED) {
            updateData.status = LicenseStatus.ACTIVE
          }
        }
      }

      // 4. 执行更新 (注意：这里传入的是 updateData，里面没有 addDays 字段了)
      const updated = await prisma.license.update({
        where: { id },
        data: updateData,
      })

      res.json({ success: true, data: updated })
    } catch (error: any) {
      console.error(error) // 打印错误日志方便调试
      res.status(500).json({ success: false, error: error.message })
    }
  }

  static async deleteLicense(req: Request, res: Response) {
    await prisma.license.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  }

  static async resetMachines(req: Request, res: Response) {
    await prisma.machine.deleteMany({ where: { licenseId: req.params.id } })
    res.json({ success: true })
  }
}
