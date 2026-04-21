import CryptoJS from 'crypto-js';

interface ConfigCache {
  token: string;
  kis: string;
  ra1: string;
  ra2: string;
  random: number;
}

interface DashboardData {
  credits: number;
  todayConsumed: number;
  totalConsumed: number;
}

interface CreateAPIKeyResult {
  id: string;
  key: string;
  name: string;
  credits: number;
  expireTime: number;
  createTime: number;
}

class GrsaiClient {
  private v1Token: string; // VITE_GRSAI_TOKEN, 用于 createAPIKey body token
  private auth: string;    // VITE_GRSAI_AUTH, 用于 getConfig Authorization
  private configCache: ConfigCache | null = null;

  constructor(v1Token: string, auth: string) {
    this.v1Token = v1Token;
    this.auth = auth;
  }

  private async ensureConfig(): Promise<void> {
    if (!this.configCache) {
      await this.getConfig();
    }
  }

  async getConfig(): Promise<ConfigCache> {
    const res = await fetch('https://grsaiapi.com/client/common/getConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': this.auth },
      body: JSON.stringify({ token: this.auth, referrer: '' }),
    });
    const data = await res.json();
    if (data.code !== 0 || !data.data) {
      throw new Error(data.msg || 'getConfig failed');
    }

    this.configCache = {
      token: data.data.token,
      kis: data.data.kis,
      ra1: data.data.ra1,
      ra2: data.data.ra2,
      random: data.data.random,
    };
    return this.configCache;
  }

  private sortASCII(obj: Record<string, any>): Record<string, any> {
    const sorted: Record<string, any> = {};
    Object.keys(obj).sort().forEach((k) => {
      sorted[k] = obj[k];
    });
    return sorted;
  }

  private aesDecrypt(key: string, iv: string, ciphertext: string): string {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    const parsedIv = CryptoJS.enc.Utf8.parse(iv);
    const decrypted = CryptoJS.AES.decrypt(ciphertext, parsedKey, {
      iv: parsedIv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  private aesEncrypt(key: string, iv: string, plaintext: string): string {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    const parsedIv = CryptoJS.enc.Utf8.parse(iv);
    const encrypted = CryptoJS.AES.encrypt(plaintext, parsedKey, {
      iv: parsedIv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return encrypted.toString();
  }

  generateXTX(body: Record<string, any>): string {
    if (!this.configCache) {
      throw new Error('Config not loaded');
    }
    const { token, kis, ra1, ra2, random } = this.configCache;
    if (!kis || !token) {
      return '';
    }

    // Step 1: 排序 + base64 编码
    const sorted = this.sortASCII(body);
    let b = '';
    for (const key in sorted) {
      if (sorted[key] === undefined) continue;
      let val = JSON.stringify(sorted[key]);
      val = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(val));
      b += `${key}=${val}`;
    }

    // Step 2: 解码 kis
    const p = Buffer.from(kis, 'base64').toString('utf8').split('=sj+Ow2R/v');

    // Step 3: 推导索引
    const y = random.toString().split('');
    const firstDigit = parseInt(y[0]);
    const lastDigit = parseInt(y[y.length - 1]);
    const w = y.slice(2, 2 + firstDigit);
    const B = y.slice(4 + firstDigit, 4 + firstDigit + lastDigit);
    const S = parseInt(w.join(''));
    const k = parseInt(B.join(''));
    const A = p[S];
    const E_key = p[k];

    if (!A || !E_key) {
      return '';
    }

    // Step 4: 解密 ra1/ra2
    const C = this.aesDecrypt(A, E_key, ra1);
    const z = this.aesDecrypt(A, E_key, ra2);
    if (!C || !z) {
      return '';
    }

    // Step 5: MD5(AES.encrypt(C, z, b))
    return CryptoJS.MD5(this.aesEncrypt(C, z, b)).toString();
  }

  private async requestV2(endpoint: string, body: Record<string, any>): Promise<any> {
    await this.ensureConfig();

    const xtx = this.generateXTX(body);
    const res = await fetch(`https://grsaiapi.com${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.configCache!.token || this.auth,
        ...(xtx ? { 'xtx': xtx } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.code !== 0) {
      throw new Error(data.msg || `V2 request failed: ${endpoint}`);
    }
    return data;
  }

  async getDashboardData(): Promise<DashboardData> {
    await this.ensureConfig();
    const res = await fetch('https://grsaiapi.com/client/grsai/getDashboardData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': this.configCache!.token },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok || data.code !== 0) {
      throw new Error(data.msg || 'getDashboardData failed');
    }
    return data.data as DashboardData;
  }

  async createAPIKey(params: {
    type: number;
    name: string;
    credits: number;
    expireTime: number;
  }): Promise<CreateAPIKeyResult> {
    const res = await fetch('https://grsai.dakka.com.cn/client/openapi/createAPIKey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: this.v1Token,
        type: params.type,
        name: params.name,
        credits: params.credits,
        expireTime: params.expireTime,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.code !== 0) {
      throw new Error(data.msg || 'createAPIKey failed');
    }
    return data.data as CreateAPIKeyResult;
  }

  async updateAPIKey(params: {
    apiKey: string;
    name: string;
    type: number;
    credits: number;
    expireTime: number;
  }): Promise<void> {
    await this.requestV2('/client/grsai/updateAPIKeyInfo', {
      apiKey: params.apiKey,
      name: params.name,
      type: params.type,
      credits: params.credits,
      expireTime: params.expireTime,
    });
  }

  async deleteAPIKey(grsaiId: string): Promise<void> {
    await this.requestV2('/client/grsai/deleteAPIKey', {
      id: grsaiId,
    });
  }

  // 查询单个 API Key 的剩余额度（无需 token）
  async getAPIKeyCredits(apiKey: string): Promise<number> {
    const res = await fetch('https://grsaiapi.com/client/openapi/getAPIKeyCredits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json();
    if (!res.ok || data.code !== 0) {
      throw new Error(data.msg || 'getAPIKeyCredits failed');
    }
    return data.data?.credits ?? 0;
  }
}

export const grsaiClient = new GrsaiClient(
  process.env.VITE_GRSAI_TOKEN || '',
  process.env.VITE_GRSAI_AUTH || ''
);
