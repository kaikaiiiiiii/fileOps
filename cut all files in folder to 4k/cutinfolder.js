// Description: Recursively cut all files in folder to 4KB

const fs = require('fs')
const path = require('path')

const target = process.argv[2]
const length = parseInt(process.argv[3]) || 1024

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

function walkSync(dir) {
    if (!fs.existsSync(dir)) return false
    const files = fs.readdirSync(dir)
    files.forEach(file => {
        const filepath = path.join(dir, file)
        const stats = fs.statSync(filepath)
        if (stats.isDirectory()) {
            walkSync(filepath)
        } else {
            replace(filepath, length)
        }
    })
}

function main(target) {
    if (fs.statSync(target).isFile()) {
        replace(target, length)
    } else if (fs.statSync(target).isDirectory()) {
        walkSync(target)
    } else {
        console.log('Please input a file or folder path.')
    }
}

main(target)
