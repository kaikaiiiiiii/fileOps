const fs = require('fs');
const path = require('path');

var targetPath = 'F:\\Anime Episodes'
var CRC8reg = /[0-9A-F]{8}/i;

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

            // 因为对于不满10集的番（01-09），直接使用 lcs 作对比会忽略序号前的 0，只找出 1-9
            // 因此需要单独通过 /\d{2,3}/i 来寻找寻找集数序号
            // 存在某种可能，番剧没有编号，而是直接写入每集名称，这种情况下没有集数序号列
            let numreg = /\d{2,3}/ig;
            let nums = this.files.map(e => e.replace(CRC8reg, '').match(numreg));
            let flags = new Array(nums[0].length).fill(false);
            for (let i = 1; i < nums.length; i++) {
                for (let j = 0; j < nums[0].length; j++) {
                    if (nums[i][j] != nums[i - 1][j]) {
                        flags[j] = true;
                    }
                }
            }
            //如果没有序号，则返回的是与 nums 等长的 undefined 数组，以 -1 标记。
            let guessEpisodes = nums.map(arr => arr.filter((e, i) => flags[i])[0]).map(e => e ? e : -1);
            let guessEpisodeDigitsLength = guessEpisodes[0] && guessEpisodes[0].length || 0

            // 推断集数序号位置
            let pos = guessEpisodes.map((e, i) => {
                return this.files[i].match(e)?.index || -1;
            });
            let p,
                o = Object.entries(
                    pos.reduce((base, add) => {
                        base[add] = base[add] + 1 || 1;
                        return base
                    }, {})
                )
            if (o.length == 1) { p = o[0][0] } else {
                p = o.reduce((base, add) => {
                    return base[1] > add[1] ? base : add;
                })[0]
            }
            // 计算子目录名
            if (p == -1) {
                let output = this.files.reduce((base, add) => lcs(base, add));
                output = output.replace(/\.([^.]*)$/, '');
                this.subDir = output;
            } else {
                let lefts = this.files.map(e => e.replace(CRC8reg, '').slice(0, p));
                let rights = this.files.map(e => e.replace(CRC8reg, '').slice(~~p + 2));
                let left = lefts.reduce((base, add) => lcs(base, add));
                let right = rights.reduce((base, add) => lcs(base, add));
                // 生成集数序号起止
                let episodes = this.files.map(e => e.substring(p, ~~p + guessEpisodeDigitsLength)).filter(e => !isNaN(e));
                function findSeries(array) {
                    var result = array[0];
                    for (let i = 1; i < array.length; i++) {
                        if (array[i] - array[i - 1] != 1) {
                            result += ','
                            result += array[i]
                            continue
                        }
                        if (i == array.length - 1) {
                            result += ('-' + array[i]);
                            continue
                        }
                    }
                    return result
                }
                let mid = findSeries(episodes);
                let output = left + '[' + mid + ']' + right;
                output = output.replace(/\.([^.]*)$/, '');
                output = output.replace(/\(\)/, '');
                output = output.replace(/\] \[/, '][');
                output = output.replace(/  /, ' ');
                output = output.replace(/ - /, ' ');
                console.log(output)
                this.subDir = output
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

