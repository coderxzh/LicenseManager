import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // === 配置指定的管理员账号 ===
  const username = 'hurry'
  const password = '1446266572@Nan.Ai'

  console.log(`🌱 正在初始化管理员账号: ${username}...`)

  // 1. 生成密码哈希 (加密)
  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)

  // 2. 写入数据库
  // upsert 作用：如果账号不存在则创建；如果已存在则更新密码
  const admin = await prisma.admin.upsert({
    where: { username },
    update: {
      password: hashedPassword, // 更新现有账号的密码
    },
    create: {
      username,
      password: hashedPassword, // 创建新账号
    },
  })

  console.log(`✅ 管理员创建/更新成功！`)
  console.log(`👤 用户名: ${admin.username}`)
  console.log(`🔑 密码: ${password}`)
  console.log(`⚠️  请妥善保管密码，生产环境建议删除此日志。`)
}

main()
  .catch(e => {
    console.error('❌ 初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
