"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // === 配置指定的管理员账号 ===
        const username = 'hurry';
        const password = '1446266572@Nan.Ai';
        console.log(`🌱 正在初始化管理员账号: ${username}...`);
        // 1. 生成密码哈希 (加密)
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedPassword = yield bcryptjs_1.default.hash(password, salt);
        // 2. 写入数据库
        // upsert 作用：如果账号不存在则创建；如果已存在则更新密码
        const admin = yield prisma.admin.upsert({
            where: { username },
            update: {
                password: hashedPassword, // 更新现有账号的密码
            },
            create: {
                username,
                password: hashedPassword, // 创建新账号
            },
        });
        console.log(`✅ 管理员创建/更新成功！`);
        console.log(`👤 用户名: ${admin.username}`);
        console.log(`🔑 密码: ${password}`);
        console.log(`⚠️  请妥善保管密码，生产环境建议删除此日志。`);
    });
}
main()
    .catch(e => {
    console.error('❌ 初始化失败:', e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
