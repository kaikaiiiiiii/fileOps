const fs = require('fs');
const path = require('path');

let targetPath = process.argv[2] || 'F:\\Anime Episodes';
let CRC8reg = /[0-9A-F]{8}/i;

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function stringSplice(str, index, count, add) {
    // We cannot pass negative indexes directly to the 2nd slicing operation.
    if (index < 0) {
        index = str.length + index;
        if (index < 0) { index = 0; }
    }
    return str.slice(0, index) + (add || "") + str.slice(index + count);
}

// 根据两个文件名的最小公共子序列与文件名间的相似度，判断两个文件是否可以归并到同一个目录中。
// 两种情况：
// 两个文件分别名为 episode 01 和 episode 02 属于同一目录。判断为相似度 > 95%
// 两个文件分别名为 movie 和 movie extra 属于同一目录。判断为 lsc 串等于某个文件。
// 需要去掉 CRC8 校验位。

function lcs(a, b) {
    if (typeof a != 'string' || typeof b != 'string') { return new Error('arguments are not strings') };
    if (a == undefined && b) { return b };
    if (b == undefined && a) { return a };
    if (b == undefined && a == undefined) { return '' };

    const m = a.length, n = b.length;
    const memo = new Array(m + 1).fill().map(() => new Array(n + 1).fill(""));
    for (let i = 1; i <= m; i++) {
        var c1 = a[i - 1];
        for (let j = 1; j <= n; j++) {
            var c2 = b[j - 1];
            if (c1 === c2) {
                memo[i][j] = memo[i - 1][j - 1].concat(c2);
            } else {
                var t1 = memo[i - 1][j];
                var t2 = memo[i][j - 1];
                memo[i][j] = t1.length > t2.length ? t1 : t2;
            }
        }
    }
    return memo[m][n];
}

// 定义同目录文件组对象
class Folder {
    constructor(x) {
        this.baseDir = targetPath;
        this.files = x ? [x] : [];
        this.status = 0; // 0 = pending, 1 = executed,
    }
    add(x) {
        this.files.push(x);
    }
    buildSubDir() {
        if (this.files.length > 1) {
            // 新逻辑：识别真正的剧集序号位置
            let episodePositions = [];
            const numreg = /\d{2,3}/g;

            // 1. 提取所有文件中的数字序列及其位置
            let allMatches = this.files.map(file => {
                let cleanName = file.replace(CRC8reg, '');
                let matches = [];
                let match;
                while ((match = numreg.exec(cleanName)) !== null) {
                    matches.push({
                        value: match[0],
                        index: match.index
                    });
                }
                return matches;
            });

            // 2. 识别可能的剧集序号（要求：数字连续递增，位置稳定）
            let candidateIndex = -1;
            for (let i = 0; i < allMatches[0].length; i++) {
                // 检查所有文件在相同索引位置是否有数字序列
                const values = allMatches.map(matches =>
                    matches[i] ? parseInt(matches[i].value) : NaN
                );

                // 验证是否满足剧集序号特征：
                // a) 所有文件都有该位置
                // b) 数字严格递增
                // c) 位置基本一致（索引差<5）
                if (values.every(v => !isNaN(v)) &&
                    values.every((v, idx) => idx === 0 || v > values[idx - 1])) {

                    const baseIndex = allMatches[0][i].index;
                    const positionStable = allMatches.every(
                        (matches, idx) => Math.abs(matches[i].index - baseIndex) < 5
                    );

                    if (positionStable) {
                        candidateIndex = i;
                        break;
                    }
                }
            }

            // 3. 使用识别到的剧集序号构建目录名
            if (candidateIndex !== -1) {
                const positions = allMatches.map(matches => matches[candidateIndex].index);
                const digits = allMatches[0][candidateIndex].value.length;
                const p = Math.min(...positions); // 取最小位置作为基准

                const episodes = this.files.map((file, idx) => {
                    const start = positions[idx];
                    return file.replace(CRC8reg, '').substring(start, start + digits);
                });

                const lefts = this.files.map(file =>
                    file.replace(CRC8reg, '').slice(0, p)
                );
                const rights = this.files.map(file =>
                    file.replace(CRC8reg, '').slice(p + digits)
                );

                const left = lefts.reduce((base, add) => lcs(base, add));
                const right = rights.reduce((base, add) => lcs(base, add));

                // 格式化剧集范围（连续/不连续处理）
                const formatRange = episodes => {
                    const nums = episodes.map(e => parseInt(e));
                    let start = nums[0], end = nums[0];
                    let ranges = [];

                    for (let i = 1; i < nums.length; i++) {
                        if (nums[i] === end + 1) {
                            end = nums[i];
                        } else {
                            ranges.push(start === end ?
                                episodes[start - nums[0]] :
                                `${episodes[start - nums[0]]}-${episodes[end - nums[0]]}`
                            );
                            start = end = nums[i];
                        }
                    }
                    ranges.push(start === end ?
                        episodes[start - nums[0]] :
                        `${episodes[start - nums[0]]}-${episodes[end - nums[0]]}`
                    );
                    return ranges.join(',');
                };

                let output = left + '[' + formatRange(episodes) + ']' + right;
                output = output.replace(/\.([^.]*)$/, '')  // 移除扩展名
                    .replace(/\(\)/, '')                   // 清理空括号
                    .replace(/\] \[/, '][')                // 合并相邻括号
                    .replace(/  /g, ' ')                   // 合并多余空格
                    .replace(/ - /g, ' ');                 // 清理短横线
                this.subDir = output;

            } else {
                // 无剧集序号时使用原始LCS方案
                let output = this.files.reduce((base, add) => lcs(base, add));
                output = output.replace(/\.([^.]*)$/, '');
                this.subDir = output;
            }
        }
    }
    print() {
        this.buildSubDir();
        console.log("===> " + path.join(this.baseDir, this.subDir || ''));
        for (let item of this.files) {
            console.log('  -> ' + item);
        }
    }
    exec() {
        this.buildSubDir();
        if (this.subDir == undefined || this.subDir.length == 0) {
            this.files.forEach(f => {
                console.log('Keep' + f + ', don\'t move.')
            })
        } else {
            let target = path.join(this.baseDir, this.subDir);
            if (fs.existsSync(target) == false) { fs.mkdirSync(target) };
            this.files.forEach(file => {
                let from = path.join(this.baseDir, file);
                let to = path.join(target, file);
                fs.renameSync(from, to);
                console.log('Move ' + file + ' done.')
            });
        }
    }
}

// 

var list = fs.readdirSync(targetPath)
    .filter(e => !fs.statSync(path.join(targetPath, e)).isDirectory());
// var list = fs.readFileSync('ls.txt', 'utf8').split('\n');

function grouping(list) {
    var result = [];
    var o = new Folder(list[0]);
    for (let i = 1; i < list.length; i++) {
        let a = list[i - 1].replace(CRC8reg, ''), b = list[i].replace(CRC8reg, '');
        let thisLCS = lcs(a, b);
        if (thisLCS.length >= a.length * 0.95 || thisLCS.length >= b.length * 0.95) {
            o.add(list[i]);
            continue;
        } else {
            result.push(o);
            o = new Folder(list[i]);
        }
    }
    result.push(o);
    return result
}

var g = grouping(list);

g.forEach(e => e.print())
g.forEach(e => e.exec())

