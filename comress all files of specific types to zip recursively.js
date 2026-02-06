#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 定义要处理的文件后缀数组
const TARGET_EXTENSIONS = ['.csv', '.txt', '.log', '.json'];

async function compressFiles(dirPath) {
    try {
        // 检查目录是否存在
        const stats = await fs.promises.stat(dirPath);
        if (!stats.isDirectory()) {
            console.error(`错误：${dirPath} 不是目录`);
            process.exit(1);
        }
    } catch (error) {
        console.error(`错误：无法访问目录 ${dirPath}`, error.message);
        process.exit(1);
    }

    console.log(`开始处理目录: ${dirPath}`);
    console.log(`目标文件后缀: ${TARGET_EXTENSIONS.join(', ')}`);

    // 递归遍历目录
    async function traverseDirectory(currentPath) {
        const files = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(currentPath, file.name);

            if (file.isDirectory()) {
                // 递归处理子目录
                await traverseDirectory(fullPath);
            } else if (file.isFile()) {
                // 获取文件扩展名并转换为小写
                const ext = path.extname(file.name).toLowerCase();

                // 检查是否是目标后缀
                if (TARGET_EXTENSIONS.includes(ext)) {
                    // 处理文件
                    await compressFile(fullPath);
                }
            }
        }
    }

    // 压缩单个文件
    async function compressFile(filePath) {
        const zipFilePath = filePath + '.zip';

        console.log(`压缩: ${filePath} -> ${zipFilePath}`);

        return new Promise((resolve, reject) => {
            // 使用7z压缩文件
            const sevenZip = spawn('7z', ['a', '-tzip', zipFilePath, filePath]);

            let errorOutput = '';

            sevenZip.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            sevenZip.on('close', async (code) => {
                if (code === 0) {
                    try {
                        // 压缩成功后删除原文件
                        await fs.promises.unlink(filePath);
                        console.log(`✓ 完成: ${filePath} -> ${zipFilePath} (原文件已删除)`);
                        resolve();
                    } catch (deleteError) {
                        console.error(`✗ 删除原文件失败: ${filePath}`, deleteError.message);
                        reject(deleteError);
                    }
                } else {
                    const error = new Error(`7z压缩失败，退出码: ${code}\n错误信息: ${errorOutput}`);
                    console.error(`✗ 压缩失败: ${filePath}`, error.message);
                    reject(error);
                }
            });

            sevenZip.on('error', (error) => {
                console.error(`✗ 无法执行7z命令: ${filePath}`, error.message);
                reject(error);
            });
        });
    }

    try {
        await traverseDirectory(dirPath);
        console.log('所有文件处理完成！');
    } catch (error) {
        console.error('处理过程中发生错误:', error.message);
        process.exit(1);
    }
}

// 主程序
function main() {
    // 获取命令行参数
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('用法: node myscript.js <目录路径>');
        console.log('示例: node myscript.js ./data');
        console.log(`当前处理的文件后缀: ${TARGET_EXTENSIONS.join(', ')}`);
        process.exit(1);
    }

    const targetPath = path.resolve(args[0]);

    // 开始处理
    compressFiles(targetPath);
}

// 执行主函数
if (require.main === module) {
    main();
}