"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const { privateKey, publicKey } = crypto_1.default.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
fs_1.default.writeFileSync('private.pem', privateKey);
fs_1.default.writeFileSync('public.pem', publicKey);
console.log('✅ 密钥对已生成！');
console.log('请将 public.pem 内容复制到你的客户端软件代码中。');
