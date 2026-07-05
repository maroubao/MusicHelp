# GitHub Actions 中文配置说明

## 这份文档是干什么的

这份文档是给你在 GitHub 仓库里手动配置运行参数用的。  
你不需要改代码，只需要按这个文档去 GitHub 页面里填几项内容。

## 你现在要配置什么

打开仓库：

- `https://github.com/maroubao/MusicHelp`

然后点击：

1. `Settings`
2. 左侧 `Secrets and variables`
3. 点击 `Actions`

## 一、先配置 Secrets

在 `Secrets` 页签里，依次点击 `New repository secret`，新增下面这些。

### 1. `FEISHU_BOT_WEBHOOK`

- 作用：给你发成功、失败、登录提醒消息
- 你要填的值：飞书机器人的 webhook 完整地址

例子：

```text
https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 2. `FEISHU_APP_ID`

- 作用：把抓到的二维码图片上传到飞书，换成 `image_key`
- 你要填的值：飞书应用的 `App ID`

### 3. `FEISHU_APP_SECRET`

- 作用：配合 `FEISHU_APP_ID` 获取飞书访问令牌
- 你要填的值：飞书应用的 `App Secret`

### 4. `NETEASE_SESSION_SECRET`

- 作用：当前先作为会话相关预留值
- 你要填的值：先填一个占位字符串即可

例子：

```text
placeholder_session_secret
```

### 5. `NETEASE_USERNAME`

- 作用：网易云密码登录回退账号
- 你要填的值：你的网易云登录账号

### 6. `NETEASE_PASSWORD`

- 作用：网易云密码登录回退密码
- 你要填的值：你的网易云登录密码

### 7. `QR_LINK_SIGNING_SECRET`

- 作用：只有你以后还想保留“二维码临时链接”方案时才会用到
- 你现在可以：
  - 先配置一个随机字符串
  - 或者先不依赖它

例子：

```text
musichelp_qr_sign_2026_random_abcdef1234567890
```

## 二、再配置 Variables

切换到 `Variables` 页签，新增下面这个。

### 1. `QR_LINK_PUBLIC_BASE_URL`

- 作用：这是“二维码临时链接”方案才会用到的公网前缀
- 你当前改成“飞书直接发二维码图片”后，它已经不是必须项
- 但为了兼容保留逻辑，你可以先填一个占位值

例子：

```text
https://example.com/musichelp/qr
```

### 2. `MUSICHELP_TARGET_EFFECTIVE_COUNT`

- 作用：控制这次任务要完成多少次计数
- 你要填的值：正整数

例子：

```text
1
```

说明：

- 调试时建议先填 `1`
- 正式跑月任务时你再改成 `365`

### 3. `MUSICHELP_TARGET_SONG_URL`

- 作用：直接覆盖配置文件里的默认歌曲
- 你要填的值：网易云单曲完整 URL

你现在可以填：

```text
https://music.163.com/#/song?id=3361270426
```

### 4. `MUSICHELP_TARGET_SONG_NAME`

- 作用：飞书通知和日志里显示的歌曲名字
- 你要填的值：你自己看得懂的名字

例子：

```text
临时调试歌曲
```

## 三、如果你只想先跑“飞书直接发图”方案

那你最少先保证下面这些已经配好：

- `FEISHU_BOT_WEBHOOK`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `NETEASE_USERNAME`
- `NETEASE_PASSWORD`
- `NETEASE_SESSION_SECRET`

这时：

- `QR_LINK_PUBLIC_BASE_URL` 可以先随便填占位值
- `QR_LINK_SIGNING_SECRET` 也先随便填占位值
- `MUSICHELP_TARGET_EFFECTIVE_COUNT` 先填 `1`
- `MUSICHELP_TARGET_SONG_URL` 填你要调试的那首歌
- `MUSICHELP_TARGET_SONG_NAME` 填你看得懂的歌名

## 四、第一次手动运行怎么做

1. 打开仓库顶部 `Actions`
2. 找到 `monthly-listening`
3. 点击 `Run workflow`
4. 分支选 `main`
5. `config_path` 保持默认：

```text
config/listening-task.yaml
```

6. `debug_label` 可以填：

```text
first-run
```

7. 点击开始运行

## 五、跑完以后你看哪里

如果成功或失败，你优先看下面这些：

### 1. Actions 页面里的步骤状态

重点看有没有红：

- `Validate config`
- `Run tests`
- `Run monthly task`

### 2. GitHub Summary

我已经改过 workflow，现在跑完后页面里会直接显示一段运行摘要。

### 3. Artifacts

下载：

- `monthly-listening-artifacts`

里面重点看：

- `artifacts/logs/run.log`
- `artifacts/reports/run-summary.md`
- `artifacts/state/run-state.json`
- `artifacts/state/session-metadata.json`
- `artifacts/screenshots/`
- `artifacts/trace/`

## 六、你现在最容易卡住的点

### 情况 1：飞书收不到二维码图片

大概率原因：

- `FEISHU_APP_ID` 或 `FEISHU_APP_SECRET` 没配对
- 飞书应用没有图片上传相关权限
- 机器人 webhook 和应用身份不是同一套飞书环境

### 情况 2：一直在重新登录

大概率原因：

- 会话还没成功保存
- 本次 run 的登录没有真正完成
- 页面结构和当前 Playwright 适配不一致

### 情况 3：能打开网站但不计数

大概率原因：

- 真实播放器行为和当前代码假设不同
- “整首播放完成”的判定点还需要站点联调

## 七、你配完后怎么告诉我

你不用把真实密码发给我。  
你只要回我一句：

```text
我已经把 FEISHU_BOT_WEBHOOK、FEISHU_APP_ID、FEISHU_APP_SECRET、NETEASE_USERNAME、NETEASE_PASSWORD、NETEASE_SESSION_SECRET 配好了
```

然后如果你已经跑了 workflow，再补一句：

```text
我已经手动跑了 first-run
```

我下一步就能继续带你看首跑结果，直接改登录页和播放器联调问题。
