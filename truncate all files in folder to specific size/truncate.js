// Description: Recursively cut all files in folder to 1KB

const fs = require('fs')
const path = require('path')



//////////////////////////////////////////////////

function parseArgs() {
    let args = process.argv.slice(2);

    function printHelp() {
        console.log('Usage: node cuts.js [folder1 folder2 ... file1 file2] <-s size>');
        console.log('Example: node cuts.js f:\\downloads e:\\downloads d:\\ -s 1');
        console.log('## -s can be ignored, default size is 1 KB');
        process.exit(0);
    }
    // check help
    if (args.findIndex((arg) => arg === '--help' || arg === '-h' || arg === '-help') > -1) {
        printHelp();
    }

    if (args.length === 0) {
        printHelp();
    }


    let sizeindex = args.findIndex((arg) => arg === '--size' || arg === '-s' || arg === '-size');
    let size = 1024;
    if (sizeindex > -1) {
        let sizeNumber = parseInt(args[speedindex + 1]) * 1024
        if (sizeNumber > 0) {
            size = sizeNumber;
            args.splice(sizeindex, 2);
        } else {
            console.log(`Can't read size number after '-s' flag, use default size ${size / 1024} KB`);
            args.splice(sizeindex, 1);
        }
    }

    return { list: args, size: size };
}

let { list, size } = parseArgs();

//////////////////////////////////////////////////////////

function main(target, size) {
    if (target === undefined) return false

    if (typeof target === 'string') target = [target]

    for (let item of target) {
        walkSync(item, size)
    }

}

main(list, size)

//////////////////////////////////////////////////////////


function walkSync(dir, size) {
    if (!fs.existsSync(dir)) return console.log(`Path not exist: ${dir}`)
    let stats = fs.statSync(dir)
    if (stats.isDirectory()) {
        const files = fs.readdirSync(dir)
        files.forEach(file => {
            const filepath = path.join(dir, file)
            walkSync(filepath, size)
        })
    } else if (stats.isFile()) {
        replace(dir, size)
    } else {
        console.log(`Unknown target: ${dir}`)
    }
}


const replace = (target, length = 1024) => {
    if (!fs.existsSync(target)) { return false }
    const existfilesize = fs.statSync(target).size
    if (existfilesize <= length) {
        return existfilesize
    } else {
        fs.truncateSync(target, length)
        return length
    }
}