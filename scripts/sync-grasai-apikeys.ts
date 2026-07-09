import { PrismaClient } from '@prisma/client'
import dayjs from 'dayjs'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

interface RemoteApiKey {
  key: string
  name?: string
  credits?: number
  expireTime?: number
  createTime?: string | number
}

interface LogDetails {
  key?: string // License key
  apiKey?: string
  apiKeyId?: string
  name?: string
}

interface KeyState {
  licenseKey?: string
  name?: string
  deleted: boolean
  lastAction?: string
  lastActionAt?: Date
}

// ========== 字符串相似度工具 ==========

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/_/g, '')
}

function variants(s: string): string[] {
  const base = normalize(s)
  const noPrefix = base.replace(/^a\d+/i, '')
  const noSuffix = base.replace(/\d+$/, '')
  const noPrefixSuffix = noPrefix.replace(/\d+$/, '')
  return Array.from(new Set([base, noPrefix, noSuffix, noPrefixSuffix])).filter((v) => v.length > 0)
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  const va = variants(a)
  const vb = variants(b)
  let max = 0
  for (const x of va) {
    for (const y of vb) {
      const dist = levenshtein(x, y)
      const len = Math.max(x.length, y.length)
      const sim = len === 0 ? 0 : 1 - dist / len
      if (sim > max) max = sim
    }
  }
  return max
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const deleteOrphans = process.argv.includes('--delete-orphans')
  const matchByName = process.argv.includes('--match-by-name')
  const thresholdArg = process.argv.find((arg, i) => arg.startsWith('--threshold=') && i > 1)
  const threshold = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 0.6

  const fileArg = process.argv.find((arg, i) => i > 1 && !arg.startsWith('--'))

  if (!fileArg) {
    console.error(
      '用法：npx ts-node scripts/sync-grasai-apikeys.ts <path/to/remote-apikeys.json> [--dry-run] [--delete-orphans] [--match-by-name] [--threshold=0.6]'
    )
    process.exit(1)
  }

  const filePath = path.resolve(fileArg)
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`)
    process.exit(1)
  }

  const remoteKeys: RemoteApiKey[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  console.log(`[Sync] 读取到 ${remoteKeys.length} 条云端 API Key 数据`)

  if (dryRun) {
    console.log('[Sync] 试运行模式，不会写入数据库')
  }

  // ========== 第一步：以远程为准，创建/更新 GrasaiApiKey 记录 ==========
  const localByKey = new Map<string, { id: string; key: string }>()
  let upserted = 0

  for (const remote of remoteKeys) {
    const createTimeUnix =
      remote.createTime === undefined
        ? null
        : typeof remote.createTime === 'string'
        ? dayjs(remote.createTime).unix() || null
        : remote.createTime

    const data: any = {
      name: remote.name || '未命名 Key',
    }
    if (remote.credits !== undefined) data.credits = remote.credits
    if (remote.expireTime !== undefined) data.expireTime = remote.expireTime
    if (createTimeUnix !== null) data.createTime = createTimeUnix

    if (!dryRun) {
      const record = await prisma.grasaiApiKey.upsert({
        where: { key: remote.key },
        update: data,
        create: { key: remote.key, ...data },
      })
      localByKey.set(record.key, { id: record.id, key: record.key })
    } else {
      const existing = await prisma.grasaiApiKey.findUnique({ where: { key: remote.key } })
      localByKey.set(remote.key, { id: existing?.id || '[dry-run]', key: remote.key })
    }

    upserted++
  }

  console.log(`[Sync] 已同步 ${upserted} 条 API Key 记录`)

  // ========== 第二步：从日志恢复 License 绑定关系 ==========
  const logs = await prisma.operationLog.findMany({
    where: {
      action: {
        in: ['CREATE_GRSAI_APIKEY', 'UPDATE_GRSAI_APIKEY', 'DELETE_GRSAI_APIKEY'],
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[Sync] 找到 ${logs.length} 条相关日志，开始计算绑定关系`)

  const stateMap = new Map<string, KeyState>()

  for (const log of logs) {
    const details: LogDetails = log.details ? JSON.parse(log.details) : {}
    const apiKey = details.apiKey
    if (!apiKey) continue

    const state: KeyState = stateMap.get(apiKey) || { deleted: false }

    if (log.action === 'CREATE_GRSAI_APIKEY') {
      state.licenseKey = details.key
      state.name = details.name || state.name
      state.deleted = false
    } else if (log.action === 'UPDATE_GRSAI_APIKEY') {
      if (details.name) state.name = details.name
      state.deleted = false
    } else if (log.action === 'DELETE_GRSAI_APIKEY') {
      state.deleted = true
    }

    state.lastAction = log.action
    state.lastActionAt = log.createdAt
    stateMap.set(apiKey, state)
  }

  const boundApiKeys = new Set<string>()
  const boundLicenseKeys = new Set<string>()
  let bound = 0
  let skippedDeleted = 0
  let noLicense = 0
  let notInRemote = 0
  let failed = 0

  for (const [apiKey, state] of stateMap) {
    const local = localByKey.get(apiKey)

    if (state.deleted) {
      console.log(`[Sync] key 已删除，跳过绑定: ${apiKey}`)
      skippedDeleted++
      continue
    }

    if (!local) {
      console.warn(`[Sync] key 不在远程列表中，跳过绑定: ${apiKey}`)
      notInRemote++
      continue
    }

    if (!state.licenseKey) {
      console.warn(`[Sync] 日志中找不到该 key 对应的 License key: ${apiKey}`)
      noLicense++
      continue
    }

    try {
      const license = await prisma.license.findUnique({
        where: { key: state.licenseKey },
      })

      if (!license) {
        console.warn(`[Sync] License 不存在: ${state.licenseKey}`)
        noLicense++
        continue
      }

      if (!dryRun) {
        await prisma.license.update({
          where: { id: license.id },
          data: { grasaiApiKeyId: local.id },
        })
      }

      console.log(`[Sync] ${dryRun ? '[试运行] ' : ''}日志绑定 ${apiKey} -> License ${license.key}`)
      bound++
      boundApiKeys.add(apiKey)
      boundLicenseKeys.add(license.key)
    } catch (e: any) {
      console.error(`[Sync] 绑定 ${apiKey} 失败: ${e.message}`)
      failed++
    }
  }

  console.log(
    `[Sync] 日志绑定完成。成功: ${bound}，已删除跳过: ${skippedDeleted}，无对应 License: ${noLicense}，不在远程列表: ${notInRemote}，失败: ${failed}`
  )

  // ========== 第三步：按名称模糊匹配（仅处理日志未绑定的 key） ==========
  if (matchByName) {
    console.log(`[Sync] 开始按名称模糊匹配，阈值: ${threshold}`)

    const unboundRemoteKeys = remoteKeys.filter((r) => !boundApiKeys.has(r.key))
    const licenses = await prisma.license.findMany({
      where: { grasaiApiKeyId: null },
      select: { id: true, key: true, remark: true },
    })

    console.log(`[Sync] 待匹配 API Key: ${unboundRemoteKeys.length}，待匹配 License: ${licenses.length}`)

    interface Candidate {
      apiKey: string
      apiKeyName: string
      licenseKey: string
      licenseRemark: string
      score: number
      exact: boolean
    }

    const candidates: Candidate[] = []

    for (const remote of unboundRemoteKeys) {
      const apiName = remote.name || ''
      for (const license of licenses) {
        const remark = license.remark || ''
        // 优先处理完全一致的名称（去除大小写/空格后）
        const exact = normalize(apiName) === normalize(remark)
        if (exact) {
          candidates.push({
            apiKey: remote.key,
            apiKeyName: apiName,
            licenseKey: license.key,
            licenseRemark: remark,
            score: 1,
            exact: true,
          })
          continue
        }

        const score = similarity(apiName, remark)
        if (score >= threshold) {
          candidates.push({
            apiKey: remote.key,
            apiKeyName: apiName,
            licenseKey: license.key,
            licenseRemark: remark,
            score,
            exact: false,
          })
        }
      }
    }

    // 按相似度降序、完全匹配优先，贪心分配避免冲突
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.exact ? 1 : 0) - (a.exact ? 1 : 0)
    })

    const matchedApiKeys = new Set<string>()
    const matchedLicenseKeys = new Set<string>()
    let nameBound = 0

    for (const c of candidates) {
      if (matchedApiKeys.has(c.apiKey) || matchedLicenseKeys.has(c.licenseKey)) continue

      const local = localByKey.get(c.apiKey)
      const license = await prisma.license.findUnique({ where: { key: c.licenseKey } })
      if (!local || !license) continue

      if (!dryRun) {
        await prisma.license.update({
          where: { id: license.id },
          data: { grasaiApiKeyId: local.id },
        })
      }

      const tag = c.exact ? '精确' : '名称'
      console.log(
        `[Sync] ${dryRun ? '[试运行] ' : ''}${tag}匹配绑定 ${c.apiKey}(${c.apiKeyName}) -> License ${license.key}(${c.licenseRemark}) ${c.exact ? '' : '相似度:' + (c.score * 100).toFixed(1) + '%'}`
      )

      matchedApiKeys.add(c.apiKey)
      matchedLicenseKeys.add(c.licenseKey)
      nameBound++
    }

    const unmatchedKeys = unboundRemoteKeys.filter((r) => !matchedApiKeys.has(r.key))
    console.log(
      `[Sync] 名称匹配完成。成功: ${nameBound}，未匹配: ${unmatchedKeys.length}`
    )

    if (unmatchedKeys.length > 0) {
      console.log('[Sync] 未匹配的 API Key：')
      for (const k of unmatchedKeys) {
        console.log(`  - ${k.name || '未命名'} / ${k.key}`)
      }
    }
  }

  // ========== 可选：清理本地孤立的 GrasaiApiKey 记录 ==========
  if (deleteOrphans && !dryRun) {
    const remoteKeySet = new Set(remoteKeys.map((k) => k.key))
    const localKeys = await prisma.grasaiApiKey.findMany({
      where: { license: { is: null } },
      select: { id: true, key: true },
    })

    let deleted = 0
    for (const local of localKeys) {
      if (!remoteKeySet.has(local.key)) {
        await prisma.grasaiApiKey.delete({ where: { id: local.id } })
        console.log(`[Sync] 删除孤立本地 key: ${local.key}`)
        deleted++
      }
    }
    console.log(`[Sync] 共删除 ${deleted} 条孤立记录`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
