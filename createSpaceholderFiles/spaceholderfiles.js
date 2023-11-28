const fs = require('fs');
const path = require('path');

const directory = process.argv[2] || __dirname; // 指定目录路径
let fileSize = 1 * 1024 * 1024 * 1024; // 文件大小为1GB
const del = process.argv[3] == 'del' ? true : false; // 是否删除已存在的文件


let fileIndex = 1; // 文件编号从1开始
let totalSize = 0; // 总文件大小

let initTime = new Date().getTime(); // 记录开始时间
let startTime = initTime; // 记录每次生成文件的时间
let worstspeed = 0;

let sizeSelector = [1 * 1024 * 1024 * 1024, 1 * 1024 * 1024, 100 * 1024, fs.statfsSync(directory).bsize]
let smaller = (now, selector) => selector.filter(item => item < now).reduce((a, b) => a > b ? a : b, selector[0])

while (true) {

    let stat = fs.statfsSync(directory);
    let freespace = stat.bavail * stat.bsize;
    fileSize = smaller(freespace, sizeSelector) || 1;
    if (fileSize <= stat.bsize) {
        if (del) { // 如果指定了删除已存在的文件
            fs.readdirSync(directory).filter(item => item.endsWith('.del')).forEach(item => fs.unlinkSync(path.join(directory, item)))
        } else {
            process.exit(0)
        }
    }

    try {

        const filePath = path.join(directory, `空间写入测试文件 ${fileIndex.toString().padStart(4, '0')}.del`); // 构造文件路径
        if (fs.existsSync(filePath)) { console.log(`${filePath} exists, continue to next.`); fileIndex++; continue } // 如果文件已存在则跳过

        const buffer = Buffer.alloc(fileSize, Math.random().toString(16).slice(2)); // 生成随机数并转为 buffer
        fs.writeFileSync(filePath, buffer); // 写入文件

        fileIndex++; // 文件编号自增
        totalSize += fileSize; // 计算总文件大小

        let currentTime = new Date().getTime(); // 记录当前时间
        let usedTime = Math.round(currentTime - startTime) / 1000; // 计算生成文件所用时间
        let hsize = (fileSize / 1024 / 1024) + 'MB'
        let speed = (fileSize / 1024 / 1024 * 1000 / (currentTime - startTime)).toFixed(3); // 计算生成速度

        startTime = currentTime; // 更新上次生成文件的时间
        let totalSpeed = Math.round(totalSize / (currentTime - initTime) * 1000 / 1024 / 1024 * 1000) / 1000; // 计算总速度
        if (worstspeed == 0 || speed < worstspeed) worstspeed = speed; // 记录最慢速度
        let info = `${filePath}: ${hsize} on ${usedTime}s, ${speed} MB/s. Worst: ${worstspeed} MB/S, Overall: ${totalSpeed} MB/S`; // 输出生成的文件路径和速度

        console.log(info); // 打印信息
        fs.appendFileSync('log.txt', info + '\n'); // 将信息写入日志文件

    } catch (error) {
        console.log(error)
    }
}


// max value of nodejs
let a = Number.MAX_VALUE;
let b = a / 256 / 1024 / 1024;
console.log(b)