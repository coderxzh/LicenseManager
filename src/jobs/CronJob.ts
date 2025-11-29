import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { LicenseStatus } from '../enums'

const prisma = new PrismaClient()

export const startCronJobs = () => {
  cron.schedule('0 * * * *', async () => {
    console.log(`[Cron] 开始清理过期数据...`)
    try {
      await prisma.license.updateMany({
        where: {
          status: LicenseStatus.ACTIVE,
          expiresAt: { lt: new Date() },
        },
        data: {
          status: LicenseStatus.EXPIRED,
        },
      })
    } catch (e) {
      console.error(e)
    }
  })
}



