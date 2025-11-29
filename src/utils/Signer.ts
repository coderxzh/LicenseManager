import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const privateKeyPath = path.join(process.cwd(), 'private.pem');
let PRIVATE_KEY = '';

try {
    PRIVATE_KEY = fs.readFileSync(privateKeyPath, 'utf8');
} catch (e) {
    console.warn("⚠️  警告: 未找到 private.pem，响应将不会被签名。");
}

export const signResponse = (data: any) => {
    if (!PRIVATE_KEY) return { data };

    const payload = JSON.stringify(data);
    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    sign.end();

    const signature = sign.sign(PRIVATE_KEY, 'base64');
    
    // 返回标准结构：数据 + 签名
    return { data, signature };
};




