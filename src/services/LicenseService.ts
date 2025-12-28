import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import { LicenseStatus, LicenseStrategy, ErrorCode } from '../enums'

const prisma = new PrismaClient()

export class LicenseService {
  // 辅助：检查过期并同步数据库
  private static async checkExpiry(license: any) {
    if (license.expiresAt && dayjs().isAfter(license.expiresAt)) {
      if (license.status !== LicenseStatus.EXPIRED) {
        // 懒更新：顺手改状态
        await prisma.license.update({
          where: { id: license.id },
          data: { status: LicenseStatus.EXPIRED },
        })
      }
      throw new Error('授权码已过期')
    }
  }

  /**
   * 场景1：激活/登录 (Login)
   * 只有这一步会执行"挤掉旧机器"的操作
   */
  static async activate(key: string, fingerprint: string, meta: any) {
    const license = await prisma.license.findUnique({
      where: { key },
      include: { machines: { orderBy: { lastSeen: 'asc' } } }, // 按时间排序，第0个是最老的
    })

    if (!license) throw new Error('授权码无效')

    // 1. 检查过期
    await this.checkExpiry(license)

    if (license.status !== LicenseStatus.ACTIVE) throw new Error(`授权码不可用: ${license.status}`)

    // 2. 检查机器是否已存在
    const currentMachine = license.machines.find(m => m.fingerprint === fingerprint)
    if (currentMachine) {
      await prisma.machine.update({
        where: { id: currentMachine.id },
        data: { lastSeen: new Date(), ip: meta.ip },
      })
      return { valid: true, message: '欢迎回来' }
    }

    // 3. 机器不存在，判断是否满员
    if (license.machines.length >= license.maxMachines) {
      if (license.strategy === LicenseStrategy.FLOATING) {
        // === 浮动策略：踢人 ===
        const machineToKick = license.machines[0]
        console.log(`[Activate] 浮动踢人: ${machineToKick.fingerprint} 被 ${fingerprint} 挤下线`)

        // [BUG修复] 使用 deleteMany 避免并发 Race Condition 导致报错
        await prisma.machine.deleteMany({ where: { id: machineToKick.id } })
      } else {
        throw new Error('机器数量已达上限')
      }
    }

    // 4. 注册新机器
    await prisma.machine.create({
      data: {
        licenseId: license.id,
        fingerprint,
        ip: meta.ip,
        platform: meta.platform,
        name: meta.hostname,
      },
    })
    return { valid: true, message: '激活成功' }
  }

  /**
   * 场景2：心跳保活 (Heartbeat)
   * 如果被踢，直接报错，不自动重新激活
   */
  static async heartbeat(key: string, fingerprint: string) {
    const license = await prisma.license.findUnique({
      where: { key },
      include: { machines: { orderBy: { lastSeen: 'asc' } } },
    })

    if (!license) throw new Error('授权码无效')
    await this.checkExpiry(license)

    const currentMachine = license.machines.find(m => m.fingerprint === fingerprint)

    if (!currentMachine) {
      // === 关键：找不到自己 = 被踢了 ===
      throw new Error(ErrorCode.KICKED)
    }

    await prisma.machine.update({
      where: { id: currentMachine.id },
      data: { lastSeen: new Date() },
    })

    return { valid: true, alive: true }
  }

  /**
   * [新增] 获取授权详情 (只读)
   * 用于客户端查询：过期时间、最大数量、当前占用
   */
  static async getInfo(key: string) {
    // 1. 查询 License 及其绑定的机器
    const license = await prisma.license.findUnique({
      where: { key },
      include: {
        machines: true, // 包含机器列表以便计算数量
      },
    })

    if (!license) throw new Error('授权码无效')

    // 2. 检查过期状态 (逻辑与 activate 保持一致)
    await this.checkExpiry(license)

    // 3. 计算数据
    const usedCount = license.machines.length
    const maxMachines = license.maxMachines
    const remainingDays = license.expiresAt ? dayjs(license.expiresAt).diff(dayjs(), 'day') : 99999 // 永久

    // 4. 返回脱敏后的信息 (不要返回 private 信息)
    return {
      valid: true, // 只要查到了且没报错，就是有效的
      status: license.status,
      maxMachines: maxMachines,
      usedMachines: usedCount,
      expiresAt: license.expiresAt,
      remainingDays: remainingDays,
      strategy: license.strategy,
    }
  }
}
