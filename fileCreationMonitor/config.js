const config = {
    DIRECTORY_TO_WATCH: __dirname, // 监控的目录
    ALERT_THRESHOLD: 60 * 1000,
    INTERVAL_TIME: 1 * 1000, // 1分钟
    EMAIL_ACCOUNT: '151493994@qq.com', // 发件人邮箱
    EMAIL_PASSWORD: 'gslbexwytehkcadh', // 发件人邮箱密码
    EMAIL_RECIPIENT: ['wky0729@163.com'], // 收件人邮箱
    EMAIL_TITLE: 'title', // 邮件标题
    EMAIL_CONTENT: 'content', // 邮件内容
    MONITORING_TYPE: 'js'
}


module.exports = config