import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const licenses = await prisma.license.findMany({
    where: { grasaiApikey: { not: null } },
  })

  const groups = new Map<string, typeof licenses>()

  for (const l of licenses) {
    const key = l.grasaiApikey?.trim()
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(l)
  }

  for (const [key, items] of groups) {
    const first = items[0]

    const record = await prisma.grasaiApiKey.create({
      data: {
        key,
        name: first.remark?.trim() || '历史迁移 Key',
        credits: null,
        expireTime: null,
        createTime: Math.floor(first.createdAt.getTime() / 1000),
      },
    })

    await prisma.license.update({
      where: { id: first.id },
      data: { grasaiApiKeyId: record.id },
    })

    if (items.length > 1) {
      console.warn(`[Migrate] Key ${key} 被 ${items.length} 个 License 共用，仅保留 License ${first.id}`)
    }
  }

  console.log(`[Migrate] 完成，共处理 ${groups.size} 个不同 Key`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
