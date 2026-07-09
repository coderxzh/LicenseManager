const GRS_AI_BASE_URL = process.env.GRSAI_API_BASE_URL || 'https://grsaiapi.com'
const GRS_AI_TOKEN = process.env.GRSAI_API_TOKEN

interface CreateApiKeyParams {
  name: string
  type?: number
  credits?: number
  expireTime?: number
}

interface GrsaiApiKeyData {
  id: string
  key: string
  name: string
  credits: number
  expireTime: number
  createTime: number
}

async function request(path: string, body: Record<string, any>) {
  if (!GRS_AI_TOKEN) {
    throw new Error('GRSAI_API_TOKEN 未配置')
  }

  const res = await fetch(`${GRS_AI_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, token: GRS_AI_TOKEN }),
  })

  if (!res.ok) {
    throw new Error(`Grsai HTTP 错误: ${res.status}`)
  }

  const json = await res.json()
  if (json.code !== 0) {
    throw new Error(json.msg || 'Grsai API 调用失败')
  }
  return json.data
}

export class GrsaiService {
  static async createApiKey(params: CreateApiKeyParams): Promise<GrsaiApiKeyData> {
    return request('/client/openapi/createAPIKey', {
      type: params.type ?? 0,
      name: params.name,
      credits: params.credits ?? 0,
      expireTime: params.expireTime ?? 0,
    })
  }

  static async deleteApiKey(apiKey: string): Promise<void> {
    await request('/client/openapi/deleteAPIKey', { apiKey })
  }
}
